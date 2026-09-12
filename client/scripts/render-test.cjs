#!/usr/bin/env node
/**
 * ============================================================================
 *  KyyPureStatus — UI Render Test (jsdom + React 18 + Framer Motion)
 * ============================================================================
 *  Ngerender <App /> beneran di DOM tiruan, terus:
 *   1. Cek semua teks kunci UI ada (bahasa gaul sesuai brief)
 *   2. Cek warning banned permanen nongol
 *   3. Cek logo SVG murni (bukan <img> eksternal)
 *   4. Simulasi event socket (init → job:start → compress:progress → job:done
 *      → job:error) dan mastiin UI-nya beneran berubah
 *
 *  Jalanin: npm --prefix client run test:render
 * ============================================================================
 *  (c) KyyDevv
 */
'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');

const CLIENT = path.resolve(__dirname, '..');

/* ------------------------------------------------------- jsdom bootstrap -- */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:8080/',
  pretendToBeVisual: true,
});
const { window } = dom;

/* --- API browser yang jsdom nggak punya / beda realm --- */
window.matchMedia =
  window.matchMedia ||
  ((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
window.URL.createObjectURL = window.URL.createObjectURL || (() => 'blob:mock');
window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => {});
window.ResizeObserver =
  window.ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
window.HTMLMediaElement.prototype.play = window.HTMLMediaElement.prototype.play || (() => Promise.resolve());
window.HTMLMediaElement.prototype.pause = window.HTMLMediaElement.prototype.pause || (() => {});
window.HTMLMediaElement.prototype.load = window.HTMLMediaElement.prototype.load || (() => {});
window.scrollTo = window.scrollTo || (() => {});

/* --- API SVG geometri: jsdom nggak punya, Framer Motion butuh buat animasi
 *     pathLength (efek checkmark "menggambar sendiri") --- */
const svgProto = window.SVGElement && window.SVGElement.prototype;
// jsdom nggak punya SVGPathElement: SEMUA elemen SVG instanceof SVGElement,
// jadi stub-nya kita pasang di situ.
const pathProto = svgProto;
if (pathProto) {
  if (!pathProto.getTotalLength) pathProto.getTotalLength = function () { return 100; };
  if (!pathProto.getPointAtLength) pathProto.getPointAtLength = function () { return { x: 0, y: 0 }; };
  if (!pathProto.getBBox) pathProto.getBBox = function () { return { x: 0, y: 0, width: 100, height: 100 }; };
  if (!pathProto.getCTM) pathProto.getCTM = function () { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; };
  if (!pathProto.getBoundingClientRect) {
    pathProto.getBoundingClientRect = function () {
      return { x: 0, y: 0, width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 };
    };
  }
}

// jsdom versi lama nggak ngerti opsi { signal } di addEventListener -> bungkus
const jsdomAdd = window.EventTarget.prototype.addEventListener;
const jsdomRemove = window.EventTarget.prototype.removeEventListener;
window.EventTarget.prototype.addEventListener = function patchedAdd(type, listener, options) {
  if (options && typeof options === 'object' && 'signal' in options) {
    const { signal, ...rest } = options;
    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', () => jsdomRemove.call(this, type, listener, rest), { once: true });
    }
    return jsdomAdd.call(this, type, listener, rest);
  }
  return jsdomAdd.call(this, type, listener, options);
};

window.AbortSignal = AbortSignal;
window.AbortController = AbortController;
window.TextEncoder = TextEncoder;
window.TextDecoder = TextDecoder;
try {
  Object.defineProperty(window, 'performance', { value: performance, writable: true, configurable: true });
} catch {
  /* jsdom udah punya sendiri */
}

global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.location = window.location;
global.history = window.history;
for (const k of [
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLVideoElement',
  'HTMLCanvasElement',
  'HTMLImageElement',
  'Element',
  'SVGElement',
  'SVGSVGElement',
  'Node',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'DataTransfer',
  'DOMParser',
  'DocumentFragment',
  'Text',
  'Image',
  'FormData',
  'Blob',
  'File',
]) {
  if (window[k]) global[k] = window[k];
}
global.AbortSignal = AbortSignal;
global.AbortController = AbortController;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.performance = performance;
global.getComputedStyle = window.getComputedStyle.bind(window);
global.localStorage = window.localStorage;
global.IS_REACT_ACT_ENVIRONMENT = true;

