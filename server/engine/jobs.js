/**
 * ============================================================================
 *  KyyPureStatus — Job Manager (pipeline kompresi + kirim)
 * ============================================================================
 *  - SINGLE-FLIGHT: cuma 1 proses encode/kirim jalan per owner (default: global)
 *  - Stage machine: probing -> compressing -> thumbing -> checking -> sending -> done
 *  - Progress throttled (~6 emit/detik) ke socket: compress:progress
 *  - Bisa dibatalkan (kill ffmpeg) kapan aja
 *  - Riwayat 8 entri terakhir buat fitur "Kirim Ulang" tanpa upload ulang
 * ============================================================================
 *  (c) KyyDevv
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const config = require('../config');
const log = require('../utils/logger').scope('jobs');
const { formatBytes, formatDuration, normalizePhone, prettyPhone, safeName } = require('../utils/format');
const { findOutput, findThumb, findUpload, removeFile, fileSize } = require('../utils/files');

const { probeVideo, validateOutput } = require('../engine/probe');
const encoder = require('../engine/encoder');
const wa = require('../whatsapp/manager');
const history = require('../store/history');
const appstate = require('../store/appstate');

const jobs = new Map(); // jobId -> job
const ownerLock = new Map(); // ownerId -> jobId (single-flight)

const PROGRESS_THROTTLE_MS = Number(process.env.PROGRESS_THROTTLE_MS || 160);

class JobError extends Error {
  constructor(message, code = 'JOB_ERROR', status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/* ------------------------------------------------------------------ emit --- */
function bindEmitter(emitter) {
  jobs.emit = emitter;
}

function emit(event, payload = {}) {
  if (typeof jobs.emit === 'function') jobs.emit(event, payload);
}

/* ------------------------------------------------------------------ jobs --- */
function publicJob(job) {
  if (!job) return null;
  return {
    jobId: job.id,
    stage: job.stage,
    status: job.status,
    owner: job.owner,
    sourceName: job.sourceName,
    sourceId: job.sourceId,
    sourceBytes: job.sourceBytes,
    target: job.target,
    targetPretty: job.targetPretty,
    caption: job.caption,
    mock: job.mock,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    progress: job.progress,
    info: job.info
      ? {
          duration: job.info.duration,
          durationPretty: job.info.durationPretty,
          width: job.info.width,
          height: job.info.height,
          orientation: job.info.orientation,
          rotation: job.info.rotation,
          codec: job.info.codec,
          fps: job.info.fps,
          hasAudio: job.info.hasAudio,
          sizeBytes: job.info.sizeBytes,
        }
      : null,
    plan: job.plan,
    result: job.result,
    error: job.error,
  };
}

function setStage(job, stage, extra = {}) {
  job.stage = stage;
  job.updatedAt = Date.now();
  log.info(`[${job.id}] stage -> ${stage} ${JSON.stringify(extra || {}).slice(0, 160)}`);
  emit('job:stage', { jobId: job.id, stage, job: publicJob(job), ...extra });
}

function setStatus(job, status) {
  job.status = status;
  job.updatedAt = Date.now();
}

function getActive(ownerId = null) {
  const list = Array.from(jobs.values()).filter((j) => ['running', 'queued'].includes(j.status));
  if (ownerId) return list.find((j) => j.owner === ownerId) || null;
  return list[0] || null;
}

