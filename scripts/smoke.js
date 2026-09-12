#!/usr/bin/env node
/**
 * ============================================================================
 *  KyyPureStatus — Smoke Test Engine
 * ============================================================================
 *  Ngetes CORE ENGINE tanpa perlu WhatsApp / browser:
 *   1. Bikin video uji pakai ffmpeg (portrait 9:16 + landscape + tanpa audio)
 *   2. Jalanin ladder kompresi & cek output sesuai spesifikasi
 *   3. Cek deteksi rotasi 90° (portrait wajib tetep portrait)
 *   4. Cek fallback ABR (limit dipaksa kecil biar ke-trigger)
 *   5. Cek fitur cancel (kill ffmpeg di tengah jalan)
 *
 *  Jalanin: node scripts/smoke.js
 * ============================================================================
 *  (c) KyyDevv
 */
'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const config = require('../server/config');
const { applyToFfmpeg, isReady } = require('../server/utils/ffmpeg');
const { probeVideo } = require('../server/engine/probe');
const encoder = require('../server/engine/encoder');

applyToFfmpeg(ffmpeg);

const WORK = path.join(config.paths.data, 'smoke');
let passed = 0;
let failed = 0;

const c = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  violet: '\x1b[38;5;141m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function ok(name, detail = '') {
  passed += 1;
  console.log(`${c.green}  ✔${c.reset} ${name}${detail ? ` ${c.dim}${detail}${c.reset}` : ''}`);
}
function bad(name, detail = '') {
  failed += 1;
  console.log(`${c.red}  ✘${c.reset} ${name}${detail ? ` ${c.dim}${detail}${c.reset}` : ''}`);
}
function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail);
}
function title(t) {
  console.log(`\n${c.violet}▸ ${t}${c.reset}`);
}

/* --------------------------------------------------------- test source --- */
function makeTestVideo({ out, duration, width, height, rotate = null, audio = true, fps = 30 }) {
  return new Promise((resolve, reject) => {
    // Video: testsrc2 (pola bergerak, gampang dikompres tapi tetep realistis)
    const videoInput = `testsrc2=size=${width}x${height}:rate=${fps}:duration=${duration}`;
    const cmd = ffmpeg().input(videoInput).inputOptions(['-f', 'lavfi']);

    if (audio) {
      cmd.input(`sine=frequency=440:sample_rate=48000:duration=${duration}`).inputOptions(['-f', 'lavfi']);
    }

    const outOpts = [
      '-map', '0:v:0',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '26',
      '-pix_fmt', 'yuv420p',
      '-t', String(duration),
    ];

    if (audio) {
      outOpts.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2');
    } else {
      outOpts.push('-an');
    }

    if (rotate) {
      // Nulis tag rotate langsung ke stream video (simulasi video HP yang direkam portrait)
      outOpts.push('-metadata:s:v:0', `rotate=${rotate}`);
    }

    cmd
      .outputOptions(outOpts)
      .on('end', () => resolve(out))
      .on('error', (err, stdout, stderr) => reject(new Error(String(stderr || err.message).split('\n').slice(-4).join(' | '))))
      .save(out);
  });
}

