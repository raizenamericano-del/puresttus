/**
 * ============================================================================
 *  KyyPureStatus — CORE COMPRESSION ENGINE (FFmpeg)
 * ============================================================================
 *  Kompresi adaptif murni berbasis DURASI video input:
 *    <= 30s   -> target 1080p, cap 6.0 Mbps, CRF 17
 *    31-60s   -> target  720p, cap 4.0 Mbps, CRF 17
 *    61-120s  -> target  480p, cap 2.5 Mbps, CRF 16
 *    > 120s   -> target  360p, cap 1.5 Mbps, CRF 16
 *
 *  Output : .mp4 / libx264 / preset faster / profile high / level 4.1
 *           pix_fmt yuv420p / 30 fps / AAC 160k 48kHz stereo (-an kalo bisu)
 *  Orient : deteksi rotate 90/270 dari ffprobe -> portrait TETAP portrait.
 *           Tidak pernah upscale. Skala pas ke kotak (mis. 1080x1920).
 *  Fallback: hasil > 50MB -> re-encode mode ABR biar muat di limit WhatsApp.
 * ============================================================================
 *  (c) KyyDevv
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const { applyToFfmpeg } = require('../utils/ffmpeg');
const log = require('../utils/logger').scope('encoder');
const { formatBytes, clamp, even } = require('../utils/format');

applyToFfmpeg(ffmpeg);

const K = 1024;
const MB = 1024 * K;

/**
 * Limit keras media WhatsApp (default 50MB). Lewat ini -> fallback ABR.
 * Dibikin mutable object supaya bisa dioverride waktu smoke test.
 */
const LIMITS = { maxOutputBytes: Number(process.env.WA_MAX_OUTPUT_MB || 50) * MB };
/** Pakai VBV (maxrate+bufsize) di pass CRF supaya bitrate nggak bablas. */
const USE_VBV_ON_CRF = !['0', 'false', 'no'].includes(String(process.env.USE_VBV || 'true').toLowerCase());
/** Safety margin container overhead waktu hitung ABR. */
const ABR_SAFETY = Number(process.env.ABR_SAFETY || 0.94);
/** Batas waktu encode (ms). 0 = tanpa batas. */
const ENCODE_TIMEOUT_MS = Number(process.env.ENCODE_TIMEOUT_MS || 25 * 60 * 1000);

const X264_PARAMS = 'ref=4:bframes=3:me=umh:subq=7:rc-lookahead=40:me_range=24';

/** Error khusus biar caller bisa bedain "dibatalkan user" dari error beneran. */
class CancelledError extends Error {
  constructor(message = 'Proses dibatalkan') {
    super(message);
    this.name = 'CancelledError';
    this.cancelled = true;
  }
}

/** Error khusus timeout encode. */
class TimeoutError extends Error {
  constructor(message = 'Encode kelamaan, server mutusin buat berhenti') {
    super(message);
    this.name = 'TimeoutError';
    this.timeout = true;
  }
}

/* =========================================================================
 * 1. LADDER ADAPTIF (murni dari durasi)
 * ========================================================================= */
function getLadder(durationSec) {
  const d = Number(durationSec) || 0;
  if (d <= 30) return { tier: 1, label: '1080p', box: { w: 1080, h: 1920 }, maxBitrateK: 6000, crf: 17 };
  if (d <= 60) return { tier: 2, label: '720p', box: { w: 720, h: 1280 }, maxBitrateK: 4000, crf: 17 };
  if (d <= 120) return { tier: 3, label: '480p', box: { w: 480, h: 854 }, maxBitrateK: 2500, crf: 16 };
  return { tier: 4, label: '360p', box: { w: 360, h: 640 }, maxBitrateK: 1500, crf: 16 };
}

/**
 * Hitung dimensi output: pas di dalam "kotak" ladder, TANPA upscale,
 * mempertahankan orientasi asli (portrait tetep portrait), dan genap (yuv420p).
 */
