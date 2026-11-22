// Jira issue panel: the primary integration surface (UX_DESIGN_SPEC §3.1).
// Renders the backend's view of this work item. The issue identity comes from the Forge context on
// the server; this component never decides a privacy state.
import { useEffect, useState } from 'react';
import Button from '@atlaskit/button/new';
import { api } from '../shared/api.js';
import { useResource } from '../shared/useResource.js';
import { getContext, openDesk, reportFirstContent } from '../shared/platform.js';
import { Skeleton, ErrorState, StatusHeader } from '../shared/components/States.jsx';
import { copy } from '../shared/copy/en.js';

export function PanelView({ resource, onOpenDesk }) {
  const { status, data, error, reload } = resource;

  useEffect(() => {
    if (status !== 'loading') reportFirstContent('panel');
  }, [status]);

  if (status === 'loading') return <Skeleton lines={3} />;
  if (status === 'error') return <ErrorState error={error} onRetry={reload} title={copy.panel.errorBody} />;
  if (data.access === 'denied') {
    return <p className="a25-panel__denied a25-subtle">{copy.panel.denied}</p>;
  }

  const checksOn = data.features?.screening === true;
  return (
    <section className="a25-panel" aria-label={copy.panel.title}>
      <StatusHeader state={data.review.state} why={copy.panel.notScreenedWhy}>
        {!checksOn ? <p className="a25-subtle a25-small">{copy.panel.checksOff}</p> : null}
      </StatusHeader>
      <div className="a25-panel__actions">
        {onOpenDesk ? (
          <Button appearance="default" onClick={() => onOpenDesk(data.issue.key)}>
            {copy.common.openInDesk}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export default function PanelApp() {
  const resource = useResource(() => api.panelState(), []);
  const [context, setContext] = useState(null);

  useEffect(() => {
    getContext().then(setContext);
  }, []);

  const onOpenDesk = context ? (key) => openDesk(context, `/review/${encodeURIComponent(key)}`) : null;
  return <PanelView resource={resource} onOpenDesk={onOpenDesk} />;
}
