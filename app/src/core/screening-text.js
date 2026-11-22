// Canonical screening text: the exact string that is screened, fingerprinted and quoted.
// Built from the work item's summary and description (ADF → blocks), with a source map so every
// verified quote can be traced back to its field and block. The raw text is never stored.
import { createHash } from 'node:crypto';
import { adfToBlocks } from './text.js';

export const TEXT_VERSION = 't1';
const SEP = '\n\n';

/**
 * @param {{summary?: string, description?: object|string|null}} issue
 * @returns {{ text: string, fingerprint: string, segments: {field:'summary'|'description', blockIndex:number, start:number, end:number}[], truncated: boolean }}
 */
export function buildScreeningText({ summary = '', description = null }) {
  const segments = [];
  let text = '';
  const append = (field, blockIndex, value) => {
    if (!value) return;
    if (text) text += SEP;
    const start = text.length;
    text += value;
    segments.push({ field, blockIndex, start, end: text.length });
  };
  append('summary', -1, String(summary ?? '').trim());
  const { blocks, truncated } = adfToBlocks(description);
  blocks.forEach((b, i) => append('description', i, b.text));
  return { text, fingerprint: fingerprint(text), segments, truncated };
}

export function fingerprint(text) {
  return createHash('sha256').update(`${TEXT_VERSION}|${text}`).digest('hex');
}

/** Map an absolute [start, end) range to its source segment (field + block + block-relative offsets). */
export function sourceOf(segments, start, end) {
  const seg = segments.find((s) => start >= s.start && end <= s.end);
  if (!seg) return null; // spans a block boundary: not a single traceable source
  return { field: seg.field, blockIndex: seg.blockIndex, start: start - seg.start, end: end - seg.start };
}
