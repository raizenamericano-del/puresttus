/**
 * ============================================================================
 *  KyyPureStatus — REST API Routes
 * ============================================================================
 *  POST /api/upload            -> terima video (maks 100MB), balikin uploadId
 *  GET  /api/history           -> 8 riwayat terakhir (buat "Kirim Ulang")
 *  GET  /api/files/:id         -> stream hasil kompresi (support HTTP Range)
 *  GET  /api/uploads/:id       -> stream file asli
 *  GET  /api/thumbs/:id        -> thumbnail jpeg
 *  POST /api/process           -> mulai kompresi (alternatif dari socket)
 *  POST /api/cancel            -> batalkan proses + kill ffmpeg
 *  POST /api/resend            -> kirim ulang dari riwayat
 *  WA   /api/wa/status|connect|pair|disconnect|logout|check
 *  GET  /api/info              -> konfigurasi & statistik
 * ============================================================================
 *  (c) KyyDevv
 */
'use strict';

const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const multer = require('multer');

const config = require('../config');
const log = require('../utils/logger').scope('api');
const { shortId, findUpload, findOutput, findThumb, removeFile, fileSize, isSafeId } = require('../utils/files');
const { normalizePhone, prettyPhone, isValidPhone, safeName, formatBytes } = require('../utils/format');
const { probeVideo } = require('../engine/probe');
const jobs = require('../engine/jobs');
const wa = require('../whatsapp/manager');
const history = require('../store/history');
const appstate = require('../store/appstate');

const router = express.Router();

/* ============================================================= multer ===== */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxBytes,
    files: 1,
    fields: 12,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isVideoMime = /^video\//.test(file.mimetype || '') || file.mimetype === 'application/octet-stream';
    if (!config.upload.allowedExt.includes(ext) && !isVideoMime) {
      return cb(new Error(`Format ${ext || file.mimetype} nggak didukung. Yang bisa: ${config.upload.allowedExt.join(', ')}`));
    }
    cb(null, true);
  },
});

/* ========================================================= helpers ======== */
function httpError(res, err, fallbackStatus = 500) {
  const status = err?.status || err?.statusCode || fallbackStatus;
  const message = err?.message || 'Server error nggak jelas. Coba lagi ya.';
  if (status >= 500) log.error(`${message} ${err?.stack ? '\n' + err.stack : ''}`);
  res.status(status).json({ ok: false, error: message, code: err?.code || 'ERROR' });
}

/** Stream file dengan dukungan HTTP Range (biar <video> bisa seek) */
async function streamFile(res, filePath, downloadName = null) {
  const stat = await fsp.stat(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mimeMap = {
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };
  const type = mimeMap[ext] || 'application/octet-stream';
  const total = stat.size;
  const range = res.req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=1800');
  if (downloadName) {
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  }

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : total - 1;
    if (start >= total || end >= total || start > end) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    res.setHeader('Content-Type', type);
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.setHeader('Content-Length', total);
  res.setHeader('Content-Type', type);
  fs.createReadStream(filePath).pipe(res);
}

/* ============================================================== info ===== */
router.get('/info', async (req, res) => {
  try {
    const stats = (await appstate.get()).stats;
    res.json({
      ok: true,
      app: {
        name: config.branding.name,
        tagline: config.branding.tagline,
        author: config.branding.author,
        version: '1.0.0',
        env: config.env,
      },
      mockSend: config.mockSend,
      waStatus: wa.getStatus(),
      limits: {
        maxUploadMb: config.upload.maxMb,
        waMediaLimitMb: config.wa.mediaLimitMb,
        historyLimit: config.cleanup.historyLimit,
        allowedExt: config.upload.allowedExt,
      },
      cleanup: {
        intervalMs: config.cleanup.intervalMs,
        uploadTtlMin: config.cleanup.uploadTtlMin,
        outputTtlMin: config.cleanup.outputTtlMin,
      },
      engine: {
        maxConcurrentJobs: config.ffmpeg.maxConcurrentJobs,
        x264Params: require('../engine/encoder').constants.X264_PARAMS,
        outputLimitBytes: require('../engine/encoder').constants.MAX_OUTPUT_BYTES,
      },
      stats,
      activeJobs: jobs.listJobs(3),
      serverTime: Date.now(),
      uptimeSec: Math.round(process.uptime()),
    });
  } catch (err) {
    httpError(res, err);
  }
});

router.get('/health', (req, res) => {
  res.json({ ok: true, status: 'alive', uptime: Math.round(process.uptime()), ts: Date.now() });
});

/* ============================================================ upload ===== */
router.post('/upload', (req, res) => {
  upload.single('video')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          ok: false,
          error: `File lu ${formatBytes(req?.headers?.['content-length'] ? Number(req.headers['content-length']) : config.upload.maxBytes)} — maks ${config.upload.maxMb}MB bro. Kegedean.`,
          code: 'FILE_TOO_BIG',
        });
      }
      return res.status(400).json({ ok: false, error: err.message, code: 'UPLOAD_ERROR' });
    }

    const file = req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({ ok: false, error: 'Nggak ada file yang kekirim. Coba drag & drop lagi ya.', code: 'NO_FILE' });
    }

    const uploadId = shortId('up');
    const ext = (path.extname(file.originalname || '.mp4').toLowerCase() || '.mp4').slice(0, 6);
    const target = path.join(config.paths.uploads, `${uploadId}${ext}`);

    try {
      await fsp.mkdir(config.paths.uploads, { recursive: true });
      await fsp.writeFile(target, file.buffer);
    } catch (e) {
      log.error(`gagal nulis file upload: ${e.message}`);
      return res.status(500).json({ ok: false, error: 'Server gagal nyimpen file lu. Cek disk volume ya.', code: 'WRITE_FAILED' });
    }

    // Probe metadata sekalian biar UI langsung bisa nunjukin info
    let info = null;
    let plan = null;
    let probeError = null;
    try {
      info = await probeVideo(target);
      plan = require('../engine/encoder').previewPlan(info);
    } catch (e) {
      probeError = e.message;
      log.warn(`probe gagal buat ${uploadId}: ${e.message}`);
    }

    log.ok(`upload ${uploadId} <- ${safeName(file.originalname)}${ext} (${formatBytes(file.size)})`);

    res.json({
      ok: true,
      uploadId,
      filename: file.originalname,
      storedName: path.basename(target),
      size: file.size,
      sizePretty: formatBytes(file.size),
      mimetype: file.mimetype,
      ext,
      previewUrl: `/api/uploads/${uploadId}`,
      info,
      plan,
      probeError,
      warning: probeError
        ? 'Metadata videonya nggak kebaca sempurna, tapi tetep bisa dicoba kompres.'
        : null,
      uploadedAt: Date.now(),
    });
  });
});

