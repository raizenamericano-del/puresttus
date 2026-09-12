/**
 * KyyPureStatus — Video Probe Engine
 * Bongkar metadata video pakai ffprobe: durasi, resolusi, orientasi/rotasi,
 * keberadaan audio, fps, bitrate. Semua keputusan ladder kompresi lahir dari sini.
 *
 * (c) KyyDevv
 */
'use strict';

const ffmpeg = require('fluent-ffmpeg');
const { applyToFfmpeg, isReady } = require('../utils/ffmpeg');
const log = require('../utils/logger').scope('probe');

applyToFfmpeg(ffmpeg);

const EPS = 1e-3;

function round(n, digits = 3) {
  const f = 10 ** digits;
  return Math.round(Number(n) * f) / f;
}

/**
 * Ubah display matrix dari ffprobe ("1,0,0,0,1,0,0,0,1" atau "0,-1,1,1,0,...") jadi derajat.
 * Matrix = [a b u; c d v; x y w]. rotation = atan2(c, a)
 */
function matrixToDegrees(sideDataList = []) {
  const sd = (sideDataList || []).find(
    (s) => s && (s.side_data_type || '').toLowerCase().includes('display matrix'),
  );
  if (!sd) return null;

  // Bentuk matriks 3x3 penuh
  if (Array.isArray(sd.displaymatrix) && sd.displaymatrix.length >= 9) {
    const m = sd.displaymatrix.map(Number);
    const deg = (Math.atan2(m[3], m[0]) * 180) / Math.PI;
    return Math.round(((deg % 360) + 360) % 360);
  }
  if (Array.isArray(sd.displaymatrix) && sd.displaymatrix.length === 4) {
    const [a, b, c, d] = sd.displaymatrix.map(Number);
    const deg = (Math.atan2(c, a) * 180) / Math.PI;
    return Math.round(((deg % 360) + 360) % 360);
  }
  // ffprobe nge-report field "rotation" dengan tanda kebalikan
  // (rotate 90° CW -> rotation: -90). Kita normalisasi ke "derajat CW positif".
  if (typeof sd.rotation === 'number' || typeof sd.rotation === 'string') {
    const raw = Number(sd.rotation);
    if (Number.isFinite(raw)) {
      const cw = -raw;
      return Math.round(((cw % 360) + 360) % 360);
    }
  }
  return null;
}

function readRotation(stream = {}) {
  const tags = stream.tags || {};
  const rawTag = tags.rotate ?? tags.Rotate ?? tags.ROTATE;
  if (rawTag !== undefined && rawTag !== null && rawTag !== '') {
    const deg = Number(String(rawTag).replace(/[^0-9-]/g, ''));
    if (Number.isFinite(deg)) return Math.round(((deg % 360) + 360) % 360);
  }
  const fromMatrix = matrixToDegrees(stream.side_data_list);
  if (fromMatrix !== null) return fromMatrix;

  // ffprobe baru kadang naro di format.tags
  return null;
}

function parseFps(stream = {}) {
  const pick = (v) => {
    if (!v || typeof v !== 'string') return null;
    const [a, b] = v.split('/').map(Number);
    if (!Number.isFinite(a)) return null;
    if (!b || b === 0) return a;
    return a / b;
  };
  const fps = pick(stream.avg_frame_rate) ?? pick(stream.r_frame_rate) ?? null;
  if (fps && Number.isFinite(fps) && fps > 0 && fps < 240) return round(fps, 2);
  return null;
}

function parseBitrate(stream, format) {
  const raw = Number(stream?.bit_rate) || Number(format?.bit_rate) || 0;
  return raw > 0 ? raw : null;
}

/**
 * Probe sebuah file video.
 * @param {string} inputPath
 * @returns {Promise<object>} info video yang sudah dinormalisasi
 */
