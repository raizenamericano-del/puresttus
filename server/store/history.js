/**
 * KyyPureStatus — Riwayat (history.json)
 * Simpan 8 proses terakhir supaya bisa "Kirim Ulang" tanpa upload ulang.
 * Tulis async & antre (write queue) biar nggak corrupt kalo barengan.
 *
 * (c) KyyDevv
 */
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const config = require('../config');
const log = require('../utils/logger').scope('history');
const { findOutput, findThumb, findUpload, removeFile } = require('../utils/files');
const { prettyPhone } = require('../utils/format');

const FILE = config.paths.historyFile;
const LIMIT = config.cleanup.historyLimit;

let cache = [];
let loaded = false;
let writeQueue = Promise.resolve();

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const safe = {
    id: String(entry.id || '').slice(0, 64),
    createdAt: Number(entry.createdAt) || Date.now(),
    finishedAt: Number(entry.finishedAt) || null,
    sourceName: String(entry.sourceName || 'video').slice(0, 120),
    sourceId: entry.sourceId ? String(entry.sourceId).slice(0, 64) : null,
    sourceBytes: Number(entry.sourceBytes) || 0,
    sourceDuration: Number(entry.sourceDuration) || 0,
    sourceResolution: entry.sourceResolution ? String(entry.sourceResolution).slice(0, 20) : null,
    outputId: entry.outputId ? String(entry.outputId).slice(0, 64) : null,
    outputBytes: Number(entry.outputBytes) || 0,
    outputResolution: entry.outputResolution ? String(entry.outputResolution).slice(0, 20) : null,
    outputDuration: Number(entry.outputDuration) || 0,
    mode: String(entry.mode || 'crf').slice(0, 10),
    tier: Number(entry.tier) || null,
    label: entry.label ? String(entry.label).slice(0, 30) : null,
    crf: entry.crf != null ? Number(entry.crf) : null,
    videoBitrateKbps: entry.videoBitrateKbps != null ? Number(entry.videoBitrateKbps) : null,
    passes: Number(entry.passes) || 1,
    encodeSeconds: Number(entry.encodeSeconds) || 0,
    target: entry.target ? String(entry.target).slice(0, 20) : null,
    targetPretty: entry.target ? prettyPhone(entry.target) : null,
    messageId: entry.messageId ? String(entry.messageId).slice(0, 80) : null,
    caption: entry.caption ? String(entry.caption).slice(0, 200) : null,
    status: String(entry.status || 'success').slice(0, 20),
    mock: Boolean(entry.mock),
    error: entry.error ? String(entry.error).slice(0, 300) : null,
    thumbId: entry.thumbId ? String(entry.thumbId).slice(0, 64) : null,
  };
  return safe.id ? safe : null;
}

async function load() {
  if (loaded) return cache;
  try {
    const raw = await fsp.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed) ? parsed.map(sanitizeEntry).filter(Boolean).slice(0, LIMIT) : [];
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`history.json rusak (${err.message}) — mulai dari kosong`);
    cache = [];
  }
  loaded = true;
  return cache;
}

function scheduleWrite() {
  writeQueue = writeQueue.then(async () => {
    try {
      await fsp.mkdir(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8');
      await fsp.rename(tmp, FILE);
    } catch (err) {
      log.error(`gagal nulis history.json: ${err.message}`);
    }
  });
  return writeQueue;
}

async function getAll() {
  await load();
  // Buang entri yang file output-nya udah disapu auto-cleanup
  const fresh = [];
  for (const entry of cache) {
    if (entry.outputId && entry.status === 'success') {
      const exists = await findOutput(entry.outputId);
      if (!exists) {
        log.debug(`history ${entry.id} di-skip: file output udah ilang`);
        continue;
      }
    }
    fresh.push(entry);
  }
  if (fresh.length !== cache.length) {
    cache = fresh;
    scheduleWrite();
  }
  return decorate(cache);
}

function decorate(list) {
  const maxAge = config.cleanup.historyMaxAgeDays * 24 * 60 * 60 * 1000;
  return list
    .filter((e) => Date.now() - e.createdAt < maxAge)
    .map((e) => ({
      ...e,
      url: e.outputId ? `/api/files/${e.outputId}` : null,
      thumbUrl: e.thumbId ? `/api/thumbs/${e.thumbId}` : null,
      sourceUrl: e.sourceId ? `/api/uploads/${e.sourceId}` : null,
      savedBytes: Math.max(0, (e.sourceBytes || 0) - (e.outputBytes || 0)),
      ratio: e.sourceBytes > 0 ? Number((e.outputBytes / e.sourceBytes).toFixed(3)) : null,
      canResend: Boolean(e.outputId) && e.status === 'success',
      ageMs: Date.now() - e.createdAt,
    }));
}

async function add(entry) {
  await load();
  const safe = sanitizeEntry(entry);
  if (!safe) return null;
  cache = [safe, ...cache.filter((e) => e.id !== safe.id)].slice(0, LIMIT);
  scheduleWrite();
  log.info(`history +${safe.id} (total ${cache.length})`);
  return decorate([safe])[0];
}

async function get(id) {
  await load();
  const hit = cache.find((e) => e.id === id);
  return hit ? decorate([hit])[0] : null;
}

async function remove(id, { deleteFiles = true } = {}) {
  await load();
  const hit = cache.find((e) => e.id === id);
  cache = cache.filter((e) => e.id !== id);
  scheduleWrite();

  if (hit && deleteFiles) {
    const targets = [hit.outputId && (await findOutput(hit.outputId)), hit.thumbId && (await findThumb(hit.thumbId))]
      .filter(Boolean);
    for (const t of targets) await removeFile(t);
  }
  return Boolean(hit);
}

async function clear({ deleteFiles = true } = {}) {
  await load();
  const old = cache.slice();
  cache = [];
  scheduleWrite();
  if (deleteFiles) {
    for (const e of old) {
      const out = e.outputId ? await findOutput(e.outputId) : null;
      const th = e.thumbId ? await findThumb(e.thumbId) : null;
      const up = e.sourceId ? await findUpload(e.sourceId) : null;
      for (const f of [out, th, up]) if (f) await removeFile(f);
    }
  }
  return old.length;
}

/** Potong history sesuai LIMIT + TTL (dipanggil auto-cleanup) */
async function prune() {
  await load();
  const before = cache.length;
  const maxAge = config.cleanup.historyMaxAgeDays * 24 * 60 * 60 * 1000;
  cache = cache.filter((e) => Date.now() - e.createdAt < maxAge).slice(0, LIMIT);
  if (cache.length !== before) scheduleWrite();
  return { before, after: cache.length };
}

async function flush() {
  await writeQueue;
}

module.exports = {
  FILE,
  LIMIT,
  load,
  getAll,
  get,
  add,
  remove,
  clear,
  prune,
  flush,
};
