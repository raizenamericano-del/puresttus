import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Upload,
  ScanSearch,
  Cpu,
  Send,
  PartyPopper,
  XOctagon,
  Ban,
  Gauge,
  Timer,
  Zap,
  Film,
  Clapperboard,
  Repeat,
  TriangleAlert,
  Activity,
} from 'lucide-react';
import { useAppState, cancelJob } from '../hooks/useAppState.js';
import { formatBytes, formatEta, formatSpeed, formatDuration, clamp } from '../lib/format.js';
import { FUNNY_PROGRESS_LINES, FUNNY_SEND_LINES, TIER_INFO } from '../lib/constants.js';
import Confetti from './Confetti.jsx';
import SuccessCheck from './SuccessCheck.jsx';

const PIPELINE = [
  { id: 'uploading', label: 'Upload', icon: Upload, hint: 'Video naik ke server' },
  { id: 'probing', label: 'Bongkar', icon: ScanSearch, hint: 'Baca durasi, resolusi & rotasi' },
  { id: 'compressing', label: 'Kompresi', icon: Cpu, hint: 'Mesin x264 lagi kerja' },
  { id: 'sending', label: 'Kirim WA', icon: Send, hint: 'Nyelipin ke WhatsApp' },
  { id: 'done', label: 'Beres', icon: PartyPopper, hint: 'Tinggal diterusin ke Status' },
];

const PHASE_TO_STEP = {
  idle: 0,
  uploading: 0,
  probing: 1,
  processing: 1,
  compressing: 2,
  sending: 3,
  done: 4,
};

