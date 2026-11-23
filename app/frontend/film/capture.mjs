// Captures the film's product shots from the harness (film/vite.config.js) with Playwright Chromium.
// Stills at 2x device scale; interactions are the components' real behaviour (clicks, typing).
// Usage: node film/capture.mjs <outDir>   (harness must be running on :5199)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/a25-film/shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const go = async (state) => {
  await page.goto(`http://localhost:5199/?state=${state}`);
  await page.waitForTimeout(600);
};
const shot = (name, opts = {}) => page.screenshot({ path: `${out}/${name}.png`, ...opts });
const full = (name) => shot(name, { fullPage: true });
const el = async (name, selector) => (await page.locator(selector).first()).screenshot({ path: `${out}/${name}.png` });

for (const s of ['getstarted-fresh', 'getstarted-done', 'inbox', 'record', 'settings-gate', 'settings-record', 'settings-restored', 'workspace-approved', 'workspace-invalidated', 'workspace-sod']) {
  await go(s);
  await full(s);
}
for (const s of ['panel', 'panel-invalidated']) {
  await go(s);
  await el(s, '.film-panel');
}
// Workspace: the evidence document, then a margin note activated (its quote highlights in the text).
await go('workspace');
await full('workspace');
await page.getByRole('button', { name: /Health data/ }).first().click();
await page.waitForTimeout(300);
await full('workspace-note-active');
// Decision form: the reviewer chooses an outcome, writes a rationale and a condition (real form).
await page.getByRole('radio', { name: 'Approve with conditions' }).check();
await page.getByLabel(/Rationale/).fill('Proportionate for checkout analytics once form inputs are masked and prescription pages are excluded.');
await page.getByLabel('Conditions 1').fill('Mask every form input in recordings');
await page.waitForTimeout(200);
await el('decision-filled', '.a25-zone--decision');
await page.getByRole('button', { name: 'Record decision' }).click();
await page.waitForTimeout(300);
await el('decision-confirm', '.a25-zone--decision');
// Specific regions for close-ups.
await go('workspace-invalidated');
await el('invalidated-zone', '.a25-zone--decision');
await go('workspace-approved');
await el('approved-zone', '.a25-zone--decision');
await go('workspace-sod');
await el('sod-zone', '.a25-zone--decision');
await browser.close();
process.stdout.write(`captured to ${out}\n`);
