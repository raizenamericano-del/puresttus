/**
 * Util format & normalisasi — dipake bareng di sisi server.
 * Client punya kembaran di client/src/lib/format.js supaya aturan identik.
 */
'use strict';

/** '081234567890' / '+62 812-3456-7890' -> '6281234567890' */
function normalizePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[^0-9]/g, '');
  if (!s) return '';
  if (s.startsWith('0')) s = `62${s.slice(1)}`;
  else if (s.startsWith('8') && s.length >= 9 && s.length <= 13) s = `62${s}`;
  else if (s.startsWith('620')) s = `62${s.slice(3)}`;
  return s;
}

function isValidPhone(raw) {
  const s = normalizePhone(raw);
  return s.length >= 9 && s.length <= 16;
}

function toUserJid(raw) {
  const s = normalizePhone(raw);
  return s ? `${s}@s.whatsapp.net` : '';
}

/** '6281234567890' -> '62 812-3456-7890' biar enak dibaca */
function prettyPhone(raw) {
  const s = normalizePhone(raw);
  if (!s) return '';
  if (s.startsWith('62')) return `62 ${s.slice(2, 5)}-${s.slice(5, 9)}-${s.slice(9)}`.replace(/-+$/g, '');
  return s;
}

function formatBytes(bytes, digits = 2) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}j ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}d`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}d`;
  return `${sec}d`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Bikin dimensi genap (wajib buat yuv420p) */
const even = (n) => Math.max(2, 2 * Math.round(Number(n) / 2));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeName(name, fallback = 'video') {
  return (
    String(name || '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || fallback
  );
}

module.exports = {
  normalizePhone,
  isValidPhone,
  toUserJid,
  prettyPhone,
  formatBytes,
  formatDuration,
  clamp,
  even,
  sleep,
  safeName,
};