function computeTargetSize(inputWidth, inputHeight, box) {
  const w = Math.max(2, Number(inputWidth) || 2);
  const h = Math.max(2, Number(inputHeight) || 2);

  const scaleToFit = Math.min(box.w / w, box.h / h);
  const scale = Math.min(1, scaleToFit); // <= 1 => nggak pernah upscale

  let tw = even(Math.round(w * scale));
  let th = even(Math.round(h * scale));

  // Jangan sampai keluar kotak setelah pembulatan genap
  if (tw > box.w) tw = even(box.w);
  if (th > box.h) th = even(box.h);

  return {
    width: tw,
    height: th,
    upscaled: false,
    scale: Number(scale.toFixed(4)),
    box: `${box.w}x${box.h}`,
  };
}

/**
 * Rencana kompresi CRF (pass pertama).
 */
function buildCrfPlan(info) {
  const ladder = getLadder(info.duration);
  const target = computeTargetSize(info.width, info.height, ladder.box);
  return {
    mode: 'crf',
    label: ladder.label,
    tier: ladder.tier,
    crf: ladder.crf,
    maxBitrateK: ladder.maxBitrateK,
    ...target,
    reason: `Durasi ${info.duration.toFixed(1)}s -> tier ${ladder.tier} (${ladder.label})`,
  };
}

/**
 * Rencana ABR (fallback) — hitung bitrate total dari limit & durasi,
 * dikurangi jatah audio, dibagi faktor safety container.
 */
function buildAbrPlan(info, attempt = 2, previousBytes = 0) {
  const duration = Math.max(0.5, Number(info.duration) || 1);
  const audioK = info.hasAudio ? 160 : 0;
  const safety = attempt >= 3 ? 0.85 : ABR_SAFETY;

  const totalKbps = Math.floor(((LIMITS.maxOutputBytes * 8 * safety) / 1000) / duration);
  const videoKbps = clamp(totalKbps - audioK - 24, 250, 12000);

  const ladder = getLadder(duration);
  const target = computeTargetSize(info.width, info.height, ladder.box);

  return {
    mode: 'abr',
    label: `${ladder.label} ABR`,
    tier: ladder.tier,
    attempt,
    videoKbps,
    audioK,
    maxBitrateK: Math.round(videoKbps * 1.35),
    bufSizeK: Math.round(videoKbps * 2),
    targetBytes: Math.round((videoKbps + audioK) * 1000 * duration / 8),
    previousBytes,
    ...target,
    reason: `Pass ${attempt - 1} hasilnya ${formatBytes(previousBytes)} — lewat limit ${formatBytes(LIMITS.maxOutputBytes)}. Ngegas mode ABR ${videoKbps} kbps.`,
  };
}

/* =========================================================================
 * 2. FILTER CHAIN
 * ========================================================================= */
function buildFilters(info, plan) {
  const parts = [];

  if (info.swapped) {
    // Metadata rotate 90/270 -> puter manual, lalu buang tag rotate biar nggak dobel.
    parts.push(`transpose=${info.rotation === 90 ? 1 : 2}`);
    parts.push('metadata=mode=delete:key=rotate');
  } else if (info.rotation === 180) {
    parts.push('transpose=1', 'transpose=1');
    parts.push('metadata=mode=delete:key=rotate');
  }

  if (info.sar && Math.abs(info.sar - 1) > 0.01) {
    // Pixel nggak kotak (anamorphic) -> normalisasi ke square pixel dulu.
    parts.push('setsar=1');
  }

  // Skala pas ke kotak: nggak pernah upscale, rasio dijaga, dimensi digenapin.
  parts.push(
    `scale=w=${plan.width}:h=${plan.height}:force_original_aspect_ratio=decrease:flags=lanczos`,
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
  );

  parts.push('fps=30');
  parts.push('format=yuv420p');

  return parts.join(',');
}

/* =========================================================================
 * 3. OUTPUT OPTIONS
 * ========================================================================= */
