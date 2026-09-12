<div align="center">

# 🎬 KyyPureStatus

**Video HD, Anti Buram, Auto Terkirim.**

Kompresi video cerdas di server pakai FFmpeg → otomatis dikirim ke WhatsApp lu → tinggal **forward ke Status** → hasilnya **tetep tajem**, nggak buram kayak biasanya.

<br/>

`Node.js 20` · `Express` · `Socket.io 4` · `Baileys v6` · `fluent-ffmpeg` · `React 18` · `Vite 5` · `Tailwind 3` · `Framer Motion 11`

<br/>

⚠️ **Pake nomor cadangan aja bro, library ginian rawan banned dari Mark Zuckerberg.**

Made with 💜 by **KyyDevv**

</div>

---

## 📌 Ini apaan sih?

Pernah ngalamin? Lu bikin video kece, kirim ke WA, diterusin ke Status — eh hasilnya **pecah/buram** kayak rekaman CCTV tahun 2009.

Penyebabnya: WhatsApp nge-kompres ulang video lu karena bitrate/ukurannya kelewat batas. **KyyPureStatus** motong masalah itu di akarnya:

1. **Server** yang ngompres video lu pakai ladder adaptif (H.264 High@4.1, 30fps, yuv420p) — pas di bawah limit WA.
2. **Orientasi dijaga** — video portrait 9:16 tetep portrait, nggak dipaksa jadi landscape.
3. **Auto kirim** ke nomor WA lu lewat Baileys (session persisten, nggak perlu scan QR tiap restart).
4. Lu tinggal **tahan → Teruskan → Status saya**. Karena filenya udah "ramah" sama encoder WA, hasil terusan-nya tetep HD.

---

## ✨ Fitur

| Fitur | Detail |
|---|---|
| 🎯 **Ladder adaptif** | Tier kompresi murni ditentukan **durasi** video input (lihat tabel di bawah) |
| 📐 **Anti-upscale & jaga orientasi** | Deteksi `rotate` 90°/270° + display matrix dari ffprobe, diputer manual pakai `transpose`, tag rotate dibuang |
| 🔁 **Fallback ABR otomatis** | Hasil CRF > 50MB → re-encode mode ABR (bitrate dihitung dari durasi) sampai muat. Masih bandel? Pass ke-3 turun 20% |
| 🔇 **Deteksi audio** | Nggak ada stream audio → otomatis `-an` (bukan error) |
| 📊 **Progress real-time** | `percent`, `eta`, `speed`, `fps`, `bitrate`, ukuran output — semua lewat Socket.io |
| 🛑 **Batalkan kapan aja** | ffmpeg di-`SIGKILL`, file setengah jadi langsung dibuang |
| 🔒 **Single-flight** | Cuma 1 proses encode/kirim jalan per user (bisa diubah lewat env) |
| 📱 **2 cara login WA** | QR Code (auto refresh, diconvert ke PNG data URL) **atau** Pairing Code 8 digit (boleh custom) |
| 🔗 **Session persisten** | `useMultiFileAuthState` di `/data/sessions` — restart server nggak perlu scan ulang |
| ♻️ **Auto-reconnect** | Exponential backoff 2s → 30s, `loggedOut` → folder session dihapus otomatis |
| ✅ **Cek nomor tujuan** | `onWhatsApp()` sebelum kirim + normalisasi `08...` → `628...` |
| 🕘 **Riwayat 8 terakhir** | Fitur **Kirim Ulang** tanpa upload/kompres ulang (paket hemat kuota server) |
| 🧹 **Auto-cleanup** | Interval **10 menit**: sapu file upload/output/thumb basi + file yatim + prune history |
| 🧪 **MOCK_SEND** | Mode uji: Baileys di-skip, kompresi tetep jalan, kirim disimulasikan — buat ngetes UI/UX |
| 🎨 **UI premium** | Dark theme Vercel/Linear vibe, logo SVG murni, progress ring, teks lucu berganti tiap 3 detik, checkmark path-animation + confetti |
| 🌐 **Streaming Range** | `GET /api/files/:id` support HTTP 206 Range → `<video>` bisa di-seek |
| 🐳 **Deploy siap** | `Dockerfile` (node:20-slim + ffmpeg), `Procfile`, `railway.json`, `docker-compose.yml` |

