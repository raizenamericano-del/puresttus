import { useEffect, useRef } from 'react';

const COLORS = ['#8b5cf6', '#d946ef', '#22d3ee', '#a78bfa', '#f0abfc', '#67e8f9', '#facc15', '#4ade80'];

/**
 * Confetti canvas ringan (zero-dependency, no network).
 * Nembak sekali pas `fire` naik, lalu bersihin sendiri setelah ~3 detik.
 *
 * (c) KyyDevv
 */
export default function Confetti({ fire = false, count = 140, duration = 3000, zIndex = 60 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!fire) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    // Lingkungan tanpa dukungan canvas (mis. jsdom) -> skip animasi, jangan crash.
    if (!ctx) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const W = window.innerWidth;
    const H = window.innerHeight;
    const origins = [
      { x: W * 0.5, y: H * 0.36 },
      { x: W * 0.18, y: H * 0.6 },
      { x: W * 0.82, y: H * 0.6 },
    ];

    const pieces = Array.from({ length: count }, (_, i) => {
      const o = origins[i % origins.length];
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 10;
      return {
        x: o.x + (Math.random() - 0.5) * 40,
        y: o.y + (Math.random() - 0.5) * 26,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5.5,
        w: 5 + Math.random() * 8,
        h: 7 + Math.random() * 11,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        shape: Math.random() < 0.35 ? 'circle' : Math.random() < 0.5 ? 'strip' : 'rect',
        alpha: 1,
        delay: Math.random() * 180,
      };
    });

    const start = performance.now();

    const draw = (now) => {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);

      for (const p of pieces) {
        const pt = Math.max(0, t - p.delay) / 1000;
        if (pt <= 0) continue;

        p.x += p.vx * 0.85;
        p.y += p.vy * 0.85;
        p.vy += 0.36; // gravitasi
        p.vx *= 0.992; // drag
        p.vy *= 0.995;
        p.rot += p.vr;
        p.alpha = Math.max(0, Math.min(1, 1.15 - (t - p.delay) / duration));

        if (p.alpha <= 0 || p.y > H + 60) continue;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'strip') {
          ctx.fillRect(-p.w / 6, -p.h / 1.5, p.w / 3, p.h);
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.62);
        }
        ctx.restore();
      }

      if (t < duration + 400) {
        rafRef.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [fire, count, duration]);

  if (!fire) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex }}
      aria-hidden="true"
    />
  );
}