function buildOutputOptions(info, plan) {
  const opts = [
    '-map', '0:v:0',
    '-c:v', 'libx264',
    '-preset', 'faster',
    '-profile:v', 'high',
    '-level:v', '4.1',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-x264-params', X264_PARAMS,
    '-movflags', '+faststart',
  ];

  if (plan.mode === 'crf') {
    opts.push('-crf', String(plan.crf));
    if (USE_VBV_ON_CRF) {
      opts.push(
        '-maxrate', `${plan.maxBitrateK}k`,
        '-bufsize', `${Math.round(plan.maxBitrateK * 2)}k`,
      );
    }
  } else {
    // Mode ABR: bitrate rata-rata diikat keras ke target + VBV ketat.
    opts.push(
      '-b:v', `${plan.videoKbps}k`,
      '-maxrate', `${plan.maxBitrateK}k`,
      '-minrate', `${Math.max(200, Math.round(plan.videoKbps * 0.45))}k`,
      '-bufsize', `${plan.bufSizeK}k`,
    );
  }

  if (info.hasAudio) {
    opts.push(
      '-map', '0:a:0?',
      '-c:a', 'aac',
      '-b:a', `${plan.mode === 'crf' ? 160 : (plan.audioK || 160)}k`,
      '-ar', '48000',
      '-ac', '2',
    );
  } else {
    opts.push('-an');
  }

  return opts;
}

/* =========================================================================
 * 4. RUNNER (fluent-ffmpeg) + PROGRESS
 * ========================================================================= */
function timemarkToSeconds(timemark) {
  if (!timemark) return 0;
  const parts = String(timemark).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0);
  return Number(parts[0]) || 0;
}

function sizeKb(p) {
  try {
    return fs.statSync(p).size / K;
  } catch {
    return 0;
  }
}

/**
 * Jalanin satu pass encode.
 * @returns {Promise<{bytes:number, seconds:number, plan:object, stats:object}>}
 */