---

## 🎚️ Ladder kompresi (murni dari durasi)

| Durasi input | Tier | Target | Kotak skala | Max bitrate | Rate control |
|---|---|---|---|---|---|
| ≤ 30 detik | 1 | **1080p** | 1080×1920 | 6 Mbps | CRF 17 |
| 31–60 detik | 2 | **720p** | 720×1280 | 4 Mbps | CRF 17 |
| 61–120 detik | 3 | **480p** | 480×854 | 2.5 Mbps | CRF 16 |
| > 120 detik | 4 | **360p** | 360×640 | 1.5 Mbps | CRF 16 |

**Aturan skala:** `scale=w=BOX:h=BOX:force_original_aspect_ratio=decrease:flags=lanczos` → rasio asli dijaga, **nggak pernah upscale**, dimensi digenapin (`trunc(iw/2)*2`) buat `yuv420p`.

### Spesifikasi output

```text
container   : MP4 (+faststart)
video       : libx264, preset faster, profile high, level 4.1
pix_fmt     : yuv420p
fps         : 30 (filter fps=30, bukan cuma -r)
x264-params : ref=4:bframes=3:me=umh:subq=7:rc-lookahead=40:me_range=24
audio       : AAC 160k • 48 kHz • stereo   (bisu → -an)
limit       : 50 MB → kalau lewat, otomatis re-encode mode ABR
```

---

## 📁 Struktur folder

```text
kyypurestatus/
├── client/                     # React 18 + Vite 5 + Tailwind 3 + Framer Motion 11
│   ├── index.html              # critical CSS inline + favicon SVG data URI
│   ├── vite.config.js          # proxy /api & /socket.io → backend (dev)
│   ├── tailwind.config.js      # design token: #07070d / #8b5cf6 / #d946ef / #22d3ee
│   ├── public/favicon.svg
│   └── src/
│       ├── main.jsx
│       ├── App.jsx             # hero, workspace 2 kolom, how-it-works, engine spec
│       ├── index.css           # design system (card/btn/pill/input/glow/noise)
│       ├── components/
│       │   ├── Logo.jsx        # SVG murni: 'K' abstrak gradasi violet→cyan + shine
│       │   ├── Header.jsx      # status socket, pill status WA, warning banned
│       │   ├── BackgroundFX.jsx# orb gradien gerak + grid halus
│       │   ├── DropZone.jsx    # drag & drop / klik / Ctrl+V, preview, chip metadata
│       │   ├── TargetInput.jsx # normalisasi 08→628 live, cek onWhatsApp, caption
│       │   ├── ProgressPanel.jsx # stepper + progress ring + teks lucu + stats + batal
│       │   ├── SuccessCheck.jsx  # checkmark "menggambar sendiri" (pathLength anim)
│       │   ├── Confetti.jsx      # confetti canvas zero-dependency
│       │   ├── ResultCard.jsx    # before/after, spek, download, kirim ke nomor lain
│       │   ├── HistoryPanel.jsx  # 8 riwayat + kirim ulang tanpa upload ulang
│       │   ├── ConnectWaModal.jsx# QR (countdown + scanline) & pairing code 8 digit
│       │   ├── InfoModal.jsx     # ladder, spek encoder, socket/API, storage, token
│       │   ├── Modal.jsx · Toasts.jsx · Footer.jsx
│       ├── hooks/useAppState.js # store useSyncExternalStore + semua socket handler
│       └── lib/ (api.js, socket.js, format.js, constants.js)
│
├── server/
│   ├── index.js                # Express + Socket.io + bootstrap + graceful shutdown
│   ├── config.js               # semua env → satu objek (default aman)
│   ├── sockets.js              # semua event socket.io client↔server
│   ├── whatsapp/manager.js     # Baileys: QR, pairing, reconnect, onWhatsApp, sendVideo
│   ├── engine/
│   │   ├── probe.js            # ffprobe: durasi, resolusi, rotasi, SAR, audio, fps
│   │   ├── encoder.js          # ⭐ CORE: ladder, filter chain, CRF→ABR fallback, kill
│   │   └── jobs.js             # pipeline + single-flight + progress + riwayat + cleanup
│   ├── store/
│   │   ├── history.js          # history.json (maks 8, write-queue, prune TTL)
│   │   └── appstate.js         # preferensi + statistik kumulatif
│   ├── routes/api.js           # semua REST endpoint (upload pakai multer, Range stream)
│   └── utils/ (logger.js, format.js, files.js, ffmpeg.js)
│
├── data/                       # ⬅ volume mount Railway (sessions/uploads/output/thumbs)
├── scripts/
│   ├── smoke.js                # 59 tes engine (ladder, skala, rotasi, ABR, cancel)
│   ├── integration.js          # 73 tes server beneran (REST + socket + pipeline)
│   └── postinstall.js          # auto install dependency client
├── package.json                # root: start / dev / build / smoke / integration
├── Dockerfile                  # node:20-slim + apt-get ffmpeg (multi-stage)
├── Procfile                    # web: node server/index.js
├── railway.json                # builder DOCKERFILE + healthcheck /api/health
├── docker-compose.yml          # jalanin lokal/VPS pakai volume persisten
├── .env.example                # semua env var + penjelasan
└── .dockerignore · .gitignore
```

