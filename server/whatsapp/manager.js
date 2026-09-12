/**
 * ============================================================================
 *  KyyPureStatus — WhatsApp Connection Manager (Baileys v6)
 * ============================================================================
 *  - Session persisten via useMultiFileAuthState di /data/sessions
 *  - Login QR Code (auto refresh, diconvert jadi data URL PNG) ATAU
 *    Pairing Code 8 digit
 *  - Auto reconnect exponential backoff 2s -> 30s
 *  - DisconnectReason.loggedOut -> hapus folder session lokal
 *  - Normalisasi nomor 08... -> 628... + cek onWhatsApp sebelum kirim
 *  - MOCK_SEND=true -> semua fungsi kirim di-skip (buat ngetes UI)
 * ============================================================================
 *  (c) KyyDevv
 */
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  delay,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');

const config = require('../config');
const log = require('../utils/logger').scope('whatsapp');
const { normalizePhone, toUserJid, prettyPhone, isValidPhone, sleep } = require('../utils/format');

const SESSION_DIR = config.paths.sessions;
const QR_TTL_MS = 45_000;

/* ---------------------------------------------------------------- state --- */
const state = {
  sock: null,
  status: 'idle', // idle | connecting | qr | pairing | open | closed | loggedOut
  connectionState: 'close',
  qr: null, // { dataUrl, raw, expiresAt, count }
  pairing: null, // { code, phone, at }
  creds: { registered: false, pushName: null, me: null, jid: null, phone: null, deviceId: null },
  lastError: null,
  lastEventAt: null,
  reconnectAttempt: 0,
  reconnectTimer: null,
  shuttingDown: false,
  startedAt: null,
  sentCount: 0,
  pendingPairingResolve: null,
};

const listeners = new Set();

function emit(event, payload = {}) {
  const message = { event, at: Date.now(), ...payload };
  state.lastEventAt = message.at;
  for (const fn of Array.from(listeners)) {
    try {
      fn(message);
    } catch (err) {
      log.error(`listener error: ${err.message}`);
    }
  }
  return message;
}

function onWaEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(next) {
  if (state.status === next) return;
  state.status = next;
  emit('wa:status', { status: next });
}

/** Snapshot status buat dikirim ke client / REST */
function getStatus() {
  const me = state.creds.me || null;
  return {
    status: state.status,
    connectionState: state.connectionState,
    connected: state.status === 'open',
    registered: state.creds.registered,
    mockSend: config.mockSend,
    me: me
      ? {
          jid: me,
          phone: me.split('@')[0],
          phonePretty: prettyPhone(me.split('@')[0]),
          pushName: state.creds.pushName || null,
          deviceId: state.creds.deviceId || null,
        }
      : null,
    qr: state.qr && Date.now() < state.qr.expiresAt ? state.qr : null,
    pairing: state.pairing,
    lastError: state.lastError,
    lastEventAt: state.lastEventAt,
    reconnectAttempt: state.reconnectAttempt,
    sentCount: state.sentCount,
    sessionDir: SESSION_DIR,
    uptimeSec: state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0,
  };
}

/* ------------------------------------------------------- session helpers --- */
async function wipeSession(reason = 'manual') {
  state.creds = { registered: false, pushName: null, me: null, jid: null, phone: null, deviceId: null };
  state.qr = null;
  state.pairing = null;
  try {
    await fsp.rm(SESSION_DIR, { recursive: true, force: true });
    await fsp.mkdir(SESSION_DIR, { recursive: true });
    log.warn(`session dihapus (${reason}) -> ${SESSION_DIR}`);
    return true;
  } catch (err) {
    log.error(`gagal hapus session: ${err.message}`);
    return false;
  }
}

async function sessionInfo() {
  try {
    const entries = await fsp.readdir(SESSION_DIR);
    return { exists: entries.length > 0, files: entries.length };
  } catch {
    return { exists: false, files: 0 };
  }
}

/* ------------------------------------------------------------ connection --- */
function backoffMs() {
  const attempt = Math.max(0, state.reconnectAttempt);
  const ms = config.wa.reconnectMinMs * 2 ** attempt;
  return Math.min(ms, config.wa.reconnectMaxMs);
}

function scheduleReconnect(reason = '') {
  if (state.shuttingDown) return;
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  const wait = backoffMs();
  state.reconnectAttempt += 1;
  log.warn(`reconnect ke-${state.reconnectAttempt} dalam ${wait}ms ${reason ? `(${reason})` : ''}`);
  emit('wa:reconnecting', { attempt: state.reconnectAttempt, delayMs: wait, reason });
  setStatus('connecting');
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    startConnection().catch((err) => log.error(`startConnection error: ${err.message}`));
  }, wait);
}