/* =========================================================== streaming === */
router.get('/uploads/:id', async (req, res) => {
  try {
    if (!isSafeId(req.params.id)) return res.status(400).json({ ok: false, error: 'id nggak valid' });
    const p = await findUpload(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: 'File upload udah nggak ada (kesapu auto-cleanup).' });
    await streamFile(res, p);
  } catch (err) {
    httpError(res, err, 500);
  }
});

router.get('/files/:id', async (req, res) => {
  try {
    if (!isSafeId(req.params.id)) return res.status(400).json({ ok: false, error: 'id nggak valid' });
    const p = await findOutput(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: 'File hasil kompresi nggak ketemu. Proses ulang ya.' });
    const download = req.query.download === '1' || req.query.download === 'true';
    await streamFile(res, p, download ? `${safeName(req.query.name || 'kyypurestatus')}.mp4` : null);
  } catch (err) {
    httpError(res, err, 500);
  }
});

router.get('/thumbs/:id', async (req, res) => {
  try {
    if (!isSafeId(req.params.id)) return res.status(404).end();
    const p = await findThumb(req.params.id);
    if (!p) return res.status(404).end();
    await streamFile(res, p);
  } catch {
    res.status(500).end();
  }
});

/* ============================================================ process ==== */
router.post('/process', async (req, res) => {
  try {
    const { uploadId, target, caption, owner } = req.body || {};
    if (!uploadId) return res.status(400).json({ ok: false, error: 'uploadId wajib diisi bro.', code: 'MISSING_UPLOAD_ID' });
    const job = await jobs.start({
      uploadId: String(uploadId),
      target: target ? String(target) : '',
      caption: caption ? String(caption) : '',
      owner: owner ? String(owner) : `rest:${req.ip}`,
    });
    res.json({ ok: true, job });
  } catch (err) {
    httpError(res, err, err?.status || 400);
  }
});

router.post('/cancel', async (req, res) => {
  try {
    const { jobId, owner } = req.body || {};
    const result = jobs.cancel(jobId || null, owner ? String(owner) : 'global');
    res.json({ ok: true, ...result });
  } catch (err) {
    httpError(res, err, err?.status || 400);
  }
});

router.get('/jobs', (req, res) => {
  res.json({ ok: true, jobs: jobs.listJobs(10), active: jobs.getActive() ? jobs.publicJob(jobs.getActive()) : null });
});