/* ============================================================== ring ===== */
function ProgressRing({ percent, size = 190, thickness = 12, active = true, tone = 'violet' }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const p = clamp(percent, 0, 100);
  const offset = c * (1 - p / 100);
  const gradId = tone === 'cyan' ? 'kyy-ring-cyan' : 'kyy-ring-violet';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* halo */}
      <AnimatePresence>
        {active && (
          <motion.span
            className="absolute inset-2 rounded-full blur-2xl"
            style={{ background: 'radial-gradient(circle, rgba(139,92,246,.35), transparent 70%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.35, 0.75, 0.35] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative -rotate-90">
        <defs>
          <linearGradient id="kyy-ring-violet" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="kyy-ring-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>

        {/* track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={thickness} />

        {/* garis putus-putus yang muter (hiasan) */}
        {active && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r + thickness / 2 + 6}
            fill="none"
            stroke="rgba(139,92,246,.22)"
            strokeWidth="1"
            strokeDasharray="2 10"
            className="origin-center animate-spin-slow"
          />
        )}

        {/* progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .45s cubic-bezier(.4,0,.2,1)', filter: 'drop-shadow(0 0 10px rgba(139,92,246,.5))' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={Math.round(p)}
          initial={{ opacity: 0.55, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="font-mono text-[42px] font-bold leading-none tabular-nums text-white"
        >
          {Math.round(p)}
          <span className="ml-0.5 text-[18px] font-semibold text-gray-500">%</span>
        </motion.span>
        <span className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-gray-500">
          {active ? 'encoding' : p >= 100 ? 'selesai' : 'standby'}
        </span>
      </div>
    </div>
  );
}

/* =========================================================== stepper ===== */
function Stepper({ current, phase, error = false }) {
  return (
    <div className="flex items-center gap-1">
      {PIPELINE.map((step, i) => {
        const Icon = step.icon;
        const done = i < current || phase === 'done';
        const active = i === current && phase !== 'done';
        const failed = error && active;

        return (
          <React.Fragment key={step.id}>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div
                className={`relative flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ${
                  failed
                    ? 'border-rose-400/60 bg-rose-500/15 text-rose-300'
                    : done
                      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                      : active
                        ? 'border-brand-violet/60 bg-brand-violet/15 text-brand-violet'
                        : 'border-white/[0.08] bg-white/[0.02] text-gray-600'
                }`}
              >
                {active && !failed && (
                  <span className="absolute inset-0 rounded-full border border-brand-violet/50 animate-pulseRing" />
                )}
                {done && !active ? <Check size={15} /> : <Icon size={14} />}
              </div>
              <span
                className={`truncate text-[10px] font-medium ${
                  failed ? 'text-rose-300' : done ? 'text-emerald-300/90' : active ? 'text-gray-200' : 'text-gray-600'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < PIPELINE.length - 1 && (
              <div className="relative -mt-5 h-px flex-1 overflow-hidden bg-white/[0.07]">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-violet to-brand-cyan"
                  initial={false}
                  animate={{ width: i < current || phase === 'done' ? '100%' : '0%' }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Check({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <motion.path d="M4 12.5 L9.5 18 L20 6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
    </svg>
  );
}

/* ============================================================ ticker ===== */
function FunTicker({ lines, interval = 3000, className = '' }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % lines.length), interval);
    return () => clearInterval(t);
  }, [lines.length, interval]);

  return (
    <div className={`relative h-5 overflow-hidden ${className}`}>
      <AnimatePresence mode="wait">
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
          className="text-center text-[13px] font-medium text-gray-300"
        >
          {lines[idx]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/* ============================================================= stat ====== */
function Stat({ icon: Icon, label, value, accent = 'text-gray-200' }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-gray-600">
        <Icon size={11} />
        {label}
      </div>
      <div className={`mt-1 font-mono text-[13px] font-semibold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

/* ======================================================= main panel ===== */
export default function ProgressPanel() {
  const { job, file, result, sendResult, error, cancelled, config } = useAppState();
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(null);
  const [confettiKey, setConfettiKey] = useState(0);

  const phase = job?.phase || (file?.uploading ? 'uploading' : error ? 'error' : cancelled ? 'cancelled' : 'idle');
  const running = ['uploading', 'probing', 'processing', 'compressing', 'sending'].includes(phase);
  const done = phase === 'done' && result;

  /* elapsed timer */
  useEffect(() => {
    if (job?.startedAt && running) startedRef.current = job.startedAt;
    if (!running) return undefined;
    const base = startedRef.current || Date.now();
    const t = setInterval(() => setElapsed((Date.now() - base) / 1000), 500);
    return () => clearInterval(t);
  }, [running, job?.startedAt]);

  useEffect(() => {
    if (!running) startedRef.current = null;
  }, [running]);

  /* confetti sekali tiap sukses baru */
  useEffect(() => {
    if (done) setConfettiKey((k) => k + 1);
  }, [done, result?.jobId]);

  const step = PHASE_TO_STEP[phase] ?? 0;
  const percent = phase === 'uploading' ? file?.uploadPercent || 0 : job?.percent || 0;

  const plan = job?.plan || file?.plan || null;
  const tierRow = plan?.tier ? TIER_INFO.find((t) => t.tier === plan.tier) : null;

  const lines = useMemo(() => (phase === 'sending' ? FUNNY_SEND_LINES : FUNNY_PROGRESS_LINES), [phase]);

  /* ---------------------------------------------- state: idle / kosong -- */
  if (!job && !file && !error && !cancelled && !result) return null;

  return (
    <div className="card card-hover overflow-hidden">
      {confettiKey > 0 && done && <Confetti key={confettiKey} fire count={150} />}

      {/* header kartu */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <Activity size={14} className={running ? 'text-brand-cyan' : done ? 'text-emerald-400' : 'text-gray-500'} />
        <h3 className="text-[13px] font-bold tracking-tight text-white">Mesin Kompresi</h3>
        <span className="pill !py-0.5 text-[10px]">
          {config.mockSend ? 'MOCK_SEND' : 'live pipeline'}
        </span>
        {running && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-cyan" />
            {formatDuration(elapsed)}
          </span>
        )}
        {done && (
          <span className="ml-auto text-[11px] text-emerald-300">
            total {formatDuration((result.encodeSeconds || 0) + elapsed * 0)} {result.encodeSeconds ? `• encode ${result.encodeSeconds}s` : ''}
          </span>
        )}
      </div>

      <div className="p-4 sm:p-5">
        {/* stepper */}
        <Stepper current={step} phase={phase} error={Boolean(error)} />

        {/* ---------------------------------------------------- RUNNING --- */}
        <AnimatePresence mode="wait">
          {running && (
            <motion.div
              key="running"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="mt-6"
            >
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-7">
                <ProgressRing
                  percent={percent}
                  tone={phase === 'sending' ? 'cyan' : 'violet'}
                  active={phase !== 'uploading'}
                  size={186}
                />

                <div className="min-w-0 flex-1 space-y-4">
                  <div className="text-center sm:text-left">
                    <h4 className="text-[15px] font-bold text-white">
                      {phase === 'uploading'
                        ? 'Lagi naik ke server...'
                        : phase === 'probing'
                          ? 'Lagi ngebongkar metadata video lu'
                          : phase === 'sending'
                            ? 'Ngirim ke WhatsApp...'
                            : job?.pass > 1
                              ? `Re-encode pass ${job.pass} (mode ${String(job.mode).toUpperCase()})`
                              : `Lagi kompres ke ${plan ? `${plan.width}×${plan.height}` : 'target resolusi'}`}
                    </h4>
                    <div className="mt-1.5">
                      <FunTicker lines={lines} interval={3000} />
                    </div>
                    <p className="mt-1 text-[11px] text-gray-600">{job?.stageLabel || PIPELINE[step]?.hint}</p>
                  </div>

                  {/* notice ABR fallback */}
                  <AnimatePresence>
                    {job?.notice && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[12px] text-amber-200">
                          <Repeat size={13} className="mt-0.5 shrink-0" />
                          <span>{job.notice}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* statistik real-time */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat
                      icon={Gauge}
                      label="speed"
                      value={phase === 'uploading' ? `${percent}%` : formatSpeed(job?.speed)}
                      accent="text-brand-cyan"
                    />
                    <Stat icon={Timer} label="eta" value={phase === 'uploading' ? 'sebentar' : formatEta(job?.eta) || '—'} />
                    <Stat
                      icon={Zap}
                      label="bitrate"
                      value={job?.bitrateKbps ? `${(job.bitrateKbps / 1000).toFixed(2)} Mbps` : '—'}
                      accent="text-brand-fuchsia"
                    />
                    <Stat
                      icon={Film}
                      label="output"
                      value={job?.outSizeKb ? formatBytes(job.outSizeKb * 1024, 1) : '—'}
                    />
                  </div>

                  {/* rencana encode */}
                  {plan && (
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Clapperboard size={12} className="text-brand-violet" />
                        <span className="text-[10px] uppercase tracking-[0.14em] text-gray-500">tier {plan.tier}</span>
                        <span className="pill !py-0.5 text-[10px]">{plan.label}</span>
                        <span className="pill !py-0.5 text-[10px]">{plan.crf ? `CRF ${plan.crf}` : `ABR ${plan.videoKbps}k`}</span>
                        <span className="pill !py-0.5 text-[10px]">cap {((plan.maxBitrateK || 0) / 1000).toFixed(1)} Mbps</span>
                        {tierRow && <span className="ml-auto text-[10px] text-gray-600">aturan: {tierRow.dur}</span>}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
                        {plan.reason || `Durasi video menentukan tier.`} • audio {plan.audio || 'AAC 160k 48kHz stereo'} • limit{' '}
                        {plan.limitPretty || '50 MB'}
                      </p>
                    </div>
                  )}

                  {/* tombol batal */}
                  <div className="flex items-center gap-2">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={cancelJob}
                      className="btn-danger btn-sm"
                    >
                      <Ban size={13} /> Batalin, gas ulang
                    </motion.button>
                    <span className="text-[11px] text-gray-600">
                      {phase === 'uploading' ? 'upload bakal di-abort' : 'ffmpeg langsung di-kill, file setengah jadi dibuang'}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ------------------------------------------------------ ERROR -- */}
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6"
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4">
                  <XOctagon size={40} className="text-rose-300" />
                </div>
                <h4 className="text-[15px] font-bold text-white">Yah, gagal nih bro 😮‍💨</h4>
                <p className="max-w-lg text-[12.5px] leading-relaxed text-gray-400">{error.message}</p>
                {error.code && <span className="pill !text-[10px]">code: {error.code}</span>}
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-[11px] text-gray-600">
                  <TriangleAlert size={12} className="text-amber-400" />
                  Cek nomor tujuan • pastiin WA nyambung • videonya jangan kepanjangan
                </div>
              </div>
            </motion.div>
          )}

          {/* ------------------------------------------------------- DONE -- */}
          {done && !error && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4 }}
              className="mt-6"
            >
              <div className="flex flex-col items-center">
                <SuccessCheck
                  size={92}
                  label={
                    sendResult
                      ? sendResult.mock
                        ? 'Video Kekirim! 🎉 (simulasi)'
                        : `Video Kekirim ke ${sendResult.targetPretty || sendResult.target}! 🎉`
                      : 'Kompresi Beres! 🎉'
                  }
                />

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.1 }}
                  className="mt-1 max-w-md text-center text-[12.5px] leading-relaxed text-gray-400"
                >
                  {sendResult?.mock
                    ? 'MOCK_SEND lagi nyala, jadi videonya nggak beneran masuk WhatsApp. Matiin di .env buat kirim beneran.'
                    : sendResult
                      ? 'Buka chat-nya, terus <b className="text-gray-200">forward ke Status WA</b> — hasilnya tetep tajem, nggak buram.'
                      : 'File hasil kompresi udah nangkring di server. Tinggal download atau kirim.'}
                </motion.p>

                {/* ringkasan angka */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.95, duration: 0.4 }}
                  className="mt-5 grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  <Stat icon={Film} label="sebelum" value={result.sourceSizePretty || formatBytes(file?.size || 0)} />
                  <Stat icon={Zap} label="sesudah" value={result.sizePretty || '—'} accent="text-brand-cyan" />
                  <Stat
                    icon={Activity}
                    label="hemat"
                    value={result.percentSaved != null ? `${result.percentSaved}%` : '—'}
                    accent="text-emerald-300"
                  />
                  <Stat icon={Cpu} label="resolusi" value={result.resolution || '—'} accent="text-brand-fuchsia" />
                </motion.div>

                {result.passCount > 1 && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-[11.5px] text-amber-200">
                    <Repeat size={13} />
                    Butuh {result.passCount} pass — CRF pertama kegedean, jadi server ulang pakai mode ABR biar muat di{' '}
                    {config.waMediaLimitMb}MB.
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* -------------------------------------------------- CANCELLED -- */}
          {cancelled && !error && !running && !done && (
            <motion.div key="cancelled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <Ban size={36} className="text-gray-400" />
                </div>
                <h4 className="text-[15px] font-bold text-white">Dibatalkan 🛑</h4>
                <p className="max-w-md text-[12.5px] text-gray-400">
                  ffmpeg udah gw cekik, file setengah jadi dibuang. Video asli lu tetep aman di server — tinggal gas ulang.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
