import React, { useId } from 'react';

/**
 * Logo KyyPureStatus — SVG murni, huruf 'K' abstrak.
 * Gradasi violet (#8b5cf6) -> fuchsia (#d946ef) -> cyan (#22d3ee).
 * Nggak ada gambar eksternal, jadi aman offline / iframe sandbox.
 *
 * (c) KyyDevv
 */
export default function Logo({ size = 40, className = '', animated = true, withRing = true, glow = true }) {
  const raw = useId().replace(/[:]/g, '');
  const g = `kyy-g-${raw}`;
  const gs = `kyy-gs-${raw}`;
  const shine = `kyy-shine-${raw}`;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {glow && (
        <span
          className="pointer-events-none absolute inset-0 rounded-[28%] blur-lg"
          style={{
            background: 'radial-gradient(circle at 35% 25%, rgba(139,92,246,.65), rgba(34,211,238,.35) 60%, transparent 72%)',
            opacity: 0.55,
          }}
        />
      )}

      <svg viewBox="0 0 64 64" width={size} height={size} className="relative overflow-visible">
        <defs>
          <linearGradient id={g} x1="12" y1="6" x2="52" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>

          <linearGradient id={gs} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <clipPath id={shine}>
            <path d="M20 12h7.6v40H20z" />
            <path d="M30.4 32 44.6 12h8.2L37.6 32l15.2 20h-8.2L30.4 32Z" />
          </clipPath>
        </defs>

        {withRing && (
          <rect
            x="2.5"
            y="2.5"
            width="59"
            height="59"
            rx="17"
            fill="#0b0b14"
            stroke="url(#kyy-none)"
            style={{ stroke: 'rgba(255,255,255,.08)', strokeWidth: 1.5 }}
          />
        )}

        {/* Batang 'K' */}
        <path d="M20 12h7.6v40H20z" fill={`url(#${g})`} rx="1" />

        {/* Lengan diagonal 'K' */}
        <path d="M30.4 32 44.6 12h8.2L37.6 32l15.2 20h-8.2L30.4 32Z" fill={`url(#${g})`} />

        {/* Pixel kecil — simbol "kompresi/kuantisasi" */}
        <circle cx="49.5" cy="32" r="2.1" fill="#22d3ee" opacity="0.9" />

        {/* Kilau nyapu (shine) */}
        {animated && (
          <g clipPath={`url(#${shine})`}>
            <rect x="-40" y="-10" width="26" height="90" fill={`url(#${gs})`} transform="rotate(18)">
              <animate attributeName="x" values="-45;80;80" dur="3.6s" repeatCount="indefinite" />
            </rect>
          </g>
        )}

        {/* Garis pinggir tipis biar tajem di background gelap */}
        <path
          d="M20 12h7.6v40H20z M30.4 32 44.6 12h8.2L37.6 32l15.2 20h-8.2L30.4 32Z"
          fill="none"
          stroke="rgba(255,255,255,.14)"
          strokeWidth="0.6"
        />
      </svg>
    </span>
  );
}

/** Logo + wordmark (buat header & footer) */
export function LogoWordmark({ size = 34, subtitle = 'by KyyDevv', animated = true }) {
  return (
    <div className="flex items-center gap-3">
      <Logo size={size} animated={animated} />
      <div className="leading-none">
        <div className="text-[15px] font-extrabold tracking-tight text-white sm:text-[17px]">
          Kyy<span className="text-gradient">Pure</span>Status
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-gray-500">{subtitle}</div>
      </div>
    </div>
  );
}
