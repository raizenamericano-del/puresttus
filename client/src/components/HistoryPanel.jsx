import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  History as HistoryIcon,
  Download,
  Send,
  Trash2,
  ExternalLink,
  Film,
  Zap,
  Clock3,
  Ban,
  FlaskConical,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { useAppState, resendFromHistory, deleteHistory, clearHistory } from '../hooks/useAppState.js';
import { formatBytes, formatDuration, timeAgo, prettyPhone, isValidPhone, normalizePhone } from '../lib/format.js';

const STATUS_META = {
  success: { label: 'sukses', cls: 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300', icon: Zap },
  failed: { label: 'gagal', cls: 'border-rose-400/25 bg-rose-400/[0.07] text-rose-300', icon: Ban },
  cancelled: { label: 'dibatalkan', cls: 'border-white/10 bg-white/[0.04] text-gray-400', icon: Ban },
};

function Row({ entry, index, onResend }) {
  const meta = STATUS_META[entry.status] || STATUS_META.success;
  const StatusIcon = meta.icon;
  const [open, setOpen] = useState(false);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.22 } }}
      transition={{ duration: 0.32, delay: index * 0.03 }}
      className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015] transition-colors hover:border-brand-violet/30"
    >
      <div className="flex items-stretch gap-3 p-2.5">
        {/* thumbnail */}
        <div className="relative h-[62px] w-[42px] shrink-0 overflow-hidden rounded-lg border border-white/[0.07] bg-black/60">
          {entry.thumbUrl ? (
            <img src={entry.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-600">
              <Film size={16} />
            </div>
          )}
          {entry.status === 'success' && (
            <span className="absolute inset-x-0 bottom-0 bg-black/75 py-0.5 text-center font-mono text-[8.5px] text-gray-300">
              {entry.outputResolution ? entry.outputResolution.split('x').map(Number).filter(Boolean).length === 2 ? `${entry.outputResolution.split('x')[0]}p` : '' : ''}
            </span>
          )}
        </div>

        {/* info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate text-[12.5px] font-semibold text-gray-100" title={entry.sourceName}>
              {entry.sourceName}
            </h4>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[9.5px] font-medium ${meta.cls}`}>
              <StatusIcon size={9} />
              {meta.label}
            </span>
            {entry.mock && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-400/25 bg-cyan-400/[0.07] px-1.5 py-px text-[9.5px] text-cyan-300">
                <FlaskConical size={9} /> mock
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <Clock3 size={10} /> {timeAgo(entry.createdAt)}
            </span>
            <span className="font-mono">
              {formatBytes(entry.sourceBytes, 1)} → <span className="text-brand-cyan">{formatBytes(entry.outputBytes, 1)}</span>
            </span>
            {entry.outputResolution && <span className="font-mono">{entry.outputResolution}</span>}
            {entry.label && <span className="rounded bg-white/[0.05] px-1 font-mono text-[9.5px] text-gray-400">{entry.label}</span>}
            {entry.sourceDuration > 0 && <span className="font-mono">{formatDuration(entry.sourceDuration)}</span>}
            {entry.savedBytes > 0 && <span className="text-emerald-400/80">hemat {formatBytes(entry.savedBytes, 1)}</span>}
          </div>

          {entry.target && (
            <div className="mt-0.5 truncate text-[10.5px] text-gray-600">
              → {entry.targetPretty || prettyPhone(entry.target)}
              {entry.messageId ? <span className="ml-1 font-mono text-[9.5px] text-gray-700">#{entry.messageId.slice(0, 10)}</span> : null}
            </div>
          )}
          {entry.error && <div className="mt-0.5 truncate text-[10.5px] text-rose-300/80">{entry.error}</div>}
        </div>

        {/* aksi */}
        <div className="flex shrink-0 flex-col items-end justify-between gap-1">
          <div className="flex items-center gap-1">
            {entry.canResend && (
              <>
                <motion.a
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.94 }}
                  href={entry.url}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-1.5 text-gray-400 transition-colors hover:border-brand-cyan/40 hover:text-brand-cyan"
                  title="Download hasil"
                  aria-label="Download hasil"
                >
                  <Download size={13} />
                </motion.a>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onResend(entry)}
                  className="rounded-lg border border-brand-violet/30 bg-brand-violet/10 p-1.5 text-brand-violet transition-colors hover:border-brand-violet/60 hover:text-white"
                  title="Kirim ulang tanpa upload ulang"
                  aria-label="Kirim ulang"
                >
                  <Send size={13} />
                </motion.button>
              </>
            )}
            <button
              type="button"
              onClick={() => deleteHistory(entry.id)}
              className="rounded-lg border border-white/[0.06] bg-transparent p-1.5 text-gray-600 transition-colors hover:border-rose-400/40 hover:text-rose-300"
              title="Hapus dari riwayat"
              aria-label="Hapus"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {entry.canResend && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[9.5px] uppercase tracking-wider text-gray-600 transition-colors hover:text-gray-400"
            >
              detail <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/[0.05] bg-black/25"
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2.5 text-[10.5px] sm:grid-cols-4">
              <Detail k="mode" v={entry.mode === 'crf' ? `CRF ${entry.crf ?? ''}` : `ABR ${entry.videoBitrateKbps ?? ''}k`} />
              <Detail k="pass" v={`${entry.passes || 1}x`} />
              <Detail k="encode" v={entry.encodeSeconds ? `${entry.encodeSeconds}s` : '—'} />
              <Detail k="sumber" v={entry.sourceResolution || '—'} />
              {entry.caption && <Detail k="caption" v={entry.caption} />}
              <div className="col-span-2 sm:col-span-4">
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand-cyan transition-colors hover:text-white"
                >
                  <ExternalLink size={10} /> buka file di tab baru
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function Detail({ k, v }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-[0.14em] text-gray-600">{k}</div>
      <div className="truncate font-mono text-[11px] text-gray-300">{v || '—'}</div>
    </div>
  );
}

