import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backend Express jalan di PORT (default 8080). Vite dev server proxy /api & /socket.io ke sana.
const BACKEND = process.env.VITE_BACKEND || `http://localhost:${process.env.PORT || 8080}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        ws: false,
      },
      '/socket.io': {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
          socket: ['socket.io-client'],
        },
      },
    },
  },
});
