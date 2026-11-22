// Display vocabulary for review states (INFORMATION_ARCHITECTURE §6). Presentation only: the
// frontend never derives a state or a gate effect itself; it renders what the backend returns.
import { copy } from './copy/en.js';

const APPEARANCE = {
  OUT_OF_SCOPE: 'default',
  NOT_SCREENED: 'default',
  SCREENING: 'inprogress',
  SCREENING_FAILED: 'removed',
  CLEAR: 'success',
  INVENTORY_UPDATE: 'default',
  NEEDS_INFO: 'moved',
  REVIEW_REQUIRED: 'moved',
  DPIA_LIKELY: 'removed',
  APPROVED: 'success',
  APPROVED_WITH_CONDITIONS: 'success',
  REJECTED: 'removed',
  RESCREEN_REQUIRED: 'moved',
  AWAITING_SCREENING: 'inprogress',
  AWAITING_REVIEW: 'moved',
  NOT_REQUIRED: 'default',
  NEEDS_MORE_INFORMATION: 'moved',
  APPROVAL_STALE: 'removed',
  PENDING_RECHECK: 'inprogress',
  CHANGED_SINCE_DECISION: 'moved',
};

export function stateDisplay(state) {
  const known = Object.prototype.hasOwnProperty.call(APPEARANCE, state);
  return {
    label: known ? copy.states[state] : copy.states.NOT_SCREENED,
    appearance: known ? APPEARANCE[state] : 'default',
    bold: state === 'DPIA_LIKELY' || state === 'APPROVAL_STALE',
  };
}
