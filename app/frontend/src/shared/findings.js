// Presentation helpers for screening results: codes → copy. No decisions are derived here.
import { copy } from './copy/en.js';

const F = copy.findings;

export function findingLabel(f) {
  switch (f.kind) {
    case 'personal_data':
    case 'sensitive_data':
      return F.categories[f.signal] ?? f.signal;
    case 'tracking_profiling':
    case 'automated_decision':
    case 'risk_criterion':
      return F.criteria[f.signal] ?? f.signal;
    case 'external_sharing':
      return F.sharedWith(f.signal);
    case 'international_transfer':
      return F.transferTo(f.signal);
    case 'retention':
      return F.retention(f.signal);
    case 'no_personal_data_statement':
      return F.noPersonalData;
    case 'question':
      return f.question;
    case 'missing_info':
      return F.purposeMissing;
    default:
      return f.kind;
  }
}

export function findingDetail(f) {
  if (f.kind === 'external_sharing') return F.vendorDetail[f.detail] ?? null;
  if (f.kind === 'sensitive_data') return 'sensitive';
  return null;
}

/** Margin-note model for a finding with verified evidence. */
export function toNote(f) {
  return {
    id: f.id,
    index: f.index,
    label: findingLabel(f),
    detail: findingDetail(f),
    quote: f.excerpt,
    isNew: f.isNew,
    severity: f.severity,
    certainty: F.certainty[f.certainty] ?? null,
    explanation: F.explanation[f.kind] ?? null,
    provenance: f.provenance ? F.provenance[f.provenance] : null,
  };
}

export const toneOf = (f) => (f.kind === 'sensitive_data' ? 'sensitive' : f.kind === 'external_sharing' || f.kind === 'international_transfer' ? 'vendor' : 'default');

export function reasonText(reason) {
  const fn = copy.reasons[reason?.ruleId];
  return fn ? fn(reason.params ?? {}) : '';
}

/** The headline "why" for a result: the deciding rule (plus the fail-safe note if present). */
export function whyLine(result) {
  return (result?.reasons ?? []).map(reasonText).filter(Boolean).join(' ');
}

export function relativeTime(ms, now = Date.now()) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((now - Number(ms)) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Display ranges for EvidenceDocument from server-verified sources (summary = block -1). */
export function rangesFrom(findings) {
  return findings.filter((f) => f.source && f.index).map((f) => ({ id: f.id, blockIndex: f.source.blockIndex, start: f.source.start, end: f.source.end }));
}

/** Compact duration for "oldest waiting": minutes, hours or days. */
export function duration(ms) {
  if (!ms || ms < 0) return '–';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}
