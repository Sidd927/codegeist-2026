// Review workspace shell (UX_DESIGN_SPEC §3.4): Document · Margin · Decision.
// Shows the work item's current text as read by the reviewer. With checks off there are no findings
// and the decision zone explains why decisions are unavailable. Nothing here can record a decision.
import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { api } from '../../shared/api.js';
import { useResource } from '../../shared/useResource.js';
import { openIssue } from '../../shared/platform.js';
import { Skeleton, ErrorState, EmptyState, StatusLozenge } from '../../shared/components/States.jsx';
import { EvidenceDocument } from '../../shared/components/Margin.jsx';
import { copy } from '../../shared/copy/en.js';
import { useRouter } from '../router.jsx';

const DECISIONS = ['APPROVED', 'APPROVED_WITH_CONDITIONS', 'CHANGES_REQUESTED', 'REJECTED'];

function DecisionZone({ decision }) {
  const reasonId = 'a25-decision-reason';
  const reason = copy.review.decisionUnavailable[decision.reason] ?? copy.review.decisionUnavailable.NOT_SCREENED;
  return (
    <section className="a25-zone a25-zone--decision" aria-labelledby="a25-decision-title">
      <h2 id="a25-decision-title" className="a25-zone__title">
        {copy.review.decisionLabel}
      </h2>
      <fieldset className="a25-decision" disabled={!decision.available} aria-describedby={reasonId}>
        <legend className="a25-visually-hidden">{copy.review.decisionLabel}</legend>
        {DECISIONS.map((d) => (
          <label key={d} className="a25-radio">
            <input type="radio" name="a25-decision" value={d} disabled={!decision.available} />
            <span>{copy.review.decisionOptions[d]}</span>
          </label>
        ))}
      </fieldset>
      <p id={reasonId} className="a25-decision__reason a25-small">
        {reason}
      </p>
      <Button appearance="primary" isDisabled shouldFitContainer>
        {copy.review.recordDecision}
      </Button>
    </section>
  );
}

export function ReviewView({ resource, onBack, onOpenIssue }) {
  const [tab, setTab] = useState('text');
  const { status, data, error, reload } = resource;

  if (status === 'loading') {
    return (
      <div className="a25-page a25-review">
        <Skeleton lines={2} />
        <div className="a25-review__zones">
          <div className="a25-zone">
            <Skeleton lines={6} />
          </div>
          <div className="a25-zone">
            <Skeleton lines={4} />
          </div>
          <div className="a25-zone">
            <Skeleton lines={4} />
          </div>
        </div>
      </div>
    );
  }
  if (status === 'error') {
    if (error?.code === 'NOT_FOUND' || error?.code === 'INVALID_INPUT') {
      return (
        <div className="a25-page">
          <EmptyState headingLevel={1} title={copy.review.notFoundTitle} body={copy.review.notFoundBody}>
            <Button onClick={onBack}>{copy.review.back}</Button>
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="a25-page">
        <h1 tabIndex={-1} className="a25-visually-hidden">
          {copy.common.errorTitle}
        </h1>
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const { issue, document: doc, review, decision } = data;
  return (
    <div className="a25-page a25-review">
      <div className="a25-review__head">
        <button type="button" className="a25-linkbutton a25-small" onClick={onBack}>
          ← {copy.review.back}
        </button>
        <div className="a25-review__titleline">
          <span className="a25-mono a25-review__key">{issue.key}</span>
          <h1 tabIndex={-1} className="a25-page__title a25-review__title">
            {issue.summary}
          </h1>
          <StatusLozenge state={review.state} />
          <span className="a25-review__open">
            <Button appearance="subtle" onClick={() => onOpenIssue(issue.key)}>
              {copy.common.openInJira}
            </Button>
          </span>
        </div>
        <p className="a25-subtle a25-small">
          {[issue.projectName, issue.issueType, issue.status].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="a25-review__tabs" role="group" aria-label={copy.review.tabsLabel}>
        <button type="button" className="a25-segmented__item" aria-pressed={tab === 'text'} onClick={() => setTab('text')}>
          {copy.review.tabText}
        </button>
        <button type="button" className="a25-segmented__item" aria-pressed={tab === 'findings'} onClick={() => setTab('findings')}>
          {copy.review.tabFindings(review.findings.length)}
        </button>
      </div>

      <div className="a25-review__zones" data-tab={tab}>
        <section className="a25-zone a25-zone--document" aria-labelledby="a25-doc-title">
          <h2 id="a25-doc-title" className="a25-zone__title">
            {copy.review.documentLabel}
          </h2>
          <EvidenceDocument
            idPrefix="a25-rv"
            summary={doc.summary}
            blocks={doc.blocks}
            marks={[]}
            labels={{ document: copy.review.documentLabel, summary: copy.review.summaryHeading, description: copy.review.descriptionHeading, noDescription: copy.review.noDescription }}
          />
          {doc.truncated ? <p className="a25-subtle a25-small">{copy.review.truncated}</p> : null}
        </section>

        <section className="a25-zone a25-zone--margin" aria-labelledby="a25-margin-title">
          <h2 id="a25-margin-title" className="a25-zone__title">
            {copy.review.marginLabel}
          </h2>
          <EmptyState headingLevel={3} title={copy.review.marginNotScreenedTitle} body={copy.review.marginNotScreenedBody} />
        </section>

        <DecisionZone decision={decision} />
      </div>
    </div>
  );
}

export function Review({ issueKey }) {
  const { navigate } = useRouter();
  const resource = useResource(() => api.workspace(issueKey), [issueKey]);
  return <ReviewView resource={resource} onBack={() => navigate('/inbox')} onOpenIssue={openIssue} />;
}