global.IntersectionObserver = class {
  constructor(cb) {
    this.cb = cb;
  }
  observe(el) {
    this.cb(
      [{ target: el, isIntersecting: true, intersectionRatio: 1, boundingClientRect: {}, intersectionRect: {}, rootBounds: null, time: Date.now() }],
      this,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};
window.IntersectionObserver = global.IntersectionObserver;

global.XMLHttpRequest = class {
  open() {}
  send() {}
  setRequestHeader() {}
  abort() {}
  addEventListener() {}
};

// fetch stub — semua /api/* dibales JSON aman
const fakeJson = { ok: true, history: [], config: {}, wa: { status: 'idle' }, stats: {} };
global.fetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => JSON.stringify(fakeJson),
  json: async () => fakeJson,
});

/* --- rAF berbasis timer: Framer Motion butuh frame berjalan buat resolve AnimatePresence --- */
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.requestAnimationFrame = global.requestAnimationFrame;
window.cancelAnimationFrame = global.cancelAnimationFrame;

/* --- Stub socket.io-client -------------------------------------------------
 * Test ini harus deterministik: jangan sampai socket beneran nyambung ke
 * server lokal (mis. :8080 yang lagi idup) dan ngirim event asli yang
 * nimpa state simulasi. Jadi modul socket.io-client kita ganti stub Emitter.
 * ------------------------------------------------------------------------- */
const stubSocket = {
  connected: true,
  connecting: false,
  id: 'test-socket',
  _h: new Map(),
  on(evt, fn) {
    if (!this._h.has(evt)) this._h.set(evt, []);
    this._h.get(evt).push(fn);
    return this;
  },
  off(evt, fn) {
    const arr = this._h.get(evt);
    if (arr) this._h.set(evt, arr.filter((f) => f !== fn));
    return this;
  },
  removeListener(evt, fn) {
    return this.off(evt, fn);
  },
  removeAllListeners(evt) {
    if (evt) this._h.delete(evt);
    else this._h.clear();
    return this;
  },
  listeners(evt) {
    return (this._h.get(evt) || []).slice();
  },
  hasListeners(evt) {
    return (this._h.get(evt) || []).length > 0;
  },
  emit(evt, payload, cb) {
    // client -> server: dicatat doang, nggak dikirim ke mana-mana
    this.sent = this.sent || [];
    for (const fn of this.listeners('__any')) {
      try {
        fn(evt, payload);
      } catch {
        /* ignore */
      }
    }
    this.sent.push({ evt, payload });
    if (typeof cb === 'function') setTimeout(() => cb({ ok: true, acked: true, event: evt }), 0);
    return true;
  },
  disconnect() {
    this.connected = false;
    return this;
  },
  connect() {
    this.connected = true;
    return this;
  },
  close() {
    return this.disconnect();
  },
};

const socketClientPath = require.resolve('socket.io-client', { paths: [CLIENT] });
require.cache[socketClientPath] = {
  id: socketClientPath,
  filename: socketClientPath,
  loaded: true,
  exports: { io: () => stubSocket, default: () => stubSocket, Socket: function FakeSocket() {} },
};

/* --------------------------------------------- jsx transform via esbuild -- */
const defaultJsHandler = Module._extensions['.js'];

function transform(module, filename, loader) {
  const source = fs.readFileSync(filename, 'utf8');
  const { code } = esbuild.transformSync(source, {
    loader,
    format: 'cjs',
    jsx: 'automatic',
    target: 'node18',
    sourcemap: 'inline',
  });
  module._compile(code, filename);
}

require.extensions['.jsx'] = (module, filename) => transform(module, filename, 'jsx');
require.extensions['.js'] = (module, filename) => {
  if (filename.startsWith(path.join(CLIENT, 'src'))) return transform(module, filename, 'js');
  return defaultJsHandler(module, filename);
};

/* --------------------------------------------------------------- runner --- */
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Framer Motion `<AnimatePresence mode="wait">` nunggu exit animation kelar sebelum
 * masang anak baru. Di jsdom exit itu nggak pernah "kelar" (nggak ada paint), jadi
 * blok yang baru nggak bakal nongol. Solusi tes: remount App dengan state store yang
 * sama — store-nya module-level, jadi state tetep kepake dan fase yang mau di-cek
 * ke-render dari nol. Ini juga mirip kondisi user reload halaman pas ada job aktif.
 */