---

## 🚀 Cara jalanin

### Prasyarat

- **Node.js 18+** (disarankan 20)
- **FFmpeg** terpasang & ada di PATH

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg

# Windows
winget install Gyan.FFmpeg
```

> Nggak ada ffmpeg di PATH? Project ini juga nyediain fallback `@ffmpeg-installer/ffmpeg` + `@ffprobe-installer/ffprobe` (devDependency), atau set manual lewat `FFMPEG_PATH` / `FFPROBE_PATH`.

### Quick start

```bash
git clone <repo-lu> kyypurestatus && cd kyypurestatus

# 1. install semua (root + client otomatis lewat postinstall)
npm install

# 2. siapin env
cp .env.example .env

# 3. build frontend
npm run build

# 4. nyalain
npm start
# → http://localhost:8080
```

### Development (hot reload)

```bash
npm run dev
# SERVER  → http://localhost:8080  (node --watch)
# CLIENT  → http://localhost:5173  (vite, proxy /api & /socket.io ke 8080)
```

### Ngetes dulu sebelum main beneran

```bash
# engine doang (bikin video uji, cek ladder/skala/rotasi/ABR/cancel)
npm run smoke

# server beneran: boot → upload → proses → kirim (mock) → resend → cancel → shutdown
npm run integration

# UI beneran di-render (jsdom + React 18): copy, warning, logo SVG, simulasi event socket
npm run test:render