async function buildAuth() {
  await fsp.mkdir(SESSION_DIR, { recursive: true });
  const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  return { authState, saveCreds };
}

/**
 * Nyalain koneksi Baileys. Aman dipanggil berkali-kali (socket lama di-end dulu).
 */
async function startConnection({ method = 'qr', phone = null } = {}) {
  if (config.mockSend) {
    setStatus('open');
    log.warn('MOCK_SEND aktif — Baileys dilewati total. Kirim video cuma simulasi.');
    emit('wa:mock', { message: 'Mode uji aktif, nggak ada WA beneran yang dihubungi.' });
    return getStatus();
  }

  if (state.sock) {
    try {
      state.sock.ev.removeAllListeners('connection.update');
      state.sock.ev.removeAllListeners('creds.update');
      state.sock.end(new Error('restart'));
    } catch {
      /* socket udah mati */
    }
    state.sock = null;
  }

  setStatus('connecting');

  const { authState, saveCreds } = await buildAuth();
  let version;
  try {
    version = (await fetchLatestBaileysVersion()).version;
  } catch (err) {
    log.warn(`fetchLatestBaileysVersion gagal (${err.message}) — pakai default`);
    version = undefined;
  }

  const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' });

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: makeCacheableSignalKeyStore(authState.creds, logger),
    browser: Browsers.appropriate(config.wa.deviceName),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    defaultQueryTimeoutMs: 60_000,
    retryRequestDelayMs: 3000,
    fireInitQueries: true,
    getMessage: async () => undefined,
  });

  state.sock = sock;
  state.startedAt = Date.now();

  /* ---------------------------------------------------------- creds.update */
  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds();
    } catch (err) {
      log.error(`saveCreds gagal: ${err.message}`);
    }
    const creds = sock.authState?.creds || {};
    const me = creds.me?.id ? jidNormalizedUser(creds.me.id) : null;
    state.creds = {
      registered: Boolean(creds.registered),
      pushName: creds.pushName || creds.me?.name || null,
      me: me,
      jid: me,
      phone: me ? me.split('@')[0] : null,
      deviceId: creds.deviceId ?? null,
    };
    if (state.creds.registered && state.status !== 'open') {
      emit('wa:creds', { registered: true, phone: state.creds.phone });
    }
  });

  /* ----------------------------------------------------- connection.update */
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update || {};
    state.connectionState = connection || state.connectionState;

    if (qr) {
      await handleQr(qr, method, phone);
    }

    if (isNewLogin) {
      log.ok('login baru terdeteksi');
      emit('wa:login', { isNewLogin: true });
    }

    if (connection === 'connecting') {
      setStatus(state.creds.registered ? 'connecting' : 'qr');
      emit('wa:connecting', {});
    }

    if (connection === 'open') {
      state.reconnectAttempt = 0;
      state.lastError = null;
      state.qr = null;
      const creds = sock.authState?.creds || {};
      const me = creds.me?.id ? jidNormalizedUser(creds.me.id) : null;
      state.creds = {
        registered: true,
        pushName: creds.pushName || creds.me?.name || null,
        me,
        jid: me,
        phone: me ? me.split('@')[0] : null,
        deviceId: creds.deviceId ?? null,
      };
      setStatus('open');
      log.ok(`WA nyambung sebagai ${state.creds.phone ? prettyPhone(state.creds.phone) : 'unknown'} (${state.creds.pushName || 'tanpa nama'})`);
      emit('wa:connected', {
        phone: state.creds.phone,
        phonePretty: state.creds.phone ? prettyPhone(state.creds.phone) : null,
        pushName: state.creds.pushName,
        jid: state.creds.jid,
      });

      // Kalo tadi minta pairing code tapi user keburu scan QR, bereskan.
      state.pairing = null;
      if (receivedPendingNotifications) emit('wa:synced', {});
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error && new Boom(lastDisconnect.error)?.output?.statusCode) || null;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      const reasonMap = {
        401: 'loggedOut',
        403: 'forbidden',
        408: 'timedOut',
        411: 'multideviceMismatch',
        428: 'connectionClosed',
        440: 'connectionReplaced',
        500: 'badSession',
        503: 'unavailableService',
        515: 'restartRequired',
      };
      const reason = reasonMap[statusCode] || `code ${statusCode ?? 'unknown'}`;
      state.lastError = reason;
      log.warn(`koneksi nutup: ${reason} (shouldReconnect=${shouldReconnect})`);
      emit('wa:disconnected', { reason, statusCode, shouldReconnect });

      state.qr = null;
      state.connectionState = 'close';

      if (!shouldReconnect || statusCode === DisconnectReason.loggedOut) {
        setStatus('loggedOut');
        await wipeSession(reason);
        emit('wa:loggedOut', {
          reason,
          message: 'Session ke-logout dari HP lu. Scan QR ulang ya bos.',
        });
        if (state.pendingPairingResolve) {
          state.pendingPairingResolve({ ok: false, error: 'Session ke-logout, coba pairing ulang.' });
          state.pendingPairingResolve = null;
        }
        return;
      }

      setStatus('closed');
      if (statusCode === DisconnectReason.badSession) {
        await wipeSession('badSession');
        emit('wa:sessionWiped', { reason: 'badSession' });
      }
      scheduleReconnect(reason);
    }
  });

  /* ----------------------------------------------------- credentials.update */
  sock.ev.on('credentials.update', () => {
    log.debug('credentials.update');
  });

  /* ------------------------------------------------------- history sync off */
  sock.ev.on('messaging-history.set', () => {
    /* kita nggak butuh history chat, diem aja */
  });

  // Kalo ternyata udah ada session valid, Baileys bakal langsung 'open'.
  // Kalo belum registered dan method-nya pairing, tunggu QR pertama.
  if (!sock.authState?.creds?.registered && method === 'pairing' && phone) {
    state.pendingPairing = { method, phone };
  }

  return getStatus();
}

