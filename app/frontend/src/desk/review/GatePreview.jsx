// "Protected transitions" in the review workspace: what the Article25 gate would do with this work
// item right now (computed by the server with the same policy as the validator), and the gate's
// recent checks for it. Monitoring is always labelled as not blocking.
import Lozenge from '@atlaskit/lozenge';
import { copy } from '../../shared/copy/en.js';
import { ModeBadge, RecentChecks } from '../settings/GateSettings.jsx';

const G = copy.gate;

export function GatePreview({ gate }) {
  if (!gate) return null;
  const monitoring = gate.mode === 'monitor';
  const state = gate.allow ? 'allow' : 'block';
  return (
    <section className="a25-gatepreview" aria-labelledby="a25-gatepreview-title">
      <div className="a25-gatepreview__head">
        <h3 id="a25-gatepreview-title" className="a25-zone__subtitle">
          {G.previewTitle}
        </h3>
        <ModeBadge mode={gate.mode} />
      </div>
      <p className="a25-gatepreview__verdict">
        <Lozenge appearance={gate.allow ? 'success' : monitoring ? 'moved' : 'removed'} isBold={!gate.allow && !monitoring}>
          {monitoring ? G.previewMonitor[state] : gate.mode === 'enforce' ? G.previewNow[state] : G.previewNow.block}
        </Lozenge>
      </p>
      <p className="a25-small">{gate.message}</p>
      <p className="a25-subtlest a25-small">{G.previewHint}</p>
      <h4 className="a25-gatepreview__sub a25-small a25-subtle">{G.recentTitle}</h4>
      <RecentChecks rows={gate.recent} showItem={false} emptyText={G.recentNone} />
    </section>
  );
}
