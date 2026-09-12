/**
 * Deteksi binary ffmpeg / ffprobe.
 * Prioritas: env -> sistem PATH -> @ffmpeg-installer / @ffprobe-installer.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const config = require('../config');
const log = require('./logger').scope('ffmpeg-bin');

let cached = null;

function tryVersion(bin, args = ['-version']) {
  try {
    execFileSync(bin, args, { stdio: ['ignore', 'ignore', 'ignore'], timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

function resolveBinary(envPath, systemName, installerModule) {
  if (envPath && fs.existsSync(envPath)) return { path: envPath, source: 'env' };
  if (tryVersion(systemName)) return { path: systemName, source: 'system' };
  try {
    // eslint-disable-next-line import/no-dynamic-require
    const mod = require(installerModule);
    const p = typeof mod === 'string' ? mod : mod.path || mod.default;
    if (p && fs.existsSync(p)) return { path: p, source: 'installer' };
  } catch {
    /* installer nggak kepasang — santai */
  }
  return { path: null, source: 'missing' };
}

function detect() {
  if (cached) return cached;

  const ffmpeg = resolveBinary(config.ffmpeg.path, 'ffmpeg', '@ffmpeg-installer/ffmpeg');
  const ffprobe = resolveBinary(config.ffmpeg.ffprobePath, 'ffprobe', '@ffprobe-installer/ffprobe');

  cached = { ffmpeg, ffprobe };

  if (!ffmpeg.path) {
    log.error('ffmpeg NGGAK ketemu! Install dulu: apt-get install -y ffmpeg (atau set FFMPEG_PATH).');
  } else {
    log.ok(`ffmpeg  -> ${ffmpeg.path} (${ffmpeg.source})`);
  }
  if (!ffprobe.path) {
    log.error('ffprobe NGGAK ketemu! Install dulu: apt-get install -y ffmpeg (atau set FFPROBE_PATH).');
  } else {
    log.ok(`ffprobe -> ${ffprobe.path} (${ffprobe.source})`);
  }

  return cached;
}

function applyToFfmpeg(ffmpegLib) {
  const { ffmpeg, ffprobe } = detect();
  if (ffmpeg.path) ffmpegLib.setFfmpegPath(ffmpeg.path);
  if (ffprobe.path) ffmpegLib.setFfprobePath(ffprobe.path);
  return { ffmpeg: ffmpeg.path, ffprobe: ffprobe.path };
}

function isReady() {
  const { ffmpeg, ffprobe } = detect();
  return Boolean(ffmpeg.path && ffprobe.path);
}

module.exports = { detect, applyToFfmpeg, isReady };