function runPass({ inputPath, outputPath, info, plan, onProgress, task, passIndex }) {
  return new Promise((resolve, reject) => {
    const filters = buildFilters(info, plan);
    const outOpts = buildOutputOptions(info, plan);

    // Bersihin sisa pass sebelumnya
    try {
      fs.rmSync(outputPath, { force: true });
    } catch {
      /* ignore */
    }

    const cmd = ffmpeg(inputPath, { timeout: ENCODE_TIMEOUT_MS > 0 ? Math.ceil(ENCODE_TIMEOUT_MS / 1000) : 0 })
      // Rotasi diurus manual di filter chain -> matiin auto-rotate bawaan ffmpeg
      .inputOptions(['-noautorotate'])
      .outputOptions(outOpts)
      .videoFilters(filters)
      .output(outputPath)
      .on('start', (line) => {
        log.ff(`[pass ${passIndex}/${plan.mode}] ${line}`);
        task.cmdline = line;
      })
      .on('codecData', (data) => {
        log.debug(`codecData: ${JSON.stringify(data)}`);
      })
      .on('progress', (p) => {
        if (!onProgress) return;

        const doneSec = timemarkToSeconds(p.timemark);
        const byTime = info.duration > 0 ? clamp((doneSec / info.duration) * 100, 0, 99.6) : 0;

        // Target ukuran output (ABR punya estimasi, CRF nggak -> pakai ukuran file riil)
        const targetSizeKb = p.targetSize && p.targetSize > 0 ? p.targetSize : sizeKb(outputPath);
        const bySize =
          plan.mode === 'abr' && plan.targetBytes > 0
            ? clamp(((targetSizeKb * K) / plan.targetBytes) * 100, 0, 99.6)
            : 0;
        const percent = clamp(Math.max(byTime, bySize, Number(p.percent) || 0), 0, 99.6);

        // Kecepatan encode: fluent-ffmpeg 2.1.x cuma ngasih currentFps, jadi kita hitung sendiri.
        const currentFps = Number(p.currentFps) || 0;
        const speedNum = currentFps > 0 ? currentFps / 30 : Number(String(p.speed || '').replace(/[^0-9.]/g, '')) || 0;
        const speedStr = speedNum > 0 ? `${speedNum.toFixed(2)}x` : null;

        // Sisa waktu: (durasi - yang udah kelar) / kecepatan
        const remainSec = info.duration > 0 ? Math.max(0, info.duration - doneSec) : 0;
        const etaSec =
          speedNum > 0 && remainSec > 0 ? Number(Math.ceil(remainSec / speedNum)) : Number.isFinite(Number(p.eta)) && p.eta > 0 ? Math.ceil(p.eta) : null;

        const elapsedWall = (Date.now() - task.startedAt) / 1000;

        onProgress({
          percent: Number(percent.toFixed(1)),
          pass: passIndex,
          mode: plan.mode,
          eta: etaSec,
          speed: speedStr,
          fps: currentFps ? Math.round(currentFps) : p.fps ? Math.round(p.fps) : null,
          frames: p.frames || null,
          bitrateKbps: p.currentKbps ? Math.round(p.currentKbps) : null,
          outSizeKb: targetSizeKb ? Math.round(targetSizeKb) : null,
          timemark: p.timemark || null,
          elapsedSec: Number(doneSec.toFixed(2)),
          wallSec: Number(elapsedWall.toFixed(2)),
          totalSec: info.duration,
        });
      })
      .on('error', (err, stdout, stderr) => {
        cleanup();
        // Jangan sampai ada file setengah jadi yang nyangkut di disk
        try {
          fs.rmSync(outputPath, { force: true });
        } catch {
          /* ignore */
        }
        if (task.cancelled) {
          log.warn(`[pass ${passIndex}] dibatalkan user`);
          return reject(new CancelledError('Kompresi dibatalkan'));
        }
        if (err && /timed?\s?out/i.test(String(err.message || ''))) {
          return reject(new TimeoutError(`Encode mentok timeout ${Math.round(ENCODE_TIMEOUT_MS / 60000)} menit. Videonya kepanjangan atau servernya ngos-ngosan.`));
        }
        const tail = String(stderr || err?.message || 'unknown ffmpeg error')
          .split('\n')
          .filter((l) => l.trim().length > 0)
          .slice(-6)
          .join(' | ');
        log.error(`[pass ${passIndex}] ffmpeg error: ${tail}`);
        reject(new Error(`FFmpeg ngambek: ${tail.slice(0, 400)}`));
      })
      .on('end', () => {
        cleanup();
        const bytes = (() => {
          try {
            return fs.statSync(outputPath).size;
          } catch {
            return 0;
          }
        })();
        if (!bytes) {
          return reject(new Error('Hasil encode 0 byte. Kemungkinan codec/driver bermasalah di server.'));
        }
        const elapsed = (Date.now() - task.startedAt) / 1000;
        log.ok(
          `[pass ${passIndex}] kelar -> ${formatBytes(bytes)} | ${plan.width}x${plan.height} | ${plan.mode}` +
            (plan.mode === 'crf' ? ` crf=${plan.crf}` : ` vb=${plan.videoKbps}k`) +
            ` | waktu server ${elapsed.toFixed(1)}s`,
        );
        resolve({
          bytes,
          seconds: elapsed,
          plan,
          stats: { filters, outputOptions: outOpts },
        });
      });

    task.procs.add(cmd);

    function cleanup() {
      task.procs.delete(cmd);
      if (task.timer) {
        clearTimeout(task.timer);
        task.timer = null;
      }
    }

    if (task.cancelled) {
      cleanup();
      return reject(new CancelledError('Kompresi dibatalkan sebelum mulai'));
    }

    cmd.run();
  });
}

/* =========================================================================
 * 5. PUBLIC API
 * ========================================================================= */
/**
 * Kompresi video full pipeline (CRF -> fallback ABR).
 *
 * @param {object} opts
 * @param {string} opts.inputPath      file sumber
 * @param {string} opts.outputPath     file tujuan (.mp4)
 * @param {object} opts.info           hasil probeVideo()
 * @param {function} [opts.onProgress] callback progress {percent, eta, speed, ...}
 * @param {object}  [opts.task]        task handle (buat cancel)
 * @returns {Promise<object>} ringkasan hasil encode
 */
