import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sparkles,
  Zap,
  ShieldCheck,
  Film,
  Rocket,
  ScanSearch,
  Cpu,
  Send,
  Smartphone,
  Flame,
  ArrowRight,
  Lock,
  Info,
  Layers,
  MousePointerClick,
} from 'lucide-react';

import BackgroundFX from './components/BackgroundFX.jsx';
import Header from './components/Header.jsx';
import DropZone from './components/DropZone.jsx';
import TargetInput from './components/TargetInput.jsx';
import ProgressPanel from './components/ProgressPanel.jsx';
import ResultCard from './components/ResultCard.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import ConnectWaModal from './components/ConnectWaModal.jsx';
import InfoModal from './components/InfoModal.jsx';
import Toasts from './components/Toasts.jsx';
import Footer from './components/Footer.jsx';
import Logo from './components/Logo.jsx';

import { useAppState, bindSocket, startProcess, openModal } from './hooks/useAppState.js';
import { IDLE_TIPS, TIER_INFO, ENCODE_SPEC, WARNING_BANNED } from './lib/constants.js';
import { isValidPhone, normalizePhone, prettyPhone } from './lib/format.js';

/* ============================================================== hero ==== */
function Hero() {
  const { config } = useAppState();

  const badges = [
    { icon: Flame, text: 'Anti buram pas diterusin', tone: 'text-brand-fuchsia' },
    { icon: ScanSearch, text: 'Portrait 9:16 nggak diubek', tone: 'text-brand-cyan' },
    { icon: Zap, text: 'Ladder adaptif by durasi', tone: 'text-brand-violet' },
    { icon: Send, text: 'Auto kirim ke WA lu', tone: 'text-emerald-300' },
    { icon: Lock, text: `Maks ${config.maxUploadMb}MB`, tone: 'text-gray-300' },
  ];

  return (
    <section className="relative pt-9 sm:pt-14">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 backdrop-blur"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-cyan opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-cyan" />
        </span>
        <span className="text-[11px] font-medium text-gray-300">
          Kompresi HD di server <span className="text-gray-600">→</span> kirim otomatis <span className="text-gray-600">→</span> tinggal forward ke
          Status
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.05 }}
        className="mx-auto max-w-3xl text-center text-[34px] font-extrabold leading-[1.08] tracking-tight text-white sm:text-[52px]"
      >
        Story lu <span className="text-gradient text-shadow-glow">HD lagi</span>.
        <br className="hidden sm:block" /> Nggak ada lagi drama <span className="relative inline-block">
          buram
          <motion.svg
            className="absolute -bottom-2 left-0 w-full"
            viewBox="0 0 200 12"
            preserveAspectRatio="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
          >
            <motion.path
              d="M2 8 C 40 2, 70 11, 105 5 S 170 2, 198 7"
              fill="none"
              stroke="#d946ef"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.75, duration: 0.7, ease: 'easeInOut' }}
            />
          </motion.svg>
        </span>
        .
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="mx-auto mt-5 max-w-2xl text-center text-[13.5px] leading-relaxed text-gray-400 sm:text-[15px]"
      >
        Seret video lu ke sini. Server yang mikir — ngebaca durasi, ngunci orientasi, ngatur bitrate biar pas di bawah{' '}
        <b className="text-gray-200">{config.waMediaLimitMb}MB</b> — terus videonya otomatis nyampe di chat WA lu. Tinggal{' '}
        <b className="text-gray-200">forward ke Status</b>, hasilnya tajem kayak aslinya.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.25 }}
        className="mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-center gap-1.5"
      >
        {badges.map((b, i) => (
          <motion.span
            key={b.text}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 + i * 0.05 }}
            className="pill !text-[11px]"
          >
            <b.icon size={12} className={b.tone} />
            {b.text}
          </motion.span>
        ))}
      </motion.div>
    </section>
  );
}

/* ============================================================ stepper ==== */
const HOW = [
  {
    n: '01',
    icon: MousePointerClick,
    title: 'Seret video lu ke sini',
    desc: 'Drop file, klik, atau Ctrl+V dari clipboard. Server langsung nge-probe resolusi, durasi, rotasi & audio-nya.',
    accent: 'from-brand-violet/25',
  },
  {
    n: '02',
    icon: Cpu,
    title: 'Seret video lu, server yang mikir',
    desc: 'Ladder adaptif nentuin tier: 1080p sampai 30 detik, 720p sampai 60 detik, 480p sampai 2 menit, 360p selebihnya. Lewat 50MB? Otomatis ulang mode ABR.',
    accent: 'from-brand-fuchsia/25',
  },
  {
    n: '03',
    icon: Send,
    title: 'Kekirim, tinggal forward',
    desc: 'Video mendarat di chat WA lu (cek onWhatsApp dulu biar nggak nyasar). Tahan → Teruskan → Status saya. Tajem, nggak buram.',
    accent: 'from-brand-cyan/25',
  },
];

