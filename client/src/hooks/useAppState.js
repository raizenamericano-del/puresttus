/**
 * ============================================================================
 *  KyyPureStatus — Client State Store (useSyncExternalStore)
 * ============================================================================
 *  Satu sumber kebenaran buat seluruh UI: socket events, upload, pipeline,
 *  WhatsApp, riwayat, notifikasi. Komponen tinggal subscribe via useAppState().
 * ============================================================================
 *  (c) KyyDevv
 */
import { useSyncExternalStore } from 'react';
import { getSocket, emit, emitAsync } from '../lib/socket.js';
import api from '../lib/api.js';
import { normalizePhone, isValidPhone, prettyPhone, formatBytes } from '../lib/format.js';

/* ------------------------------------------------------------------ state -- */
const createState = () => ({
  connected: false,
  connecting: true,
  config: {
    mockSend: false,
    maxUploadMb: 100,
    waMediaLimitMb: 50,
    historyLimit: 8,
    allowedExt: ['.mp4', '.mov', '.mkv', '.webm'],
    cleanupIntervalMs: 600000,
    maxConcurrentJobs: 1,
    branding: { name: 'KyyPureStatus', tagline: 'Video HD, Anti Buram, Auto Terkirim.', author: 'KyyDevv' },
  },

  wa: {
    status: 'idle',
    connected: false,
    registered: false,
    mockSend: false,
    me: null,
    qr: null,
    pairing: null,
    lastError: null,
    reconnectAttempt: 0,
    sentCount: 0,
  },

  file: null, // { id, file, name, size, previewUrl, uploading, uploadPercent, info, plan, probeError }
  job: null, // { jobId, phase, stage, stageLabel, percent, eta, speed, fps, bitrateKbps, mode, pass, notice, startedAt }
  result: null, // hasil akhir dari job:done
  sendResult: null,
  error: null, // { message, code }
  cancelled: false,

  history: [],
  state: { lastTarget: '', recentTargets: [], lastCaption: '', lastLoginMethod: 'qr', stats: null },

  ui: {
    modal: null, // 'connect' | 'info' | null
    connectTab: 'qr', // 'qr' | 'pair'
    toasts: [],
    busy: false,
  },
});

let state = createState();
const listeners = new Set();
let toastSeq = 0;

function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  return state;
}

export function useAppState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getState() {
  return state;
}

/* ----------------------------------------------------------------- toasts -- */
function toast(message, tone = 'info', ttl = 4200) {
  const id = ++toastSeq;
  setState((s) => ({ ui: { ...s.ui, toasts: [...s.ui.toasts, { id, message, tone }].slice(-4) } }));
  setTimeout(() => dismissToast(id), ttl);
  return id;
}

export function dismissToast(id) {
  setState((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } }));
}

/* ------------------------------------------------------------ stage label -- */
const STAGE_LABEL = {
  queued: 'Ngantri bentar...',
  probing: 'Lagi ngebongkar metadata video lu',
  compressing: 'Mesin FFmpeg lagi masak',
  validating: 'Ngecek hasil kompresi',
  thumbing: 'Bikin thumbnail',
  checking: 'Ngecek nomor tujuan di WhatsApp',
  sending: 'Ngirim ke WhatsApp',
  done: 'Beres total',
  cancelled: 'Dibatalkan',
  error: 'Ada yang nggak beres',
};

function phaseFromStage(stage) {
  if (['queued', 'probing', 'compressing', 'validating', 'thumbing'].includes(stage)) return 'compressing';
  if (['checking', 'sending'].includes(stage)) return 'sending';
  if (stage === 'done') return 'done';
  if (stage === 'cancelled') return 'cancelled';
  if (stage === 'error') return 'error';
  return 'processing';
}

/* ============================================================ ACTIONS ==== */
let bound = false;