export default function HistoryPanel({ defaultTarget = '', onPickTarget }) {
  const { history, config } = useAppState();
  const [busyId, setBusyId] = useState(null);

  const handleResend = async (entry) => {
    let target = entry.target || defaultTarget;
    if (!config.mockSend) {
      target = window.prompt(
        'Kirim ulang ke nomor mana bro?\n(format 08xxx atau 628xxx)',
        entry.target || defaultTarget || '',
      );
      if (target === null) return;
      if (!isValidPhone(target)) {
        window.alert('Nomornya nggak valid bro 😅');
        return;
      }
      if (onPickTarget) onPickTarget(normalizePhone(target));
    }

    setBusyId(entry.id);
    await resendFromHistory(entry, { target });
    setBusyId(null);
  };

  return (
    <section className="card card-hover">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <HistoryIcon size={14} className="text-brand-fuchsia" />
        <h3 className="text-[13px] font-bold tracking-tight text-white">Riwayat</h3>
        <span className="pill !py-0.5 text-[10px]">
          {history.length}/{config.historyLimit || 8}
        </span>
        <span className="ml-auto hidden text-[10.5px] text-gray-600 sm:inline">
          <Sparkles size={10} className="mr-1 inline text-brand-cyan" />
          kirim ulang tanpa upload ulang
        </span>
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Bersihin semua riwayat + file hasilnya di server?')) clearHistory();
            }}
            className="rounded-md border border-white/[0.08] px-2 py-0.5 text-[10px] text-gray-500 transition-colors hover:border-rose-400/40 hover:text-rose-300"
          >
            bersihin
          </button>
        )}
      </div>

      <div className="p-3">
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
              <Film size={22} className="text-gray-600" />
            </div>
            <p className="text-[12.5px] font-medium text-gray-400">Belum ada apa-apa di sini</p>
            <p className="max-w-xs text-[11px] leading-relaxed text-gray-600">
              8 proses terakhir lu bakal nongol di sini. Jadi kalo lupa kirim, tinggal klik tombol kirim ulang — nggak perlu upload video lagi.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {history.map((entry, i) => (
                <Row key={entry.id} entry={entry} index={i} onResend={handleResend} busy={busyId === entry.id} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );
}
