// Pure presentation of screening state for the UI. Converts storage rows into the display contract
// and decides the DISPLAY state (never a decision). Personal identifiers are never included.
import { pipelineVersion } from '../../core/analyse.js';

const PENDING = new Set(['QUEUED', 'SCREENING']);

/**
 * @param {object|null} row        work_items row
 * @param {object|null} screening  screenings row (parsed)
 * @param {string|null} currentFp  fingerprint of the text the viewer sees now (null if unknown)
 */
export function presentScreening(row, screening, currentFp = null) {
  if (!row) return { state: 'NOT_SCREENED', result: null };
  const result = screening ? presentResult(screening) : null;
  if (PENDING.has(row.state)) return { state: 'SCREENING', since: row.updated_at, result };
  if (row.state === 'SCREENING_FAILED') return { state: 'SCREENING_FAILED', errorCode: row.last_error ?? null, result };
  if (!result) return { state: 'NOT_SCREENED', result: null };
  if (currentFp && row.screened_fp && currentFp !== row.screened_fp) return { state: 'RESCREEN_REQUIRED', reason: 'content_changed', result };
  // Version-aware: a result produced by older rules/extractor code is out of date even for identical text.
  if (result.pipelineVersion && result.pipelineVersion !== pipelineVersion(result.mode, result.mode === 'ai' ? result.model : null)) return { state: 'RESCREEN_REQUIRED', reason: 'pipeline_changed', result };
  return { state: result.outcome, result };
}

export function presentResult(s) {
  const r = s.result ?? {};
  return {
    screeningId: s.screening_id ?? s.screeningId,
    outcome: s.outcome,
    mode: s.mode,
    model: s.mode === 'ai' ? s.model ?? null : null,
    aiStatus: s.ai_status ?? s.aiStatus ?? null,
    checkedAt: s.created_at ?? s.createdAt,
    rulesVersion: r.rulesVersion,
    pipelineVersion: s.pipeline_version ?? s.pipelineVersion,
    reasons: (r.reasons ?? []).map((x) => ({ ruleId: x.ruleId, outcome: x.outcome, params: x.params ?? {} })),
    trace: r.trace ?? [],
    criteria: r.criteria ?? [],
    // Purposes are shown only with a verified verbatim quote; the AI's own wording is labelled as such.
    purposes: (r.purposes ?? []).filter((p) => p?.evidence?.excerpt).map((p) => ({ excerpt: p.evidence.excerpt, description: p.provenance === 'ai' ? p.description ?? null : null, provenance: p.provenance ?? null, source: p.evidence.source ?? null })),
    truncated: r.truncated === true,
    quality: { rejected: s.quality?.rejected ?? 0, dropped: s.quality?.dropped ?? 0 },
    findings: (r.findings ?? []).map((f) => ({
      id: f.id,
      index: f.index,
      kind: f.kind,
      signal: f.signal,
      certainty: f.certainty,
      severity: f.severity,
      isNew: f.isNew === true,
      detail: f.detail ?? null,
      question: f.question ?? null,
      provenance: f.provenance ?? null,
      excerpt: f.evidence?.excerpt ?? null,
      source: f.evidence?.source ?? null,
    })),
  };
}
