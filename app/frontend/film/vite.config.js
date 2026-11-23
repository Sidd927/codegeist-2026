// Film capture harness (dev only, never deployed): renders the app's real views from payloads produced
// by the real services (scripts/film-data.mjs) so the demo film can show crisp, full-resolution UI.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  resolve: { alias: { '@forge/bridge': resolve(import.meta.dirname, '../src/forge-bridge.stub.js') } },
  server: { port: 5199, strictPort: true, fs: { allow: [resolve(import.meta.dirname, '..'), '/tmp/a25-film'] } },
});
