/**
 * KyyPureStatus — Pusat konfigurasi
 * Semua nilai diambil dari env dengan default yang aman buat dev & Railway.
 * (c) KyyDevv
 */
'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
};

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT_DIR, p));

const DATA_DIR = abs(process.env.DATA_DIR || './data');
const SESSION_DIR = abs(process.env.SESSION_DIR || path.join(DATA_DIR, 'sessions'));
const UPLOAD_DIR = abs(process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads'));
const OUTPUT_DIR = abs(process.env.OUTPUT_DIR || path.join(DATA_DIR, 'output'));
const THUMB_DIR = abs(process.env.THUMB_DIR || path.join(DATA_DIR, 'thumbs'));
const CLIENT_DIST = abs(process.env.CLIENT_DIST || path.join(ROOT_DIR, 'client', 'dist'));

// Pastikan folder volume ada sebelum dipakai (Railway mount /data)
for (const dir of [DATA_DIR, SESSION_DIR, UPLOAD_DIR, OUTPUT_DIR, THUMB_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  rootDir: ROOT_DIR,
  port: num(process.env.PORT, 8080),
  host: process.env.HOST || '0.0.0.0',

  mockSend: bool(process.env.MOCK_SEND, false),
  apiToken: process.env.API_TOKEN || '',
  corsOrigin: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  paths: {
    data: DATA_DIR,
    sessions: SESSION_DIR,
    uploads: UPLOAD_DIR,
    output: OUTPUT_DIR,
    thumbs: THUMB_DIR,
    historyFile: path.join(DATA_DIR, 'history.json'),
    appStateFile: path.join(DATA_DIR, 'appstate.json'),
    clientDist: CLIENT_DIST,
  },

  upload: {
    maxMb: num(process.env.MAX_UPLOAD_MB, 100),
    get maxBytes() {
      return this.maxMb * 1024 * 1024;
    },
    allowedExt: ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.3gp', '.ts', '.flv', '.wmv'],
  },

  wa: {
    mediaLimitMb: num(process.env.WA_MEDIA_LIMIT_MB, 50),
    get mediaLimitBytes() {
      return this.mediaLimitMb * 1024 * 1024;
    },
    deviceName: process.env.WA_DEVICE_NAME || 'KyyPureStatus',
    reconnectMinMs: num(process.env.WA_RECONNECT_MIN_MS, 2000),
    reconnectMaxMs: num(process.env.WA_RECONNECT_MAX_MS, 30000),
    sessionFolder: SESSION_DIR,
  },

  ffmpeg: {
    path: process.env.FFMPEG_PATH || '',
    ffprobePath: process.env.FFPROBE_PATH || '',
    maxConcurrentJobs: Math.max(1, num(process.env.MAX_CONCURRENT_JOBS, 1)),
  },

  cleanup: {
    enabled: bool(process.env.CLEANUP_ENABLED, true),
    intervalMs: num(process.env.CLEANUP_INTERVAL_MS, 600_000), // 10 menit
    uploadTtlMin: num(process.env.UPLOAD_TTL_MIN, 120),
    outputTtlMin: num(process.env.OUTPUT_TTL_MIN, 240),
    thumbTtlMin: num(process.env.THUMB_TTL_MIN, 240),
    historyLimit: Math.max(1, num(process.env.HISTORY_LIMIT, 8)),
    historyMaxAgeDays: num(process.env.HISTORY_MAX_AGE_DAYS, 7),
  },

  branding: {
    name: 'KyyPureStatus',
    tagline: 'Video HD, Anti Buram, Auto Terkirim.',
    author: 'KyyDevv',
  },
};

module.exports = config;
