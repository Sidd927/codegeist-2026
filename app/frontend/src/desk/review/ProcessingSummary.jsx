// "What the text says": purpose, categories, recipients, transfers and retention, built ONLY from
// verified findings (each with an exact quote and a numbered link to its highlight). Absence is
// worded carefully: the rule-based check cannot assess transfers or retention, so it says so.
import { copy } from '../../shared/copy/en.js';
import { findingLabel } from '../../shared/findings.js';

const P = copy.review.processing;

function Ref({ f, onActivate }) {
  if (!f.index) return null;
  return (
    <button type="button" className="a25-ref a25-mono" onClick={() => onActivate?.(f.id)} aria-label={`${findingLabel(f)}, finding ${f.index}`}>
      [{f.index}]
    </button>
  );
}

function Row({ term, items, empty, onActivate }) {
  return (
    <div className="a25-proc__row">
      <dt className="a25-proc__term a25-small">{term}</dt>
      <dd className="a25-proc__value">
        {items.length ? (
          <ul className="a25-proc__list">
            {items.map((f) => (
              <li key={f.id}>
                {findingLabel(f)} <Ref f={f} onActivate={onActivate} />
              </li>
            ))}
          </ul>
        ) : (
          <span className="a25-subtle">{empty}</span>
        )}
      </dd>
    </div>
  );
}

export function ProcessingSummary({ result, onActivate }) {
  if (!result) return null;
  const by = (...kinds) => result.findings.filter((f) => kinds.includes(f.kind) && f.excerpt);
  const rules = result.mode === 'rules';
  const purposes = result.purposes ?? [];
  return (
    <section className="a25-proc" aria-labelledby="a25-proc-title">
      <h3 id="a25-proc-title" className="a25-questions__title">
        {P.title}
      </h3>
      <dl className="a25-proc__grid">
        <div className="a25-proc__row">
          <dt className="a25-proc__term a25-small">{P.purpose}</dt>
          <dd className="a25-proc__value">
            {purposes.length ? (
              <ul className="a25-proc__list">
                {purposes.map((p, i) => (
                  <li key={i}>
                    <q className="a25-note__quote">{p.excerpt}</q>
                    {p.description ? <span className="a25-subtlest a25-small a25-block">{P.aiWording(p.description)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="a25-subtle">{P.notStated}</span>
            )}
          </dd>
        </div>
        <Row term={P.categories} items={by('personal_data', 'sensitive_data')} empty={P.noneFound} onActivate={onActivate} />
        <Row term={P.recipients} items={by('external_sharing')} empty={P.noneFound} onActivate={onActivate} />
        <Row term={P.transfers} items={by('international_transfer')} empty={rules ? P.notAssessed : P.noneFound} onActivate={onActivate} />
        <Row term={P.retention} items={by('retention')} empty={rules ? P.notAssessed : P.notStated} onActivate={onActivate} />
      </dl>
      <p className="a25-subtlest a25-small">{P.note}</p>
    </section>
  );
}