router.post('/resend', async (req, res) => {
  try {
    const { historyId, target, caption, owner } = req.body || {};
    if (!historyId) return res.status(400).json({ ok: false, error: 'historyId wajib diisi.', code: 'MISSING_HISTORY_ID' });
    const job = await jobs.resend({
      historyId: String(historyId),
      target: target ? String(target) : '',
      caption: caption ? String(caption) : '',
      owner: owner ? String(owner) : `rest:${req.ip}`,
    });
    res.json({ ok: true, job });
  } catch (err) {
    httpError(res, err, err?.status || 400);
  }
});

/* ============================================================ history ==== */
router.get('/history', async (req, res) => {
  try {
    const list = await history.getAll();
    res.json({ ok: true, history: list, limit: config.cleanup.historyLimit });
  } catch (err) {
    httpError(res, err);
  }
});

router.delete('/history/:id', async (req, res) => {
  try {
    const removed = await history.remove(req.params.id);
    res.json({ ok: true, removed, history: await history.getAll() });
  } catch (err) {
    httpError(res, err);
  }
});

router.delete('/history', async (req, res) => {
  try {
    const n = await history.clear();
    res.json({ ok: true, removed: n, history: [] });
  } catch (err) {
    httpError(res, err);
  }
});

/* ============================================================ whatsapp === */
router.get('/wa/status', (req, res) => {
  res.json({ ok: true, ...wa.getStatus() });
});

router.post('/wa/connect', async (req, res) => {
  try {
    const { method = 'qr', phone = null } = req.body || {};
    if (config.mockSend) {
      return res.json({ ok: true, mock: true, message: 'MOCK_SEND aktif — nggak perlu nyambungin WA beneran.', ...wa.getStatus() });
    }
    const status = await wa.startConnection({
      method: method === 'pairing' ? 'pairing' : 'qr',
      phone: phone ? normalizePhone(phone) : null,
    });
    res.json({ ok: true, ...status });
  } catch (err) {
    httpError(res, err);
  }
});

router.post('/wa/pair', async (req, res) => {
  try {
    const { phone, code } = req.body || {};
    if (!phone) return res.status(400).json({ ok: false, error: 'Nomor HP lu wajib diisi bro, nggak bisa kosong.', code: 'MISSING_PHONE' });
    if (!isValidPhone(phone)) {
      return res.status(400).json({ ok: false, error: 'Nomornya nggak valid. Contoh: 081234567890 atau 6281234567890.', code: 'INVALID_PHONE' });
    }
    const result = await wa.requestPairing(normalizePhone(phone), code || undefined);
    res.json(result.ok ? { ok: true, ...result } : { ok: false, error: result.error, code: 'PAIRING_FAILED' });
  } catch (err) {
    httpError(res, err);
  }
});

router.post('/wa/disconnect', async (req, res) => {
  try {
    const wipe = Boolean(req.body?.wipe);
    const status = await wa.disconnect({ wipe, reason: 'user' });
    res.json({ ok: true, ...status });
  } catch (err) {
    httpError(res, err);
  }
});

router.post('/wa/logout', async (req, res) => {
  try {
    const status = await wa.disconnect({ wipe: true, reason: 'logout' });
    res.json({ ok: true, ...status, message: 'Session dihapus. Tinggal scan QR lagi kapan aja.' });
  } catch (err) {
    httpError(res, err);
  }
});

router.post('/wa/check', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!isValidPhone(phone)) {
      return res.status(400).json({ ok: false, exists: false, error: 'Nomor nggak valid bro.' });
    }
    const result = await wa.checkNumber(phone);
    res.json({ ok: true, ...result, phonePretty: prettyPhone(result.normalized) });
  } catch (err) {
    httpError(res, err, err?.code === 'WA_NOT_CONNECTED' ? 409 : 500);
  }
});

/* ============================================================ storage ==== */
router.post('/storage/cleanup', async (req, res) => {
  try {
    const result = await jobs.cleanupTick('manual');
    res.json({ ok: true, ...result });
  } catch (err) {
    httpError(res, err);
  }
});

router.get('/storage', async (req, res) => {
  try {
    const { dirSize } = require('../utils/files');
    const [up, out, th] = await Promise.all([
      dirSize(config.paths.uploads),
      dirSize(config.paths.output),
      dirSize(config.paths.thumbs),
    ]);
    res.json({
      ok: true,
      uploads: up,
      output: out,
      thumbs: th,
      total: up + out + th,
      totalPretty: formatBytes(up + out + th),
    });
  } catch (err) {
    httpError(res, err);
  }
});

/* Hapus file upload manual (misal user ganti video) */
router.delete('/uploads/:id', async (req, res) => {
  try {
    const p = await findUpload(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: 'Nggak ketemu.' });
    await removeFile(p);
    res.json({ ok: true, removed: true, sizeFreed: await fileSize(p).catch(() => 0) });
  } catch (err) {
    httpError(res, err);
  }
});

module.exports = router;