/* ------------------------------------------------------------------- QR ---- */
async function handleQr(rawQr, method, phone) {
  const raw = typeof rawQr === 'string' ? rawQr : String(rawQr || '');
  if (!raw) return;

  // Hindari spam event kalo QR-nya sama persis
  if (state.qr && state.qr.raw === raw && Date.now() < state.qr.expiresAt) return;

  let dataUrl = null;
  try {
    dataUrl = await QRCode.toDataURL(raw, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: '#0b0b14ff', light: '#ffffffff' },
    });
  } catch (err) {
    log.error(`bikin QR dataURL gagal: ${err.message}`);
  }

  state.qr = {
    raw,
    dataUrl,
    expiresAt: Date.now() + QR_TTL_MS,
    count: (state.qr?.count || 0) + 1,
    at: Date.now(),
  };
  setStatus('qr');
  log.info(`QR baru #${state.qr.count} (auto refresh tiap ~20-40s dari server WA)`);
  emit('wa:qr', { qr: state.qr });

  // Pairing code mode: begitu QR pertama nongol, socket udah siap auth.
  if (method === 'pairing' && phone && !state.creds.registered && !state.pairing) {
    try {
      const result = await requestPairing(phone);
      if (result.ok) log.ok(`pairing code diminta buat ${prettyPhone(result.phone)}`);
    } catch (err) {
      log.error(`auto pairing gagal: ${err.message}`);
    }
  }
}

/* ------------------------------------------------------- Pairing code ------ */
function normalizePairingCode(code) {
  const clean = String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!clean) return null;
  return clean.padEnd(8, '0').slice(0, 8);
}

/**
 * Minta pairing code 8 digit ke WhatsApp.
 * @param {string} phone nomor yang mau ditautkan (628...)
 * @param {string} [customCode] 8 karakter A-Z0-9 (opsional)
 */
