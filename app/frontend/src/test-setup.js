// jsdom test setup: @forge/bridge only works inside Forge's iframe, so it is replaced with inert stubs.
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

vi.mock('@forge/bridge', () => ({
  invoke: vi.fn(async () => ({ ok: true, data: {} })),
  view: { theme: { enable: vi.fn(async () => undefined) }, getContext: vi.fn(async () => ({})), createHistory: vi.fn() },
  router: { navigate: vi.fn(), open: vi.fn() },
}));

afterEach(() => cleanup());

// jsdom lacks matchMedia (used by Atlaskit for reduced-motion and theme queries).
if (!window.matchMedia) {
  window.matchMedia = (query) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
}