function probeVideo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, { streams: true, format: true }, (err, data) => {
      if (err) {
        log.error(`ffprobe gagal (${inputPath}): ${err.message || err}`);
        return reject(new Error(`Nggak bisa baca metadata video lu: ${err.message || 'file korup / bukan video'}`));
      }
      if (!data || !Array.isArray(data.streams)) {
        return reject(new Error('Metadata videonya kosong, kayak dompet akhir bulan.'));
      }

      const videoStream =
        data.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1) ||
        data.streams.find((s) => s.codec_type === 'video');
      const audioStream = data.streams.find((s) => s.codec_type === 'audio' && s.disposition?.attached_pic !== 1);

      if (!videoStream) {
        return reject(new Error('File ini nggak punya stream video. Yang lu drop beneran video kan?'));
      }

      const rotationRaw = readRotation(videoStream) ?? matrixToDegrees(data.format?.side_data_list) ?? 0;
      const rotation = [0, 90, 180, 270].includes(rotationRaw) ? rotationRaw : 0;
      const swapped = rotation === 90 || rotation === 270;

      const codedW = Number(videoStream.width) || 0;
      const codedH = Number(videoStream.height) || 0;
      if (!codedW || !codedH) {
        return reject(new Error('Resolusi video nggak kebaca. Coba re-upload ya.'));
      }

      const width = swapped ? codedH : codedW;
      const height = swapped ? codedW : codedH;

      const sar = videoStream.sample_aspect_ratio;
      let sarRatio = 1;
      if (typeof sar === 'string' && sar.includes('/')) {
        const [a, b] = sar.split('/').map(Number);
        if (Number.isFinite(a) && Number.isFinite(b) && b > 0 && a > 0) sarRatio = a / b;
      }

      const durationRaw = Number(data.format?.duration) || Number(videoStream.duration) || 0;
      const duration = durationRaw > 0 ? round(durationRaw, 3) : 0;
      const sizeBytes = Number(data.format?.size) || 0;
      const fps = parseFps(videoStream);
      const bitrate = parseBitrate(videoStream, data.format);

      const info = {
        path: inputPath,
        format: (data.format?.format_name || '').split(',')[0] || 'unknown',
        codec: videoStream.codec_name || 'unknown',
        profile: videoStream.profile || null,
        pixFmt: videoStream.pix_fmt || null,
        codedWidth: codedW,
        codedHeight: codedH,
        rotation,
        swapped,
        width,
        height,
        sar: round(sarRatio, 4),
        dar: round((width * sarRatio) / height, 4),
        orientation: height > width ? 'portrait' : height < width ? 'landscape' : 'square',
        duration,
        durationPretty: formatClock(duration),
        sizeBytes,
        fps,
        bitrate,
        bitrateMbps: bitrate ? round(bitrate / 1_000_000, 2) : null,
        hasAudio: Boolean(audioStream),
        audio: audioStream
          ? {
              codec: audioStream.codec_name,
              channels: audioStream.channels,
              channelLayout: audioStream.channel_layout || null,
              sampleRate: Number(audioStream.sample_rate) || null,
              bitrate: Number(audioStream.bit_rate) || null,
            }
          : null,
        nbStreams: data.streams.length,
        nbVideoStreams: data.streams.filter((s) => s.codec_type === 'video').length,
      };

      log.info(
        `probe: ${info.width}x${info.height} ${info.orientation} rot=${info.rotation} dur=${info.duration}s ` +
          `fps=${info.fps ?? '?'} audio=${info.hasAudio ? info.audio.codec : 'NONE'} size=${(info.sizeBytes / 1048576).toFixed(2)}MB`,
      );

      resolve(info);
    });
  });
}

function formatClock(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}:${String(r).padStart(2, '0')}` : `0:${String(r).padStart(2, '0')}`;
}

/** Cek file masih video valid pasca encode (bukan 0 byte / corrupt) */
async function validateOutput(outputPath) {
  try {
    const info = await probeVideo(outputPath);
    return {
      ok: info.duration > 0.05 && info.width > 0 && info.height > 0,
      info,
    };
  } catch (err) {
    return { ok: false, error: err.message, info: null };
  }
}

function ffmpegVersion() {
  return new Promise((resolve) => {
    if (!isReady()) return resolve(null);
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) return resolve(null);
      resolve({ formats: Object.keys(formats || {}).length });
    });
  });
}

module.exports = {
  probeVideo,
  validateOutput,
  ffmpegVersion,
  isReady,
  formatClock,
  // diekspor buat unit test deteksi orientasi
  readRotation,
  matrixToDegrees,
};