function listJobs(limit = 10) {
  return Array.from(jobs.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map(publicJob);
}

function assertSingleFlight(ownerId) {
  const max = config.ffmpeg.maxConcurrentJobs;
  const running = Array.from(jobs.values()).filter((j) => j.status === 'running');
  if (running.length >= max) {
    const cur = running[0];
    throw new JobError(
      `Sabar bos, masih ada proses jalan (${cur.sourceName} — ${cur.stage}). Selesaiin atau batalin dulu ya.`,
      'BUSY',
      409,
    );
  }
  const owned = ownerLock.get(ownerId);
  if (owned && jobs.has(owned) && ['running', 'queued'].includes(jobs.get(owned).status)) {
    throw new JobError('Lu masih punya proses yang lagi jalan. Satu-satu dulu bro.', 'BUSY_OWNER', 409);
  }
}

/* ---------------------------------------------------------------- start ---- */
/**
 * Mulai pipeline kompresi (+ kirim kalo ada target).
 * @param {object} args
 * @param {string} args.uploadId   id file hasil POST /api/upload
 * @param {string} [args.target]   nomor WA tujuan (boleh kosong kalo cuma mau kompres)
 * @param {string} [args.caption]
 * @param {string} [args.owner]    identitas pemilik (socket.id / 'global')
 */
async function start({ uploadId, target = '', caption = '', owner = 'global' }) {
  const inputPath = await findUpload(uploadId);
  if (!inputPath) {
    throw new JobError('File upload-nya nggak ketemu. Mungkin udah disapu auto-cleanup — upload ulang ya.', 'UPLOAD_NOT_FOUND', 404);
  }

  const ownerId = owner || 'global';
  assertSingleFlight(ownerId);

  if (!config.mockSend && target && wa.getStatus().status !== 'open') {
    throw new JobError('WA lu belum nyambung. Scan QR / pairing dulu baru bisa kirim.', 'WA_NOT_CONNECTED', 409);
  }

  if (!config.mockSend && !target) {
    throw new JobError('Nomor tujuan belum diisi bro. Kalo cuma mau kompres doang, nyalain MOCK_SEND atau isi nomor lu sendiri.', 'TARGET_REQUIRED', 400);
  }

  const normalizedTarget = target ? normalizePhone(target) : '';

  const id = randomUUID();
  const outputId = `out_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const thumbId = `th_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const job = {
    id,
    owner: ownerId,
    status: 'queued',
    stage: 'queued',
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    updatedAt: Date.now(),
    uploadId,
    sourceId: uploadId,
    inputPath,
    sourceName: path.basename(inputPath),
    sourceBytes: await fileSize(inputPath),
    outputPath: path.join(config.paths.output, `${outputId}.mp4`),
    thumbPath: path.join(config.paths.thumbs, `${thumbId}.jpg`),
    outputId,
    thumbId,
    target: normalizedTarget,
    targetPretty: normalizedTarget ? prettyPhone(normalizedTarget) : null,
    caption: String(caption || '').slice(0, 200),
    mock: config.mockSend,
    progress: { percent: 0, eta: null, speed: null, fps: null, bitrateKbps: null, mode: 'crf', pass: 1 },
    info: null,
    plan: null,
    result: null,
    error: null,
    task: encoder.createTask(id),
    lastEmit: 0,
  };

  jobs.set(id, job);
  ownerLock.set(ownerId, id);
  log.info(`job dibuat ${id} | source=${job.sourceName} (${formatBytes(job.sourceBytes)}) | target=${job.targetPretty || '-'} | mock=${job.mock}`);

  emit('job:start', { jobId: id, job: publicJob(job) });

  // Jalan di background — nggak diblokir
  runPipeline(job).catch((err) => log.error(`pipeline crash ${id}: ${err.stack || err.message}`));

  return publicJob(job);
}

/* -------------------------------------------------------------- pipeline --- */
async function runPipeline(job) {
  job.startedAt = Date.now();
  setStatus(job, 'running');

  try {
    /* ---------- 1. PROBE ---------- */
    setStage(job, 'probing');
    job.info = await probeVideo(job.inputPath);
    job.plan = encoder.previewPlan(job.info);
    job.sourceBytes = job.info.sizeBytes || job.sourceBytes;

    emit('job:probe', { jobId: job.id, info: job.info, plan: job.plan, job: publicJob(job) });
    emit('compress:plan', { jobId: job.id, plan: job.plan, info: job.info });

    /* ---------- 2. COMPRESS ---------- */
    setStage(job, 'compressing', {
      tier: job.plan.tier,
      label: job.plan.label,
      target: `${job.plan.width}x${job.plan.height}`,
    });

    const onProgress = (p) => {
      job.progress = { ...job.progress, ...p };
      const now = Date.now();
      const important = p.reset || p.notice;
      if (!important && now - job.lastEmit < PROGRESS_THROTTLE_MS) return;
      job.lastEmit = now;

      const payload = {
        jobId: job.id,
        percent: p.percent ?? job.progress.percent ?? 0,
        eta: p.eta ?? null,
        speed: p.speed ?? null,
        fps: p.fps ?? null,
        bitrateKbps: p.bitrateKbps ?? null,
        outSizeKb: p.outSizeKb ?? null,
        pass: p.pass ?? job.progress.pass ?? 1,
        mode: p.mode ?? job.progress.mode ?? 'crf',
        stage: 'compressing',
        notice: p.notice || null,
        reset: Boolean(p.reset),
        elapsedSec: p.elapsedSec ?? null,
        wallSec: p.wallSec ?? null,
        frames: p.frames ?? null,
        totalSec: p.totalSec ?? job.info?.duration ?? null,
      };
      emit('compress:progress', payload);
      emit('job:progress', payload);
    };

    const result = await encoder.encodeVideo({
      inputPath: job.inputPath,
      outputPath: job.outputPath,
      info: job.info,
      onProgress,
      task: job.task,
    });

    if (job.task.cancelled) throw new encoder.CancelledError('Kompresi dibatalkan');

    job.result = result;
    emit('compress:progress', { jobId: job.id, percent: 100, stage: 'compressing', eta: null, speed: null, final: true });

    /* ---------- 3. VALIDASI OUTPUT ---------- */
    setStage(job, 'validating');
    const check = await validateOutput(job.outputPath);
    if (!check.ok) {
      throw new JobError(`Hasil kompresi nggak valid: ${check.error || 'durasi 0'}. Coba lagi ya.`, 'OUTPUT_INVALID', 500);
    }
    job.outputInfo = check.info;

    /* ---------- 4. THUMBNAIL ---------- */
    setStage(job, 'thumbing');
    const thumb = await encoder.generateThumbnail(job.outputPath, job.thumbPath, {
      duration: check.info.duration,
      width: 360,
    });
    job.thumbOk = Boolean(thumb);

    /* ---------- 5. KIRIM ---------- */
    let sendResult = null;
    if (job.target) {
      setStage(job, 'checking', { target: job.targetPretty });
      if (!job.mock) {
        const numberCheck = await wa.checkNumber(job.target);
        emit('job:targetCheck', { jobId: job.id, ...numberCheck });
        if (!numberCheck.exists) {
          throw new JobError(
            `Nomor ${job.targetPretty} nggak ketemu di WhatsApp (${numberCheck.reason}). Cek lagi nomornya bos.`,
            'TARGET_INVALID',
            422,
          );
        }
      }

      setStage(job, 'sending', { mock: job.mock });
      emit('job:sendProgress', { jobId: job.id, stage: 'upload', mock: job.mock });

      sendResult = await wa.sendVideo({
        filePath: job.outputPath,
        phone: job.target,
        caption: job.caption,
        thumbPath: job.thumbOk ? job.thumbPath : null,
        onStage: (name, extra) => emit('job:sendProgress', { jobId: job.id, stage: name, ...extra }),
      });
      job.sendResult = sendResult;
    } else {
      log.info(`[${job.id}] nggak ada target — mode kompres doang`);
    }

    /* ---------- 6. SELESAI ---------- */
    setStage(job, 'done');
    setStatus(job, 'success');
    job.finishedAt = Date.now();

    const entry = await history.add({
      id: job.id,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      sourceName: job.sourceName,
      sourceId: job.uploadId,
      sourceBytes: job.sourceBytes,
      sourceDuration: job.info.duration,
      sourceResolution: `${job.info.width}x${job.info.height}`,
      outputId: job.outputId,
      outputBytes: job.result.bytes,
      outputResolution: `${job.result.width}x${job.result.height}`,
      outputDuration: check.info.duration,
      mode: job.result.mode,
      tier: job.result.tier,
      label: job.result.label,
      crf: job.result.crf,
      videoBitrateKbps: job.result.videoBitrateKbps,
      passes: job.result.passCount,
      encodeSeconds: job.result.encodeSeconds,
      target: job.target || null,
      messageId: sendResult?.messageId || null,
      caption: job.caption || null,
      status: 'success',
      mock: job.mock,
      thumbId: job.thumbOk ? job.thumbId : null,
    });

    await appstate.bumpStats({
      processed: 1,
      sent: sendResult ? 1 : 0,
      sourceBytes: job.sourceBytes,
      outputBytes: job.result.bytes,
      encodeSeconds: job.result.encodeSeconds,
    });
    if (job.target) await appstate.rememberTarget(job.target, job.targetPretty);

    const payload = {
      jobId: job.id,
      job: publicJob(job),
      result: {
        outputId: job.outputId,
        url: `/api/files/${job.outputId}`,
        thumbUrl: job.thumbOk ? `/api/thumbs/${job.thumbId}` : null,
        bytes: job.result.bytes,
        sizePretty: formatBytes(job.result.bytes),
        sourceSizePretty: formatBytes(job.sourceBytes),
        savedBytes: job.result.savedBytes,
        savedPretty: formatBytes(job.result.savedBytes),
        ratio: job.result.ratio,
        percentSaved: job.result.ratio ? Math.round((1 - job.result.ratio) * 100) : null,
        width: job.result.width,
        height: job.result.height,
        resolution: `${job.result.width}x${job.result.height}`,
        sourceResolution: `${job.info.width}x${job.info.height}`,
        duration: check.info.duration,
        durationPretty: formatDuration(check.info.duration),
        mode: job.result.mode,
        label: job.result.label,
        crf: job.result.crf,
        videoBitrateKbps: job.result.videoBitrateKbps,
        passCount: job.result.passCount,
        encodeSeconds: job.result.encodeSeconds,
        overLimit: job.result.overLimit,
      },
      send: sendResult
        ? {
            ok: true,
            mock: Boolean(sendResult.mock),
            target: job.target,
            targetPretty: job.targetPretty,
            messageId: sendResult.messageId,
            jid: sendResult.jid,
            note: sendResult.note || null,
          }
        : null,
      history: entry,
    };

    emit('job:done', payload);
    log.ok(
      `[${job.id}] SUKSES ${formatBytes(job.sourceBytes)} -> ${formatBytes(job.result.bytes)} ` +
        `(${payload.result.percentSaved ?? 0}% hemat) ${job.target ? `| terkirim ke ${job.targetPretty}` : ''}`,
    );
    return payload;
  } catch (err) {
    return handleFailure(job, err);
  } finally {
    ownerLock.delete(job.owner);
    // Bersihin job dari memori setelah 30 menit biar nggak numpuk
    setTimeout(() => jobs.delete(job.id), 30 * 60_000).unref?.();
  }
}

async function handleFailure(job, err) {
  const cancelled = Boolean(err?.cancelled) || job.task.cancelled;
  job.finishedAt = Date.now();

  if (cancelled) {
    setStatus(job, 'cancelled');
    setStage(job, 'cancelled');
    encoder.killTask(job.task);
    await removeFile(job.outputPath);
    await removeFile(job.thumbPath);
    await history.add({
      id: job.id,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      sourceName: job.sourceName,
      sourceId: job.uploadId,
      sourceBytes: job.sourceBytes,
      sourceDuration: job.info?.duration || 0,
      sourceResolution: job.info ? `${job.info.width}x${job.info.height}` : null,
      status: 'cancelled',
      target: job.target || null,
      mock: job.mock,
      error: 'Dibatalkan user',
    });
    emit('job:cancelled', { jobId: job.id, job: publicJob(job), message: 'Oke, dibatalin. Video lu tetep aman di server.' });
    log.warn(`[${job.id}] dibatalkan user`);
    return { jobId: job.id, cancelled: true };
  }

  const code = err?.code || 'JOB_ERROR';
  const message = err?.message || 'Terjadi kesalahan yang nggak jelas. Coba lagi ya.';
  job.error = { code, message };
  setStatus(job, 'failed');
  setStage(job, 'error');

  try {
    await removeFile(job.outputPath);
  } catch {
    /* ignore */
  }

  await history.add({
    id: job.id,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    sourceName: job.sourceName,
    sourceId: job.uploadId,
    sourceBytes: job.sourceBytes,
    sourceDuration: job.info?.duration || 0,
    sourceResolution: job.info ? `${job.info.width}x${job.info.height}` : null,
    status: 'failed',
    target: job.target || null,
    mock: job.mock,
    error: message,
  });

  emit('job:error', { jobId: job.id, job: publicJob(job), code, message });
  log.error(`[${job.id}] GAGAL (${code}): ${message}`);
  return { jobId: job.id, failed: true, code, message };
}

/* --------------------------------------------------------------- cancel ---- */
function cancel(jobId, ownerId = null) {
  const job = jobs.get(jobId);
  if (!job) {
    // Mungkin client reload — cari job aktif milik owner
    const active = getActive(ownerId);
    if (!active) throw new JobError('Nggak ada proses yang lagi jalan buat dibatalin.', 'NO_ACTIVE_JOB', 404);
    return cancel(active.id, ownerId);
  }
  if (ownerId && job.owner !== ownerId && ownerId !== 'global') {
    throw new JobError('Itu bukan proses lu bro.', 'FORBIDDEN', 403);
  }
  if (!['queued', 'running'].includes(job.status)) {
    throw new JobError(`Prosesnya udah ${job.status}, nggak bisa dibatalin.`, 'ALREADY_FINISHED', 409);
  }

  const killed = encoder.killTask(job.task);
  job.cancelRequestedAt = Date.now();
  log.warn(`[${job.id}] cancel diminta (ffmpeg killed=${killed})`);
  emit('job:cancelling', { jobId: job.id, killed });
  return { ok: true, jobId: job.id, killed };
}

function cancelAll() {
  let n = 0;
  for (const job of jobs.values()) {
    if (['queued', 'running'].includes(job.status)) {
      encoder.killTask(job.task);
      n += 1;
    }
  }
  return n;
}

/* --------------------------------------------------------------- resend ---- */
/**
 * Kirim ulang file hasil kompresi yang udah ada di riwayat (tanpa upload ulang).
 */
async function resend({ historyId, target, caption = '', owner = 'global' }) {
  const entry = await history.get(historyId);
  if (!entry) throw new JobError('Riwayatnya nggak ketemu. Mungkin udah kehapus auto-cleanup.', 'HISTORY_NOT_FOUND', 404);
  if (!entry.canResend) throw new JobError('Entri ini nggak punya file output yang bisa dikirim ulang.', 'NOT_RESENDABLE', 409);

  const outputPath = await findOutput(entry.outputId);
  if (!outputPath) throw new JobError('File hasilnya udah disapu server. Proses ulang videonya ya.', 'OUTPUT_GONE', 410);

  const normalized = normalizePhone(target);
  if (!normalized) throw new JobError('Nomor tujuan kosong bro.', 'TARGET_REQUIRED', 400);

  if (!config.mockSend && wa.getStatus().status !== 'open') {
    throw new JobError('WA lu belum nyambung. Scan QR dulu baru gas kirim ulang.', 'WA_NOT_CONNECTED', 409);
  }

  assertSingleFlight(owner);

  const id = randomUUID();
  const thumbPath = await findThumb(entry.thumbId || '');

  const job = {
    id,
    owner,
    status: 'running',
    stage: 'checking',
    createdAt: Date.now(),
    startedAt: Date.now(),
    finishedAt: null,
    updatedAt: Date.now(),
    uploadId: entry.sourceId,
    sourceId: entry.sourceId,
    inputPath: null,
    sourceName: entry.sourceName,
    sourceBytes: entry.sourceBytes,
    outputPath,
    outputId: entry.outputId,
    thumbPath: thumbPath || null,
    thumbId: entry.thumbId || null,
    thumbOk: Boolean(thumbPath),
    target: normalized,
    targetPretty: prettyPhone(normalized),
    caption: String(caption || entry.caption || '').slice(0, 200),
    mock: config.mockSend,
    progress: { percent: 100, eta: null, speed: null, mode: 'resend', pass: 0 },
    info: null,
    plan: null,
    result: {
      bytes: entry.outputBytes,
      width: Number((entry.outputResolution || '0x0').split('x')[0]) || 0,
      height: Number((entry.outputResolution || '0x0').split('x')[1]) || 0,
      mode: entry.mode,
      label: entry.label,
      tier: entry.tier,
      crf: entry.crf,
      videoBitrateKbps: entry.videoBitrateKbps,
      passCount: entry.passes,
      encodeSeconds: 0,
      savedBytes: entry.savedBytes || 0,
      ratio: entry.ratio,
      overLimit: false,
    },
    error: null,
    task: encoder.createTask(id),
    lastEmit: 0,
    isResend: true,
    resendFrom: historyId,
  };

  jobs.set(id, job);
  ownerLock.set(owner, id);
  emit('job:start', { jobId: id, job: publicJob(job), resend: true });

  runPipelineResend(job).catch((err) => log.error(`resend crash ${id}: ${err.stack || err.message}`));
  return publicJob(job);
}

async function runPipelineResend(job) {
  try {
    setStage(job, 'checking', { target: job.targetPretty });
    if (!job.mock) {
      const numberCheck = await wa.checkNumber(job.target);
      emit('job:targetCheck', { jobId: job.id, ...numberCheck });
      if (!numberCheck.exists) {
        throw new JobError(`Nomor ${job.targetPretty} nggak terdaftar di WhatsApp (${numberCheck.reason}).`, 'TARGET_INVALID', 422);
      }
    }

    setStage(job, 'sending', { mock: job.mock });
    const sendResult = await wa.sendVideo({
      filePath: job.outputPath,
      phone: job.target,
      caption: job.caption,
      thumbPath: job.thumbOk ? job.thumbPath : null,
      onStage: (name, extra) => emit('job:sendProgress', { jobId: job.id, stage: name, ...extra }),
    });
    job.sendResult = sendResult;

    setStage(job, 'done');
    setStatus(job, 'success');
    job.finishedAt = Date.now();

    const r = job.result;
    const entry = await history.add({
      id: job.id,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      sourceName: job.sourceName,
      sourceId: job.sourceId,
      sourceBytes: job.sourceBytes,
      outputId: job.outputId,
      outputBytes: r.bytes,
      outputResolution: `${r.width}x${r.height}`,
      mode: r.mode,
      tier: r.tier,
      label: r.label,
      crf: r.crf,
      videoBitrateKbps: r.videoBitrateKbps,
      passes: r.passCount,
      encodeSeconds: 0,
      target: job.target,
      messageId: sendResult.messageId,
      caption: job.caption || null,
      status: 'success',
      mock: job.mock,
      thumbId: job.thumbOk ? job.thumbId : null,
    });

    await appstate.bumpStats({ sent: 1 });
    await appstate.rememberTarget(job.target, job.targetPretty);

    const payload = {
      jobId: job.id,
      resend: true,
      job: publicJob(job),
      result: {
        outputId: job.outputId,
        url: `/api/files/${job.outputId}`,
        thumbUrl: job.thumbOk ? `/api/thumbs/${job.thumbId}` : null,
        bytes: r.bytes,
        sizePretty: formatBytes(r.bytes),
        sourceSizePretty: formatBytes(job.sourceBytes),
        savedBytes: r.savedBytes,
        savedPretty: formatBytes(r.savedBytes),
        ratio: r.ratio,
        percentSaved: r.ratio ? Math.round((1 - r.ratio) * 100) : null,
        width: r.width,
        height: r.height,
        resolution: `${r.width}x${r.height}`,
        duration: null,
        durationPretty: null,
        mode: r.mode,
        label: r.label,
        crf: r.crf,
        videoBitrateKbps: r.videoBitrateKbps,
        passCount: r.passCount,
        encodeSeconds: 0,
        overLimit: false,
      },
      send: {
        ok: true,
        mock: Boolean(sendResult.mock),
        target: job.target,
        targetPretty: job.targetPretty,
        messageId: sendResult.messageId,
        note: sendResult.note || null,
      },
      history: entry,
    };
    emit('job:done', payload);
    log.ok(`[${job.id}] RESEND sukses ke ${job.targetPretty}`);
    return payload;
  } catch (err) {
    return handleFailure(job, err);
  } finally {
    ownerLock.delete(job.owner);
    setTimeout(() => jobs.delete(job.id), 30 * 60_000).unref?.();
  }
}

/* -------------------------------------------------------------- cleanup ---- */
/** Dipanggil interval 10 menit: hapus file basi + rapikan history. */
async function cleanupTick(reason = 'interval') {
  const started = Date.now();
  const c = config.cleanup;
  const results = {};

  results.uploads = await sweep(config.paths.uploads, c.uploadTtlMin);
  results.output = await sweep(config.paths.output, c.outputTtlMin);
  results.thumbs = await sweep(config.paths.thumbs, c.thumbTtlMin);
  results.history = await history.prune();

  // Hapus output yang udah nggak direferensikan history (yatim piatu)
  const referenced = new Set();
  for (const e of await history.getAll()) {
    if (e.outputId) referenced.add(e.outputId);
    if (e.thumbId) referenced.add(e.thumbId);
  }
  results.orphans = await removeOrphans(config.paths.output, referenced, '.mp4');
  results.orphanThumbs = await removeOrphans(config.paths.thumbs, referenced, '.jpg');

  const removed = Object.values(results)
    .filter((r) => r && typeof r.removed === 'number')
    .reduce((a, r) => a + r.removed, 0);

  const payload = {
    reason,
    at: Date.now(),
    tookMs: Date.now() - started,
    results,
    removedFiles: removed,
  };
  log.info(`cleanup (${reason}) -> ${removed} file dihapus dalam ${payload.tookMs}ms`);
  emit('cleanup:done', payload);
  return payload;
}

async function sweep(dir, ttlMin) {
  const cutoff = Date.now() - ttlMin * 60_000;
  let removed = 0;
  let bytes = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs < cutoff) {
          bytes += st.size;
          fs.rmSync(full, { force: true });
          removed += 1;
        }
      } catch {
        /* skip */
      }
    }
  } catch (err) {
    log.warn(`sweep ${dir} gagal: ${err.message}`);
  }
  return { dir, ttlMin, removed, bytes };
}

async function removeOrphans(dir, referencedIds, ext) {
  let removed = 0;
  let bytes = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(ext)) continue;
      const id = name.slice(0, -ext.length);
      if (referencedIds.has(id)) continue;
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        // Kasih grace period 5 menit biar file yang barusan jadi nggak kehapus
        if (Date.now() - st.mtimeMs < 5 * 60_000) continue;
        bytes += st.size;
        fs.rmSync(full, { force: true });
        removed += 1;
      } catch {
        /* skip */
      }
    }
  } catch (err) {
    log.warn(`orphan sweep ${dir} gagal: ${err.message}`);
  }
  return { dir, removed, bytes };
}

module.exports = {
  bindEmitter,
  start,
  resend,
  cancel,
  cancelAll,
  getActive,
  listJobs,
  publicJob,
  cleanupTick,
  JobError,
  jobs,
};
