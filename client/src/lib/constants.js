/**
 * Konstanta UI KyyPureStatus
 * (c) KyyDevv
 */

export const WARNING_BANNED =
  'Pake nomor cadangan aja bro, library ginian rawan banned dari Mark Zuckerberg.';

export const STAGES = [
  { id: 'uploading', label: 'Upload', hint: 'Video lu lagi dikirim ke server' },
  { id: 'probing', label: 'Bongkar Metadata', hint: 'Server lagi ngintip resolusi, durasi & rotasi' },
  { id: 'compressing', label: 'Kompresi', hint: 'Mesin FFmpeg lagi masak pixel' },
  { id: 'sending', label: 'Kirim WA', hint: 'Nyelipin video ke WhatsApp lu' },
  { id: 'done', label: 'Beres', hint: 'Tinggal diterusin ke Status' },
];

/** Teks lucu yang ganti tiap 3 detik pas kompresi jalan */
export const FUNNY_PROGRESS_LINES = [
  'Lagi ngulik pixel...',
  'Biar story lu makin HD...',
  'Ngusir buram satu-satu...',
  'x264 lagi pemanasan otot...',
  'Ngebuang bitrate mubazir...',
  'Biar kuota temen lu nggak nangis...',
  'Nyusun ulang 30 frame per detik...',
  'Sedikit lagi, jangan di-close ya...',
  'Ngecilin file, bukan ngecilin kualitas...',
  'Lagi nego sama encoder...',
  'Warna kulit lu aman, tenang aja...',
  'Kompres dulu, flexing kemudian...',
];

export const FUNNY_UPLOAD_LINES = [
  'Nyedot video lu ke server...',
  'Sabar, ini bukan download 4G kampung...',
  'Lagi manjat ke cloud...',
  'Bit demi bit masuk kantong server...',
];

export const FUNNY_SEND_LINES = [
  'Ngetok pintu WhatsApp...',
  'Lagi nyamar jadi device tertaut...',
  'Video lu lagi antre di server Meta...',
  'Ngecek apakah doi beneran punya WA...',
  'Hampir nyampe, sabar bos...',
];

export const IDLE_TIPS = [
  'Video portrait (9:16) aman banget — orientasi nggak bakal diubek server.',
  'Makin pendek videonya, makin tinggi resolusi yang dikasih ladder.',
  'Hasil di atas 50MB otomatis di-re-encode mode ABR biar muat di WA.',
  'Nggak ada audio? Tenang, encoder otomatis pakai -an biar nggak error.',
  'Riwayat nyimpen 8 proses terakhir — bisa kirim ulang tanpa upload lagi.',
  'File di server auto-disapu tiap 10 menit, jadi jangan ditinggal lama.',
];

export const TIER_INFO = [
  { tier: 1, dur: '≤ 30 detik', res: '1080p', cap: '6 Mbps', crf: 'CRF 17' },
  { tier: 2, dur: '31–60 detik', res: '720p', cap: '4 Mbps', crf: 'CRF 17' },
  { tier: 3, dur: '61–120 detik', res: '480p', cap: '2.5 Mbps', crf: 'CRF 16' },
  { tier: 4, dur: '> 120 detik', res: '360p', cap: '1.5 Mbps', crf: 'CRF 16' },
];

export const ENCODE_SPEC = {
  container: 'MP4',
  video: 'H.264 (libx264)',
  preset: 'faster',
  profile: 'High @ Level 4.1',
  pixFmt: 'yuv420p',
  fps: '30 fps',
  audio: 'AAC 160 kbps • 48 kHz • stereo',
  x264: 'ref=4 : bframes=3 : me=umh : subq=7 : rc-lookahead=40 : me_range=24',
};

export const MAX_UPLOAD_MB = 100;
