import { createHash } from 'node:crypto';

// Minimal ADF -> plain text (paragraphs, headings, lists, text nodes).
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text ?? '';
  const inner = (node.content ?? []).map(adfToText).join(node.type === 'doc' || node.type === 'bulletList' || node.type === 'orderedList' ? '\n' : '');
  return ['paragraph', 'heading', 'listItem'].includes(node.type) ? inner + '\n' : inner;
}

// Confluence storage format (XHTML) -> plain text.
export function storageToText(xhtml = '') {
  return xhtml.replace(/<(br|\/p|\/h\d|\/li|\/tr)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
}

export const fingerprint = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export const escapeXml = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
