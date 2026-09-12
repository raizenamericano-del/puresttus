/**
 * ============================================================================
 *   ██╗  ██╗██╗   ██╗██╗   ██╗██████╗ ██╗   ██╗██████╗ ███████╗
 *   ██║ ██╔╝╚██╗ ██╔╝╚██╗ ██╔╝██╔══██╗██║   ██║██╔══██╗██╔════╝
 *   █████╔╝  ╚████╔╝  ╚████╔╝ ██████╔╝██║   ██║██████╔╝███████╗
 *   ██╔═██╗   ╚██╔╝    ╚██╔╝  ██╔═══╝ ██║   ██║██╔══██╗╚════██║
 *   ██║  ██╗   ██║      ██║   ██║     ╚██████╔╝██║  ██║███████║
 *   ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝
 *   KyyPureStatus — Video HD Anti Buram, Auto Terkirim ke WhatsApp.
 * ============================================================================
 *  Express + Socket.io 4 + Baileys v6 + fluent-ffmpeg
 *  (c) KyyDevv
 */
'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');

const config = require('./config');
const log = require('./utils/logger').scope('server');
const apiRoutes = require('./routes/api');
const { initSockets } = require('./sockets');
const wa = require('./whatsapp/manager');
const jobs = require('./engine/jobs');
const history = require('./store/history');
const appstate = require('./store/appstate');
const ffmpegUtil = require('./utils/ffmpeg');

const BANNER = `
\x1b[38;5;141m╔══════════════════════════════════════════════════════════════╗
║  KyyPureStatus v1.0.0            Video HD, Anti Buram.       ║
║  by KyyDevv                      Kompres cerdas → kirim WA   ║
╚══════════════════════════════════════════════════════════════╝\x1b[0m`;

/* ================================================================ APP ==== */
const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // biar UI bisa pakai inline style / data URI
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(
  cors({
    origin: config.corsOrigin.includes('*') ? true : config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Kyy-Token'],
  }),
);

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ------------------------------------------------- API token (opsional) -- */
if (config.apiToken) {
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    const token = req.get('X-Kyy-Token') || req.query.token || (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (token !== config.apiToken) {
      return res.status(401).json({ ok: false, error: 'Token salah bro. Set X-Kyy-Token yang bener.', code: 'UNAUTHORIZED' });
    }
    next();
  });
  log.warn('API_TOKEN aktif — semua /api butuh header X-Kyy-Token');
}

