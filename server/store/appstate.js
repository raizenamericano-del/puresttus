/**
 * KyyPureStatus — App State (appstate.json)
 * Nyimpen preferensi kecil yang perlu survive restart:
 * target terakhir, caption terakhir, mode login, statistik kumulatif.
 *
 * (c) KyyDevv
 */
'use strict';

const fsp = require('fs/promises');
const path = require('path');
const config = require('../config');
const log = require('../utils/logger').scope('appstate');

const FILE = config.paths.appStateFile;

const DEFAULTS = {
  lastTarget: '',
  recentTargets: [],
  lastCaption: '',
  lastLoginMethod: 'qr',
  stats: {
    totalProcessed: 0,
    totalSent: 0,
    totalSourceBytes: 0,
    totalOutputBytes: 0,
    totalEncodeSeconds: 0,
    startedAt: null,
  },
};

let state = structuredClone(DEFAULTS);
let loaded = false;
let queue = Promise.resolve();

function merge(base, incoming) {
  const out = { ...base };
  for (const [k, v] of Object.entries(incoming || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = merge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

async function load() {
  if (loaded) return state;
  try {
    const raw = await fsp.readFile(FILE, 'utf8');
    state = merge(structuredClone(DEFAULTS), JSON.parse(raw));
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn(`appstate.json rusak (${err.message}) — pakai default`);
  }
  if (!state.stats.startedAt) state.stats.startedAt = Date.now();
  loaded = true;
  return state;
}

function scheduleWrite() {
  queue = queue.then(async () => {
    try {
      await fsp.mkdir(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
      await fsp.rename(tmp, FILE);
    } catch (err) {
      log.error(`gagal nulis appstate: ${err.message}`);
    }
  });
  return queue;
}

async function get() {
  await load();
  return structuredClone(state);
}

async function set(patch) {
  await load();
  state = merge(state, patch || {});
  scheduleWrite();
  return structuredClone(state);
}

async function rememberTarget(phone, pretty) {
  await load();
  const list = Array.isArray(state.recentTargets) ? state.recentTargets : [];
  const next = [{ phone, pretty, at: Date.now() }, ...list.filter((t) => t.phone !== phone)].slice(0, 6);
  state.recentTargets = next;
  state.lastTarget = phone;
  scheduleWrite();
  return next;
}

async function bumpStats(delta = {}) {
  await load();
  const s = state.stats;
  s.totalProcessed = (s.totalProcessed || 0) + (delta.processed || 0);
  s.totalSent = (s.totalSent || 0) + (delta.sent || 0);
  s.totalSourceBytes = (s.totalSourceBytes || 0) + (delta.sourceBytes || 0);
  s.totalOutputBytes = (s.totalOutputBytes || 0) + (delta.outputBytes || 0);
  s.totalEncodeSeconds = Number(((s.totalEncodeSeconds || 0) + (delta.encodeSeconds || 0)).toFixed(2));
  scheduleWrite();
  return structuredClone(s);
}

async function flush() {
  await queue;
}

module.exports = { load, get, set, rememberTarget, bumpStats, flush, FILE };
