import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Download,
  Send,
  RotateCcw,
  Maximize2,
  Clock3,
  Cpu,
  Gauge,
  Link2,
  MessageCircle,
  ArrowUpRight,
  Copy,
  Check,
  Film,
  Music4,
  Music2,
  Trash2,
} from 'lucide-react';
import { useAppState, clearFile, resetAll, resendFromHistory, getState } from '../hooks/useAppState.js';
import { formatBytes, formatDuration, prettyPhone, isValidPhone, normalizePhone } from '../lib/format.js';

/**
 * Kartu hasil: preview video + angka before/after + aksi (download, kirim ulang,
 * proses video baru).
 *
 * (c) KyyDevv
 */
export default function ResultCard() {
  const { result, sendResult, file, job, config, state: appState } = useAppState();
  const [resendOpen, setResendOpen] = useState(false);
  const [resendTarget, setResendTarget] = useState(appState.lastTarget || '');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!result) return null;

  const url = result.url;
  const thumbUrl = result.thumbUrl;
  const downloadUrl = `${url}?download=1&name=${encodeURIComponent(file?.name?.replace(/\.[^.]+$/, '') || 'kyypurestatus')}`;

  const specs = [
    { icon: Maximize2, label: 'resolusi', value: result.resolution || '—', tone: 'text-brand-cyan' },
    { icon: Clock3, label: 'durasi', value: result.durationPretty || formatDuration(result.duration) || '—' },
    { icon: Cpu, label: 'mode', value: result.mode === 'crf' ? `CRF ${result.crf}` : `ABR ${result.videoBitrateKbps}k`, tone: 'text-brand-fuchsia' },
    { icon: Gauge, label: 'encode', value: result.encodeSeconds ? `${result.encodeSeconds}s` : '—' },
    { icon: Film, label: 'pass', value: `${result.passCount || 1}x` },
    {
      icon: result.mode === 'crf' ? Music4 : Music2,
      label: 'label',
      value: result.label || '—',
    },
  ];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const doResend = async () => {
    const normalized = normalizePhone(resendTarget);
    if (!config.mockSend && !isValidPhone(normalized)) return;
    setBusy(true);
    // Cari entri riwayat yang punya output sama persis (biar nggak perlu upload/kompres ulang)
    const entry = (getState().history || []).find((h) => h.outputId === result.outputId);
    if (entry) {
      await resendFromHistory(entry, { target: normalized });
    }
    setBusy(false);
    setResendOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="card overflow-hidden"
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-brand-gradient-soft px-4 py-3">
        <Check size={15} className="text-emerald-300" />
        <h3 className="text-[13px] font-bold tracking-tight text-white">Hasil Kompresi</h3>
        {sendResult && (
          <span className="pill pill-live !py-0.5 text-[10px]">
            <Send size={10} />
            {sendResult.mock ? 'simulasi terkirim' : `terkirim ke ${sendResult.targetPretty || prettyPhone(sendResult.target)}`}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            resetAll();
            setResendOpen(false);
          }}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-500 transition-colors hover:text-brand-cyan"
        >
          <RotateCcw size={11} /> proses video baru
        </button>
      </div>

      <div className="grid gap-0 md:grid-cols-[minmax(0,300px)_1fr]">
        {/* preview */}
        <div className="relative border-b border-white/[0.06] bg-black/50 md:border-b-0 md:border-r">
          <video
            src={url}
            poster={thumbUrl || undefined}
            className="h-52 w-full object-contain md:h-full md:min-h-[280px]"
            controls
            playsInline
            preload="metadata"
          />
          <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-gray-300 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> hasil server
          </div>
        </div>

        {/* detail */}
        <div className="p-4">
          {/* before / after */}
          <div className="rounded-xl border border-white/[0.07] bg-base-900/50 p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">sebelum</div>
                <div className="mt-0.5 font-mono text-[15px] font-semibold text-gray-400 line-through decoration-rose-400/60">
                  {result.sourceSizePretty}
                </div>
                <div className="text-[10px] text-gray-600">{result.sourceResolution || '—'}</div>
              </div>

              <ArrowUpRight size={18} className="shrink-0 text-brand-violet" />

              <div className="min-w-0 flex-1 text-right">
                <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">sesudah</div>
                <div className="mt-0.5 font-mono text-[19px] font-bold text-gradient">{result.sizePretty}</div>
                <div className="text-[10px] text-gray-500">{result.resolution}</div>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10px] text-gray-500">
                <span>penghematan</span>
                <span className="font-mono text-emerald-300">
                  {result.percentSaved != null ? `${result.percentSaved}%` : '—'} ({result.savedPretty || formatBytes(result.savedBytes || 0)})
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand-violet via-brand-fuchsia to-brand-cyan"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(3, Math.min(100, result.percentSaved || 0))}%` }}
                  transition={{ duration: 0.9, delay: 0.25, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>

          {/* spesifikasi */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {specs.map((s) => (
              <div key={s.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-gray-600">
                  <s.icon size={11} />
                  {s.label}
                </div>
                <div className={`mt-1 truncate font-mono text-[12.5px] font-semibold ${s.tone || 'text-gray-200'}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* aksi */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a href={downloadUrl} className="btn-primary btn-sm" download>
              <Download size={14} /> Download MP4
            </a>

            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setResendOpen((v) => !v)}
              className="btn-ghost btn-sm"
            >
              <Send size={13} /> Kirim ke nomor lain
            </motion.button>

            <button type="button" onClick={copyLink} className="btn-ghost btn-sm" title="Salin link file di server">
              {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
              {copied ? 'tersalin!' : 'Salin link'}
            </button>

            <button
              type="button"
              onClick={() => {
                clearFile();
                resetAll();
              }}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-gray-600 transition-colors hover:text-rose-300"
            >
              <Trash2 size={12} /> buang
            </button>
          </div>

          {/* form kirim ulang */}
          <AnimatePresence>
            {resendOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-xl border border-brand-violet/25 bg-brand-violet/[0.06] p-3">
                  <label className="label" htmlFor="kyy-resend-target">
                    Nomor tujuan baru
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="kyy-resend-target"
                      type="tel"
                      value={resendTarget}
                      onChange={(e) => setResendTarget(e.target.value.replace(/[^0-9+\-\s()]/g, '').slice(0, 20))}
                      placeholder="081234567890"
                      className="input font-mono"
                    />
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={doResend}
                      disabled={busy || (!config.mockSend && !isValidPhone(resendTarget))}
                      className="btn-primary btn-sm shrink-0"
                    >
                      <Send size={13} /> Gas
                    </motion.button>
                  </div>
                  <p className="mt-1.5 text-[10.5px] text-gray-500">
                    {config.mockSend
                      ? 'Mode uji: nggak ada yang beneran terkirim.'
                      : `Nomor jadi: ${isValidPhone(resendTarget) ? prettyPhone(resendTarget) : 'belum valid'}`}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* tips teruskan ke status */}
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <MessageCircle size={14} className="mt-0.5 shrink-0 text-brand-cyan" />
            <p className="text-[11.5px] leading-relaxed text-gray-400">
              <b className="text-gray-200">Cara lanjutin ke Status:</b> buka chat {sendResult ? sendResult.targetPretty || 'tujuan' : 'tujuan'} →
              tahan video → <b className="text-gray-200">Teruskan</b> → pilih <b className="text-gray-200">Status saya</b>. Karena videonya udah
              pas di bawah {config.waMediaLimitMb}MB dan H.264 High@4.1, hasil terusan-nya tetep tajem, nggak dikompres ulang jadi buram.
            </p>
          </div>

          {job?.resend && (
            <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-gray-600">
              <Link2 size={11} /> hasil kirim ulang dari riwayat — nggak ada proses kompresi ulang.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}


