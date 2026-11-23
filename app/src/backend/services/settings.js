// Administrator settings as an append-only, audited log (settings_events).
// The latest row per setting is its value; each change is one INSERT IGNORE at expectedSeq + 1
// with a unique request id, so a change and its audit record can never diverge, concurrent changes
// resolve to exactly one winner (CONFLICT for the other), and retries are idempotent.
// Callers must have verified that the actor is a Jira administrator.
import { AppError, ErrorCode } from '../lib/errors.js';

const REQUEST_ID = /^[A-Za-z0-9:_-]{8,100}$/;

export const SETTINGS = Object.freeze({
  'gate.mode': { values: ['monitor', 'enforce'], default: 'monitor' }, // safest non-blocking default
  'review.separation_of_duties': { values: ['on', 'off'], default: 'on' },
});

export function createSettingsService({ repos, log, clock = () => Date.now() }) {
  async function current(setting) {
    const def = SETTINGS[setting];
    if (!def) throw new AppError(ErrorCode.INVALID_INPUT);
    const row = await repos.settingsEvents.latest(setting);
    const value = row && def.values.includes(row.value) ? row.value : row ? null : def.default;
    return { setting, value, seq: row ? Number(row.seq) : 0, isDefault: !row, changedAt: row ? Number(row.changed_at) : null, changedBy: row?.changed_by ?? null };
  }

  async function change({ setting, value, actorId, expectedSeq, requestId, note }) {
    const def = SETTINGS[setting];
    if (!def || !def.values.includes(value)) throw new AppError(ErrorCode.INVALID_INPUT);
    const rid = String(requestId ?? '');
    if (!REQUEST_ID.test(rid)) throw new AppError(ErrorCode.INVALID_INPUT);
    const exp = Number(expectedSeq);
    if (!Number.isInteger(exp) || exp < 0 || exp > 1_000_000) throw new AppError(ErrorCode.INVALID_INPUT);
    if (!actorId) throw new AppError(ErrorCode.NOT_AUTHORISED);
    const cleanNote = note === undefined || note === null ? null : String(note).replace(/\s+/g, ' ').trim().slice(0, 300) || null;

    const prior = await repos.settingsEvents.byRequest(rid);
    if (prior) {
      if (prior.setting !== setting) throw new AppError(ErrorCode.INVALID_INPUT);
      return { status: 'unchanged', value: prior.value, seq: Number(prior.seq) };
    }
    const cur = await current(setting);
    if (cur.seq !== exp) throw new AppError(ErrorCode.CONFLICT);
    if (cur.value === value) return { status: 'unchanged', value, seq: cur.seq };
    const ok = await repos.settingsEvents.insert({ setting, seq: exp + 1, value, changedBy: actorId, changedAt: clock(), requestId: rid, note: cleanNote });
    if (!ok) {
      const dup = await repos.settingsEvents.byRequest(rid);
      if (dup) return { status: 'unchanged', value: dup.value, seq: Number(dup.seq) };
      throw new AppError(ErrorCode.CONFLICT);
    }
    log.info({ evt: 'settings.changed', reason: setting, outcome: value, count: exp + 1 });
    return { status: 'changed', value, seq: exp + 1 };
  }

  const history = async (setting, limit = 10) => (await repos.settingsEvents.history(setting, limit)).map((r) => ({ seq: Number(r.seq), value: r.value, changedBy: r.changed_by, changedAt: Number(r.changed_at), note: r.note ?? null }));

  return { current, change, history };
}
