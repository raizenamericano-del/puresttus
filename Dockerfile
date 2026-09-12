# =============================================================================
#  KyyPureStatus — Dockerfile (multi-stage)
#  Base: node:20-slim + ffmpeg (apt-get SEBELUM npm install, sesuai spec)
#  (c) KyyDevv
# =============================================================================

# ---------- STAGE 1: build frontend (React + Vite + Tailwind) ---------------
FROM node:20-slim AS client-builder

WORKDIR /app/client

# Cache layer dependency client dulu biar rebuild cepet
COPY client/package.json ./
RUN npm install --no-audit --no-fund --loglevel=error

COPY client/ ./
ENV NODE_ENV=production
RUN npm run build


# ---------- STAGE 2: dependency backend (production only) ------------------
FROM node:20-slim AS deps

WORKDIR /app

COPY package.json ./
COPY scripts/postinstall.js ./scripts/postinstall.js

# Folder client/package.json perlu ada supaya postinstall nggak bingung,
# tapi node_modules client dibikin dummy biar nggak dobel install.
RUN mkdir -p client/node_modules && echo '{"name":"kyypurestatus-client","version":"1.0.0"}' > client/package.json

RUN npm install --omit=dev --no-audit --no-fund --loglevel=error \
 && npm cache clean --force


# ---------- STAGE 3: runtime -----------------------------------------------
FROM node:20-slim AS runtime

# ffmpeg WAJIB keinstall duluan (sebelum node_modules dipakai jalan)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini curl \
 && ffmpeg -version | head -1 \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    SESSION_DIR=/data/sessions \
    UPLOAD_DIR=/data/uploads \
    OUTPUT_DIR=/data/output \
    THUMB_DIR=/data/thumbs \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe

# Dependency backend hasil stage deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Source backend + scripts
COPY server ./server
COPY scripts ./scripts

# Hasil build frontend
COPY --from=client-builder /app/client/dist ./client/dist

# Volume Railway: session WA + file upload/output/thumb
RUN mkdir -p /data/sessions /data/uploads /data/output /data/thumbs
VOLUME ["/data"]

EXPOSE 8080

# tini jadi PID 1 -> SIGTERM diterusin ke node (graceful shutdown + kill ffmpeg)
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]

HEALTHCHECK --interval=30s --timeout=6s --start-period=45s --retries=4 \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1
