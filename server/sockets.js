/**
 * ============================================================================
 *  KyyPureStatus — Socket.io Handler
 * ============================================================================
 *  Client -> Server:
 *    wa:connect {method:'qr'|'pairing', phone?, code?}
 *    wa:pair    {phone, code?}
 *    wa:disconnect {wipe?}
 *    wa:status
 *    video:process  {uploadId, target?, caption?}
 *    video:send     {uploadId|outputId, target, caption?}
 *    video:cancel   {jobId?}
 *    video:resend   {historyId, target?, caption?}
 *    history:get / history:delete {id} / history:clear
 *
 *  Server -> Client:
 *    wa:status wa:qr wa:pairing wa:connected wa:disconnected wa:loggedOut wa:error
 *    job:start job:stage job:probe job:progress compress:progress compress:plan
 *    job:sendProgress job:done job:error job:cancelled cleanup:done
 * ============================================================================
 *  (c) KyyDevv
 */
'use strict';

const config = require('./config');
const log = require('./utils/logger').scope('socket');
const jobs = require('./engine/jobs');
const wa = require('./whatsapp/manager');
const history = require('./store/history');
const appstate = require('./store/appstate');
const { normalizePhone, isValidPhone, prettyPhone } = require('./utils/format');
const { findOutput, findUpload } = require('./utils/files');

/** Broadcast ke semua client (aplikasi ini single-user, jadi room global). */
function makeEmitter(io) {
  return (event, payload) => {
    io.emit(event, payload);
  };
}

function attachWaBridge(io) {
  const push = (event, payload) => io.emit(event, payload);

  return wa.onWaEvent((msg) => {
    switch (msg.event) {
      case 'wa:qr':
        push('wa:qr', {
          qr: msg.qr,
          dataUrl: msg.qr?.dataUrl || null,
          expiresAt: msg.qr?.expiresAt || null,
          count: msg.qr?.count || 0,
          ttlMs: 45000,
        });
        break;
      case 'wa:pairing':
        push('wa:pairing', { code: msg.code, phone: msg.phone, phonePretty: prettyPhone(msg.phone), at: msg.at });
        break;
      case 'wa:connected':
        push('wa:connected', { ...msg, status: wa.getStatus() });
        break;
      case 'wa:disconnected':
        push('wa:disconnected', { reason: msg.reason, statusCode: msg.statusCode, status: wa.getStatus() });
        break;
      case 'wa:loggedOut':
        push('wa:loggedOut', { message: msg.message, reason: msg.reason, status: wa.getStatus() });
        break;
      case 'wa:reconnecting':
        push('wa:reconnecting', { attempt: msg.attempt, delayMs: msg.delayMs, reason: msg.reason });
        break;
      case 'wa:status':
        push('wa:status', wa.getStatus());
        break;
      case 'wa:error':
        push('wa:error', { message: msg.message });
        break;
      default:
        push(msg.event, msg);
    }
  });
}

