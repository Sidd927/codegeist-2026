// Runs axe-core against a rendered container (jsdom). Colour contrast is excluded HERE because jsdom has no
// layout or canvas; it is checked in real Chromium against the ADS light and dark themes by
// src/contrast.browser.test.jsx (npm run test:contrast, also in CI).
import axe from 'axe-core';

export async function axeViolations(container) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