async function requestPairing(phone, customCode) {
  if (config.mockSend) {
    const fake = normalizePairingCode('KYYDEVV8') || 'KYYDEVV8';
    state.pairing = { code: fake, phone: normalizePhone(phone), at: Date.now(), mock: true };
    setStatus('pairing');
    emit('wa:pairing', { ...state.pairing });
    return { ok: true, ...state.pairing };
  }

  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) {
    return { ok: false, error: 'Nomornya nggak valid bro. Format bener: 08xxx atau 628xxx.' };
  }
  if (!state.sock) {
    return { ok: false, error: 'Socket WA belum nyala. Klik Sambungkan dulu.' };
  }
  if (state.creds.registered) {
    return {
      ok: true,
      alreadyRegistered: true,
      phone: state.creds.phone,
      message: 'WA lu udah nyambung nih bos, nggak perlu pairing lagi.',
    };
  }

  const custom = customCode ? normalizePairingCode(customCode) : null;

  try {
    setStatus('pairing');
    // Kasih jeda dikit biar socket siap (kadang langsung dipanggil kecepetan)
    await delay(800);
    const code = await state.sock.requestPairingCode(normalized, custom || undefined);
    if (!code) throw new Error('WhatsApp nggak ngasih pairing code.');

    state.pairing = { code, phone: normalized, at: Date.now(), custom: Boolean(custom) };
    emit('wa:pairing', { ...state.pairing });

    if (state.pendingPairingResolve) {
      state.pendingPairingResolve({ ok: true, ...state.pairing });
      state.pendingPairingResolve = null;
    }

    log.ok(`pairing code: ${code} untuk ${prettyPhone(normalized)}`);
    return { ok: true, ...state.pairing };
  } catch (err) {
    const message = err?.message || String(err);
    log.error(`requestPairingCode gagal: ${message}`);
    state.lastError = message;
    setStatus(state.qr ? 'qr' : 'connecting');
    emit('wa:error', { message: `Pairing gagal: ${message}` });
    return { ok: false, error: message };
  }
}

/* ------------------------------------------------------------ disconnect --- */
async function disconnect({ wipe = false, reason = 'user' } = {}) {
  state.shuttingDown = true;
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.sock) {
    try {
      state.sock.ev.removeAllListeners('connection.update');
      state.sock.end(new Error(reason));
    } catch {
      /* udah mati */
    }
    state.sock = null;
  }
  if (wipe) await wipeSession(reason);
  state.qr = null;
  state.pairing = null;
  state.connectionState = 'close';
  setStatus('idle');
  state.shuttingDown = false;
  emit('wa:closed', { reason, wiped: wipe });
  log.warn(`koneksi diputus (${reason}) wipe=${wipe}`);
  return getStatus();
}

/* ------------------------------------------------------------- sending ---- */
function ensureConnected() {
  if (config.mockSend) return;
  if (!state.sock || state.status !== 'open' || !state.creds.registered) {
    const err = new Error('WA belum nyambung. Sambungkan dulu bos, baru gas kirim.');
    err.code = 'WA_NOT_CONNECTED';
    throw err;
  }
}

/**
 * Cek apakah nomor tujuan beneran ada di WhatsApp.
 * @returns {Promise<{exists:boolean, jid:string, normalized:string, reason?:string}>}
 */
async function checkNumber(rawPhone) {
  const normalized = normalizePhone(rawPhone);
  const jid = toUserJid(normalized);

  if (!isValidPhone(normalized)) {
    return { exists: false, jid, normalized, reason: 'FORMAT_SALAH' };
  }
  if (config.mockSend) {
    return { exists: true, jid, normalized, mock: true, reason: 'MOCK' };
  }

  ensureConnected();

  try {
    const result = await state.sock.onWhatsApp(jid);
    const hit = Array.isArray(result) ? result[0] : null;
    const exists = Boolean(hit?.exists);
    return {
      exists,
      jid: hit?.jid ? jidNormalizedUser(hit.jid) : jid,
      normalized,
      isBusiness: Boolean(hit?.jid && String(hit.jid).includes('@lid')),
      lid: hit?.lid || null,
      reason: exists ? 'OK' : 'TIDAK_TERDAFTAR',
    };
  } catch (err) {
    log.error(`onWhatsApp gagal: ${err.message}`);
    return { exists: false, jid, normalized, reason: 'QUERY_GAGAL', error: err.message };
  }
}

/**
 * Kirim video hasil kompresi ke nomor tujuan.
 * @param {object} args
 * @param {string} args.filePath path .mp4 hasil encode
 * @param {string} args.phone    nomor tujuan (08.../628...)
 * @param {string} [args.caption]
 * @param {string} [args.thumbPath] jpeg thumbnail
 * @param {function} [args.onStage] callback tahap: 'validate'|'presence'|'upload'|'sent'
 */
