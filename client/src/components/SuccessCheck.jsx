import React from 'react';
import { motion } from 'framer-motion';

/**
 * Checkmark yang "menggambar sendiri" (SVG path animation) + halo memancar.
 * (c) KyyDevv
 */
export default function SuccessCheck({ size = 96, delay = 0, label = 'Video Kekirim! 🎉' }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        {/* halo memancar */}
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,.35), transparent 68%)' }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.6, 1.5, 1.35], opacity: [0, 0.9, 0] }}
          transition={{ duration: 1.7, delay, times: [0, 0.45, 1], ease: 'easeOut' }}
        />
        <motion.span
          className="absolute inset-0 rounded-full border border-emerald-400/40"
          initial={{ scale: 0.8, opacity: 0.8 }}
          animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: 1.5, delay: delay + 0.15, ease: 'easeOut' }}
        />

        <svg viewBox="0 0 100 100" width={size} height={size} className="relative">
          <defs>
            <linearGradient id="kyy-check-grad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="55%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
            <filter id="kyy-check-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* lingkaran */}
          <motion.circle
            cx="50"
            cy="50"
            r="43"
            fill="rgba(34,211,238,.05)"
            stroke="url(#kyy-check-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.85, delay, ease: [0.65, 0, 0.35, 1] }}
            style={{ transformOrigin: '50px 50px', rotate: -90 }}
            filter="url(#kyy-check-glow)"
          />

          {/* centang */}
          <motion.path
            d="M31 52.5 L44.5 66 L70 36"
            fill="none"
            stroke="url(#kyy-check-grad)"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: delay + 0.55, ease: 'easeOut' }}
            filter="url(#kyy-check-glow)"
          />
        </svg>
      </div>

      {label && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: delay + 0.8, type: 'spring', stiffness: 220, damping: 18 }}
          className="text-center"
        >
          <h3 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">{label}</h3>
        </motion.div>
      )}
    </div>
  );
}