export function bindSocket() {
  if (bound) return () => {};
  bound = true;
  const socket = getSocket();

  socket.on('connect', () => setState({ connected: true, connecting: false }));
  socket.on('disconnect', (reason) => {
    setState({ connected: false });
    if (reason !== 'io client disconnect') toast('Koneksi ke server putus bentar, lagi nyambung ulang...', 'warn');
  });
  socket.on('connect_error', (err) => {
    setState({ connected: false, connecting: false });
    if (String(err?.message || '').includes('UNAUTHORIZED')) {
      toast('Token API salah. Isi token yang bener di menu Info ya.', 'error');
    }
  });
  socket.on('reconnect', () => {
    setState({ connected: true });
    toast('Nyambung lagi ke server ✅', 'success', 2600);
  });

  /* ---------------------------------------------------------- init ----- */
  socket.on('init', (payload) => {
    if (!payload?.ok) return;
    setState({
      config: { ...state.config, ...(payload.config || {}) },
      wa: { ...state.wa, ...(payload.wa || {}) },
      history: payload.history || [],
      state: { ...state.state, ...(payload.state || {}) },
      connecting: false,
    });
    if (payload.activeJob) {
      setState({
        job: {
          jobId: payload.activeJob.jobId,
          phase: phaseFromStage(payload.activeJob.stage),
          stage: payload.activeJob.stage,
          stageLabel: STAGE_LABEL[payload.activeJob.stage] || payload.activeJob.stage,
          percent: payload.activeJob.progress?.percent || 0,
          mode: payload.activeJob.progress?.mode || 'crf',
          pass: payload.activeJob.progress?.pass || 1,
        },
      });
      toast('Server masih ngerjain proses lu yang tadi, dilanjut ya 👀', 'info', 5000);
    }
  });

  /* ------------------------------------------------------- whatsapp ---- */
  socket.on('wa:status', (payload) => {
    if (!payload || typeof payload !== 'object') return;
    setState((s) => {
      const wa = { ...s.wa };
      for (const [k, v] of Object.entries(payload)) {
        // Jangan pernah nimpa data yang udah ada dengan null/undefined
        if (v === null || v === undefined) {
          if (wa[k] === undefined) wa[k] = v;
          continue;
        }
        wa[k] = v;
      }
      return { wa };
    });
  });

  socket.on('wa:qr', (payload) => {
    setState((s) => {
      const qr = payload.qr || { dataUrl: payload.dataUrl, expiresAt: payload.expiresAt, count: payload.count };
      const shouldOffer = !s.wa.registered && !s.wa.qrOffered && s.ui.modal === null;
      return {
        wa: { ...s.wa, qr, status: 'qr', qrOffered: s.wa.qrOffered || shouldOffer },
        ui: shouldOffer ? { ...s.ui, modal: 'connect', connectTab: 'qr' } : s.ui,
      };
    });
  });

  socket.on('wa:pairing', (payload) => {
    setState((s) => ({ wa: { ...s.wa, pairing: payload, status: 'pairing' } }));
    toast(`Pairing code lu: ${payload.code} — masukin di WA (Perangkat Tertaut → Tautkan dengan nomor)`, 'info', 12000);
  });

  socket.on('wa:connected', (payload) => {
    setState((s) => ({
      wa: {
        ...s.wa,
        status: 'open',
        connected: true,
        registered: true,
        me: { phone: payload.phone, phonePretty: payload.phonePretty, pushName: payload.pushName, jid: payload.jid },
        qr: null,
        pairing: null,
        lastError: null,
        reconnectAttempt: 0,
        qrOffered: false,
      },
      ui: { ...s.ui, modal: null },
    }));
    toast(`WA lu udah nyambung nih bos (${payload.phonePretty || payload.phone || 'ok'}) 🔗`, 'success');
  });

  socket.on('wa:disconnected', (payload) => {
    setState((s) => ({
      wa: { ...s.wa, status: 'closed', connected: false, lastError: payload.reason || 'disconnected' },
    }));
    toast(`WA keputus (${payload.reason || 'unknown'}) — server lagi nyoba nyambung ulang...`, 'warn', 6000);
  });

  socket.on('wa:reconnecting', (payload) => {
    setState((s) => ({ wa: { ...s.wa, reconnectAttempt: payload.attempt, status: 'connecting' } }));
  });

  socket.on('wa:loggedOut', (payload) => {
    setState((s) => ({
      wa: { ...s.wa, status: 'loggedOut', connected: false, registered: false, me: null, qr: null, pairing: null, lastError: 'loggedOut', qrOffered: false },
    }));
    toast(payload.message || 'Session ke-logout. Scan QR ulang ya bos.', 'error', 8000);
  });

  socket.on('wa:error', (payload) => toast(payload.message || 'Ada error di sisi WhatsApp.', 'error', 7000));

  /* ---------------------------------------------------------- jobs ----- */
  socket.on('job:start', (payload) => {
    const job = payload.job || {};
    setState((s) => ({
      job: {
        jobId: job.jobId || payload.jobId,
        phase: 'processing',
        stage: job.stage || 'queued',
        stageLabel: STAGE_LABEL[job.stage] || 'Mulai proses...',
        percent: 0,
        eta: null,
        speed: null,
        fps: null,
        bitrateKbps: null,
        mode: 'crf',
        pass: 1,
        notice: null,
        startedAt: Date.now(),
        target: job.targetPretty || null,
        resend: Boolean(payload.resend || job.isResend),
      },
      error: null,
      cancelled: false,
      result: payload.resend ? s.result : null,
      sendResult: null,
    }));
    if (payload.resend) toast('Gas kirim ulang dari riwayat 🚀', 'info', 3000);
  });

  socket.on('job:stage', (payload) => {
    const stage = payload.stage;
    setState((s) => ({
      job: s.job
        ? {
            ...s.job,
            stage,
            stageLabel: STAGE_LABEL[stage] || stage,
            phase: phaseFromStage(stage),
          }
        : s.job,
    }));
  });

  socket.on('compress:plan', (payload) => {
    const plan = payload.plan || {};
    setState((s) => ({
      job: s.job
        ? {
            ...s.job,
            plan: {
              label: plan.label,
              tier: plan.tier,
              crf: plan.crf,
              width: plan.width,
              height: plan.height,
              maxBitrateK: plan.maxBitrateK,
              audio: plan.audio,
              reason: plan.reason,
              limitPretty: plan.limitPretty,
            },
          }
        : s.job,
      file: s.file ? { ...s.file, plan: s.file.plan || plan } : s.file,
    }));
  });

  socket.on('compress:progress', (p) => {
    setState((s) => ({
      job: s.job
        ? {
            ...s.job,
            phase: 'compressing',
            stage: 'compressing',
            stageLabel: STAGE_LABEL.compressing,
            percent: typeof p.percent === 'number' ? p.percent : s.job.percent,
            eta: p.eta ?? null,
            speed: p.speed ?? null,
            fps: p.fps ?? null,
            bitrateKbps: p.bitrateKbps ?? null,
            outSizeKb: p.outSizeKb ?? null,
            mode: p.mode || s.job.mode,
            pass: p.pass || s.job.pass,
            notice: p.notice || (p.reset ? null : s.job.notice),
            final: Boolean(p.final),
          }
        : s.job,
    }));
    if (p.notice) toast(p.notice, 'warn', 7000);
  });

  socket.on('job:progress', (p) => {
    // alias dari compress:progress — cukup satu yang diproses
    if (p.stage && p.stage !== 'compressing') {
      setState((s) => (s.job ? { job: { ...s.job, stage: p.stage, stageLabel: STAGE_LABEL[p.stage] || p.stage } } : {}));
    }
  });

  socket.on('job:sendProgress', (payload) => {
    setState((s) => ({
      job: s.job
        ? {
            ...s.job,
            phase: 'sending',
            stage: payload.stage === 'upload' ? 'sending' : payload.stage,
            stageLabel:
              payload.stage === 'validate'
                ? 'Ngecek nomor tujuan'
                : payload.stage === 'presence'
                  ? 'Nyapa WhatsApp'
                  : payload.stage === 'upload'
                    ? 'Ngupload video ke server WA'
                    : payload.stage === 'sent'
                      ? 'Kekirim!'
                      : STAGE_LABEL[payload.stage] || payload.stage,
            percent: 100,
          }
        : s.job,
    }));
  });

  socket.on('job:done', (payload) => {
    const result = payload.result || {};
    const send = payload.send || null;

    setState((s) => ({
      job: s.job ? { ...s.job, phase: 'done', stage: 'done', stageLabel: STAGE_LABEL.done, percent: 100 } : s.job,
      result: { ...result, jobId: payload.jobId, resend: Boolean(payload.resend), directSend: Boolean(payload.directSend) },
      sendResult: send,
      error: null,
      cancelled: false,
      wa: send && !send.mock ? { ...s.wa, sentCount: (s.wa.sentCount || 0) + 1 } : s.wa,
    }));

    if (send) {
      if (send.mock) {
        toast('Video Kekirim! 🎉 (tapi ini MOCK_SEND, cuma simulasi buat ngetes UI)', 'success', 6000);
      } else {
        toast(`Video Kekirim ke ${send.targetPretty || send.target}! 🎉 Tinggal diterusin ke Status.`, 'success', 6000);
      }
    } else {
      toast(`Kelar dikompres! ${result.sizePretty || ''} siap dipakai 🎉`, 'success', 5000);
    }
  });

  socket.on('job:cancelled', (payload) => {
    setState((s) => ({
      job: s.job ? { ...s.job, phase: 'cancelled', stage: 'cancelled', stageLabel: STAGE_LABEL.cancelled } : s.job,
      cancelled: true,
      result: null,
      sendResult: null,
    }));
    toast(payload.message || 'Oke, dibatalin. Video lu tetep aman di server 👍', 'info', 4000);
  });

  socket.on('job:error', (payload) => {
    const message = payload.message || payload.error || 'Ada yang error, tapi servernya diem aja.';
    setState((s) => ({
      job: s.job ? { ...s.job, phase: 'error', stage: 'error', stageLabel: STAGE_LABEL.error } : s.job,
      error: { message, code: payload.code || 'ERROR' },
    }));
    toast(message, 'error', 8000);
  });

  socket.on('job:cancelling', () => {
    setState((s) => (s.job ? { job: { ...s.job, stageLabel: 'Ngerem ffmpeg...' } } : {}));
  });

  socket.on('job:targetCheck', (payload) => {
    if (!payload.exists) {
      toast(`Nomor ${prettyPhone(payload.normalized || '')} nggak kedeteksi di WhatsApp (${payload.reason})`, 'warn', 6000);
    }
  });

  /* ------------------------------------------------------- history ----- */
  socket.on('history:update', (list) => setState({ history: Array.isArray(list) ? list : [] }));

  socket.on('cleanup:done', (payload) => {
    if (payload?.removedFiles > 0) {
      toast(`Auto-cleanup nyapu ${payload.removedFiles} file basi 🧹`, 'info', 3500);
    }
  });

  return () => {
    bound = false;
    socket.removeAllListeners();
  };
}

