// Pure helpers for the Margin document: locate evidence quotes in the work-item text and split each
// block into plain and marked segments. Presentation only; quote verification happens server-side.

/**
 * @param {{kind:string,text:string}[]} blocks
 * @param {{id:string, quote:string}[]} marks  in display order
 * @returns {Map<number, {start:number,end:number,id:string}[]>} block index -> non-overlapping ranges
 */
export function locateMarks(blocks, marks) {
  const byBlock = new Map();
  for (const mark of marks) {
    const quote = String(mark.quote ?? '').trim();
    if (!quote) continue;
    for (let b = 0; b < blocks.length; b++) {
      const text = blocks[b].text;
      let from = 0;
      let placed = false;
      while (!placed) {
        const start = text.toLowerCase().indexOf(quote.toLowerCase(), from);
        if (start < 0) break;
        const end = start + quote.length;
        const ranges = byBlock.get(b) ?? [];
        if (ranges.some((r) => start < r.end && end > r.start)) {
          from = start + 1; // overlap: look for the next occurrence
          continue;
        }
        ranges.push({ start, end, id: mark.id });
        ranges.sort((x, y) => x.start - y.start);
        byBlock.set(b, ranges);
        placed = true;
      }
      if (placed) break;
    }
  }
  return byBlock;
}

/** Split one block's text into [{text, markId?}] segments using located ranges. */
export function segment(text, ranges = []) {
  const out = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) out.push({ text: text.slice(pos, r.start) });
    out.push({ text: text.slice(r.start, r.end), markId: r.id });
    pos = r.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}