function initSockets(io) {
  jobs.bindEmitter(makeEmitter(io));
  const detachWa = attachWaBridge(io);

  // Auth sederhana kalo API_TOKEN diset
  io.use((socket, next) => {
    if (!config.apiToken) return next();
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token === config.apiToken) return next();
    log.warn(`socket ditolak (token salah) dari ${socket.handshake.address}`);
    next(new Error('UNAUTHORIZED'));
  });

  io.on('connection', async (socket) => {
    const owner = `sock:${socket.id}`;
    log.info(`client connect ${socket.id} (${socket.handshake.address})`);

    /* ---- Kirimin state awal biar UI langsung sinkron ---- */
    try {
      const [hist, state, waStatus] = await Promise.all([history.getAll(), appstate.get(), Promise.resolve(wa.getStatus())]);
      socket.emit('init', {
        ok: true,
        config: {
          mockSend: config.mockSend,
          maxUploadMb: config.upload.maxMb,
          waMediaLimitMb: config.wa.mediaLimitMb,
          historyLimit: config.cleanup.historyLimit,
          allowedExt: config.upload.allowedExt,
          cleanupIntervalMs: config.cleanup.intervalMs,
          maxConcurrentJobs: config.ffmpeg.maxConcurrentJobs,
          branding: config.branding,
        },
        wa: waStatus,
        history: hist,
        state: {
          lastTarget: state.lastTarget,
          recentTargets: state.recentTargets,
          lastCaption: state.lastCaption,
          lastLoginMethod: state.lastLoginMethod,
          stats: state.stats,
        },
        activeJob: jobs.getActive() ? jobs.publicJob(jobs.getActive()) : null,
        serverTime: Date.now(),
      });
      socket.emit('wa:status', waStatus);
      socket.emit('history:update', hist);
      if (waStatus.qr) socket.emit('wa:qr', { qr: waStatus.qr, dataUrl: waStatus.qr.dataUrl, expiresAt: waStatus.qr.expiresAt, count: waStatus.qr.count, ttlMs: 45000 });
    } catch (err) {
      log.error(`gagal kirim init ke ${socket.id}: ${err.message}`);
    }

    /* ==================================================== WHATSAPP ======= */
    socket.on('wa:status', (cb) => {
      const status = wa.getStatus();
      if (typeof cb === 'function') cb({ ok: true, ...status });
      socket.emit('wa:status', status);
    });

    socket.on('wa:connect', async (payload = {}, cb) => {
      try {
        const method = payload.method === 'pairing' ? 'pairing' : 'qr';
        const phone = payload.phone ? normalizePhone(payload.phone) : null;

        if (config.mockSend) {
          const status = wa.getStatus();
          const out = { ok: true, mock: true, message: 'MOCK_SEND aktif — WA disimulasikan nyambung.', ...status };
          if (typeof cb === 'function') cb(out);
          socket.emit('wa:status', status);
          return;
        }
        if (method === 'pairing' && !isValidPhone(phone)) {
          const out = { ok: false, error: 'Buat pairing code, nomor HP lu wajib diisi (08xxx / 628xxx).' };
          if (typeof cb === 'function') cb(out);
          socket.emit('wa:error', { message: out.error });
          return;
        }

        await appstate.set({ lastLoginMethod: method });
        const status = await wa.startConnection({ method, phone });
        const out = { ok: true, ...status };
        if (typeof cb === 'function') cb(out);
      } catch (err) {
        log.error(`wa:connect error: ${err.message}`);
        const out = { ok: false, error: err.message };
        if (typeof cb === 'function') cb(out);
        socket.emit('wa:error', { message: err.message });
      }
    });

    socket.on('wa:pair', async (payload = {}, cb) => {
      try {
        const phone = normalizePhone(payload.phone || '');
        if (!isValidPhone(phone)) {
          const out = { ok: false, error: 'Nomornya nggak valid bro. Contoh: 081234567890.' };
          if (typeof cb === 'function') cb(out);
          return;
        }
        const result = await wa.requestPairing(phone, payload.code || undefined);
        if (typeof cb === 'function') cb(result);
        if (result.ok && result.code) socket.emit('wa:pairing', { ...result, phonePretty: prettyPhone(result.phone) });
      } catch (err) {
        const out = { ok: false, error: err.message };
        if (typeof cb === 'function') cb(out);
        socket.emit('wa:error', { message: err.message });
      }
    });

    socket.on('wa:disconnect', async (payload = {}, cb) => {
      try {
        const status = await wa.disconnect({ wipe: Boolean(payload.wipe), reason: 'user' });
        if (typeof cb === 'function') cb({ ok: true, ...status });
        socket.emit('wa:status', status);
      } catch (err) {
        if (typeof cb === 'function') cb({ ok: false, error: err.message });
      }
    });

    socket.on('wa:check', async (payload = {}, cb) => {
      try {
        const phone = normalizePhone(payload.phone || '');
        if (!isValidPhone(phone)) {
          if (typeof cb === 'function') cb({ ok: false, exists: false, error: 'Nomor nggak valid.' });
          return;
        }
        const result = await wa.checkNumber(phone);
        if (typeof cb === 'function') cb({ ok: true, ...result, phonePretty: prettyPhone(result.normalized) });
      } catch (err) {
        if (typeof cb === 'function') cb({ ok: false, exists: false, error: err.message });
      }
    });

    /* ==================================================== VIDEO ========== */
    socket.on('video:process', async (payload = {}, cb) => {
      try {
        const { uploadId, target = '', caption = '' } = payload || {};
        if (!uploadId) throw Object.assign(new Error('uploadId kosong. Upload dulu videonya bro.'), { status: 400, code: 'MISSING_UPLOAD_ID' });

        const job = await jobs.start({
          uploadId: String(uploadId),
          target: target ? String(target) : '',
          caption: caption ? String(caption) : '',
          owner,
        });
        if (typeof cb === 'function') cb({ ok: true, job });
        socket.emit('job:start', { jobId: job.jobId, job });
      } catch (err) {
        log.warn(`video:process ditolak: ${err.message}`);
        const out = { ok: false, error: err.message, code: err.code || 'PROCESS_FAILED' };
        if (typeof cb === 'function') cb(out);
        socket.emit('job:error', { jobId: null, ...out, message: err.message });
      }
    });

    // Alias: kirim video (kalo uploadId dikasih & belum diproses -> proses dulu)
    socket.on('video:send', async (payload = {}, cb) => {
      try {
        const { uploadId, outputId, target, caption } = payload || {};
        if (outputId) {
          const file = await findOutput(String(outputId));
          if (!file) throw Object.assign(new Error('File output nggak ketemu.'), { status: 404 });
          const result = await wa.sendVideo({
            filePath: file,
            phone: String(target || ''),
            caption: caption ? String(caption) : '',
          });
          if (typeof cb === 'function') cb({ ok: true, send: result });
          socket.emit('job:done', { jobId: null, directSend: true, send: result, result: { outputId, url: `/api/files/${outputId}` } });
          return;
        }
        if (uploadId) {
          const job = await jobs.start({
            uploadId: String(uploadId),
            target: target ? String(target) : '',
            caption: caption ? String(caption) : '',
            owner,
          });
          if (typeof cb === 'function') cb({ ok: true, job });
          return;
        }
        throw Object.assign(new Error('Kasih uploadId atau outputId dulu bro.'), { status: 400 });
      } catch (err) {
        const out = { ok: false, error: err.message, code: err.code || 'SEND_FAILED' };
        if (typeof cb === 'function') cb(out);
        socket.emit('job:error', { jobId: null, ...out, message: err.message });
      }
    });

    socket.on('video:cancel', (payload = {}, cb) => {
      try {
        const jobId = payload?.jobId || jobs.getActive(owner)?.id || jobs.getActive()?.id;
        const result = jobs.cancel(jobId, owner);
        if (typeof cb === 'function') cb({ ok: true, ...result });
      } catch (err) {
        const out = { ok: false, error: err.message, code: err.code || 'CANCEL_FAILED' };
        if (typeof cb === 'function') cb(out);
        socket.emit('job:error', { jobId: payload?.jobId || null, ...out, message: err.message });
      }
    });

    socket.on('video:resend', async (payload = {}, cb) => {
      try {
        const { historyId, target, caption } = payload || {};
        if (!historyId) throw Object.assign(new Error('historyId kosong.'), { status: 400 });
        const job = await jobs.resend({
          historyId: String(historyId),
          target: target ? String(target) : '',
          caption: caption ? String(caption) : '',
          owner,
        });
        if (typeof cb === 'function') cb({ ok: true, job });
      } catch (err) {
        log.warn(`video:resend ditolak: ${err.message}`);
        const out = { ok: false, error: err.message, code: err.code || 'RESEND_FAILED' };
        if (typeof cb === 'function') cb(out);
        socket.emit('job:error', { jobId: null, ...out, message: err.message });
      }
    });

    /* ==================================================== HISTORY ======== */
    socket.on('history:get', async (cb) => {
      const list = await history.getAll();
      if (typeof cb === 'function') cb({ ok: true, history: list });
      socket.emit('history:update', list);
    });

    socket.on('history:delete', async (payload = {}, cb) => {
      try {
        await history.remove(String(payload.id || ''));
        const list = await history.getAll();
        io.emit('history:update', list);
        if (typeof cb === 'function') cb({ ok: true, history: list });
      } catch (err) {
        if (typeof cb === 'function') cb({ ok: false, error: err.message });
      }
    });

    socket.on('history:clear', async (cb) => {
      try {
        await history.clear();
        io.emit('history:update', []);
        if (typeof cb === 'function') cb({ ok: true, history: [] });
      } catch (err) {
        if (typeof cb === 'function') cb({ ok: false, error: err.message });
      }
    });

    /* ==================================================== MISC =========== */
    socket.on('state:get', async (cb) => {
      const s = await appstate.get();
      if (typeof cb === 'function') cb({ ok: true, state: s });
    });

    socket.on('state:set', async (payload = {}, cb) => {
      try {
        const patch = {};
        if (payload.lastCaption !== undefined) patch.lastCaption = String(payload.lastCaption).slice(0, 200);
        if (payload.lastTarget !== undefined) patch.lastTarget = normalizePhone(payload.lastTarget);
        if (payload.lastLoginMethod !== undefined) patch.lastLoginMethod = String(payload.lastLoginMethod).slice(0, 10);
        const s = await appstate.set(patch);
        if (typeof cb === 'function') cb({ ok: true, state: s });
      } catch (err) {
        if (typeof cb === 'function') cb({ ok: false, error: err.message });
      }
    });

    socket.on('ping:app', (cb) => {
      if (typeof cb === 'function') cb({ ok: true, pong: Date.now(), mockSend: config.mockSend });
    });

    socket.on('disconnect', (reason) => {
      log.info(`client disconnect ${socket.id} (${reason})`);
      // Proses TETEP jalan di server walau client putus (biar nggak sia-sia).
    });
  });

  io.on('connection_error', (err) => log.warn(`connection_error: ${err.message}`));

  return {
    close: () => {
      detachWa();
    },
  };
}

module.exports = { initSockets };