/* ------------------------------------------------------------- upload ---- */
export async function pickFile(file) {
  if (!file) return;

  const maxBytes = (state.config.maxUploadMb || 100) * 1024 * 1024;
  if (file.size > maxBytes) {
    toast(`File lu ${formatBytes(file.size)} — maks ${state.config.maxUploadMb}MB bro. Kegedean 😭`, 'error', 6000);
    return;
  }

  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v|3gp|ts|flv|wmv)$/i.test(file.name);
  if (!isVideo) {
    toast('Itu bukan video bro. Drop file .mp4 / .mov / .mkv / .webm ya.', 'error', 5000);
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  setState({
    file: {
      id: null,
      file,
      name: file.name,
      size: file.size,
      previewUrl,
      uploading: true,
      uploadPercent: 0,
      info: null,
      plan: null,
      probeError: null,
    },
    job: null,
    result: null,
    sendResult: null,
    error: null,
    cancelled: false,
  });

  try {
    const res = await api.upload(file, {
      onProgress: (p) => {
        setState((s) => (s.file ? { file: { ...s.file, uploadPercent: p.percent } } : {}));
      },
    });

    setState((s) => ({
      file: s.file
        ? {
            ...s.file,
            id: res.uploadId,
            uploading: false,
            uploadPercent: 100,
            info: res.info,
            plan: res.plan,
            probeError: res.probeError,
            previewUrl: s.file.previewUrl,
          }
        : s.file,
    }));

    const info = res.info;
    toast(
      info
        ? `Video naik ke server ✅ ${formatBytes(res.size)} • ${info.width}x${info.height} ${info.orientation} • ${info.durationPretty}`
        : `Video naik ke server ✅ ${formatBytes(res.size)}`,
      'success',
      4200,
    );
    return res;
  } catch (err) {
    setState((s) => ({
      file: s.file ? { ...s.file, uploading: false, uploadPercent: 0 } : s.file,
      error: { message: err.message, code: err.code || 'UPLOAD_FAILED' },
    }));
    toast(err.message, 'error', 7000);
    throw err;
  }
}

