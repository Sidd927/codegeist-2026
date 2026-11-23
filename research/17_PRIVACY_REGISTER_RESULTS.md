# 17 — Spike F: Confluence Privacy Register Results

**Date:** 2026-11-22 · **Site:** <dev-site>.atlassian.net · **Space:** A25 (id 3473411) · **Page:** "Article25 Privacy Register (SPIKE)" id **3538945** · **Data:** synthetic only
**Code:** `spikes/article25-core-spike/src/register.js`

## Verdict
**VERIFIED WITH LIMITATIONS.** Complete create→update cycles work, with versioning, decision idempotency, content-hash no-op publishing, adoption of an existing page, and manual-edit detection. Correctness depends on keeping register state in **one** storage (multi-app compatibility; doc 13 F-B3). Two design gaps were found: manual edits can be overwritten, and drift goes unnoticed until the next change.

## 1. Design under test
- **Source of truth:** structured register in Forge KVS (`register:entries` keyed by work item → `{activity, status, conditions, categories, vendors, decisionId, decidedBy, updatedAt, history[]}`), plus page pointer `register:page` `{pageId, lastVersion, contentHash}`.
- **Statuses:** `PROPOSED`, `APPROVED`, `APPROVED_WITH_CONDITIONS`, `REJECTED`, `SUPERSEDED` (supersede sets the old entry's status and `supersededBy`).
- **Idempotency:** per-decision marker `register:decision:<decisionId>`. Re-applying the same decision is a no-op.
- **Human-readable view:** a generated Confluence page (storage-format table), with links to Jira work items, decision IDs and timestamps. Publishing skips when the content hash is unchanged. Updates use `version = current + 1`. A 409 refetches and retries once. Version drift = manual edit.
- **Adoption:** if creating the page fails with a duplicate title, find the page by exact title in the space and adopt it.

## 2. Test log (actual results, from `forge logs`)
| # | Step | Context | Result |
|---|---|---|---|
| F1 | Reviewer approves AS-2 *with conditions* ("Aggregate location to city level", "30-day retention for raw events") → `applyDecision` | Jira issue panel (Jira installation) | `applied: true`, decisionId `AS-2:APPROVED_WITH_CONDITIONS:1795323749529`, review v4, mirror 200 |
| F2 | Publish register | **Confluence** global page (separate Confluence installation) | `created: true`, page 3538945 v1, **but body had only the header row**: the Confluence installation's storage did not contain F1. (Root cause in doc 13 F-B1.) |
| F3 | Publish again, no change | Confluence | `published:false, reason:"no content change (idempotent)"` ✅ |
| F4 | Replay F1's decisionId | Confluence | **Applied again (not deduplicated).** Same root cause: marker stored in the other installation. |
| F5 | Publish from the Jira installation | Jira global page | **400** "A page with this title already exists" (Jira installation had no page pointer) |
| F6 | Added "adopt existing page" logic; publish again | Jira | `adopted:{pageId:3538945, versionAtAdoption:1}`, **v1 → v2**, AS-2 row present ✅ |
| F7 | Replay F1's decisionId | Jira (same installation) | `applied:false, "duplicate decisionId (idempotent no-op)"` ✅ |
| F8 | New decision `SPIKE-F-NEW-1` → publish | Jira | applied; **v2 → v3** ✅ |
| F9 | Replay `SPIKE-F-NEW-1` → publish | Jira | no-op; "no content change" ✅ |
| F10 | User manually edits the page (v4) → publish with no register change | Jira | "no content change". **The manual edit went undetected** (hash short-circuit) ⚠️ |
| F11 | New decision `SPIKE-F-NEW-2` → publish | Jira | `manualEditDetected:true, fromVersion:4, toVersion:5`. **The human edit was overwritten** ⚠️ |
| F12 | After uninstall + reinstall in **multiple-app mode**: new decision from Jira → read + replay + publish from **Confluence** | Single shared installation | Confluence sees the Jira-written entry ✅. Replay deduplicated ✅. Publish re-adopted the page, **v5 → v6** ✅. Prior entries were **gone** (storage wiped on uninstall). |

## 3. Requirements checklist (brief §9)
| Requirement | Result |
|---|---|
| Page creation | ✅ F2 |
| Page updating | ✅ F6, F8, F11, F12 |
| Version handling | ✅ v1→v6 with explicit version numbers and messages |
| Idempotency (no duplicate entries on retry) | ✅ within one storage (F7, F9, F12). ❌ across separate installations (F4). Fixed by multi-app mode. |
| Concurrent updates | ⚠️ **UNVERIFIED.** 409 retry is coded but no concurrent writers were tested. Register writes are read-modify-write of one KVS key (`register:entries`), so lost updates are possible under concurrency. Use `kvs.transact` with conditions, per-entry keys, or Forge SQL. |
| Permission failures | ✅ observed 403 "app not installed" when Confluence install missing (doc 13 F-B2). ✅ 400 duplicate title handled by adoption. Not tested: a space where the app lacks write permission. |
| Audit history | ✅ per-entry `history[]` + Confluence page version history. ⚠️ KVS history lost on uninstall (F12), so the Confluence page versions are the only surviving trail. |
| Traceability to Jira | ✅ rows link to `/browse/<key>` with decisionId and decidedBy |
| Distinguishes proposed / approved / approved-with-conditions / rejected / superseded | ✅ statuses implemented and rendered. ⚠️ `SUPERSEDED` path coded but **not exercised** in a test. |

## 4. Data-model recommendation
**Combination: structured data model (source of truth) + generated Confluence page (view and durable trail).**
- Structured store (Forge SQL recommended for the product): `processing_activity`, `decision` (immutable, append-only, decisionId unique), `register_change`, `page_publication`. Use unique constraints, or KVS transactions, for idempotency.
- Confluence page = **read-only generated view**, with a banner "Generated by Article25 — edit in the app". On publish, **always compare the page version** (cheap GET) even when the content hash is unchanged. On manual edit: **do not overwrite**. Mark "publish blocked: manual edits detected", show a diff, and let the DPO choose to import or overwrite.
- **Durability:** because uninstall wipes app storage, each decision should also be written to a customer-owned record (Confluence page history and/or a Jira comment on the work item), and the app should support "rebuild register from Confluence/Jira" after reinstall.
- **Page identity:** store the page ID and also tag the page (content property or label), so it can be re-adopted without relying on titles.

## 5. Open items
- Concurrency test (two simultaneous decisions).
- Supersession test.
- Large-register page size (Confluence page body limits, table rendering): untested beyond a few rows.
- Publishing as app vs as user: the page author is the app account, which may matter for customers' content-governance policies.