async function sendVideo({ filePath, phone, caption = '', thumbPath = null, onStage = null }) {
  const stage = (name, extra = {}) => {
    log.wa(`stage:${name} ${JSON.stringify(extra)}`);
    if (onStage) onStage(name, extra);
  };

  if (!fs.existsSync(filePath)) {
    throw new Error('File hasil kompresi nggak ketemu di server. Coba proses ulang ya.');
  }

  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) {
    throw new Error('Nomor tujuan nggak valid. Contoh bener: 0812xxxx atau 62812xxxx.');
  }

  /* --------------------------- MODE UJI --------------------------- */
  if (config.mockSend) {
    stage('validate', { mock: true });
    await sleep(700);
    stage('upload', { mock: true });
    await sleep(1300);
    const mockKey = { id: `MOCK${Date.now().toString(36).toUpperCase()}`, fromMe: true, remoteJid: toUserJid(normalized) };
    state.sentCount += 1;
    stage('sent', { mock: true });
    log.warn(`MOCK_SEND: pura-pura ngirim ke ${prettyPhone(normalized)}`);
    return {
      ok: true,
      mock: true,
      jid: toUserJid(normalized),
      phone: normalized,
      phonePretty: prettyPhone(normalized),
      key: mockKey,
      messageId: mockKey.id,
      sentAt: Date.now(),
      caption: caption || null,
      note: 'MOCK_SEND aktif — video nggak beneran terkirim ke WhatsApp.',
    };
  }

  /* --------------------------- MODE PRODUKSI --------------------------- */
  ensureConnected();
  stage('validate', {});

  const check = await checkNumber(normalized);
  if (!check.exists) {
    const msg =
      check.reason === 'FORMAT_SALAH'
        ? 'Format nomornya salah bro.'
        : check.reason === 'QUERY_GAGAL'
          ? `Gagal ngecek nomor (${check.error || 'unknown'}). Coba lagi sebentar.'`
          : `Nomor ${prettyPhone(normalized)} kayaknya nggak terdaftar di WhatsApp. Cek lagi ya.`;
    const err = new Error(msg);
    err.code = 'TARGET_INVALID';
    throw err;
  }

  const jid = check.jid;
  stage('presence', { jid });

  try {
    await state.sock.presenceSubscribe(jid);
    await state.sock.sendPresenceUpdate('available', jid);
  } catch (err) {
    log.warn(`presence gagal (lanjut aja): ${err.message}`);
  }

  const jpegThumbnail = thumbPath && fs.existsSync(thumbPath) ? fs.readFileSync(thumbPath) : undefined;
  const content = {
    video: { url: filePath },
    mimetype: 'video/mp4',
    caption: caption || undefined,
    ...(jpegThumbnail ? { jpegThumbnail } : {}),
  };

  stage('upload', { jid });
  const sent = await state.sock.sendMessage(jid, content, {
    ephemeralExpiration: undefined,
  });

  if (!sent || !sent.key) {
    throw new Error('WhatsApp nggak ngasih konfirmasi pesan terkirim. Coba lagi ya.');
  }

  state.sentCount += 1;
  stage('sent', { jid, messageId: sent.key.id });

  log.ok(`VIDEO KEKIRIM ke ${prettyPhone(normalized)} (msgId=${sent.key.id})`);

  return {
    ok: true,
    mock: false,
    jid,
    phone: normalized,
    phonePretty: prettyPhone(normalized),
    key: sent.key,
    messageId: sent.key.id,
    messageTimestamp: sent.messageTimestamp || null,
    sentAt: Date.now(),
    caption: caption || null,
  };
}

/* -------------------------------------------------------------- lifecycle --- */
async function shutdown() {
  state.shuttingDown = true;
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  if (state.sock) {
    try {
      state.sock.end(new Error('server shutdown'));
    } catch {
      /* ignore */
    }
  }
  state.sock = null;
}

/** Boot awal: kalo ada session valid langsung nyambung, kalo nggak nunggu user action. */
async function boot() {
  await fsp.mkdir(SESSION_DIR, { recursive: true });
  if (config.mockSend) {
    setStatus('open');
    log.warn('MOCK_SEND=true -> status WA dipaksa "open" (simulasi).');
    return getStatus();
  }

  const info = await sessionInfo();
  if (info.exists) {
    log.info(`session lama ketemu (${info.files} file) -> coba nyambung otomatis`);
    startConnection({ method: 'qr' }).catch((err) => log.error(`boot connect gagal: ${err.message}`));
  } else {
    setStatus('idle');
    log.info('belum ada session. Tunggu user scan QR / pairing code dari UI.');
  }
  return getStatus();
}

module.exports = {
  boot,
  startConnection,
  disconnect,
  shutdown,
  requestPairing,
  normalizePairingCode,
  checkNumber,
  sendVideo,
  getStatus,
  onWaEvent,
  wipeSession,
  sessionInfo,
  state,
  SESSION_DIR,
};
