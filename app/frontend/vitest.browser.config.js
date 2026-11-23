// Real-browser test run (headless Chromium via Playwright) for checks jsdom cannot do, such as colour
// contrast against the real Atlassian Design System themes. Unit tests stay on jsdom (vite.config.js).
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@forge/bridge': resolve(import.meta.dirname, 'src/forge-bridge.stub.js') } },
  test: {
    root: import.meta.dirname,
    include: ['src/**/*.browser.test.{js,jsx}'],
    browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] },
  },
});