# atau gas ketiganya sekaligus
npm test
```

---

## 🔐 Login WhatsApp

Dua cara, pilih di modal **"Sambungkan WA"**:

**A. QR Code** — klik *Sambungkan WA*, QR nongol (auto refresh tiap ±20–40 detik dari server WA, ada countdown-nya), scan dari HP:
`WhatsApp → ⋮ → Perangkat tertaut → Tautkan perangkat`.

**B. Pairing Code 8 digit** — isi nomor HP lu (format `08...` otomatis jadi `628...`), boleh juga kasih kode custom 8 karakter A–Z0–9 (misal `KYYDEVV8`). Terus di HP:
`WhatsApp → Perangkat tertaut → Tautkan perangkat → "Tautkan dengan nomor telepon" → ketik kodenya`.

Session disimpan di `data/sessions/` (di Railway: volume `/data/sessions`) — **restart server nggak perlu scan ulang**. Kalo kena `DisconnectReason.loggedOut`, folder session dihapus otomatis dan UI nyuruh lu scan lagi.

> 🔁 **Auto-reconnect:** exponential backoff `2s → 4s → 8s → ... → maks 30s`, counter-nya keliatan di UI.

---

## 🧪 Mode uji (`MOCK_SEND`)

```bash
MOCK_SEND=true
```

- Baileys **nggak dinyalain** sama sekali (status WA dipaksa `open`).
- Kompresi FFmpeg **tetep jalan normal 100%** — jadi lu bisa ngetes ladder, progress ring, fallback ABR, cancel.
- Tahap kirim langsung ditembak sukses setelah ±2 detik (messageId `MOCK...`).
- Cocok buat: develop UI, demo, screenshot, atau server tanpa akses WA.

Balik ke produksi: `MOCK_SEND=false` terus restart.

---

## ⚙️ Environment variables

Semua punya default aman — `.env` boleh kosong total. Yang penting:

| Variable | Default | Fungsi |
|---|---|---|
| `PORT` | `8080` | Port HTTP (Railway inject otomatis) |
| `HOST` | `0.0.0.0` | Bind address — **jangan** `127.0.0.1` di container |
| `MOCK_SEND` | `false` | Mode uji (skip Baileys) |
| `DATA_DIR` | `./data` | Root storage. Railway: `/data` |
| `SESSION_DIR` | `DATA_DIR/sessions` | Session Baileys (`useMultiFileAuthState`) |
| `UPLOAD_DIR` / `OUTPUT_DIR` / `THUMB_DIR` | di dalam `DATA_DIR` | File mentah / hasil / thumbnail |
| `MAX_UPLOAD_MB` | `100` | Limit upload (multer) |
| `WA_MEDIA_LIMIT_MB` | `50` | Limit hasil → trigger fallback ABR |
| `CLEANUP_INTERVAL_MS` | `600000` | **10 menit** auto-cleanup |
| `UPLOAD_TTL_MIN` / `OUTPUT_TTL_MIN` / `THUMB_TTL_MIN` | `120` / `240` / `240` | Umur file sebelum disapu |
| `HISTORY_LIMIT` | `8` | Jumlah riwayat disimpan |
| `HISTORY_MAX_AGE_DAYS` | `7` | Riwayat lebih tua dibuang |
| `MAX_CONCURRENT_JOBS` | `1` | Single-flight (1 = ketat) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | *(kosong)* | Override binary manual |
| `USE_VBV` | `true` | Pasang `maxrate`+`bufsize` di pass CRF (biar cap bitrate beneran dijaga) |
| `ABR_SAFETY` | `0.94` | Safety margin hitung bitrate ABR |
| `ENCODE_TIMEOUT_MS` | `1500000` | Timeout encode (25 menit) |
| `PROGRESS_THROTTLE_MS` | `160` | Throttle emit `compress:progress` |
| `WA_DEVICE_NAME` | `KyyPureStatus` | Nama device di "Perangkat Tertaut" |
| `WA_RECONNECT_MIN_MS` / `WA_RECONNECT_MAX_MS` | `2000` / `30000` | Backoff reconnect |
| `API_TOKEN` | *(kosong)* | Kalo diisi, semua `/api` + socket butuh `X-Kyy-Token` |
| `CORS_ORIGIN` | `*` | Origin yang diijinkan (pisah koma) |

---

## 🔌 REST API

| Method | Endpoint | Fungsi |
|---|---|---|
| `POST` | `/api/upload` | multipart field **`video`** (maks 100MB) → `{uploadId, size, info, plan, previewUrl}` |
| `POST` | `/api/process` | `{uploadId, target, caption}` → mulai pipeline (alternatif socket) |
| `POST` | `/api/cancel` | `{jobId}` → kill ffmpeg |
| `POST` | `/api/resend` | `{historyId, target, caption}` → kirim ulang tanpa kompresi |
| `GET` | `/api/jobs` | daftar job + yang lagi aktif |
| `GET` | `/api/history` | 8 riwayat terakhir (+ `url`, `thumbUrl`, `canResend`) |
| `DELETE` | `/api/history/:id` · `/api/history` | hapus satu / semua |
| `GET` | `/api/files/:id` | stream hasil (support `Range` → HTTP 206) |
| `GET` | `/api/uploads/:id` | stream file asli |
| `GET` | `/api/thumbs/:id` | thumbnail JPEG |
| `DELETE` | `/api/uploads/:id` | buang file upload |
| `GET` | `/api/wa/status` | status koneksi Baileys |
| `POST` | `/api/wa/connect` | `{method:'qr'\|'pairing', phone?}` |
| `POST` | `/api/wa/pair` | `{phone, code?}` → pairing code 8 digit |
| `POST` | `/api/wa/disconnect` · `/api/wa/logout` | putus (session tetep) / hapus session |
| `POST` | `/api/wa/check` | `{phone}` → `{exists, jid, reason}` (onWhatsApp) |
| `GET` | `/api/info` | konfigurasi + ladder + statistik |
| `GET` | `/api/storage` | pemakaian disk per folder |
| `POST` | `/api/storage/cleanup` | paksa cleanup sekarang |
| `GET` | `/api/health` | `{ok:true}` (dipakai healthcheck Railway/Docker) |

## 📡 Socket.io

**Client → Server**

| Event | Payload | Keterangan |
|---|---|---|
| `video:process` | `{uploadId, target?, caption?}` | mulai kompresi (+ kirim kalo ada target) |
| `video:send` | `{uploadId \| outputId, target, caption?}` | kirim langsung / proses dulu |
| `video:cancel` | `{jobId?}` | batalkan (kill ffmpeg) |
| `video:resend` | `{historyId, target?, caption?}` | kirim ulang dari riwayat |
| `wa:connect` | `{method, phone?, code?}` | mulai koneksi QR / pairing |
| `wa:pair` | `{phone, code?}` | minta pairing code 8 digit |
| `wa:disconnect` | `{wipe?}` | putus / hapus session |
| `wa:status` · `wa:check` | `{}` / `{phone}` | cek status / cek nomor |
| `history:get` · `history:delete` · `history:clear` | `{}` / `{id}` | kelola riwayat |
| `state:get` · `state:set` | `{}` / `{lastTarget,lastCaption}` | preferensi |

**Server → Client**

| Event | Payload |
|---|---|
| `init` | `{config, wa, history, state, activeJob}` |
| `compress:progress` | `{jobId, percent, eta, speed, fps, bitrateKbps, outSizeKb, pass, mode, notice, elapsedSec, wallSec, totalSec}` |
| `compress:plan` | `{plan, info}` |
| `job:start` · `job:stage` · `job:probe` | `{jobId, stage, job, info, plan}` |
| `job:sendProgress` | `{jobId, stage: 'validate'\|'presence'\|'upload'\|'sent'}` |
| `job:done` | `{jobId, result, send, history}` |
| `job:error` · `job:cancelled` · `job:cancelling` | `{jobId, message, code}` |
| `wa:status` · `wa:qr` · `wa:pairing` · `wa:connected` | `{qr:{dataUrl,expiresAt,count}, ...}` |
| `wa:disconnected` · `wa:reconnecting` · `wa:loggedOut` · `wa:error` | `{reason, attempt, delayMs, message}` |
| `history:update` · `cleanup:done` | `[...]` / `{removedFiles, results}` |

> Semua event yang bisa gagal support **ack callback** `{ok, error, code}` — UI pakai itu buat nampilin toast.

---

## 🚢 Deploy ke Railway

1. **New Project → Deploy from GitHub repo** (pilih repo ini).
2. Railway otomatis baca `railway.json` → builder **DOCKERFILE**.
3. **Bikin volume**: tab service → `+ New Volume` → mount path **`/data`**.
4. Set variables:

```env
NODE_ENV=production
MOCK_SEND=false
DATA_DIR=/data
MAX_UPLOAD_MB=100
WA_MEDIA_LIMIT_MB=50
WA_DEVICE_NAME=KyyPureStatus
# opsional, biar nggak diacak orang:
API_TOKEN=bikin-token-rahasia-lu-disini
```

5. Deploy → **Generate Domain** → buka → klik **Sambungkan WA** → scan QR / pairing code.
6. Healthcheck: `/api/health` (udah diset di `railway.json`, timeout 120s).

> 💡 **Kenapa volume penting:** session Baileys + hasil kompresi ada di `/data`. Tanpa volume, tiap redeploy lu harus scan QR ulang dan riwayat ilang.

> 💡 **Resource:** encode 1080p butuh napas. Kasih minimal **2 vCPU / 2GB RAM** biar `preset faster` beneran cepet. Cek progress `speed` di UI — kalo di bawah `1.0x`, artinya CPU-nya kurang.

### Deploy pakai Docker / VPS

```bash
docker compose up -d --build
# → http://localhost:8080
```

Atau manual:

```bash
docker build -t kyydevv/kyypurestatus .
docker run -d --name kyypurestatus -p 8080:8080 \
  -v kyy-data:/data \
  -e MOCK_SEND=false \
  kyydevv/kyypurestatus