async function encodeVideo({ inputPath, outputPath, info, onProgress, task }) {
  const handle = task || createTask();
  handle.startedAt = handle.startedAt || Date.now();

  if (ENCODE_TIMEOUT_MS > 0 && !handle.timer) {
    handle.timer = setTimeout(() => {
      handle.timedOut = true;
      killTask(handle);
    }, ENCODE_TIMEOUT_MS);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const crfPlan = buildCrfPlan(info);
  log.info(`rencana CRF: ${crfPlan.reason} -> ${crfPlan.width}x${crfPlan.height} crf=${crfPlan.crf} cap=${crfPlan.maxBitrateK}k`);

  const passes = [];
  let first;
  try {
    first = await runPass({
      inputPath,
      outputPath,
      info,
      plan: crfPlan,
      onProgress,
      task: handle,
      passIndex: 1,
    });
    passes.push({ mode: 'crf', bytes: first.bytes, seconds: first.seconds, plan: crfPlan });
  } catch (err) {
    if (handle.timer) clearTimeout(handle.timer);
    await safeRemove(outputPath);
    throw err;
  }

  // ---- Fallback ABR kalo lewat limit WA ----
  let result = first;
  if (first.bytes > LIMITS.maxOutputBytes) {
    if (handle.cancelled) {
      if (handle.timer) clearTimeout(handle.timer);
      throw new CancelledError('Kompresi dibatalkan');
    }

    const abrPlan = buildAbrPlan(info, 2, first.bytes);
    log.warn(`CRF result ${formatBytes(first.bytes)} > limit ${formatBytes(LIMITS.maxOutputBytes)} -> retry ABR ${abrPlan.videoKbps}kbps`);

    if (onProgress) {
      onProgress({
        percent: 0,
        reset: true,
        pass: 2,
        mode: 'abr',
        notice: `Hasil pertama ${formatBytes(first.bytes)} kegedean buat WhatsApp. Gas ulang mode ABR biar pas di bawah ${formatBytes(LIMITS.maxOutputBytes)} 🔁`,
        eta: null,
        speed: null,
      });
    }

    try {
      result = await runPass({
        inputPath,
        outputPath,
        info,
        plan: abrPlan,
        onProgress,
        task: handle,
        passIndex: 2,
      });
      passes.push({ mode: 'abr', bytes: result.bytes, seconds: result.seconds, plan: abrPlan });
    } catch (err) {
      if (handle.timer) clearTimeout(handle.timer);
      await safeRemove(outputPath);
      throw err;
    }

    // Masih bandel? Turunin lagi 15% (pass 3).
    if (result.bytes > LIMITS.maxOutputBytes) {
      const abrPlan3 = buildAbrPlan(info, 3, result.bytes);
      abrPlan3.videoKbps = Math.max(200, Math.round(result.plan.videoKbps * 0.8));
      abrPlan3.maxBitrateK = Math.round(abrPlan3.videoKbps * 1.3);
      abrPlan3.bufSizeK = Math.round(abrPlan3.videoKbps * 2);
      log.warn(`masih ${formatBytes(result.bytes)} -> pass 3 ABR ${abrPlan3.videoKbps}kbps`);

      if (onProgress) {
        onProgress({
          percent: 0,
          reset: true,
          pass: 3,
          mode: 'abr',
          notice: 'Masih ngelebihin dikit, server turunin bitrate sekali lagi. Sabar ya bro 🙏',
          eta: null,
          speed: null,
        });
      }

      result = await runPass({
        inputPath,
        outputPath,
        info,
        plan: abrPlan3,
        onProgress,
        task: handle,
        passIndex: 3,
      });
      passes.push({ mode: 'abr', bytes: result.bytes, seconds: result.seconds, plan: abrPlan3 });
    }
  }

  if (handle.timer) {
    clearTimeout(handle.timer);
    handle.timer = null;
  }
  if (handle.cancelled) {
    await safeRemove(outputPath);
    throw new CancelledError('Kompresi dibatalkan');
  }

  const finalBytes = result.bytes;
  const finalPlan = result.plan;

  return {
    outputPath,
    bytes: finalBytes,
    sizePretty: formatBytes(finalBytes),
    width: finalPlan.width,
    height: finalPlan.height,
    mode: finalPlan.mode,
    label: finalPlan.label,
    tier: finalPlan.tier,
    crf: finalPlan.mode === 'crf' ? finalPlan.crf : null,
    videoBitrateKbps: finalPlan.mode === 'abr' ? finalPlan.videoKbps : null,
    maxBitrateK: finalPlan.maxBitrateK,
    passes,
    passCount: passes.length,
    overLimit: finalBytes > LIMITS.maxOutputBytes,
    encodeSeconds: Number(passes.reduce((a, p) => a + p.seconds, 0).toFixed(2)),
    ratio: info.sizeBytes > 0 ? Number((finalBytes / info.sizeBytes).toFixed(4)) : null,
    savedBytes: info.sizeBytes > 0 ? Math.max(0, info.sizeBytes - finalBytes) : 0,
    cmdline: handle.cmdline || null,
    limitBytes: LIMITS.maxOutputBytes,
  };
}

/** Preview rencana kompresi tanpa eksekusi (buat UI "rencana encode"). */
function previewPlan(info) {
  const plan = buildCrfPlan(info);
  return {
    ...plan,
    filters: buildFilters(info, plan),
    audio: info.hasAudio ? 'AAC 160k / 48kHz / stereo' : 'tidak ada audio (-an)',
    limitBytes: LIMITS.maxOutputBytes,
    limitPretty: formatBytes(LIMITS.maxOutputBytes),
    sourceBytes: info.sizeBytes,
    estimatedBytes: Math.min(
      info.sizeBytes || LIMITS.maxOutputBytes,
      Math.round(((plan.maxBitrateK + (info.hasAudio ? 160 : 0)) * 1000 * Math.max(1, info.duration)) / 8),
    ),
  };
}

async function safeRemove(p) {
  try {
    fs.rmSync(p, { force: true });
  } catch {
    /* ignore */
  }
}

/* =========================================================================
 * 6. TASK HANDLE (buat cancel / kill)
 * ========================================================================= */
function createTask(id = 'task') {
  return {
    id,
    procs: new Set(),
    cancelled: false,
    timedOut: false,
    startedAt: Date.now(),
    timer: null,
    cmdline: null,
  };
}

/** Kill semua proses ffmpeg milik task (SIGKILL biar instan, nggak ninggalin file setengah jadi). */
function killTask(task) {
  if (!task) return 0;
  task.cancelled = true;
  let killed = 0;
  for (const proc of Array.from(task.procs)) {
    try {
      proc.kill('SIGKILL');
      killed += 1;
    } catch (err) {
      log.warn(`gagal kill ffmpeg: ${err.message}`);
    }
  }
  task.procs.clear();
  if (task.timer) {
    clearTimeout(task.timer);
    task.timer = null;
  }
  return killed;
}

/** Thumbnail cepat dari video hasil encode (buat kartu riwayat & preview). */
function generateThumbnail(inputPath, outJpeg, { atSecond = null, width = 360, duration = 0 } = {}) {
  return new Promise((resolve) => {
    if (!duration || duration <= 0) return resolve(null);
    const at = clamp(atSecond ?? Math.min(1.2, duration * 0.15), 0.1, Math.max(0.2, duration - 0.3));
    const cmd = ffmpeg(inputPath)
      .inputOptions([`-ss ${at}`])
      .videoFilters([`scale=${width}:-2`, 'format=yuvj420p'])
      .frames(1)
      .outputOptions(['-q:v', '4', '-map', '0:v:0'])
      .on('end', () => resolve(outJpeg))
      .on('error', (err) => {
        log.warn(`thumbnail gagal: ${err.message}`);
        try {
          fs.rmSync(outJpeg, { force: true });
        } catch {
          /* ignore */
        }
        resolve(null);
      });
    try {
      cmd.save(outJpeg);
    } catch (err) {
      log.warn(`thumbnail spawn gagal: ${err.message}`);
      resolve(null);
    }
  });
}

module.exports = {
  encodeVideo,
  previewPlan,
  generateThumbnail,
  getLadder,
  buildCrfPlan,
  buildAbrPlan,
  computeTargetSize,
  buildFilters,
  buildOutputOptions,
  createTask,
  killTask,
  CancelledError,
  TimeoutError,
  LIMITS,
  constants: { get MAX_OUTPUT_BYTES() { return LIMITS.maxOutputBytes; }, X264_PARAMS, USE_VBV_ON_CRF, ABR_SAFETY, ENCODE_TIMEOUT_MS },
};