export function clearFile() {
  const f = state.file;
  if (f?.previewUrl) {
    try {
      URL.revokeObjectURL(f.previewUrl);
    } catch {
      /* ignore */
    }
  }
  if (f?.id) {
    api.deleteUpload(f.id).catch(() => {});
  }
  setState({ file: null, job: null, result: null, sendResult: null, error: null, cancelled: false });
}

/* ------------------------------------------------------------ pipeline --- */
export async function startProcess({ target, caption } = {}) {
  const f = state.file;
  if (!f?.id) {
    toast('Belum ada video yang ke-upload. Drop dulu videonya bro.', 'warn');
    return null;
  }

  const normalized = normalizePhone(target || state.state.lastTarget || '');
  const mock = state.config.mockSend;

  if (!mock && !normalized) {
    toast('Isi dulu nomor WA tujuannya. Kalo cuma mau ngetes, nyalain MOCK_SEND di server.', 'warn', 5000);
    return null;
  }
  if (!mock && !isValidPhone(normalized)) {
    toast('Nomornya nggak valid. Contoh bener: 081234567890 atau 6281234567890.', 'warn', 5000);
    return null;
  }
  if (!mock && state.wa.status !== 'open') {
    toast('WA lu belum nyambung. Scan QR dulu di tombol "Sambungkan WA" 👆', 'warn', 6000);
    setState((s) => ({ ui: { ...s.ui, modal: 'connect', connectTab: 'qr' } }));
    return null;
  }

  setState({ error: null, cancelled: false, result: null, sendResult: null, ui: { ...state.ui, busy: true } });

  try {
    const res = await emitAsync(
      'video:process',
      { uploadId: f.id, target: normalized, caption: caption ?? state.state.lastCaption ?? '' },
      30000,
    );
    if (res && res.ok === false) throw new Error(res.error);
    setState({ ui: { ...state.ui, busy: false } });
    return res?.job || null;
  } catch (err) {
    setState({ ui: { ...state.ui, busy: false }, error: { message: err.message, code: err.code || 'PROCESS_FAILED' } });
    toast(err.message, 'error', 7000);
    return null;
  }
}

