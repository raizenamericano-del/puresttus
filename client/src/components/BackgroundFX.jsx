import React from 'react';
import { motion } from 'framer-motion';

/**
 * Latar belakang premium: grid halus + orb gradien yang gerak pelan.
 * Murni CSS/SVG — nggak narik resource eksternal (aman buat preview offline).
 *
 * (c) KyyDevv
 */
export default function BackgroundFX() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* grid */}
      <div className="bg-grid absolute inset-0 opacity-60" />

      {/* orb violet */}
      <motion.div
        className="absolute -left-40 -top-40 h-[540px] w-[540px] rounded-full blur-[110px]"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,.28), transparent 68%)' }}
        animate={{ x: [0, 40, -20, 0], y: [0, 30, 60, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* orb fuchsia */}
      <motion.div
        className="absolute -right-32 top-[18%] h-[460px] w-[460px] rounded-full blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(217,70,239,.22), transparent 70%)' }}
        animate={{ x: [0, -50, 20, 0], y: [0, 60, -30, 0], scale: [1, 1.12, 0.94, 1] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* orb cyan */}
      <motion.div
        className="absolute bottom-[-160px] left-[28%] h-[520px] w-[520px] rounded-full blur-[130px]"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,.16), transparent 70%)' }}
        animate={{ x: [0, 70, -40, 0], y: [0, -40, 20, 0], scale: [1, 0.92, 1.06, 1] }}
        transition={{ duration: 38, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
      />

      {/* vignette */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 0%, transparent 40%, rgba(7,7,13,.85) 100%)' }}
      />
    </div>
  );
}
