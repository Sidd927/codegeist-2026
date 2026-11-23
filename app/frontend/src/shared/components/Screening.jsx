// Screening result building blocks shared by the panel and the review workspace.
// Every element renders backend results; nothing here decides or infers a privacy outcome.
import { useId, useState } from 'react';
import { copy } from '../copy/en.js';
import { findingLabel, findingDetail, relativeTime, reasonText } from '../findings.js';
import { Lozenge } from './ui.jsx';

/** Says how the result was produced: AI-assisted (quotes verified) or the limited rule-based check. */
export function ModeNote({ result }) {
  if (!result) return null;
  const why = result.mode === 'rules' ? copy.screening.aiStatus[result.aiStatus] : '';
  return (
    <p className={`a25-mode a25-mode--${result.mode}`}>
      <span className="a25-mode__label">{copy.screening.mode[result.mode] ?? result.mode}</span>
      {why ? <span className="a25-subtle"> · {why}</span> : null}
      {result.quality?.rejected ? <span className="a25-subtle"> · {copy.screening.rejectedQuotes(result.quality.rejected)}</span> : null}
    </p>
  );
}

/** Disclosure listing the ordered rules, which one fired, and the rules version. */
export function RuleTrace({ result }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!result) return null;
  return (
    <div className="a25-trace">
      <button type="button" className="a25-linkbutton a25-small" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {copy.screening.howDecided} {open ? '▾' : '▸'}
      </button>
      {open ? (
        <div id={id} className="a25-trace__body a25-small">
          <ol className="a25-trace__list">
            {result.reasons.map((r) => (
              <li key={r.ruleId}>
                <span className="a25-mono">{r.ruleId}</span> {reasonText(r)}
              </li>
            ))}
          </ol>
          <p className="a25-subtlest">
            {copy.screening.rulesVersion(result.rulesVersion)} · <span className="a25-mono">{result.trace.filter((t) => t.result !== 'skipped').map((t) => `${t.ruleId}:${t.result === 'fired' ? '✓' : '–'}`).join(' ')}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** "What's new" chips: high-severity, new-to-inventory or external-sharing findings. */
export function DeltaChips({ findings, label = copy.screening.whatsNew }) {
  const chips = findings.filter((f) => f.severity === 'high' || f.isNew || f.kind === 'external_sharing').slice(0, 4);
  if (!chips.length) return null;
  return (
    <ul className="a25-chips" aria-label={label}>
      {chips.map((f) => (
        <li key={f.id} className="a25-chip">
          {findingLabel(f)}
        </li>
      ))}
    </ul>
  );
}

/** Non-interactive findings list (the panel). The desk uses MarginNotes linked to marks. */
export function FindingsList({ findings, limit = 4 }) {
  const [all, setAll] = useState(false);
  const withEvidence = findings.filter((f) => f.excerpt);
  const shown = all ? withEvidence : withEvidence.slice(0, limit);
  if (!withEvidence.length) return null;
  return (
    <div className="a25-findings">
      <ol className="a25-findings__list" aria-label={copy.screening.findingsLabel}>
        {shown.map((f) => (
          <li key={f.id} className="a25-finding">
            <span className="a25-finding__head">
              <span className="a25-mono a25-subtle" aria-hidden="true">
                [{f.index}]
              </span>
              <span className="a25-finding__label">
                {findingLabel(f)}
                {findingDetail(f) ? <span className="a25-subtle"> · {findingDetail(f)}</span> : null}
              </span>
              {f.isNew ? <Lozenge appearance="moved">{copy.findings.new}</Lozenge> : null}
            </span>
            <q className="a25-note__quote">{f.excerpt}</q>
            <span className="a25-note__meta a25-small">
              <span className={`a25-note__certainty a25-note__certainty--${f.severity}`}>{copy.findings.certainty[f.certainty]}</span>
              {f.provenance ? <span className="a25-note__provenance">{copy.findings.provenance[f.provenance]}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {withEvidence.length > limit ? (
        <button type="button" className="a25-linkbutton a25-small" aria-expanded={all} onClick={() => setAll((a) => !a)}>
          {all ? copy.screening.showFewer : copy.screening.showAll(withEvidence.length)}
        </button>
      ) : null}
    </div>
  );
}

/** Open questions and missing information (no quotation: these are about what the text does NOT say). */
export function OpenQuestions({ findings }) {
  const qs = findings.filter((f) => f.kind === 'question' || f.kind === 'missing_info');
  if (!qs.length) return null;
  return (
    <div className="a25-questions">
      <h3 className="a25-questions__title">{copy.screening.questionsLabel}</h3>
      <ul className="a25-questions__list">
        {qs.map((q) => (
          <li key={q.id}>
            {findingLabel(q)}
            {q.kind === 'missing_info' ? <span className="a25-subtle a25-small"> · {copy.findings.explanation.missing_info}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CheckedAt({ result }) {
  if (!result?.checkedAt) return null;
  return <span className="a25-subtlest a25-small">{copy.screening.checkedAt(relativeTime(result.checkedAt))}</span>;
}