/* ---------------------------------------------------------------- tests --- */
async function main() {
  console.log(`${c.cyan}
╔══════════════════════════════════════════════════════════════╗
║   KyyPureStatus — SMOKE TEST ENGINE                          ║
╚══════════════════════════════════════════════════════════════╝${c.reset}`);

  await fsp.rm(WORK, { recursive: true, force: true });
  await fsp.mkdir(WORK, { recursive: true });

  if (!isReady()) {
    console.log(`${c.red}ffmpeg/ffprobe nggak ketemu. Install dulu: apt-get install -y ffmpeg${c.reset}`);
    process.exit(1);
  }
  ok('ffmpeg & ffprobe tersedia');

  /* ---------------- 1. Ladder ---------------- */
  title('1. Ladder adaptif berdasarkan durasi');
  const cases = [
    { dur: 10, expect: { tier: 1, label: '1080p', crf: 17, cap: 6000 } },
    { dur: 30, expect: { tier: 1, label: '1080p', crf: 17, cap: 6000 } },
    { dur: 45, expect: { tier: 2, label: '720p', crf: 17, cap: 4000 } },
    { dur: 60, expect: { tier: 2, label: '720p', crf: 17, cap: 4000 } },
    { dur: 90, expect: { tier: 3, label: '480p', crf: 16, cap: 2500 } },
    { dur: 120, expect: { tier: 3, label: '480p', crf: 16, cap: 2500 } },
    { dur: 300, expect: { tier: 4, label: '360p', crf: 16, cap: 1500 } },
  ];
  for (const t of cases) {
    const l = encoder.getLadder(t.dur);
    assert(
      l.tier === t.expect.tier && l.crf === t.expect.crf && l.maxBitrateK === t.expect.cap,
      `${t.dur}s -> ${l.label} tier${l.tier} crf${l.crf} cap${l.maxBitrateK}k`,
      l.label === t.expect.label ? '' : `(harusnya ${t.expect.label})`,
    );
  }

  /* ---------------- 2. Target size / no upscale ---------------- */
  title('2. Skala pas kotak & anti-upscale');
  const sizeTests = [
    { in: [3840, 2160], box: { w: 1080, h: 1920 }, expectMax: [1080, 1920], note: '4K landscape -> kotak portrait' },
    { in: [720, 1280], box: { w: 1080, h: 1920 }, expect: [720, 1280], note: '720x1280 portrait TIDAK di-upscale' },
    { in: [1080, 1920], box: { w: 1080, h: 1920 }, expect: [1080, 1920], note: 'pas 1080x1920' },
    { in: [640, 480], box: { w: 480, h: 854 }, expect: [480, 360], note: '4:3 landscape ke kotak 480p' },
    { in: [480, 640], box: { w: 360, h: 640 }, expect: [360, 480], note: 'portrait 480x640 -> 360x480' },
  ];
  for (const t of sizeTests) {
    const r = encoder.computeTargetSize(t.in[0], t.in[1], t.box);
    const good = t.expect
      ? r.width === t.expect[0] && r.height === t.expect[1]
      : r.width <= t.expectMax[0] && r.height <= t.expectMax[1] && r.width % 2 === 0 && r.height % 2 === 0;
    assert(good, `${t.note}: ${t.in.join('x')} -> ${r.width}x${r.height}`);
  }

  /* ---------------- 3. Encode beneran ---------------- */
  title('3. Encode beneran (landscape 20s + audio)');
  const src1 = path.join(WORK, 'src_landscape.mp4');
  await makeTestVideo({ out: src1, duration: 20, width: 1920, height: 1080, audio: true });
  const info1 = await probeVideo(src1);
  assert(info1.orientation === 'landscape' && info1.hasAudio, `probe: ${info1.width}x${info1.height} ${info1.orientation} audio=${info1.hasAudio}`);

  const out1 = path.join(WORK, 'out_landscape.mp4');
  let progressSeen = 0;
  let maxPercent = 0;
  let sawSpeed = null;
  let sawEta = null;
  const r1 = await encoder.encodeVideo({
    inputPath: src1,
    outputPath: out1,
    info: info1,
    onProgress: (p) => {
      progressSeen += 1;
      maxPercent = Math.max(maxPercent, p.percent);
      if (p.speed && !sawSpeed) sawSpeed = p.speed;
      if (p.eta != null && sawEta == null) sawEta = p.eta;
    },
  });
  const o1 = await probeVideo(out1);
  assert(progressSeen > 3, `progress event diterima ${progressSeen}x (maks ${maxPercent.toFixed(1)}%)`);
  assert(Boolean(sawSpeed), `speed dihitung dari currentFps -> ${sawSpeed}`);
  assert(sawEta != null && sawEta >= 0, `eta terhitung -> ${sawEta}s`);
  assert(o1.codec === 'h264' && o1.profile?.toLowerCase().includes('high'), `codec=${o1.codec} profile=${o1.profile}`);
  assert(o1.pixFmt === 'yuv420p', `pix_fmt=${o1.pixFmt}`);
  assert(Math.abs(o1.fps - 30) < 1.5, `fps=${o1.fps}`);
  assert(o1.width <= 1080 && o1.height <= 1920, `output ${o1.width}x${o1.height} (tier ${r1.label})`);
  assert(o1.hasAudio && o1.audio.codec === 'aac' && o1.audio.sampleRate === 48000 && o1.audio.channels === 2, `audio ${o1.audio?.codec} ${o1.audio?.sampleRate}Hz ${o1.audio?.channels}ch`);
  assert(Math.abs(o1.duration - info1.duration) < 1.5, `durasi ${o1.duration}s (sumber ${info1.duration}s)`);
  assert(r1.bytes < info1.sizeBytes || info1.sizeBytes < 1_000_000, `size ${fs.statSync(src1).size} -> ${r1.bytes} bytes`);

  /* ---------------- 4. Rotasi 90°/270° wajib portrait ---------------- */
  title('4. Deteksi rotasi (tag rotate + display matrix) — portrait wajib tetep portrait');
  const probeMod = require('../server/engine/probe');

  // 4a. Tag rotate klasik (video HP Android/iOS lawas)
  const tagCases = [
    [{ tags: { rotate: '90' } }, 90],
    [{ tags: { rotate: 270 } }, 270],
    [{ tags: { rotate: '-90' } }, 270],
    [{ tags: { rotate: '180' } }, 180],
    [{ tags: { rotate: '0' } }, 0],
  ];
  for (const [stream, expected] of tagCases) {
    const got = probeMod.readRotation(stream);
    assert(got === expected, `tag rotate=${JSON.stringify(stream.tags.rotate)} -> ${got}°`);
  }

  // 4b. Display matrix (ffprobe baru / iPhone HEVC)
  const matrices = [
    { name: 'identity (0°)', list: [{ side_data_type: 'Display Matrix', displaymatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] }], expect: 0 },
    { name: 'rotate 90° CW', list: [{ side_data_type: 'Display Matrix', displaymatrix: [0, 1, 0, -1, 0, 0, 0, 0, 1] }], expect: 270 },
    { name: 'rotate 270° CW', list: [{ side_data_type: 'Display Matrix', displaymatrix: [0, -1, 0, 1, 0, 0, 0, 0, 1] }], expect: 90 },
    { name: 'rotate 180°', list: [{ side_data_type: 'Display Matrix', displaymatrix: [-1, 0, 0, 0, -1, 0, 0, 0, 1] }], expect: 180 },
    { name: 'field rotation=90', list: [{ side_data_type: 'Display Matrix', rotation: -90 }], expect: 90 },
  ];
  for (const m of matrices) {
    const got = probeMod.matrixToDegrees(m.list);
    assert(got === m.expect, `${m.name} -> ${got}° (harap ${m.expect}°)`);
  }

  // 4c. Dimensi tampil di-swap pas rotasi 90/270
  for (const rot of [90, 270]) {
    const fakeInfo = {
      duration: 20,
      width: 1080,
      height: 1920,
      sar: 1,
      swapped: true,
      rotation: rot,
      hasAudio: true,
      sizeBytes: 20_000_000,
    };
    const plan = encoder.buildCrfPlan(fakeInfo);
    const filters = encoder.buildFilters(fakeInfo, plan);
    assert(
      plan.width <= 1080 && plan.height <= 1920 && plan.height > plan.width,
      `rot=${rot}: rencana ${plan.width}x${plan.height} (portrait dipertahankan)`,
    );
    assert(
      filters.includes(`transpose=${rot === 90 ? 1 : 2}`) && filters.includes('metadata=mode=delete:key=rotate'),
      `rot=${rot}: filter pakai transpose + buang tag rotate`,
    );
  }

  // 4d. End-to-end: sumber portrait 1080x1920 (tanpa tag) -> output tetep portrait
  const srcPortrait = path.join(WORK, 'src_portrait_native.mp4');
  await makeTestVideo({ out: srcPortrait, duration: 5, width: 1080, height: 1920, audio: true });
  const infoPortrait = await probeVideo(srcPortrait);
  assert(
    infoPortrait.orientation === 'portrait' && infoPortrait.width === 1080 && infoPortrait.height === 1920,
    `probe native portrait: ${infoPortrait.width}x${infoPortrait.height} rot=${infoPortrait.rotation}`,
  );
  const outPortrait = path.join(WORK, 'out_portrait_native.mp4');
  const rPortrait = await encoder.encodeVideo({ inputPath: srcPortrait, outputPath: outPortrait, info: infoPortrait });
  const oPortrait = await probeVideo(outPortrait);
  assert(
    oPortrait.height > oPortrait.width,
    `output ${oPortrait.width}x${oPortrait.height} -> masih portrait 9:16 ✅ (tier ${rPortrait.label})`,
  );
  assert(
    Math.abs(oPortrait.width / oPortrait.height - 9 / 16) < 0.02,
    `rasio ${(oPortrait.width / oPortrait.height).toFixed(3)} ≈ 0.5625 (9:16)`,
  );

  /* ---------------- 5. Video tanpa audio -> -an ---------------- */
  title('5. Video bisu -> output tanpa audio (-an)');
  const src3 = path.join(WORK, 'src_silent.mp4');
  await makeTestVideo({ out: src3, duration: 4, width: 1280, height: 720, audio: false });
  const info3 = await probeVideo(src3);
  assert(info3.hasAudio === false, 'probe: nggak ada stream audio');
  const out3 = path.join(WORK, 'out_silent.mp4');
  await encoder.encodeVideo({ inputPath: src3, outputPath: out3, info: info3 });
  const o3 = await probeVideo(out3);
  assert(o3.hasAudio === false, `output audio=${o3.hasAudio} (harus false)`);

  /* ---------------- 6. Fallback ABR ---------------- */
  title('6. Fallback ABR (limit dipaksa 1MB biar ke-trigger)');
  const src4 = path.join(WORK, 'src_noisy.mp4');
  await makeTestVideo({ out: src4, duration: 25, width: 1920, height: 1080, audio: true });
  const info4 = await probeVideo(src4);
  const out4 = path.join(WORK, 'out_abr.mp4');

  const originalLimit = encoder.LIMITS.maxOutputBytes;
  // Paksa limit jadi 900KB supaya CRF pass pertama pasti lewat -> ABR
  encoder.LIMITS.maxOutputBytes = 900 * 1024;
  const planAbr = encoder.buildAbrPlan(info4, 2, 5_000_000);
  assert(planAbr.mode === 'abr' && planAbr.videoKbps > 0, `rencana ABR: ${planAbr.videoKbps}kbps video + ${planAbr.audioK}kbps audio (target ${planAbr.width}x${planAbr.height})`);

  let sawPass2 = false;
  const r4 = await encoder.encodeVideo({
    inputPath: src4,
    outputPath: out4,
    info: info4,
    onProgress: (p) => {
      if (p.pass >= 2 || p.mode === 'abr') sawPass2 = true;
    },
  });
  encoder.LIMITS.maxOutputBytes = originalLimit;

  assert(sawPass2, 'pass 2 (ABR) ke-trigger ✅');
  assert(r4.passCount >= 2, `jumlah pass = ${r4.passCount}`);
  assert(r4.bytes <= 900 * 1024 * 1.15, `hasil ${(r4.bytes / 1024).toFixed(0)}KB <= ~900KB`);
  const o4 = await probeVideo(out4);
  assert(o4.codec === 'h264' && o4.duration > 20, `output ABR valid: ${o4.width}x${o4.height} ${o4.duration}s`);

  /* ---------------- 7. Cancel ---------------- */
  title('7. Cancel (kill ffmpeg di tengah jalan)');
  const src5 = path.join(WORK, 'src_long.mp4');
  await makeTestVideo({ out: src5, duration: 30, width: 1920, height: 1080, audio: true });
  const info5 = await probeVideo(src5);
  const out5 = path.join(WORK, 'out_cancelled.mp4');
  const task = encoder.createTask('smoke-cancel');

  const cancelPromise = encoder
    .encodeVideo({
      inputPath: src5,
      outputPath: out5,
      info: info5,
      task,
      onProgress: (p) => {
        if (p.percent > 2 && !task.cancelled) {
          console.log(`${c.dim}    (cancel di ${p.percent.toFixed(1)}%)${c.reset}`);
          encoder.killTask(task);
        }
      },
    })
    .then(() => ({ cancelled: false }))
    .catch((err) => ({ cancelled: Boolean(err.cancelled), message: err.message }));

  const cancelResult = await cancelPromise;
  assert(cancelResult.cancelled === true, `CancelledError dilempar: "${cancelResult.message}"`);
  assert(!fs.existsSync(out5) || fs.statSync(out5).size === 0, 'nggak ada file hasil setengah jadi yang dianggap sukses');

  /* ---------------- 8. Thumbnail ---------------- */
  title('8. Thumbnail generator');
  const thumb = path.join(WORK, 'thumb.jpg');
  const thumbResult = await encoder.generateThumbnail(out1, thumb, { duration: o1.duration });
  assert(Boolean(thumbResult) && fs.existsSync(thumb) && fs.statSync(thumb).size > 500, `thumbnail ${(fs.existsSync(thumb) ? fs.statSync(thumb).size : 0)} bytes`);

  /* ---------------- 9. Util normalisasi nomor ---------------- */
  title('9. Normalisasi nomor WhatsApp');
  const { normalizePhone, isValidPhone, prettyPhone } = require('../server/utils/format');
  const phones = [
    ['081234567890', '6281234567890'],
    ['+62 812-3456-7890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['81234567890', '6281234567890'],
    ['0812 3456 7890', '6281234567890'],
  ];
  for (const [input, expected] of phones) {
    assert(normalizePhone(input) === expected, `"${input}" -> ${normalizePhone(input)}`);
  }
  assert(isValidPhone('08123') === false, 'nomor pendek ditolak');
  assert(isValidPhone('081234567890') === true, 'nomor valid diterima');
  assert(prettyPhone('6281234567890').startsWith('62 812'), `pretty: ${prettyPhone('6281234567890')}`);

  /* ---------------- summary ---------------- */
  await fsp.rm(WORK, { recursive: true, force: true });

  console.log(`\n${c.cyan}──────────────────────────────────────────────────────────────${c.reset}`);
  console.log(`  ${c.green}LULUS ${passed}${c.reset} | ${failed ? c.red : c.dim}GAGAL ${failed}${c.reset}`);
  console.log(`${c.cyan}──────────────────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.dim}  KyyPureStatus engine smoke test — by KyyDevv${c.reset}\n`);

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`${c.red}SMOKE TEST CRASH:${c.reset}`, err.stack || err.message);
  process.exit(1);
});
