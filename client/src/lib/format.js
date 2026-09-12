/**
 * Util format sisi client — kembaran server/utils/format.js
 * (aturan normalisasi nomor WA harus identik biar nggak ada miskom)
 * (c) KyyDevv
 */

export function normalizePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[^0-9]/g, '');
  if (!s) return '';
  if (s.startsWith('0')) s = `62${s.slice(1)}`;
  else if (s.startsWith('8') && s.length >= 9 && s.length <= 13) s = `62${s}`;
  else if (s.startsWith('620')) s = `62${s.slice(3)}`;
  return s;
}

export function isValidPhone(raw) {
  const s = normalizePhone(raw);
  return s.length >= 9 && s.length <= 16;
}

export function prettyPhone(raw) {
  const s = normalizePhone(raw);
  if (!s) return '';
  if (s.startsWith('62')) return `62 ${s.slice(2, 5)}-${s.slice(5, 9)}-${s.slice(9)}`.replace(/-+$/g, '');
  return s;
}

export function maskPhone(raw) {
  const s = normalizePhone(raw);
  if (s.length < 6) return s;
  return `${s.slice(0, 4)}${'•'.repeat(Math.max(2, s.length - 8))}${s.slice(-4)}`;
}

export function formatBytes(bytes, digits = 2) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}j ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}d`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}d`;
  return `${sec}d`;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** '3.2x' / '12x' -> kecepatan encode ffmpeg */
export function formatSpeed(speed) {
  if (!speed) return '—';
  const n = parseFloat(String(speed).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return String(speed);
  return `${n.toFixed(n < 10 ? 1 : 0)}x`;
}

/** ETA dari ffmpeg ('00:00:12' atau detik) -> '12 detik lagi' */
export function formatEta(eta) {
  if (eta === null || eta === undefined || eta === '') return null;
  let sec = 0;
  if (typeof eta === 'string' && eta.includes(':')) {
    const parts = eta.split(':').map(Number);
    sec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + (parts[1] || 0);
  } else {
    sec = Number(eta);
  }
  if (!Number.isFinite(sec) || sec <= 0) return null;
  sec = Math.round(sec);
  if (sec < 60) return `${sec} detik lagi`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}d lagi` : `${m} menit lagi`;
}

export function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - Number(ts);
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${Math.max(1, sec)} detik lalu`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour} jam lalu`;
  const day = Math.round(hour / 24);
  return `${day} hari lalu`;
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
