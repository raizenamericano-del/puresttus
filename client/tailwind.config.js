/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: '#07070d',
          900: '#07070d',
          800: '#0b0b14',
          700: '#101019',
          600: '#16161f',
          500: '#1e1e2b',
        },
        brand: {
          violet: '#8b5cf6',
          fuchsia: '#d946ef',
          cyan: '#22d3ee',
        },
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(100deg,#8b5cf6 0%,#d946ef 48%,#22d3ee 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg,rgba(139,92,246,.18),rgba(217,70,239,.12) 45%,rgba(34,211,238,.14))',
        'grid-faint':
          'linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)',
      },
      backgroundSize: {
        grid: '48px 48px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,92,246,.35), 0 20px 60px -25px rgba(139,92,246,.55)',
        'glow-cyan': '0 0 0 1px rgba(34,211,238,.35), 0 20px 60px -25px rgba(34,211,238,.45)',
        card: '0 1px 0 0 rgba(255,255,255,.04) inset, 0 24px 60px -40px rgba(0,0,0,.9)',
      },
      keyframes: {
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseRing: {
          '0%': { transform: 'scale(.85)', opacity: '.7' },
          '70%': { transform: 'scale(1.25)', opacity: '0' },
          '100%': { transform: 'scale(1.25)', opacity: '0' },
        },
        ticker: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '12%': { transform: 'translateY(0)', opacity: '1' },
          '88%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-100%)', opacity: '0' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 9s linear infinite',
        float: 'float 5s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        pulseRing: 'pulseRing 2.2s cubic-bezier(.24,.7,.4,1) infinite',
        ticker: 'ticker .6s ease-out',
      },
    },
  },
  plugins: [],
};
