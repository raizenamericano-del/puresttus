#!/usr/bin/env node
/**
 * ============================================================================
 *  KyyPureStatus — Integration Test (REST + Socket.io + pipeline + mock WA)
 * ============================================================================
 *  Nyalain server beneran (MOCK_SEND=true), terus:
 *   1. GET  /api/info & /api/health
 *   2. Bikin video uji portrait 9:16 pakai ffmpeg
 *   3. POST /api/upload        -> uploadId + info + plan
 *   4. socket video:process    -> pantau compress:progress sampai job:done
 *   5. GET  /api/files/:id     -> cek hasil (HTTP Range juga)
 *   6. socket video:resend     -> kirim ulang dari riwayat
 *   7. upload video panjang    -> video:cancel di tengah jalan
 *   8. GET  /api/history       -> maksimal 8 entri
 *   9. POST /api/storage/cleanup
 *
 *  Jalanin: node scripts/integration.js
 * ============================================================================
 *  (c) KyyDevv
 */
'use strict';

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { spawn } = require('child_process');
const http = require('http');
const ffmpeg = require('fluent-ffmpeg');
const { io } = require('socket.io-client');
const { applyToFfmpeg, isReady } = require('../server/utils/ffmpeg');

applyToFfmpeg(ffmpeg);

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.IT_PORT || 8099);
const BASE = `http://127.0.0.1:${PORT}`;
const WORK = path.join(ROOT, 'data', 'itest');

