// Desk overview (entry point). Explains the loop, shows the caller's access and this site's setup,
// and illustrates the Margin review with a clearly labelled fictional example (no decision controls).
import { useState } from 'react';
import Heading from '@atlaskit/heading';
import Lozenge from '@atlaskit/lozenge';
import { copy } from '../../shared/copy/en.js';
import { EvidenceDocument, MarginNotes } from '../../shared/components/Margin.jsx';
import { StatusLozenge } from '../../shared/components/States.jsx';

// Fictional, synthetic example. It is not stored, not linked to any work item, and has no decision.
const EXAMPLE = {
  summary: 'Add session replay to checkout with ReplayCloud',
  blocks: [
    { kind: 'paragraph', text: 'Record checkout sessions to understand where shoppers drop off.' },
    { kind: 'paragraph', text: 'Segment shoppers who abandon carts containing prescription items for a follow-up campaign.' },
  ],
  marks: [
    { id: 'ex1', index: 1, quote: 'prescription items', tone: 'sensitive' },
    { id: 'ex2', index: 2, quote: 'Record checkout sessions', tone: 'default' },
    { id: 'ex3', index: 3, quote: 'ReplayCloud', tone: 'vendor' },
  ],
  notes: [
    { id: 'ex1', index: 1, label: 'Health data', detail: 'sensitive', quote: 'prescription items', isNew: true },
    { id: 'ex2', index: 2, label: 'Systematic monitoring', quote: 'Record checkout sessions' },
    { id: 'ex3', index: 3, label: 'Vendor: ReplayCloud', detail: 'not approved', quote: 'ReplayCloud', isNew: true },
  ],
  chips: ['New vendor: ReplayCloud', 'New for this project: behavioural data'],
};

function ExampleReview() {
  const [active, setActive] = useState(null);
  return (
    <section className="a25-example" aria-labelledby="a25-example-title">
      <div className="a25-section-head">
        <Heading as="h2" size="small" id="a25-example-title">
          {copy.home.exampleTitle}
        </Heading>
      </div>
      <p className="a25-notice">
        <Lozenge>{copy.home.exampleBadge}</Lozenge>
        <span>{copy.home.exampleNotice}</span>
      </p>
      <div className="a25-example__grid">
        <div className="a25-example__doc">
          <EvidenceDocument
            idPrefix="a25-ex"
            summary={EXAMPLE.summary}
            blocks={EXAMPLE.blocks}
            marks={EXAMPLE.marks}
            activeId={active}
            labels={{ document: copy.review.documentLabel, summary: copy.review.summaryHeading, description: copy.review.descriptionHeading, noDescription: copy.review.noDescription }}
          />
        </div>
        <div className="a25-example__margin">
          <div className="a25-example__status">
            <StatusLozenge state="DPIA_LIKELY" />
          </div>
          <ul className="a25-chips" aria-label={copy.home.whatsNewLabel}>
            {EXAMPLE.chips.map((c) => (
              <li key={c} className="a25-chip">
                {c}
              </li>
            ))}
          </ul>
          <MarginNotes idPrefix="a25-ex" notes={EXAMPLE.notes} activeId={active} onActivate={setActive} />
        </div>
      </div>
    </section>
  );
}

export function Home({ appContext }) {
  const isAdmin = appContext?.roles?.jiraAdmin === true;
  const s = copy.home.setup;
  const checksOn = appContext?.features?.screening === true;
  return (
    <div className="a25-page a25-home">
      <div className="a25-page__head">
        <h1 tabIndex={-1} className="a25-page__title">
          {copy.home.title}
        </h1>
        <p className="a25-page__lead a25-subtle">{copy.home.lead}</p>
      </div>

      <div className="a25-home__grid">
        <div className="a25-home__main">
          <section aria-labelledby="a25-loop-title" className="a25-loop-section">
            <Heading as="h2" size="small" id="a25-loop-title">
              {copy.home.loopLabel}
            </Heading>
            <ol className="a25-loop">
              {copy.home.loop.map((step, i) => (
                <li key={step.key} className="a25-loop__step">
                  <span className="a25-loop__num a25-mono" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="a25-loop__title">{step.title}</span>
                  <span className="a25-loop__body a25-subtle">{step.body}</span>
                </li>
              ))}
            </ol>
          </section>
          <ExampleReview />
        </div>

        <aside className="a25-home__side" aria-label={copy.home.setupTitle}>
          <section className="a25-card" aria-labelledby="a25-access-title">
            <Heading as="h2" size="xsmall" id="a25-access-title">
              {copy.home.access.title}
            </Heading>
            <p className="a25-subtle">{appContext ? (isAdmin ? copy.home.access.admin : copy.home.access.notAdmin) : copy.common.loading}</p>
          </section>
          <section className="a25-card" aria-labelledby="a25-setup-title">
            <Heading as="h2" size="xsmall" id="a25-setup-title">
              {copy.home.setupTitle}
            </Heading>
            <dl className="a25-setup">
              <div>
                <dt>{s.checks.label}</dt>
                <dd>{checksOn ? s.checks.on : s.checks.off}</dd>
              </div>
              <div>
                <dt>{s.reviewers.label}</dt>
                <dd>
                  <span className="a25-mono">{appContext?.reviewerGroup ?? '–'}</span>
                  {appContext ? <span className="a25-block a25-subtle a25-small">{appContext.roles?.reviewer ? s.reviewers.member : s.reviewers.notMember}</span> : null}
                </dd>
              </div>
              <div>
                <dt>{s.gate.label}</dt>
                <dd>
                  {s.gate[appContext?.gate?.mode] ?? s.gate.unknown}
                  <span className="a25-block a25-subtle a25-small">{s.gate.coverage}</span>
                </dd>
              </div>
              <div>
                <dt>{s.record.label}</dt>
                <dd>{appContext ? (s.record[appContext.record?.signing] ?? s.record.none) : '–'}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
