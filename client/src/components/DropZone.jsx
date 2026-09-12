import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  UploadCloud,
  Film,
  X,
  CheckCircle2,
  Loader2,
  Clapperboard,
  Ruler,
  Music4,
  Music2,
  Clock3,
  HardDrive,
  ScanLine,
  RotateCcw,
  TriangleAlert,
  Sparkles,
} from 'lucide-react';
import { useAppState, pickFile, clearFile } from '../hooks/useAppState.js';
import { formatBytes, formatDuration } from '../lib/format.js';
import { FUNNY_UPLOAD_LINES } from '../lib/constants.js';

/* ------------------------------------------------------------------ meta --- */
function MetaChip({ icon: Icon, label, value, tone = 'default', title }) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200'
      : tone === 'warn'
        ? 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200'
        : 'border-white/[0.08] bg-white/[0.03] text-gray-300';
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${toneClass}`} title={title}>
      <Icon size={13} className="shrink-0 opacity-80" />
      <span className="text-[10px] uppercase tracking-[0.12em] text-gray-500">{label}</span>
      <span className="font-mono text-[12px] font-medium tabular-nums">{value}</span>
    </div>
  );
}

function VideoMeta({ info, plan, probeError }) {
  if (!info && !probeError) return null;

  if (probeError && !info) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-[12px] text-amber-200">
        <TriangleAlert size={15} className="mt-0.5 shrink-0" />
        <span>
          Metadata videonya nggak kebaca: <b>{probeError}</b>. Tetep bisa dicoba kompres, tapi server bakal nebak-nebak dikit.
        </span>
      </div>
    );
  }

  const portrait = info.orientation === 'portrait';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-2.5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <MetaChip icon={Ruler} label="resolusi" value={`${info.width}×${info.height}`} />
        <MetaChip
          icon={ScanLine}
          label="orientasi"
          value={portrait ? 'portrait 9:16' : info.orientation === 'square' ? 'square' : 'landscape'}
          tone={portrait ? 'good' : 'default'}
          title={portrait ? 'Aman — orientasi nggak bakal diubah server' : 'Video landscape, tetap dijaga rasionya'}
        />
        <MetaChip icon={Clock3} label="durasi" value={formatDuration(info.duration)} />
        <MetaChip icon={Film} label="codec" value={(info.codec || '?').toUpperCase()} />
        <MetaChip icon={RotateCcw} label="fps" value={info.fps ? `${info.fps}` : '?'} />
        <MetaChip
          icon={info.hasAudio ? Music4 : Music2}
          label="audio"
          value={info.hasAudio ? `${(info.audio?.codec || 'aac').toUpperCase()} ${info.audio?.channels || 2}ch` : 'bisu (-an)'}
          tone={info.hasAudio ? 'default' : 'warn'}
        />
        <MetaChip icon={HardDrive} label="size" value={formatBytes(info.sizeBytes)} />
        {info.rotation ? <MetaChip icon={RotateCcw} label="rotate" value={`${info.rotation}°`} tone="warn" /> : null}
      </div>

      {plan && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-violet/25 bg-brand-gradient-soft px-3 py-2.5">
          <Sparkles size={14} className="shrink-0 text-brand-cyan" />
          <span className="text-[11px] uppercase tracking-[0.14em] text-gray-400">rencana encode</span>
          <span className="font-mono text-[12px] font-semibold text-white">
            {plan.width}×{plan.height}
          </span>
          <span className="pill !py-0.5 text-[10px]">{plan.label}</span>
          <span className="pill !py-0.5 text-[10px]">{plan.mode === 'crf' ? `CRF ${plan.crf}` : `ABR ${plan.videoKbps}k`}</span>
          <span className="pill !py-0.5 text-[10px]">cap {(plan.maxBitrateK / 1000).toFixed(1)} Mbps</span>
          <span className="pill !py-0.5 text-[10px]">30fps • H.264 High@4.1</span>
          <span className="ml-auto text-[11px] text-gray-500">est. {formatBytes(plan.estimatedBytes)}</span>
        </div>
      )}
    </motion.div>
  );
}

/* -------------------------------------------------------------- dropzone -- */
export default function DropZone() {
  const { file, job, config } = useAppState();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploadLine, setUploadLine] = useState(FUNNY_UPLOAD_LINES[0]);
  const dragDepth = useRef(0);

  const busy = Boolean(job && ['processing', 'compressing', 'sending'].includes(job.phase));

  useEffect(() => {
    if (!file?.uploading) return undefined;
    let i = 0;
    setUploadLine(FUNNY_UPLOAD_LINES[0]);
    const t = setInterval(() => {
      i = (i + 1) % FUNNY_UPLOAD_LINES.length;
      setUploadLine(FUNNY_UPLOAD_LINES[i]);
    }, 2600);
    return () => clearInterval(t);
  }, [file?.uploading]);

  const handleFiles = useCallback(
    (files) => {
      const f = files && files[0];
      if (f) pickFile(f);
    },
    [],
  );

  /* Support paste dari clipboard (Ctrl+V video) */
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type?.startsWith('video/')) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            pickFile(f);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const onDragEnter = (e) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  /* --------------------------------------------------------- file ready --- */
  if (file) {
    return (
      <div className="card card-hover overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[minmax(0,240px)_1fr]">
          {/* preview */}
          <div className="relative border-b border-white/[0.06] bg-black/40 md:border-b-0 md:border-r">
            <video
              key={file.previewUrl}
              src={file.previewUrl}
              className="h-44 w-full object-contain md:h-full md:min-h-[230px]"
              controls
              playsInline
              muted
              preload="metadata"
            />
            <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-gray-300 backdrop-blur">
              preview lokal
            </div>
          </div>

          {/* info */}
          <div className="relative p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Clapperboard size={14} className="shrink-0 text-brand-violet" />
                  <h3 className="truncate text-[14px] font-semibold text-white" title={file.name}>
                    {file.name}
                  </h3>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  {formatBytes(file.size)}
                  {file.id ? ' • udah nangkring di server ✅' : ' • lagi naik ke server...'}
                  {config.mockSend ? ' • MODE UJI aktif' : ''}
                </p>
              </div>

              <motion.button
                type="button"
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={clearFile}
                disabled={busy}
                className="btn-ghost !rounded-lg !p-1.5 disabled:opacity-30"
                title={busy ? 'Nggak bisa dibuang pas proses jalan' : 'Buang video, ganti yang lain'}
                aria-label="Buang video"
              >
                <X size={15} />
              </motion.button>
            </div>

            <div className="mt-3 space-y-3">
              {file.uploading ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin text-brand-cyan" />
                      {uploadLine}
                    </span>
                    <span className="font-mono tabular-nums text-brand-cyan">{file.uploadPercent}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className="h-full rounded-full bg-brand-gradient"
                      animate={{ width: `${Math.max(2, file.uploadPercent || 2)}%` }}
                      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-500">
                    {formatBytes(((file.uploadPercent || 0) / 100) * file.size)} / {formatBytes(file.size)}
                  </p>
                </div>
              ) : (
                <VideoMeta info={file.info} plan={file.plan} probeError={file.probeError} />
              )}
            </div>

            {file.id && !busy && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-gray-500 transition-colors hover:text-brand-cyan"
              >
                <RotateCcw size={12} /> ganti video lain
              </button>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={config.allowedExt?.join(',') || 'video/*'}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    );
  }

  /* ------------------------------------------------------------- kosong --- */
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative"
    >
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`card group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden px-6 py-12 text-center transition-all duration-300 sm:py-16 ${
          dragging ? 'border-brand-cyan/60 shadow-glow-cyan' : 'hover:border-brand-violet/40 hover:shadow-glow'
        }`}
      >
        {/* grid halus */}
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />

        {/* glow ngikutin drag */}
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(600px 260px at 50% 40%, rgba(34,211,238,.16), transparent 70%)' }}
            />
          )}
        </AnimatePresence>

        {/* ikon */}
        <motion.div
          animate={dragging ? { scale: 1.12, y: -4 } : { scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="relative mb-5"
        >
          <span className="absolute inset-0 rounded-2xl bg-brand-violet/25 blur-2xl" />
          {dragging ? (
            <div className="relative rounded-2xl border border-brand-cyan/50 bg-brand-cyan/10 p-4">
              <UploadCloud size={34} className="text-brand-cyan" />
            </div>
          ) : (
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <Film size={34} className="text-brand-violet" />
            </motion.div>
          )}
        </motion.div>

        <h2 className="relative text-xl font-bold text-white sm:text-2xl">
          Seret video lu ke sini
        </h2>
        <p className="relative mt-2 max-w-md text-[13px] leading-relaxed text-gray-400">
          Atau <span className="font-semibold text-brand-cyan underline decoration-dotted underline-offset-4">klik buat milih file</span> — bisa
          juga <kbd className="mx-0.5 rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-gray-300">Ctrl</kbd>
          <span className="mx-0.5 text-gray-500">+</span>
          <kbd className="rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-gray-300">V</kbd> buat paste dari
          clipboard.
        </p>

        <div className="relative mt-5 flex flex-wrap items-center justify-center gap-1.5">
          <span className="pill">
            <CheckCircle2 size={12} className="text-emerald-400" /> maks {config.maxUploadMb}MB
          </span>
          <span className="pill">.mp4 .mov .mkv .webm</span>
          <span className="pill">
            <ScanLine size={12} className="text-brand-cyan" /> portrait 9:16 aman
          </span>
          <span className="pill">
            <Sparkles size={12} className="text-brand-fuchsia" /> auto ladder by durasi
          </span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={config.allowedExt?.join(',') || 'video/*'}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    </motion.div>
  );
}
