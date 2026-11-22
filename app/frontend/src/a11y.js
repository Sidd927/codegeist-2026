// Runs axe-core against a rendered container. Colour contrast is excluded because jsdom has no
// layout or computed token colours; contrast comes from ADS tokens and is reviewed live in both themes.
import axe from 'axe-core';

export async function axeViolations(container) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