export async function cancelJob() {
  const jobId = state.job?.jobId;
  try {
    const res = await emitAsync('video:cancel', { jobId }, 10000);
    if (res?.ok === false) throw new Error(res.error);
    toast('Oke, ffmpeg-nya gw cekik 🛑', 'info', 3000);
    return true;
  } catch (err) {
    toast(err.message, 'error');
    return false;
  }
}

export async function resendFromHistory(entry, { target, caption } = {}) {
  const normalized = normalizePhone(target || entry.target || state.state.lastTarget || '');
  if (!state.config.mockSend && !isValidPhone(normalized)) {
    toast('Isi nomor tujuan dulu buat kirim ulang bro.', 'warn', 5000);
    return null;
  }
  setState({
    result: null,
    sendResult: null,
    error: null,
    cancelled: false,
    job: {
      jobId: `resend_${entry.id}`,
      phase: 'sending',
      stage: 'checking',
      stageLabel: STAGE_LABEL.checking,
      percent: 100,
      mode: 'resend',
      pass: 0,
      target: prettyPhone(normalized),
      resend: true,
    },
  });
  try {
    const res = await emitAsync(
      'video:resend',
      { historyId: entry.id, target: normalized, caption: caption ?? entry.caption ?? '' },
      30000,
    );
    if (res?.ok === false) throw new Error(res.error);
    return res?.job || null;
  } catch (err) {
    setState({ error: { message: err.message, code: err.code || 'RESEND_FAILED' }, job: null });
    toast(err.message, 'error', 7000);
    return null;
  }
}

