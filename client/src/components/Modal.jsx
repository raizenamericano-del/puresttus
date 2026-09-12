import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Modal generik: backdrop blur, tutup pakai ESC / klik luar, animasi spring.
 * (c) KyyDevv
 */
export default function Modal({ open, onClose, title, subtitle, icon: Icon = null, children, maxWidth = 'max-w-2xl', footer = null }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`card relative z-10 my-auto w-full ${maxWidth} overflow-hidden`}
            initial={{ opacity: 0, y: 26, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <div className="flex items-start gap-3 border-b border-white/[0.06] bg-brand-gradient-soft px-4 py-3.5 sm:px-5">
              {Icon && (
                <span className="mt-0.5 rounded-xl border border-white/10 bg-black/30 p-2">
                  <Icon size={16} className="text-brand-violet" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-bold tracking-tight text-white">{title}</h2>
                {subtitle && <p className="mt-0.5 text-[11.5px] leading-relaxed text-gray-400">{subtitle}</p>}
              </div>
              <motion.button
                type="button"
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-1.5 text-gray-400 transition-colors hover:text-white"
                aria-label="Tutup"
              >
                <X size={15} />
              </motion.button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

            {footer && <div className="border-t border-white/[0.06] bg-black/25 px-4 py-3 sm:px-5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
