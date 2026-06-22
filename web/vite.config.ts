import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// The gateway terminates TLS on :8443 with a self-signed cert (SANs include
// localhost + exprsn.local). We proxy every backend prefix + the single
// Socket.IO path through the Vite dev server so the browser sees ONE origin
// (the dev server) and credentials/cookies flow cleanly. secure:false accepts
// the dev self-signed cert; never do this against a real CA in prod.
const GATEWAY = process.env.VITE_GATEWAY_ORIGIN || 'https://localhost:8443';

// Backend module prefixes (mirror src/modules/registry.js) + platform routes.
const BACKEND_PATHS = [
  '/ca',
  '/auth',
  '/spark',
  '/nexus',
  '/filevault',
  '/vault',
  '/timeline',
  '/prefetch',
  '/moderator',
  '/live',
  '/health',
];

const proxy: Record<string, ProxyOptions> = Object.fromEntries(
  BACKEND_PATHS.map((p) => [p, { target: GATEWAY, changeOrigin: true, secure: false }]),
);
// Socket.IO (single server) — needs WebSocket upgrade passthrough.
proxy['/socket.io'] = { target: GATEWAY, changeOrigin: true, secure: false, ws: true };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    host: true,
    proxy,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