/* ------------------------------------------------------------- history --- */
export async function refreshHistory() {
  try {
    const res = await emitAsync('history:get', {}, 10000);
    if (res?.ok) setState({ history: res.history || [] });
  } catch (err) {
    toast(err.message, 'error');
  }
}

export async function deleteHistory(id) {
  try {
    const res = await emitAsync('history:delete', { id }, 10000);
    if (res?.ok) setState({ history: res.history || [] });
    toast('Satu riwayat dihapus 🧹', 'info', 2600);
  } catch (err) {
    toast(err.message, 'error');
  }
}

export async function clearHistory() {
  try {
    await emitAsync('history:clear', {}, 10000);
    setState({ history: [] });
    toast('Riwayat dibersihin semua ✨', 'info', 2600);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ------------------------------------------------------------ whatsapp --- */
export async function connectWa(method = 'qr', { phone = '', code = '' } = {}) {
  setState({ ui: { ...state.ui, modal: 'connect', connectTab: method === 'pairing' ? 'pair' : 'qr' } });
  try {
    const res = await emitAsync('wa:connect', { method, phone: phone ? normalizePhone(phone) : null, code }, 90000);
    if (res?.ok === false) {
      toast(res.error, 'error', 7000);
      return res;
    }
    if (method === 'qr') toast('QR code-nya lagi dibuat, siap-siap scan 📲', 'info', 4000);
    return res;
  } catch (err) {
    toast(err.message, 'error', 7000);
    return { ok: false, error: err.message };
  }
}

export async function requestPairing(phone, code = '') {
  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) {
    toast('Nomor HP lu nggak valid buat pairing. Contoh: 081234567890.', 'warn', 5000);
    return { ok: false };
  }
  try {
    const res = await emitAsync('wa:pair', { phone: normalized, code }, 90000);
    if (res?.ok === false) {
      toast(res.error, 'error', 7000);
      return res;
    }
    return res;
  } catch (err) {
    toast(err.message, 'error', 7000);
    return { ok: false, error: err.message };
  }
}

export async function disconnectWa(wipe = false) {
  try {
    await emitAsync('wa:disconnect', { wipe }, 20000);
    setState((s) => ({ wa: { ...s.wa, status: 'idle', connected: false, qr: null, pairing: null } }));
    toast(wipe ? 'Session dihapus bersih. Tinggal scan QR lagi kapan aja.' : 'Koneksi WA diputus.', 'info');
  } catch (err) {
    toast(err.message, 'error');
  }
}

export async function checkNumber(phone) {
  try {
    return await emitAsync('wa:check', { phone: normalizePhone(phone) }, 20000);
  } catch (err) {
    return { ok: false, exists: false, error: err.message };
  }
}

/* ------------------------------------------------------------ preferensi -- */
export function setUi(patch) {
  setState((s) => ({ ui: { ...s.ui, ...patch } }));
}

export function setConnectTab(tab) {
  setState((s) => ({ ui: { ...s.ui, connectTab: tab } }));
}

export function openModal(modal) {
  setState((s) => ({ ui: { ...s.ui, modal } }));
}

export function closeModal() {
  setState((s) => ({ ui: { ...s.ui, modal: null } }));
}

export async function setLastTarget(target) {
  const normalized = normalizePhone(target);
  setState((s) => ({ state: { ...s.state, lastTarget: normalized } }));
  emit('state:set', { lastTarget: normalized });
}

export async function setLastCaption(caption) {
  setState((s) => ({ state: { ...s.state, lastCaption: caption } }));
  emit('state:set', { lastCaption: caption });
}

export function resetAll() {
  clearFile();
  setState({ job: null, result: null, sendResult: null, error: null, cancelled: false });
}

export const actions = {
  toast,
  dismissToast,
  pickFile,
  clearFile,
  startProcess,
  cancelJob,
  resendFromHistory,
  refreshHistory,
  deleteHistory,
  clearHistory,
  connectWa,
  requestPairing,
  disconnectWa,
  checkNumber,
  setUi,
  setConnectTab,
  openModal,
  closeModal,
  setLastTarget,
  setLastCaption,
  resetAll,
};

export default actions;
