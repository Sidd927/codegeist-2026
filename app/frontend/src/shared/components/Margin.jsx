// The Margin experience: the work item text is the page, findings are numbered margin notes, and
// each note is linked to the exact words that triggered it (UX_DESIGN_SPEC §2, §3.4).
import { useMemo } from 'react';
import Lozenge from '@atlaskit/lozenge';
import { locateMarks, segment } from '../margin.js';

const markId = (prefix, id) => `${prefix}-mark-${id}`;
const noteId = (prefix, id) => `${prefix}-note-${id}`;

/**
 * @param {object} props
 * @param {string} props.idPrefix         unique per page, keeps ids stable and unique
 * @param {string} props.summary          work item summary
 * @param {{kind:string,text:string}[]} props.blocks  description blocks
 * @param {{id:string,index:number,quote:string,tone:'sensitive'|'vendor'|'default'}[]} props.marks
 * @param {string|null} props.activeId
 */
export function EvidenceDocument({ idPrefix, summary, blocks, marks = [], activeId = null, labels }) {
  const all = useMemo(() => [{ kind: 'summary', text: summary ?? '' }, ...blocks], [summary, blocks]);
  const located = useMemo(() => locateMarks(all, marks), [all, marks]);
  const byId = useMemo(() => Object.fromEntries(marks.map((m) => [m.id, m])), [marks]);

  const renderText = (text, b) =>
    segment(text, located.get(b)).map((seg, i) => {
      if (!seg.markId) return <span key={i}>{seg.text}</span>;
      const m = byId[seg.markId];
      return (
        <mark
          key={i}
          id={markId(idPrefix, m.id)}
          className={`a25-mark a25-mark--${m.tone ?? 'default'}${activeId === m.id ? ' is-active' : ''}`}
          aria-describedby={noteId(idPrefix, m.id)}
        >
          {seg.text}
          <sup className="a25-mark__index" aria-hidden="true">
            {m.index}
          </sup>
          <span className="a25-visually-hidden">{` (evidence ${m.index} of ${marks.length})`}</span>
        </mark>
      );
    });

  return (
    <article className="a25-document" aria-label={labels.document}>
      <h3 className="a25-document__label">{labels.summary}</h3>
      <p className="a25-document__summary">{renderText(all[0].text, 0)}</p>
      <h3 className="a25-document__label">{labels.description}</h3>
      {blocks.length === 0 ? (
        <p className="a25-subtle">{labels.noDescription}</p>
      ) : (
        blocks.map((block, i) => {
          const Tag = block.kind === 'heading' ? 'h4' : 'p';
          const cls = `a25-document__block a25-document__block--${block.kind}`;
          return (
            <Tag key={i} className={cls}>
              {block.kind === 'listItem' && <span aria-hidden="true">• </span>}
              {renderText(block.text, i + 1)}
            </Tag>
          );
        })
      )}
    </article>
  );
}

/**
 * Margin notes. Each note is a button: activating it highlights and scrolls to its mark.
 * @param {{id:string,index:number,label:string,detail?:string,quote:string,isNew?:boolean,provenance?:string}[]} props.notes
 */
export function MarginNotes({ idPrefix, notes, activeId, onActivate, newLabel = 'New' }) {
  const activate = (id) => {
    onActivate?.(id);
    const el = typeof document !== 'undefined' ? document.getElementById(markId(idPrefix, id)) : null;
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };
  return (
    <ol className="a25-notes">
      {notes.map((n) => (
        <li key={n.id} className={`a25-note${activeId === n.id ? ' is-active' : ''}`}>
          <button type="button" className="a25-note__button" aria-pressed={activeId === n.id} onClick={() => activate(n.id)} onFocus={() => onActivate?.(n.id)}>
            <span className="a25-note__index a25-mono" aria-hidden="true">
              [{n.index}]
            </span>
            <span className="a25-note__body">
              <span className="a25-note__head">
                <span id={noteId(idPrefix, n.id)} className="a25-note__label">
                  {n.label}
                  {n.detail ? <span className="a25-subtle"> · {n.detail}</span> : null}
                </span>
                {n.isNew ? <Lozenge appearance="moved">{newLabel}</Lozenge> : null}
              </span>
              <q className="a25-note__quote">{n.quote}</q>
              {n.provenance ? <span className="a25-note__provenance a25-small">{n.provenance}</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