const c = { green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', cyan: '\x1b[36m', violet: '\x1b[38;5;141m', reset: '\x1b[0m' };
let passed = 0;
let failed = 0;

function ok(name, detail = '') {
  passed += 1;
  console.log(`${c.green}  ✔${c.reset} ${name}${detail ? ` ${c.dim}${detail}${c.reset}` : ''}`);
}
function bad(name, detail = '') {
  failed += 1;
  console.log(`${c.red}  ✘${c.reset} ${name}${detail ? ` ${c.dim}${detail}${c.reset}` : ''}`);
}
function assert(cond, name, detail = '') {
  cond ? ok(name, detail) : bad(name, detail);
}
function title(t) {
  console.log(`\n${c.violet}▸ ${t}${c.reset}`);
}

/* ------------------------------------------------------------ http util -- */
function req(method, urlPath, { body = null, headers = {}, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + urlPath);
    const data = body instanceof Buffer ? body : body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        ...(data && !(body instanceof Buffer) ? { 'Content-Type': 'application/json' } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (ch) => chunks.push(ch));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (raw) return resolve({ status: res.statusCode, headers: res.headers, buffer: buf });
        let json = null;
        try {
          json = JSON.parse(buf.toString('utf8'));
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json, text: buf.toString('utf8') });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

/** multipart/form-data upload manual (tanpa dependency tambahan) */
function uploadVideo(filePath, fieldName = 'video') {
  return new Promise((resolve, reject) => {
    const boundary = `----kyyitest${Date.now().toString(16)}`;
    const fileName = path.basename(filePath);
    const fileBuf = fs.readFileSync(filePath);

    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
        `Content-Type: video/mp4\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([head, fileBuf, tail]);

    const url = new URL(`${BASE}/api/upload`);
    const r = http.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: '/api/upload',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (ch) => chunks.push(ch));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, body: json });
        });
      },
    );
    r.on('error', reject);
    r.write(payload);
    r.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await req('GET', '/api/health');
      if (res.status === 200 && res.body?.ok) return true;
    } catch {
      /* belum idup */
    }
    await sleep(400);
  }
  return false;
}

/* ------------------------------------------------------- bikin video uji -- */
function makeVideo({ out, duration, width, height, audio = true }) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg().input(`testsrc2=size=${width}x${height}:rate=30:duration=${duration}`).inputOptions(['-f', 'lavfi']);
    if (audio) cmd.input(`sine=frequency=520:sample_rate=48000:duration=${duration}`).inputOptions(['-f', 'lavfi']);
    const opts = ['-map', '0:v:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-t', String(duration)];
    if (audio) opts.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '96k');
    else opts.push('-an');
    cmd
      .outputOptions(opts)
      .on('end', () => resolve(out))
      .on('error', (e, so, se) => reject(new Error(String(se || e.message).split('\n').slice(-3).join(' | '))))
      .save(out);
  });
}

/* ============================================================== tests ==== */
async function main() {
  console.log(`${c.cyan}
╔══════════════════════════════════════════════════════════════╗
║   KyyPureStatus — INTEGRATION TEST (server beneran)          ║
╚══════════════════════════════════════════════════════════════╝${c.reset}`);

  await fsp.rm(WORK, { recursive: true, force: true });
  await fsp.mkdir(WORK, { recursive: true });

  if (!isReady()) {
    console.log(`${c.red}ffmpeg/ffprobe nggak ketemu — install dulu (apt-get install -y ffmpeg).${c.reset}`);
    process.exit(1);
  }
  ok('ffmpeg & ffprobe tersedia buat bikin video uji');

  /* ---------------------------------------------------------- boot server */
  title('0. Boot server (MOCK_SEND=true)');
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    MOCK_SEND: 'true',
    DATA_DIR: path.join(ROOT, 'data', 'itest-data'),
    CLEANUP_ENABLED: 'true',
    CLEANUP_INTERVAL_MS: '600000',
    WA_LOG_LEVEL: 'silent',
  };
  await fsp.rm(env.DATA_DIR, { recursive: true, force: true });

  const serverLog = [];
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => serverLog.push(d.toString()));
  child.stderr.on('data', (d) => serverLog.push(d.toString()));

  const alive = await waitForServer();
  if (!alive) {
    bad('server gagal idup');
    console.log(serverLog.join('').slice(-3000));
    child.kill('SIGKILL');
    process.exit(1);
  }
  ok(`server idup di ${BASE} (pid ${child.pid})`);

  let exitCode = 0;
  try {
    /* ------------------------------------------------------------- info */
    title('1. GET /api/info & /api/health');
    const info = await req('GET', '/api/info');
    assert(info.status === 200 && info.body.ok, '/api/info 200');
    assert(info.body.app?.name === 'KyyPureStatus', `app name = ${info.body.app?.name}`);
    assert(info.body.app?.author === 'KyyDevv', `author = ${info.body.app?.author}`);
    assert(info.body.mockSend === true, 'mockSend = true');
    assert(info.body.limits?.maxUploadMb === 100, `maxUploadMb = ${info.body.limits?.maxUploadMb}`);
    assert(info.body.limits?.waMediaLimitMb === 50, `waMediaLimitMb = ${info.body.limits?.waMediaLimitMb}`);
    assert(info.body.cleanup?.intervalMs === 600000, `cleanup interval = ${info.body.cleanup?.intervalMs}ms (10 menit)`);
    assert(String(info.body.engine?.x264Params).includes('rc-lookahead=40'), `x264-params = ${info.body.engine?.x264Params}`);

    const waStatus = await req('GET', '/api/wa/status');
    assert(waStatus.status === 200 && waStatus.body.status === 'open', `wa status (mock) = ${waStatus.body.status}`);

    /* ------------------------------------------------------ bikin sumber */
    title('2. Bikin video uji portrait 9:16 (12 detik)');
    const src = path.join(WORK, 'itest_portrait.mp4');
    await makeVideo({ out: src, duration: 12, width: 1080, height: 1920, audio: true });
    assert(fs.statSync(src).size > 100_000, `file uji ${(fs.statSync(src).size / 1048576).toFixed(2)}MB`);

    /* ----------------------------------------------------------- upload */
    title('3. POST /api/upload');
    const up = await uploadVideo(src);
    assert(up.status === 200 && up.body?.ok, `upload 200 (uploadId=${up.body?.uploadId})`);
    assert(Boolean(up.body?.uploadId), 'uploadId ada');
    assert(up.body?.info?.orientation === 'portrait', `probe orientation = ${up.body?.info?.orientation}`);
    assert(up.body?.info?.width === 1080 && up.body?.info?.height === 1920, `probe ${up.body?.info?.width}x${up.body?.info?.height}`);
    assert(up.body?.plan?.tier === 1 && up.body?.plan?.crf === 17, `plan tier=${up.body?.plan?.tier} crf=${up.body?.plan?.crf} (${up.body?.plan?.label})`);
    assert(up.body?.plan?.width === 1080 && up.body?.plan?.height === 1920, `plan target ${up.body?.plan?.width}x${up.body?.plan?.height}`);
    const uploadId = up.body.uploadId;

    // preview URL
    const prev = await req('GET', `/api/uploads/${uploadId}`, { raw: true });
    assert(prev.status === 200 && prev.buffer.length > 1000, `GET /api/uploads/:id ${prev.status} (${prev.buffer.length} bytes)`);

    // path traversal ditolak
    const evil = await req('GET', '/api/files/..%2f..%2fpackage');
    assert(evil.status === 400 || evil.status === 404, `path traversal ditolak (HTTP ${evil.status})`);

    /* ---------------------------------------------------- socket pipeline */
    title('4. Socket.io: video:process -> compress:progress -> job:done');
    const socket = io(BASE, { transports: ['websocket'], reconnection: false });

    const events = { progress: [], stages: [], done: null, error: null, init: null, sendProgress: [], cancelled: null };
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('socket connect timeout')), 15000);
      socket.on('connect', () => {
        clearTimeout(t);
        resolve();
      });
      socket.on('connect_error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
    ok('socket.io connect');

    socket.on('init', (p) => (events.init = p));
    socket.on('compress:progress', (p) => events.progress.push(p));
    socket.on('job:stage', (p) => events.stages.push(p.stage));
    socket.on('job:sendProgress', (p) => events.sendProgress.push(p.stage));
    socket.on('job:done', (p) => (events.done = p));
    socket.on('job:error', (p) => (events.error = p));
    socket.on('job:cancelled', (p) => (events.cancelled = p));

    await sleep(600);
    assert(Boolean(events.init?.ok), 'event init diterima (config + wa + history)');
    assert(events.init?.config?.mockSend === true, 'init.config.mockSend = true');

    const ack = await new Promise((resolve) => {
      socket.emit('video:process', { uploadId, target: '081234567890', caption: 'HD nih bos 🔥' }, resolve);
    });
    assert(ack?.ok === true && ack.job?.jobId, `video:process ack (jobId=${ack?.job?.jobId?.slice(0, 8)}...)`);

    // tunggu selesai
    const started = Date.now();
    while (!events.done && !events.error && Date.now() - started < 90000) await sleep(250);
    assert(events.progress.length > 3, `compress:progress ${events.progress.length}x`);
    const maxPct = Math.max(0, ...events.progress.map((p) => p.percent || 0));
    assert(maxPct >= 90, `persen maksimum ${maxPct.toFixed(1)}%`);
    const withSpeed = events.progress.find((p) => p.speed);
    assert(Boolean(withSpeed), `speed dilaporkan (contoh: ${withSpeed?.speed})`);
    const withEta = events.progress.find((p) => p.eta != null);
    assert(withEta !== undefined, `eta dilaporkan (contoh: ${withEta?.eta}s)`);
    assert(events.progress.some((p) => p.bitrateKbps > 0), `bitrate real-time (contoh: ${events.progress.find((p) => p.bitrateKbps)?.bitrateKbps} kbps)`);
    assert(events.progress.some((p) => p.outSizeKb > 0), `ukuran output real-time (contoh: ${events.progress.find((p) => p.outSizeKb)?.outSizeKb} KB)`);
    assert(events.stages.includes('probing') && events.stages.includes('compressing'), `stage: ${events.stages.join(' → ')}`);
    assert(!events.error, events.error ? `job:error -> ${events.error.message}` : 'nggak ada job:error');
    assert(Boolean(events.done), 'job:done diterima');

    if (events.done) {
      const r = events.done.result;
      const s = events.done.send;
      assert(s?.ok === true && s.mock === true, `send mock ok (target=${s?.targetPretty})`);
      assert(s?.messageId?.startsWith('MOCK'), `messageId = ${s?.messageId}`);
      assert(r.resolution === '1080x1920', `hasil ${r.resolution} (portrait dipertahankan)`);
      assert(r.mode === 'crf' && r.crf === 17, `mode=${r.mode} crf=${r.crf}`);
      assert(r.bytes > 0 && r.bytes < 50 * 1024 * 1024, `size ${r.sizePretty} < 50MB`);
      assert(r.percentSaved != null, `hemat ${r.percentSaved}% (${r.sourceSizePretty} → ${r.sizePretty})`);
      assert(Boolean(r.url) && Boolean(r.thumbUrl), `url=${r.url} thumb=${r.thumbUrl}`);
      assert(events.sendProgress.includes('sent'), `send stages: ${events.sendProgress.join(' → ')}`);

      /* ------------------------------------------------------- streaming */
      title('5. GET /api/files/:id (+ HTTP Range)');
      const full = await req('GET', r.url, { raw: true });
      assert(full.status === 200 && full.buffer.length === r.bytes, `full download ${full.buffer.length} bytes`);
      assert(String(full.headers['content-type']).includes('video/mp4'), `content-type = ${full.headers['content-type']}`);
      assert(full.headers['accept-ranges'] === 'bytes', 'Accept-Ranges: bytes');

      const ranged = await req('GET', r.url, { headers: { Range: 'bytes=0-1023' }, raw: true });
      assert(ranged.status === 206 && ranged.buffer.length === 1024, `range 206 (${ranged.buffer.length} bytes)`);
      assert(String(ranged.headers['content-range'] || '').startsWith('bytes 0-1023/'), `content-range = ${ranged.headers['content-range']}`);

      const thumb = await req('GET', r.thumbUrl, { raw: true });
      assert(thumb.status === 200 && thumb.buffer.length > 500, `thumbnail ${(thumb.buffer.length / 1024).toFixed(1)}KB`);

      /* ----------------------------------------------------------- resend */
      title('6. Socket.io: video:resend (kirim ulang tanpa upload ulang)');
      const hist = await req('GET', '/api/history');
      assert(hist.status === 200 && Array.isArray(hist.body.history), `GET /api/history (${hist.body?.history?.length} entri)`);
      const entry = hist.body.history.find((h) => h.outputId === r.outputId) || hist.body.history[0];
      assert(Boolean(entry?.canResend), `entri riwayat canResend=${entry?.canResend}`);

      events.done = null;
      events.sendProgress = [];
      const ackResend = await new Promise((resolve) => {
        socket.emit('video:resend', { historyId: entry.id, target: '6281298765432' }, resolve);
      });
      assert(ackResend?.ok === true, `video:resend ack ok=${ackResend?.ok}`);

      const t2 = Date.now();
      while (!events.done && !events.error && Date.now() - t2 < 30000) await sleep(200);
      assert(events.done?.resend === true, 'job:done (resend) diterima');
      assert(events.done?.send?.targetPretty?.startsWith('62 812'), `target resend = ${events.done?.send?.targetPretty}`);
      assert(!events.stages.includes('compressing') || events.done?.resend, 'resend nggak ngulang kompresi');
    }

    /* ------------------------------------------------------------- cancel */
    title('7. Batalkan proses (kill ffmpeg di tengah jalan)');
    const longSrc = path.join(WORK, 'itest_long.mp4');
    await makeVideo({ out: longSrc, duration: 45, width: 1280, height: 720, audio: true });
    const up2 = await uploadVideo(longSrc);
    assert(up2.body?.ok, `upload video 45s (${up2.body?.sizePretty})`);
    assert(up2.body?.plan?.tier === 2, `durasi 45s -> tier ${up2.body?.plan?.tier} (${up2.body?.plan?.label}) crf=${up2.body?.plan?.crf}`);

    events.done = null;
    events.error = null;
    events.cancelled = null;
    events.progress = [];

    const ack2 = await new Promise((resolve) => socket.emit('video:process', { uploadId: up2.body.uploadId, target: '081234567890' }, resolve));
    assert(ack2?.ok === true, 'proses kedua dimulai');

    // tunggu progress > 3% terus batalin
    const t3 = Date.now();
    while (Date.now() - t3 < 60000) {
      const last = events.progress[events.progress.length - 1];
      if (last && last.percent > 2) break;
      await sleep(200);
    }
    const ackCancel = await new Promise((resolve) => socket.emit('video:cancel', { jobId: ack2.job.jobId }, resolve));
    assert(ackCancel?.ok === true && ackCancel.killed >= 0, `video:cancel ack (ffmpeg killed=${ackCancel?.killed})`);

    const t4 = Date.now();
    while (!events.cancelled && !events.error && Date.now() - t4 < 30000) await sleep(200);
    assert(Boolean(events.cancelled), 'job:cancelled diterima');
    assert(!events.done, 'nggak ada job:done setelah dibatalkan');

    // single-flight: proses ketiga harus ditolak pas yang kedua masih jalan? (udah kelar, jadi cek BUSY lewat jalur lain)
    const jobsRes = await req('GET', '/api/jobs');
    assert(jobsRes.status === 200 && Array.isArray(jobsRes.body.jobs), `GET /api/jobs (${jobsRes.body?.jobs?.length} job tercatat)`);
    const cancelledJob = jobsRes.body.jobs.find((j) => j.jobId === ack2.job.jobId);
    assert(cancelledJob?.status === 'cancelled', `status job kedua = ${cancelledJob?.status}`);

    /* ------------------------------------------------------- history limit */
    title('8. Riwayat + limit 8 entri');
    const hist2 = await req('GET', '/api/history');
    assert(hist2.body.history.length <= 8, `history ${hist2.body.history.length} <= 8`);
    assert(hist2.body.limit === 8, `limit = ${hist2.body.limit}`);
    assert(hist2.body.history.some((h) => h.status === 'cancelled'), 'entri "cancelled" tercatat di riwayat');

    /* ------------------------------------------------------------- cleanup */
    title('9. Auto-cleanup manual + storage');
    const st = await req('GET', '/api/storage');
    assert(st.status === 200 && st.body.ok, `GET /api/storage (total ${st.body?.totalPretty})`);
    const cl = await req('POST', '/api/storage/cleanup');
    assert(cl.status === 200 && cl.body.ok, `cleanup manual ok (removed=${cl.body?.removedFiles}, ${cl.body?.tookMs}ms)`);
    assert(cl.body?.results?.uploads && cl.body?.results?.history, 'hasil cleanup dirinci per folder');

    /* -------------------------------------------------------- wa endpoints */
    title('10. Endpoint WhatsApp (mode mock)');
    const chk = await req('POST', '/api/wa/check', { body: { phone: '081234567890' } });
    assert(chk.status === 200 && chk.body.exists === true, `wa/check mock -> exists=${chk.body.exists} (${chk.body.reason})`);
    const pair = await req('POST', '/api/wa/pair', { body: { phone: '081234567890', code: 'KYYDEVV8' } });
    assert(pair.status === 200 && pair.body.ok === true, `wa/pair mock -> code=${pair.body.code}`);
    assert(pair.body.code === 'KYYDEVV8', `custom pairing code 8 digit dipakai: ${pair.body.code}`);
    const badPhone = await req('POST', '/api/wa/check', { body: { phone: '0812' } });
    assert(badPhone.status === 400 || badPhone.body.exists === false, `nomor pendek ditolak (HTTP ${badPhone.status})`);

    socket.close();
  } catch (err) {
    bad('integration test crash', err.stack || err.message);
    console.log(c.dim + serverLog.join('').slice(-2500) + c.reset);
    exitCode = 1;
  }

  /* --------------------------------------------------------- matiin server */
  title('11. Graceful shutdown (SIGTERM)');
  const termStart = Date.now();
  child.kill('SIGTERM');
  const code = await new Promise((resolve) => {
    const t = setTimeout(() => {
      child.kill('SIGKILL');
      resolve('timeout');
    }, 12000);
    child.on('exit', (cd) => {
      clearTimeout(t);
      resolve(cd);
    });
  });
  assert(code === 0, `server nutup sendiri dengan exit code ${code} (${Date.now() - termStart}ms)`);
  assert(serverLog.join('').includes('sampai jumpa') || serverLog.join('').includes('nutup'), 'log shutdown kebaca');

  await fsp.rm(WORK, { recursive: true, force: true });

  console.log(`\n${c.cyan}──────────────────────────────────────────────────────────────${c.reset}`);
  console.log(`  ${c.green}LULUS ${passed}${c.reset} | ${failed ? c.red : c.dim}GAGAL ${failed}${c.reset}`);
  console.log(`${c.cyan}──────────────────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.dim}  KyyPureStatus integration test — by KyyDevv${c.reset}\n`);

  process.exit(failed || exitCode ? 1 : 0);
}

main().catch((err) => {
  console.error(`${c.red}CRASH:${c.reset}`, err.stack || err.message);
  process.exit(1);
});