function HowItWorks() {
  return (
    <section className="mt-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <span className="kicker">alur kerja</span>
          <h2 className="mt-1 text-[20px] font-bold tracking-tight text-white sm:text-[24px]">Tiga langkah, nggak pake ribet</h2>
        </div>
        <button type="button" onClick={() => openModal('info')} className="btn-ghost btn-sm hidden sm:inline-flex">
          <Info size={13} /> spek lengkap
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {HOW.map((step, i) => (
          <motion.div
            key={step.n}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: i * 0.09 }}
            whileHover={{ y: -4 }}
            className="card card-hover group relative overflow-hidden p-4"
          >
            <div
              className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${step.accent} to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
            />
            <div className="relative flex items-start gap-3">
              <div className="relative shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <step.icon size={18} className="text-brand-violet transition-colors group-hover:text-brand-cyan" />
                </div>
                <span className="absolute -right-1.5 -top-1.5 rounded-md border border-white/10 bg-base-900 px-1 font-mono text-[9px] text-gray-500">
                  {step.n}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="text-[13.5px] font-bold text-white">{step.title}</h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-gray-500">{step.desc}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ========================================================= engine spec === */
function EngineSection() {
  return (
    <section className="mt-14">
      <div className="mb-5">
        <span className="kicker">mesin di balik layar</span>
        <h2 className="mt-1 text-[20px] font-bold tracking-tight text-white sm:text-[24px]">
          Ladder-nya <span className="text-gradient">deterministik</span>, bukan tebak-tebakan
        </h2>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        {/* tabel tier */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="card overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <Layers size={14} className="text-brand-violet" />
            <h3 className="text-[13px] font-bold text-white">Tier berdasarkan durasi</h3>
            <span className="pill ml-auto !py-0.5 text-[10px]">murni durasi input</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.12em] text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-semibold">durasi</th>
                  <th className="px-3 py-2 font-semibold">target</th>
                  <th className="px-3 py-2 font-semibold">kotak</th>
                  <th className="px-3 py-2 font-semibold">max bitrate</th>
                  <th className="px-4 py-2 font-semibold">rc</th>
                </tr>
              </thead>
              <tbody>
                {TIER_INFO.map((t, i) => (
                  <motion.tr
                    key={t.tier}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06, duration: 0.3 }}
                    className="border-t border-white/[0.04] text-[12px] text-gray-300 transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-2.5">{t.dur}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-white">{t.res}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-500">
                      {['1080×1920', '720×1280', '480×854', '360×640'][i]}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-brand-cyan">{t.cap}</td>
                    <td className="px-4 py-2.5 font-mono text-brand-fuchsia">{t.crf}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-white/[0.06] bg-black/25 px-4 py-3 text-[11px] leading-relaxed text-gray-500">
            <Sparkles size={11} className="mr-1 inline text-brand-cyan" />
            Video portrait (9:16) ngisi penuh kotaknya, landscape di-scale pas tanpa dipaksa jadi portrait, dan{' '}
            <b className="text-gray-300">nggak pernah di-upscale</b> — resolusi kecil tetep kecil, cuma bitrate-nya yang dirapihin.
          </div>
        </motion.div>

        {/* spek output */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="card p-4"
        >
          <div className="mb-3 flex items-center gap-2">
            <Cpu size={14} className="text-brand-fuchsia" />
            <h3 className="text-[13px] font-bold text-white">Spesifikasi output</h3>
          </div>
          <ul className="space-y-2">
            {[
              ['container', ENCODE_SPEC.container],
              ['video', ENCODE_SPEC.video],
              ['preset', ENCODE_SPEC.preset],
              ['profile', ENCODE_SPEC.profile],
              ['pix_fmt', ENCODE_SPEC.pixFmt],
              ['fps', ENCODE_SPEC.fps],
              ['audio', ENCODE_SPEC.audio],
            ].map(([k, v]) => (
              <li key={k} className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1.5 last:border-0">
                <span className="text-[11px] uppercase tracking-[0.1em] text-gray-600">{k}</span>
                <span className="text-right font-mono text-[11.5px] text-gray-200">{v}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/40 p-2.5">
            <div className="mb-1 text-[9.5px] uppercase tracking-[0.14em] text-gray-600">x264-params</div>
            <code className="block break-all font-mono text-[10.5px] leading-relaxed text-brand-cyan">{ENCODE_SPEC.x264}</code>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-2.5 text-[11px] leading-relaxed text-amber-200/85">
            <ShieldCheck size={12} className="mt-0.5 shrink-0 text-amber-400" />
            <span>{WARNING_BANNED}</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ============================================================= tips ====== */
function TipTicker() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % IDLE_TIPS.length), 5200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex h-4 items-center gap-2 overflow-hidden">
      <Sparkles size={11} className="shrink-0 text-brand-cyan" />
      <AnimatePresence mode="wait">
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35 }}
          className="truncate text-[11px] text-gray-500"
        >
          {IDLE_TIPS[i]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/* =============================================================== app ==== */
export default function App() {
  const { file, job, wa, config, result, state: appState, connected } = useAppState();
  const [target, setTarget] = useState('');
  const [caption, setCaption] = useState('');

  /* nyalain socket + sinkron preferensi terakhir */
  useEffect(() => {
    bindSocket();
  }, []);

  useEffect(() => {
    if (!target && appState.lastTarget) setTarget(appState.lastTarget);
    if (!caption && appState.lastCaption) setCaption(appState.lastCaption);
  }, [appState.lastTarget, appState.lastCaption]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = Boolean(file?.id) && !file?.uploading;
  const running = Boolean(job && ['processing', 'probing', 'compressing', 'sending'].includes(job.phase));
  const waReady = config.mockSend || wa.status === 'open';
  const targetOk = config.mockSend || isValidPhone(target);

  const canGo = ready && !running && waReady && targetOk && connected;

  const buttonLabel = useMemo(() => {
    if (running) return 'Lagi proses, tunggu bentar...';
    if (!file) return 'Drop video dulu bro';
    if (file.uploading) return `Lagi upload... ${file.uploadPercent || 0}%`;
    if (!connected) return 'Server belum nyambung';
    if (!waReady) return 'Sambungkan WA dulu';
    if (!targetOk) return 'Isi nomor tujuan dulu';
    return 'Gas, Compress & Kirim!';
  }, [running, file, connected, waReady, targetOk]);

  const onAction = useCallback(() => {
    if (!file) return;
    if (!waReady) {
      openModal('connect');
      return;
    }
    if (!targetOk) return;
    startProcess({ target: normalizePhone(target), caption });
  }, [file, waReady, targetOk, target, caption]);

  /* Ctrl/Cmd + Enter = gas */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canGo) {
        e.preventDefault();
        onAction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canGo, onAction]);

  return (
    <div className="noise relative min-h-screen">
      <BackgroundFX />
      <Header />

      <main className="relative mx-auto max-w-[1240px] px-4 pb-6 sm:px-6">
        <Hero />

        {/* ---------------------------------------------------- workspace -- */}
        <div className="mt-9 grid items-start gap-4 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,1fr)]">
          {/* kolom kiri */}
          <div className="space-y-4">
            <DropZone />

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="card card-hover p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <Smartphone size={14} className="text-brand-cyan" />
                <h3 className="text-[13px] font-bold tracking-tight text-white">Tujuan & caption</h3>
                <span className="pill ml-auto !py-0.5 text-[10px]">
                  {config.mockSend ? 'simulasi' : wa.status === 'open' ? `WA: ${wa.me?.phonePretty || 'nyambung'}` : 'WA off'}
                </span>
              </div>

              <TargetInput target={target} setTarget={setTarget} caption={caption} setCaption={setCaption} disabled={running} />

              <div className="divider my-4" />

              {/* tombol utama */}
              <div className="relative">
                {canGo && (
                  <motion.span
                    className="pointer-events-none absolute -inset-1 rounded-2xl bg-brand-gradient opacity-30 blur-xl"
                    animate={{ opacity: [0.22, 0.42, 0.22] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                <motion.button
                  type="button"
                  whileHover={canGo ? { scale: 1.015 } : {}}
                  whileTap={canGo ? { scale: 0.985 } : {}}
                  onClick={onAction}
                  disabled={!canGo}
                  className={`relative w-full justify-center !py-3.5 !text-[14px] ${canGo ? 'btn-primary' : 'btn-ghost'}`}
                >
                  {running ? (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                        className="inline-block"
                      >
                        <Cpu size={16} />
                      </motion.span>
                      {buttonLabel}
                    </>
                  ) : (
                    <>
                      <Rocket size={16} />
                      {buttonLabel}
                      {canGo && <ArrowRight size={15} className="opacity-80" />}
                    </>
                  )}
                </motion.button>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <TipTicker />
                  <span className="shrink-0 text-[10px] text-gray-700">
                    <kbd className="rounded border border-white/10 bg-white/[0.05] px-1 py-px font-mono">Ctrl</kbd> +{' '}
                    <kbd className="rounded border border-white/10 bg-white/[0.05] px-1 py-px font-mono">Enter</kbd> buat gas
                  </span>
                </div>

                {/* konfirmasi tujuan */}
                <AnimatePresence>
                  {canGo && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-1 overflow-hidden text-[11px] text-gray-500"
                    >
                      Video <b className="text-gray-300">{file?.name}</b> bakal dikompres{' '}
                      {file?.plan ? (
                        <b className="text-brand-cyan">
                          {file.plan.width}×{file.plan.height} ({file.plan.label}
                          {file.plan.crf ? `, CRF ${file.plan.crf}` : ''})
                        </b>
                      ) : (
                        'otomatis'
                      )}{' '}
                      terus dikirim ke <b className="font-mono text-emerald-300">{prettyPhone(target)}</b>.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            <HistoryPanel defaultTarget={target} onPickTarget={(v) => setTarget(v)} />
          </div>

          {/* kolom kanan — sticky monitor */}
          <div className="space-y-4 lg:sticky lg:top-[104px]">
            {/* kartu koneksi WA */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.14 }}
              className="card card-hover p-4"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Logo size={38} animated={wa.status !== 'open'} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-base-800 ${
                      config.mockSend ? 'bg-cyan-400' : wa.status === 'open' ? 'bg-emerald-400' : wa.status === 'idle' ? 'bg-gray-600' : 'bg-amber-400'
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[13px] font-bold text-white">
                    {config.mockSend
                      ? 'Mode Uji (MOCK_SEND)'
                      : wa.status === 'open'
                        ? 'WA lu udah nyambung nih bos.'
                        : wa.status === 'idle'
                          ? 'WA-nya belum disambungin'
                          : wa.status === 'loggedOut'
                            ? 'Session ke-logout — scan QR lagi ya'
                            : 'Lagi nyambungin ke WhatsApp...'}
                  </h3>
                  <p className="mt-0.5 truncate text-[11px] text-gray-500">
                    {config.mockSend
                      ? 'Baileys di-skip, kirim video cuma simulasi buat ngetes UI.'
                      : wa.status === 'open'
                        ? `${wa.me?.phonePretty || wa.me?.phone || ''}${wa.me?.pushName ? ` • ${wa.me.pushName}` : ''} • ${wa.sentCount || 0} video terkirim`
                        : wa.reconnectAttempt
                          ? `reconnect ke-${wa.reconnectAttempt} (backoff 2s → 30s)`
                          : 'Scan QR atau pakai pairing code 8 digit. Session disimpen permanen.'}
                  </p>
                </div>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => openModal('connect')}
                  className={config.mockSend || wa.status === 'open' ? 'btn-ghost btn-sm shrink-0' : 'btn-primary btn-sm shrink-0'}
                >
                  {wa.status === 'open' || config.mockSend ? <Info size={13} /> : <Zap size={13} />}
                  {wa.status === 'open' ? 'kelola' : config.mockSend ? 'info' : 'sambung'}
                </motion.button>
              </div>
            </motion.div>

            <AnimatePresence mode="wait">
              {(job || result || file?.uploading) && (
                <motion.div key="pipeline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                  <ProgressPanel />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {result && (
                <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <ResultCard />
                </motion.div>
              )}
            </AnimatePresence>

            {/* placeholder kalo belum ada apa-apa */}
            {!job && !result && !file && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="card relative overflow-hidden p-5"
              >
                <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
                <div className="relative flex flex-col items-center gap-3 py-6 text-center">
                  <motion.div
                    animate={{ y: [0, -7, 0] }}
                    transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"
                  >
                    <Film size={26} className="text-brand-violet" />
                  </motion.div>
                  <h3 className="text-[14px] font-bold text-white">Monitor pipeline-nya di sini</h3>
                  <p className="max-w-xs text-[11.5px] leading-relaxed text-gray-500">
                    Progress ring, kecepatan encode, bitrate real-time, sampai notifikasi pas server mutusin buat re-encode pakai mode ABR —
                    semuanya nongol di panel ini.
                  </p>
                  <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                    {['upload', 'probe', 'encode', 'send'].map((s) => (
                      <span key={s} className="pill !py-0.5 !text-[10px] font-mono">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        <HowItWorks />
        <EngineSection />
      </main>

      <Footer />

      <ConnectWaModal />
      <InfoModal />
      <Toasts />
    </div>
  );
}
