/**
 * Util filesystem: path resolver yang aman (anti path traversal), size, cleanup.
 */
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

async function exists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(p) {
  try {
    const st = await fsp.stat(p);
    return st.size;
  } catch {
    return 0;
  }
}

async function fileStat(p) {
  try {
    return await fsp.stat(p);
  } catch {
    return null;
  }
}

/** Pastikan id (uploadId/outputId) cuma alphanumeric-dash, anti '../' */
function isSafeId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(id);
}

function resolveIn(baseDir, id, ext = '') {
  if (!isSafeId(id)) return null;
  const full = path.resolve(baseDir, `${id}${ext}`);
  const rel = path.relative(path.resolve(baseDir), full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

const resolveUpload = (id, ext = '') => resolveIn(config.paths.uploads, id, ext);
const resolveOutput = (id, ext = '') => resolveIn(config.paths.output, id, ext);
const resolveThumb = (id, ext = '') => resolveIn(config.paths.thumbs, id, ext);

/** Cari file pertama yang cocok dengan id (apapun ekstensinya) di dalam folder */
async function findById(dir, id) {
  if (!isSafeId(id)) return null;
  try {
    const entries = await fsp.readdir(dir);
    const hit = entries.find((f) => f.startsWith(`${id}.`));
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

const findUpload = (id) => findById(config.paths.uploads, id);
const findOutput = (id) => findById(config.paths.output, id);
const findThumb = (id) => findById(config.paths.thumbs, id);

async function removeFile(p) {
  if (!p) return false;
  try {
    await fsp.rm(p, { force: true });
    return true;
  } catch {
    return false;
  }
}

async function removeDir(p) {
  try {
    await fsp.rm(p, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
  return p;
}

function shortId(prefix = 'vid') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

/** Hapus file yang lebih tua dari ttlMinutes di sebuah folder. Return jumlah file kehapus. */
async function sweepOldFiles(dir, ttlMinutes, log = null) {
  const cutoff = Date.now() - ttlMinutes * 60_000;
  let removed = 0;
  let bytes = 0;
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.name === '.gitkeep') continue;
      try {
        if (entry.isDirectory()) {
          const st = await fsp.stat(full);
          if (st.mtimeMs < cutoff) {
            const size = await dirSize(full);
            await fsp.rm(full, { recursive: true, force: true });
            removed += 1;
            bytes += size;
          }
          continue;
        }
        const st = await fsp.stat(full);
        if (st.mtimeMs < cutoff) {
          await fsp.rm(full, { force: true });
          removed += 1;
          bytes += st.size;
        }
      } catch {
        /* file ilang di tengah jalan — skip */
      }
    }
  } catch (err) {
    if (log) log.warn(`sweep gagal di ${dir}: ${err.message}`);
  }
  return { removed, bytes };
}

async function dirSize(dir) {
  let total = 0;
  try {
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      const entries = await fsp.readdir(cur, { withFileTypes: true });
      for (const e of entries) {
        const p = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(p);
        else {
          try {
            total += (await fsp.stat(p)).size;
          } catch {
            /* skip */
          }
        }
      }
    }
  } catch {
    /* folder belum ada */
  }
  return total;
}

async function diskUsage(dir) {
  return { bytes: await dirSize(dir) };
}

module.exports = {
  exists,
  fileSize,
  fileStat,
  isSafeId,
  resolveUpload,
  resolveOutput,
  resolveThumb,
  findUpload,
  findOutput,
  findThumb,
  removeFile,
  removeDir,
  ensureDir,
  shortId,
  sweepOldFiles,
  dirSize,
  diskUsage,
};
