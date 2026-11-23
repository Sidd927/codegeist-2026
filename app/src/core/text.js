// Atlassian Document Format (ADF) -> plain-text blocks for the Margin document view.
// Ported from spikes/article25-core-spike/src/text.js (adfToText), extended to keep block structure
// (one entry per paragraph, heading, list item or code block) and to handle common inline nodes.
// Pure: no Forge imports, unit-tested in test/text.test.mjs.

const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'panel', 'tableCell', 'tableHeader']);
const MAX_BLOCKS = 400;
const MAX_CHARS = 32000;

function inlineText(node) {
  if (!node) return '';
  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'hardBreak':
      return '\n';
    case 'mention':
      return node.attrs?.text ?? '@mention';
    case 'emoji':
      return node.attrs?.text ?? node.attrs?.shortName ?? '';
    case 'inlineCard':
      return node.attrs?.url ?? '';
    case 'status':
      return node.attrs?.text ?? '';
    case 'date':
      return node.attrs?.timestamp ? new Date(Number(node.attrs.timestamp)).toISOString().slice(0, 10) : '';
    default:
      return (node.content ?? []).map(inlineText).join('');
  }
}

/**
 * @param {object|string|null} adf  ADF document (Jira REST v3 description) or plain string
 * @returns {{ blocks: { kind: string, text: string }[], truncated: boolean }}
 */
export function adfToBlocks(adf) {
  const blocks = [];
  let chars = 0;
  let truncated = false;

  const push = (kind, text) => {
    const t = text.replace(/[ \t]+\n/g, '\n').trim();
    if (!t) return;
    if (blocks.length >= MAX_BLOCKS || chars + t.length > MAX_CHARS) {
      truncated = true;
      return;
    }
    chars += t.length;
    blocks.push({ kind, text: t });
  };

  const walk = (node) => {
    if (!node || truncated) return;
    if (BLOCKS.has(node.type)) {
      // A list item may contain nested lists: emit its own paragraph text, then walk nested lists.
      const own = (node.content ?? []).filter((c) => c.type !== 'bulletList' && c.type !== 'orderedList');
      const kind = node.type === 'heading' ? 'heading' : node.type === 'listItem' ? 'listItem' : node.type === 'codeBlock' ? 'code' : 'paragraph';
      push(kind, own.map((c) => (BLOCKS.has(c.type) ? inlineText(c) : inlineText(c))).join(node.type === 'listItem' ? ' ' : ''));
      (node.content ?? []).filter((c) => c.type === 'bulletList' || c.type === 'orderedList').forEach(walk);
      return;
    }
    (node.content ?? []).forEach(walk);
  };

  if (typeof adf === 'string') adf.split(/\n{2,}/).forEach((p) => push('paragraph', p));
  else walk(adf);
  return { blocks, truncated };
}