```

---

## 🧪 Testing

| Perintah | Isi | Hasil terakhir |
|---|---|---|
| `npm run smoke` | Ladder 7 kasus durasi · skala/anti-upscale 5 kasus · encode beneran (cek codec/profile/pix_fmt/fps/audio) · **deteksi rotasi** (tag rotate + display matrix 90/180/270) · portrait 9:16 end-to-end · video bisu → `-an` · **fallback ABR 3 pass** · cancel (kill ffmpeg) · thumbnail · normalisasi nomor | **59/59 ✔** |
| `npm run integration` | Boot server beneran → `/api/info` → upload multipart → probe & plan → socket `video:process` → pantau `compress:progress` (percent/speed/eta/bitrate) → `job:done` → stream file + **HTTP Range 206** → thumbnail → `video:resend` → upload 45s lalu **`video:cancel`** → riwayat ≤ 8 → cleanup manual → endpoint WA → **graceful shutdown SIGTERM** | **73/73 ✔** |
| `npm run test:render` | Render `<App />` beneran di jsdom: semua copy bahasa gaul · warning banned permanen · logo SVG murni (gradient + path 'K') · simulasi event socket (`init` → `job:start` → `compress:progress` → notice ABR → `job:done` → `job:error` → `job:cancelled`) · progress ring & statistik real-time · checkmark self-drawing + confetti + kartu hasil · modal QR & **8 kotak pairing code** · aksi UI beneran nge-emit `video:cancel` / `wa:pair` / `wa:connect` / `wa:check` / `state:set` · normalisasi `08…` → `628…` | **76/76 ✔** |

```bash
npm test            # smoke + integration + render
```

> Catatan: render test pakai **stub socket** (`socket.io-client` di-mock), jadi nggak akan
> nyenggol server yang lagi idup di mesin lu. Hasilnya deterministik.

---

## 🩺 Troubleshooting

| Gejala | Sebab & solusi |
|---|---|
| `ffmpeg NGGAK ketemu` di log | Install ffmpeg (`apt-get install -y ffmpeg`) atau set `FFMPEG_PATH`/`FFPROBE_PATH` ke binary-nya |
| QR nggak nongol | Klik **"Tampilkan QR"** di modal. Cek log server buat `connection.update`. Kalo `badSession`, session dihapus otomatis — scan ulang |
| Pairing code nggak muncul | Pastikan nomor format `628...` (bukan `+62`), dan device belum pernah terdaftar. Coba mode QR sebagai plan B |
| `Nomor ... nggak terdaftar di WhatsApp` | `onWhatsApp()` balik `exists:false`. Cek nomor, atau doi pakai WhatsApp Business dengan LID |
| Hasil video miring/kepotong | Harusnya nggak — rotasi diurus manual. Kalo masih aneh, cek `info.rotation` di response `/api/upload` dan laporin |
| Hasil masih > 50MB | Encoder otomatis re-encode ABR (pass 2 & 3). Kalo masih lewat juga, berarti durasi videonya ekstrem — potong dulu |
| Encode lambat banget (`speed` < 1x) | CPU kurang. Naikin vCPU, atau set `MAX_CONCURRENT_JOBS=1` (default) biar nggak rebutan |
| Kena banned / ke-logout | Udah diwarning dari awal 🙂 Pakai nomor cadangan, jangan spam, jangan kirim massal. `loggedOut` → session dibersihkan otomatis |
| Upload gagal 413 | Lewat `MAX_UPLOAD_MB`. Naikin env-nya (inget, limit WA tetep 50MB buat hasil) |
| Port 8080 dipake | Ganti `PORT` di `.env` |
| Frontend 404 / "belum di-build" | Jalanin `npm run build` dulu (produksi serve `client/dist`) |

---

## ⚠️ Disclaimer

- Project ini **nggak berafiliasi** dengan WhatsApp / Meta.
- Otomasi WhatsApp lewat library pihak ketiga **melanggar ToS WhatsApp** dan **berisiko banned permanen**. Pakai nomor cadangan, jangan spam, jangan buat hal yang merugikan orang lain.
- **Pake nomor cadangan aja bro, library ginian rawan banned dari Mark Zuckerberg.**
- Semua risiko pemakaian lu tanggung sendiri. Author cuma bikin alatnya.

---

<div align="center">

**KyyPureStatus** v1.0.0 — dibangun sekali jalan, tanpa placeholder.

Made with 💜 by **KyyDevv**

</div>