/* --------------------------------------------------------- request log --- */
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api') && !req.path.includes('/files/') && !req.path.includes('/thumbs/')) {
      log.debug(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`);
    }
  });
  next();
});

/* ------------------------------------------------------------- routes ---- */
app.use('/api', apiRoutes);

app.get('/', (req, res, next) => {
  const indexFile = path.join(config.paths.clientDist, 'index.html');
  if (fs.existsSync(indexFile)) return next();
  res
    .status(200)
    .type('html')
    .send(
      `<!doctype html><html lang="id"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>KyyPureStatus — Build Dulu Bos</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07070d;color:#e5e7eb;
font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}
.card{max-width:640px;border:1px solid rgba(139,92,246,.35);border-radius:20px;padding:32px;
background:linear-gradient(180deg,rgba(139,92,246,.10),rgba(7,7,13,.6));box-shadow:0 30px 80px -40px rgba(139,92,246,.6)}
h1{margin:0 0 8px;font-size:26px;background:linear-gradient(90deg,#8b5cf6,#d946ef,#22d3ee);
-webkit-background-clip:text;background-clip:text;color:transparent}
code{display:block;margin:12px 0;padding:14px 16px;border-radius:12px;background:#0b0b14;
border:1px solid rgba(255,255,255,.08);color:#22d3ee;font-size:14px;white-space:pre-wrap}
p{line-height:1.7;color:#9ca3af;margin:10px 0}
.ok{color:#4ade80}
</style></head><body><div class="card">
<h1>KyyPureStatus — Backend Jalan ✅</h1>
<p>Server Express + Socket.io + Baileys udah hidup, tapi <b>frontend-nya belum di-build</b>.</p>
<p>Jalanin ini dulu di folder project:</p>
<code>npm run install:all
npm run build
npm start</code>
<p>Atau buat development (hot reload):</p>
<code>npm run dev   # server :${config.port} + vite :5173</code>
<p class="ok">API siap: <code>GET /api/info</code> • <code>GET /api/health</code> • <code>GET /api/history</code></p>
<p style="font-size:12px;opacity:.6;margin-top:18px">Made with 💜 by KyyDevv</p>
</div></body></html>`,
    );
});

// Static build React (production)
if (fs.existsSync(config.paths.clientDist)) {
  app.use(
    express.static(config.paths.clientDist, {
      index: 'index.html',
      maxAge: config.isProd ? '7d' : 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  // SPA fallback
  app.get('*', (req, res) => {
    const indexFile = path.join(config.paths.clientDist, 'index.html');
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    res.status(404).json({ ok: false, error: 'Frontend belum di-build. Jalanin `npm run build`.' });
  });
} else {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.status(404).json({ ok: false, error: 'Frontend belum di-build. Jalanin `npm run build` dulu bos.' });
  });
}

// 404 API
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: `Endpoint ${req.method} ${req.originalUrl} nggak ada bro.` }));

// Error handler global
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log.error(`unhandled: ${err.message}\n${err.stack || ''}`);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Server error.', code: err.code || 'INTERNAL' });
});

/* ============================================================ SOCKET.IO == */
const io = new Server(server, {
  path: '/socket.io',
  cors: {
    origin: config.corsOrigin.includes('*') ? true : config.corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 25_000,
  pingTimeout: 60_000,
  maxHttpBufferSize: 4e6,
  transports: ['websocket', 'polling'],
});

const socketHandles = initSockets(io);

/* ============================================================= BOOTSTRAP == */
let cleanupTimer = null;
let firstCleanupDone = false;

async function bootstrap() {
  console.log(BANNER);
  log.info(`env=${config.env} | mockSend=${config.mockSend} | dataDir=${config.paths.data}`);

  const bins = ffmpegUtil.detect();
  if (!bins.ffmpeg.path || !bins.ffprobe.path) {
    log.error('FFmpeg/ffprobe nggak ada. Kompresi bakal gagal. Install: apt-get install -y ffmpeg');
  }

  await history.load();
  await appstate.load();

  // WhatsApp: auto-nyambung kalo ada session tersimpan
  await wa.boot();

  // Auto cleanup tiap 10 menit
  if (config.cleanup.enabled) {
    setTimeout(async () => {
      firstCleanupDone = true;
      try {
        await jobs.cleanupTick('startup');
      } catch (err) {
        log.error(`cleanup startup gagal: ${err.message}`);
      }
    }, 15_000).unref?.();

    cleanupTimer = setInterval(async () => {
      try {
        await jobs.cleanupTick('interval');
      } catch (err) {
        log.error(`cleanup interval gagal: ${err.message}`);
      }
    }, config.cleanup.intervalMs);
    if (cleanupTimer.unref) cleanupTimer.unref();
    log.info(`auto-cleanup tiap ${Math.round(config.cleanup.intervalMs / 60000)} menit (uploads TTL ${config.cleanup.uploadTtlMin}m, output TTL ${config.cleanup.outputTtlMin}m)`);
  }

  server.listen(config.port, config.host, () => {
    log.ok(`Server jalan di http://${config.host}:${config.port}`);
    log.ok(`UI       : http://localhost:${config.port}`);
    log.ok(`API info : http://localhost:${config.port}/api/info`);
    log.ok(`Mode uji : MOCK_SEND=${config.mockSend}`);
    if (config.mockSend) {
      log.warn('⚠ MOCK_SEND aktif — kirim WA cuma simulasi, cocok buat ngetes UI/UX.');
    } else {
      log.warn('⚠ Pake nomor cadangan aja bro, library ginian rawan banned dari Mark Zuckerberg.');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log.error(`Port ${config.port} udah dipake proses lain. Ganti PORT di .env ya.`);
      process.exit(1);
    }
    log.error(`server error: ${err.message}`);
  });
}

/* ========================================================= GRACEFUL EXIT == */
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.warn(`${signal} diterima — matiin server dengan elegan...`);

  if (cleanupTimer) clearInterval(cleanupTimer);
  const killed = jobs.cancelAll();
  if (killed) log.warn(`${killed} proses ffmpeg di-kill`);

  try {
    socketHandles.close();
  } catch {
    /* ignore */
  }
  try {
    await wa.shutdown();
  } catch {
    /* ignore */
  }
  try {
    await Promise.all([history.flush(), appstate.flush()]);
  } catch {
    /* ignore */
  }

  server.close(() => {
    log.ok('server nutup. Sampai jumpa 👋');
    process.exit(0);
  });

  setTimeout(() => {
    log.error('force exit setelah 8 detik');
    process.exit(1);
  }, 8000).unref?.();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  log.error(`unhandledRejection: ${reason instanceof Error ? reason.stack || reason.message : JSON.stringify(reason)}`);
});
process.on('uncaughtException', (err) => {
  log.error(`uncaughtException: ${err.stack || err.message}`);
});

bootstrap().catch((err) => {
  log.error(`bootstrap gagal total: ${err.stack || err.message}`);
  process.exit(1);
});

module.exports = { app, server, io };
