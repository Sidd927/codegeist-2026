// Server-side evidence verification. A quote is accepted only if it exists verbatim in the screened
// text (tolerating case, whitespace runs and straight/curly quote marks) and lies within one source
// block. Accepted quotes are stored as offsets plus a short redacted excerpt, never as raw text.
import { sourceOf } from './screening-text.js';

export const MIN_QUOTE_CHARS = 3;
export const MAX_QUOTE_CHARS = 300;
export const MAX_EXCERPT_CHARS = 120;

const QUOTE_CHARS = /[‘’‚‛′`´]/g;
const DQUOTE_CHARS = /[“”„‟″«»]/g;
const DASHES = /[‐-―−]/g;

function normChar(c) {
  const n = c.replace(QUOTE_CHARS, "'").replace(DQUOTE_CHARS, '"').replace(DASHES, '-');
  const lower = n.toLowerCase();
  return lower.length === 1 ? lower : n; // keep the index map 1:1 (e.g. 'İ' lowercases to 2 chars)
}

/** Normalise text and keep a map from normalised index → original index. */
export function normaliseWithMap(text) {
  let out = '';
  const map = [];
  let prevSpace = true; // trims leading whitespace
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      out += ' ';
      map.push(i);
      prevSpace = true;
      continue;
    }
    out += normChar(ch);
    map.push(i);
    prevSpace = false;
  }
  if (out.endsWith(' ')) {
    out = out.slice(0, -1);
    map.pop();
  }
  return { norm: out, map };
}

const normQuote = (q) => normaliseWithMap(String(q ?? '')).norm.replace(/^["']+|["']+$/g, '').trim();

/**
 * Locate a model-provided quote in the screened text.
 * @returns {{ ok: true, start: number, end: number, source: object } | { ok: false, reason: string }}
 */
export function verifyQuote(text, segments, quote, normalised = normaliseWithMap(text)) {
  if (typeof quote !== 'string') return { ok: false, reason: 'quote_missing' };
  const q = normQuote(quote);
  if (q.replace(/\s/g, '').length < MIN_QUOTE_CHARS) return { ok: false, reason: 'quote_too_short' };
  if (q.length > MAX_QUOTE_CHARS) return { ok: false, reason: 'quote_too_long' };
  const { norm, map } = normalised;
  let from = 0;
  while (from <= norm.length) {
    const at = norm.indexOf(q, from);
    if (at < 0) return { ok: false, reason: 'quote_not_found' };
    const start = map[at];
    const end = map[at + q.length - 1] + 1;
    const source = sourceOf(segments, start, end);
    if (source) return { ok: true, start, end, source };
    from = at + 1; // spans a block boundary: try the next occurrence
  }
  return { ok: false, reason: 'quote_not_found' };
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const CARDLIKE = /\b(?:\d[ -]?){13,19}\b/g;

/** Short excerpt for storage/display: truncated and with obvious identifiers redacted (NFR-3). */
export function excerptOf(text, start, end) {
  let s = text.slice(start, end);
  if (s.length > MAX_EXCERPT_CHARS) s = `${s.slice(0, MAX_EXCERPT_CHARS - 1)}…`;
  return s.replace(EMAIL, '[email]').replace(CARDLIKE, '[number]').replace(PHONE, '[phone]');
}