let remountCount = 0;
const text = () => document.body.textContent.replace(/\s+/g, ' ');

async function main() {
  console.log(`${c.cyan}
╔══════════════════════════════════════════════════════════════╗
║   KyyPureStatus — UI RENDER TEST (jsdom)                     ║
╚══════════════════════════════════════════════════════════════╝${c.reset}`);

  const React = require(path.join(CLIENT, 'node_modules/react'));
  const { act } = require(path.join(CLIENT, 'node_modules/react'));
  const ReactDOM = require(path.join(CLIENT, 'node_modules/react-dom/client'));
  const App = require(path.join(CLIENT, 'src/App.jsx')).default;
  const { getSocket } = require(path.join(CLIENT, 'src/lib/socket.js'));
  const appState = require(path.join(CLIENT, 'src/hooks/useAppState.js'));

  const container = document.getElementById('root');
  let root = ReactDOM.createRoot(container);

  /**
   * `<AnimatePresence mode="wait">` baru masang anak berikutnya setelah exit
   * animation anak sebelumnya kelar. Di jsdom nggak ada paint, jadi exit-nya
   * nggak pernah bener-bener "kelar" dan blok baru nggak nongol. Solusinya:
   * remount App (store-nya module-level, jadi state tetep) — sama aja kayak
   * user reload halaman pas job masih idup. Fase yang mau dicek jadi ke-render
   * dari nol.
   */
  async function remount() {
    remountCount += 1;
    await act(async () => {
      root.unmount();
      await sleep(30);
    });
    // root React nggak bisa dipakai lagi setelah unmount -> bikin baru
    root = ReactDOM.createRoot(container);
    await act(async () => {
      root.render(React.createElement(App));
      await sleep(260);
    });
  }

  /* ---------------------------------------------------------- 1. mount -- */
  title('1. Render <App /> pertama kali');
  await act(async () => {
    root.render(React.createElement(App));
    await sleep(150);
  });
  ok('nggak crash pas mount');

  const t = text();
  assert(t.includes('KyyPureStatus'), 'wordmark "KyyPureStatus" ke-render');
  assert(t.includes('KyyDevv'), 'kredit "KyyDevv" ke-render');

  /* ------------------------------------------------- 2. bahasa sesuai brief */
  title('2. Bahasa UI sesuai brief (Indonesia gaul, bukan bahasa kaku)');
  assert(t.includes('Seret video lu ke sini'), 'dropzone: "Seret video lu ke sini"');
  assert(t.includes('Drop video dulu bro'), 'tombol idle: "Drop video dulu bro"');
  assert(t.includes('Monitor pipeline'), 'placeholder panel pipeline ke-render');
  assert(t.includes('Tiga langkah'), 'section "Tiga langkah, nggak pake ribet"');
  assert(t.includes('Tier berdasarkan durasi'), 'tabel ladder ke-render');
  assert(t.includes('Seret video lu, server yang mikir'), 'copy hero: "Seret video lu, server yang mikir"');
  assert(!t.includes('Silakan unggah video Anda'), 'nggak ada bahasa kaku "Silakan unggah video Anda"');
  assert(!t.includes('Mohon tunggu'), 'nggak ada "Mohon tunggu"');
  assert(!t.includes('Autentikasi berhasil'), 'nggak ada "Autentikasi berhasil"');

  /* ------------------------------------------------- 3. warning permanen -- */
  title('3. Warning banned permanen');
  const warning = 'Pake nomor cadangan aja bro, library ginian rawan banned dari Mark Zuckerberg';
  const warningCount = document.body.innerHTML.split(warning).length - 1;
  assert(warningCount >= 2, `teks warning utuh & muncul ${warningCount}x (header + footer/section)`);
  assert(document.querySelectorAll('header').length >= 1, 'header sticky ada');

  /* ----------------------------------------------------- 4. logo SVG murni */
  title('4. Logo SVG murni (bukan <img> eksternal)');
  const svgs = document.querySelectorAll('svg');
  assert(svgs.length > 3, `${svgs.length} elemen SVG ke-render`);
  assert(document.querySelectorAll('svg linearGradient').length > 0, `${document.querySelectorAll('svg linearGradient').length} linearGradient violet→fuchsia→cyan`);
  const logoPaths = Array.from(document.querySelectorAll('svg path')).filter((p) => (p.getAttribute('d') || '').startsWith('M20 12h7.6'));
  assert(logoPaths.length > 0, "path huruf 'K' abstrak ketemu di DOM");
  assert(document.querySelectorAll('img[src$=".png"], img[src*="logo."]').length === 0, 'nggak ada <img> logo eksternal');

  /* ------------------------------------------- 5. simulasi event socket -- */
  title('5. Simulasi event socket → UI beneran berubah');
  const socket = getSocket();
  socket.connected = true;
  window.__KYY_DEBUG_STORE = (...a) => console.log('   [store]', JSON.stringify(a)); // biar _emit langsung manggil handler, bukan buffer

  // Panggil handler server→client yang terdaftar lewat socket.on(...) secara lokal,
  // tanpa nyentuh jaringan. socket.io-client 4.8 punya emitEvent(evt, args[]).
  const fire = (event, payload) => {
    const fns = socket.listeners(event) || [];
    if (!fns.length) throw new Error(`nggak ada handler buat event "${event}"`);
    for (const fn of fns.slice()) fn(payload);
    return fns.length;
  };

  await act(async () => {
    fire('init', {
      ok: true,
      config: {
        mockSend: false,
        maxUploadMb: 100,
        waMediaLimitMb: 50,
        historyLimit: 8,
        allowedExt: ['.mp4', '.mov'],
        cleanupIntervalMs: 600000,
        maxConcurrentJobs: 1,
        branding: { name: 'KyyPureStatus', tagline: 'Video HD, Anti Buram, Auto Terkirim.', author: 'KyyDevv' },
      },
      wa: {
        status: 'open',
        registered: true,
        connected: true,
        me: { phone: '6281234567890', phonePretty: '62 812-3456-7890', pushName: 'Kyy', jid: '6281234567890@s.whatsapp.net', deviceId: 2 },
        sentCount: 3,
        uptimeSec: 120,
      },
      history: [
        {
          id: 'h1',
          createdAt: Date.now() - 60000,
          sourceName: 'story-luas.mp4',
          sourceBytes: 42_000_000,
          outputId: 'out_abc',
          outputBytes: 8_400_000,
          outputResolution: '1080x1920',
          sourceResolution: '2160x3840',
          sourceDuration: 22,
          mode: 'crf',
          tier: 1,
          label: '1080p',
          crf: 17,
          passes: 1,
          encodeSeconds: 9.4,
          target: '6281234567890',
          targetPretty: '62 812-3456-7890',
          messageId: 'ABC123DEF456',
          status: 'success',
          mock: false,
          thumbId: null,
          url: '/api/files/out_abc',
          thumbUrl: null,
          savedBytes: 33_600_000,
          ratio: 0.2,
          canResend: true,
          ageMs: 60000,
        },
      ],
      state: {
        lastTarget: '6281234567890',
        recentTargets: [{ phone: '6281234567890', pretty: '62 812-3456-7890', at: Date.now() }],
        lastCaption: '',
        lastLoginMethod: 'qr',
        stats: { totalProcessed: 7 },
      },
      activeJob: null,
      serverTime: Date.now(),
    });
    await sleep(150);
  });

  let now = text();
  assert(now.includes('WA lu udah nyambung nih bos'), 'status WA nyambung muncul di kartu koneksi');
  assert(now.includes('62 812-3456-7890'), 'nomor ke-format cantik (08… → 62 …-…-…)');
  assert(now.includes('story-luas.mp4'), 'riwayat ke-render dari payload init');
  assert(now.includes('Riwayat'), 'panel riwayat muncul');
  assert(now.includes('8/8') || now.includes('1/8'), `counter riwayat (${now.match(/\d+\/8/) ? now.match(/\d+\/8/)[0] : '?'})`);

  /* -------------------------------------------------- 6. pipeline jalan -- */
  title('6. Pipeline kompresi: progress ring + stats real-time');
  await act(async () => {
    fire('job:start', {
      jobId: 'job_test_1',
      job: { jobId: 'job_test_1', stage: 'compressing', status: 'running', targetPretty: '62 812-3456-7890', progress: { percent: 0 } },
    });
    await sleep(60);
    fire('compress:plan', {
      jobId: 'job_test_1',
      plan: {
        label: '1080p',
        tier: 1,
        crf: 17,
        width: 1080,
        height: 1920,
        maxBitrateK: 6000,
        audio: 'AAC 160k / 48kHz / stereo',
        reason: 'Durasi 22.0s -> tier 1 (1080p)',
        limitPretty: '50.00 MB',
      },
      info: {},
    });
    fire('compress:progress', {
      jobId: 'job_test_1',
      percent: 42.5,
      eta: 11,
      speed: '1.85x',
      fps: 55,
      bitrateKbps: 5200,
      outSizeKb: 3120,
      pass: 1,
      mode: 'crf',
      stage: 'compressing',
      elapsedSec: 9.6,
      wallSec: 5.2,
      totalSec: 22,
    });
    await sleep(250);
  });

  now = text();
  const ringPct = appState.getState().job.percent;
  assert(now.includes(`${Math.round(ringPct)}%`), `progress ring nunjukin ${Math.round(ringPct)}% (dari ${ringPct})`);
  assert(now.includes('1.9x'), 'kecepatan encode "1.9x" ke-render (dari speed 1.85x)');
  assert(now.includes('5.20 Mbps'), 'bitrate real-time "5.20 Mbps" ke-render');
  assert(now.includes('11 detik lagi'), 'eta "11 detik lagi" ke-render');
  assert(now.includes('Batalin, gas ulang'), 'tombol batal ada pas proses jalan');
  assert(now.includes('CRF 17'), 'rencana encode CRF 17 ke-render');
  assert(now.includes('1080×1920'), 'target resolusi 1080×1920 ke-render');
  assert(now.includes('tier 1'), 'label tier 1 ke-render');
  assert(document.querySelectorAll('svg circle[stroke-dasharray]').length > 0, 'SVG progress ring (stroke-dasharray) ada di DOM');
  assert(
    ['Lagi ngulik pixel', 'Biar story lu makin HD', 'Ngusir buram'].some((l) => now.includes(l)) || now.includes('encoding'),
    'teks lucu / status encoding aktif',
  );

  /* ------------------------------------------------- 7. notice fallback ABR */
  title('7. Notice fallback ABR (re-encode pass 2)');
  await act(async () => {
    fire('compress:progress', {
      jobId: 'job_test_1',
      percent: 0,
      reset: true,
      pass: 2,
      mode: 'abr',
      notice: 'Hasil pertama 62.10 MB kegedean buat WhatsApp. Gas ulang mode ABR biar pas di bawah 50.00 MB 🔁',
      eta: null,
      speed: null,
    });
    await sleep(200);
  });
  now = text();
  assert(now.includes('Gas ulang mode ABR'), 'notice ABR nongol di panel kompresi');
  assert(now.includes('Re-encode pass 2') || now.includes('pass 2'), 'judul panel nunjukin pass 2');

  /* --------------------------------------------------------- 8. sukses --- */
  title('8. Sukses: checkmark animasi + confetti + kartu hasil');
  await act(async () => {
    fire('job:done', {
      jobId: 'job_test_1',
      result: {
        outputId: 'out_test',
        url: '/api/files/out_test',
        thumbUrl: '/api/thumbs/th_test',
        bytes: 8_400_000,
        sizePretty: '8.01 MB',
        sourceSizePretty: '40.05 MB',
        savedBytes: 33_600_000,
        savedPretty: '32.04 MB',
        ratio: 0.21,
        percentSaved: 79,
        width: 1080,
        height: 1920,
        resolution: '1080x1920',
        sourceResolution: '2160x3840',
        duration: 22,
        durationPretty: '22d',
        mode: 'crf',
        label: '1080p',
        crf: 17,
        passCount: 1,
        encodeSeconds: 9.4,
        overLimit: false,
      },
      send: { ok: true, mock: false, target: '6281234567890', targetPretty: '62 812-3456-7890', messageId: 'XYZ789' },
      history: { id: 'job_test_1' },
    });
    await sleep(350);
  });
  await remount();

  now = text();
  assert(now.includes('Video Kekirim'), 'headline sukses "Video Kekirim! 🎉"');
  assert(now.includes('Hasil Kompresi'), 'kartu hasil ke-render');
  assert(now.includes('8.01 MB'), 'ukuran hasil 8.01 MB');
  assert(now.includes('40.05 MB'), 'ukuran sumber (before) 40.05 MB');
  assert(now.includes('79%'), 'penghematan 79%');
  assert(now.includes('Download MP4'), 'tombol download ada');
  assert(now.includes('Kirim ke nomor lain'), 'tombol kirim ke nomor lain ada');
  assert(now.includes('Teruskan') || now.includes('forward ke Status'), 'tips forward ke Status');
  assert(document.querySelector('canvas') !== null, 'canvas confetti ke-mount');
  const allD = Array.from(document.querySelectorAll('svg path')).map((p) => p.getAttribute('d') || '');
  const checkPaths = allD.filter((d) => d.replace(/\s+/g, ' ').includes('M31 52.5 L44.5 66 L70 36'));
  assert(checkPaths.length > 0, `path checkmark "menggambar sendiri" ke-render (${checkPaths.length} path)`);
  assert(allD.some((d) => d.includes('M4 12.5')), 'path centang kecil di stepper juga ke-render');
  assert(document.querySelectorAll('[aria-label="Tutup notifikasi"]').length > 0, 'toast sukses muncul (+ tombol tutup)');
  assert(now.includes('terkirim ke 62 812-3456-7890'), 'pill "terkirim ke …" di header kartu hasil');

  /* ---------------------------------------------------------- 9. error --- */
  title('9. State error + state batal');
  await act(async () => {
    fire('job:error', { jobId: 'job_err', code: 'TARGET_INVALID', message: 'Nomor 62 812-0000 nggak terdaftar di WhatsApp. Cek lagi nomornya bos.' });
    await sleep(220);
  });
  await remount();
  now = text();
  assert(now.includes('Yah, gagal nih bro'), 'state error ke-render dengan bahasa gaul');
  assert(now.includes('TARGET_INVALID'), 'kode error ditampilkan');
  assert(now.includes('nggak terdaftar di WhatsApp'), 'pesan error dari server diterusin ke UI');

  await act(async () => {
    fire('job:start', { jobId: 'job_cancel', job: { jobId: 'job_cancel', stage: 'compressing', status: 'running', progress: { percent: 3 } } });
    await sleep(80);
    fire('job:cancelled', { jobId: 'job_cancel', message: 'Oke, dibatalin. Video lu tetep aman di server.' });
    await sleep(220);
  });
  await remount();
  now = text();
  assert(now.includes('Dibatalkan'), 'state batal ke-render');
  assert(now.includes('ffmpeg udah gw cekik') || now.includes('cekik'), 'copy pembatalan bahasa gaul');

  /* --------------------------------------------------- 10. QR / pairing -- */
  title('10. Modal koneksi WA: QR + pairing code 8 digit');
  // Skenario asli: server baru nyala, belum ada session -> registered=false,
  // QR pertama nongol -> modal koneksi kebuka sendiri (sekali per sesi QR).
  await act(async () => {
    fire('wa:status', { status: 'qr', connected: false, registered: false, me: null });
    await sleep(120);
  });
  await remount();
  assert(appState.getState().ui.modal !== 'connect', 'modal nggak maksa kebuka kalo belum ada QR');

  await act(async () => {
    fire('wa:qr', {
      qr: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', expiresAt: Date.now() + 40000, count: 3, raw: 'RAWQR' },
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      expiresAt: Date.now() + 40000,
      count: 3,
      ttlMs: 45000,
    });
    await sleep(280);
  });
  await remount();
  now = text();
  assert(appState.getState().ui.modal === 'connect', 'modal koneksi kebuka otomatis pas QR pertama nongol');
  assert(appState.getState().ui.connectTab === 'qr', 'tab default modal = QR');
  assert(now.includes('Cara scan-nya gini bos'), 'instruksi scan QR ke-render');
  assert(document.querySelector('img[alt*="QR"]') !== null, 'gambar QR (data URL) ke-render');
  assert((document.querySelector('img[alt*="QR"]') || {}).src?.startsWith('data:image/png;base64,'), 'src QR-nya data URL, bukan file eksternal');
  assert(now.includes('QR ke-3'), 'counter QR auto-refresh ditampilkan');
  assert(now.includes('Perangkat tertaut'), 'instruksi nyebut "Perangkat tertaut"');

  // QR refresh kedua nggak boleh maksa modal kebuka lagi (user mungkin udah nutup)
  await act(async () => {
    appState.setUi({ modal: null });
    fire('wa:qr', { qr: { dataUrl: 'data:image/png;base64,AAA=', expiresAt: Date.now() + 40000, count: 4 }, count: 4 });
    await sleep(150);
  });
  assert(appState.getState().ui.modal === null, 'QR refresh berikutnya nggak maksa modal kebuka lagi');

  // Tutup modal QR dulu, terus buka lagi langsung di tab pairing (di flow asli
  // user yang klik tab-nya; AnimatePresence nunggu exit kelar).
  await remount();
  await act(async () => {
    fire('wa:pairing', { code: 'KYYDEVV8', phone: '6281234567890', phonePretty: '62 812-3456-7890', at: Date.now() });
    appState.setUi({ modal: 'connect', connectTab: 'pair' });
    await sleep(200);
  });
  await remount();
  now = text();
  assert(now.includes('Pairing Code'), 'tab pairing code ada');
  assert(appState.getState().ui.connectTab === 'pair', 'tab aktif pindah ke pairing');
  const codeBoxes = Array.from(document.querySelectorAll('div')).filter(
    (d) => d.children.length === 0 && d.textContent.trim().length === 1 && /^[A-Z0-9•]$/.test(d.textContent.trim()),
  );
  assert(codeBoxes.length >= 8, `8 kotak digit pairing ke-render (${codeBoxes.length} kotak)`);
  assert(
    codeBoxes.map((d) => d.textContent.trim()).join('') === 'KYYDEVV8',
    `digit pairing kebaca "KYYDEVV8" (${codeBoxes.map((d) => d.textContent.trim()).join('')})`,
  );
  assert(now.includes('Tautkan dengan nomor telepon'), 'instruksi pairing lengkap');
  assert(now.includes('Masukin kode-nya di HP'), 'judul instruksi pairing ke-render');

  // balikin ke kondisi nyambung biar seksi berikutnya realistis
  await act(async () => {
    fire('wa:status', {
      status: 'open',
      connected: true,
      registered: true,
      me: { jid: '6281234567890@s.whatsapp.net', phone: '6281234567890', phonePretty: '62 812-3456-7890', pushName: 'Kyy Tester' },
      qr: null,
      pairing: null,
    });
    await sleep(150);
  });

  /* --------------------------------------- 11. kontrak client -> server --- */
  title('11. Aksi UI beneran nge-emit event ke server');
  const sent = [];
  socket.on('__any', (evt, payload) => sent.push({ evt, payload }));
  await act(async () => {
    await appState.cancelJob();
    await appState.requestPairing('081234567890', 'KYYDEVV8');
    appState.connectWa('qr');
    await appState.checkNumber('081234567890');
    await appState.setLastTarget('081234567890');
    await sleep(220);
  });
  const sentEvents = sent.map((x) => x.event || x.evt);
  assert(sentEvents.includes('video:cancel'), `cancelJob() nge-emit "video:cancel" (jobId=${appState.getState().job?.jobId})`);
  assert(sentEvents.includes('wa:pair'), 'requestPairing() nge-emit "wa:pair"');
  assert(sentEvents.includes('wa:connect'), 'connectWa() nge-emit "wa:connect"');
  assert(sentEvents.includes('wa:check'), 'checkNumber() nge-emit "wa:check"');
  assert(sentEvents.includes('state:set'), 'setLastTarget() nge-emit "state:set"');
  const pairEvt = sent.find((x) => (x.event || x.evt) === 'wa:pair');
  assert(pairEvt && pairEvt.payload && pairEvt.payload.phone === '6281234567890', 'nomor 08… dinormalisasi jadi 628… sebelum dikirim');
  assert(pairEvt && pairEvt.payload && pairEvt.payload.code === 'KYYDEVV8', 'kode custom 8 karakter ikut dikirim');

  /* ------------------------------------------------------- 11. unmount --- */
  title('12. Unmount bersih');
  await act(async () => {
    root.unmount();
    await sleep(80);
  });
  ok('unmount tanpa error');

  console.log(`\n${c.cyan}──────────────────────────────────────────────────────────────${c.reset}`);
  console.log(`  ${c.green}LULUS ${passed}${c.reset} | ${failed ? c.red : c.dim}GAGAL ${failed}${c.reset}`);
  console.log(`${c.cyan}──────────────────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.dim}  KyyPureStatus UI render test — by KyyDevv${c.reset}\n`);

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`${c.red}RENDER TEST CRASH:${c.reset}`, err.stack || err.message);
  process.exit(1);
});
