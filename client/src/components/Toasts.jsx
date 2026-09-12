import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, TriangleAlert, XOctagon, X } from 'lucide-react';
import { useAppState, dismissToast } from '../hooks/useAppState.js';

const TONES = {
  success: {
    cls: 'border-emerald-400/35 bg-emerald-500/[0.12] text-emerald-100',
    icon: CheckCircle2,
    iconCls: 'text-emerald-300',
    bar: 'from-emerald-400 to-brand-cyan',
  },
  error: {
    cls: 'border-rose-400/35 bg-rose-500/[0.12] text-rose-100',
    icon: XOctagon,
    iconCls: 'text-rose-300',
    bar: 'from-rose-400 to-brand-fuchsia',
  },
  warn: {
    cls: 'border-amber-400/35 bg-amber-500/[0.12] text-amber-100',
    icon: TriangleAlert,
    iconCls: 'text-amber-300',
    bar: 'from-amber-400 to-brand-fuchsia',
  },
  info: {
    cls: 'border-brand-violet/35 bg-brand-violet/[0.14] text-gray-100',
    icon: Info,
    iconCls: 'text-brand-cyan',
    bar: 'from-brand-violet to-brand-cyan',
  },
};

/**
 * Tumpukan notifikasi pojok kanan bawah — bahasa gaul, auto-hilang.
 * (c) KyyDevv
 */
export default function Toasts() {
  const { ui } = useAppState();
  const toasts = ui.toasts || [];

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[90] flex w-[min(380px,calc(100vw-24px))] flex-col gap-2 sm:bottom-5 sm:right-5">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const tone = TONES[t.tone] || TONES.info;
          const Icon = tone.icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.94, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className={`pointer-events-auto relative overflow-hidden rounded-xl border px-3.5 py-2.5 pr-8 shadow-[0_20px_50px_-25px_rgba(0,0,0,.95)] backdrop-blur-xl ${tone.cls}`}
            >
              <div className="flex items-start gap-2.5">
                <Icon size={15} className={`mt-0.5 shrink-0 ${tone.iconCls}`} />
                <p className="text-[12.5px] font-medium leading-relaxed">{t.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="absolute right-2 top-2 rounded p-0.5 text-current opacity-45 transition-opacity hover:opacity-100"
                aria-label="Tutup notifikasi"
              >
                <X size={13} />
              </button>
              <motion.div
                className={`absolute bottom-0 left-0 h-[2px] bg-gradient-to-r ${tone.bar}`}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 4.2, ease: 'linear' }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
