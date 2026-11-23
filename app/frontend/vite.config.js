// One build per Forge resource: each surface must ship its own index.html and assets inside its
// resource directory (Forge serves a resource directory as an isolated static site).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const entry = process.env.A25_ENTRY ?? 'panel';
if (!['panel', 'desk'].includes(entry)) throw new Error(`Unknown A25_ENTRY ${entry}`);

export default defineConfig({
  plugins: [react()],
  root: resolve(import.meta.dirname, entry),
  base: './', // relative asset paths are required inside Forge resources
  build: {
    outDir: resolve(import.meta.dirname, 'dist', entry),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 600,
  },
  test: {
    root: import.meta.dirname,
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test-setup.js'],
  },
});
