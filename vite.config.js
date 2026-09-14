import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 1500 }
});
