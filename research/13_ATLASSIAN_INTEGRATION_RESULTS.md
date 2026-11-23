# 13 — Spike B: Jira & Confluence Integration Results

**Date:** 2026-11-22 · **Site:** one-atlas-psvy.atlassian.net (Codegeist demo site) · **Data:** synthetic only
**App:** `article25-core-spike` (`a6a87625-08ce-466e-9322-016c9af89fa8`), code in `spikes/article25-core-spike/`
**Evidence method:** each resolver wraps its result in a `console.log({evidence: <name>, ms, payload, out})` line, captured with `forge logs -e development`. Browser checks used the signed-in user's own session (Jira/Confluence REST from the page) for comparison and for setup steps.

**Overall verdict:** **VERIFIED WITH LIMITATIONS.** All required Jira and Confluence reads and writes work. Two architecture-level limitations were found (§4): per-installation storage, and Confluence access requiring a Confluence installation. Both are resolved by Forge **multiple-app compatibility** (Preview).

---

## 1. Setup performed (synthetic)
| Item | Value |
|---|---|
| Jira test issue | **AS-2** "Implement a customer analytics dashboard", description = the brief's sentence verbatim + "SYNTHETIC TEST DATA", label `article25-synthetic`, one synthetic comment. Created via REST as the user (Jira's Create dialog is broken on this project; see doc 12 A3). |
| Earlier issue | AS-1 "Implement customer health profile feature" (synthetic) |
| Company-managed project | **A25C** "Article25 Company Sandbox" (`style: classic`), created via `POST /rest/api/3/project` with the company-managed Kanban template; issue **A25C-1** (synthetic courier-tracking task) |
| Confluence space | **A25** "Article25 Sandbox" (id `3473411`), created via `POST /wiki/api/v2/spaces` as the user to keep test pages away from seeded HR/onboarding content |
| Reviewer group | `article25-reviewers` (created via REST; user added) |

## 2. Scopes: what lint actually required
The first deploy **failed lint**. Confluence v2 endpoints need **granular** scopes; the classic `read/write:confluence-content` scopes do not cover them.
```
POST /pages requires "write:page:confluence"
GET /pages/{id} requires "read:page:confluence"
GET /spaces requires "read:space:confluence"
```
Final minimal scope set (all used):
| Scope | Why |
|---|---|
| `read:jira-work` | read issues/comments; required for lambda validators |
| `write:jira-work` | issue property, comment, create review task, issue link |
| `read:jira-user` | reviewer-group membership check (`GET /user/groups`) |
| `storage:app` | Forge KVS |
| `search:confluence` | CQL search (v1 `/wiki/rest/api/search`) |
| `read:page:confluence` / `write:page:confluence` | v2 page read/create/update |
| `read:space:confluence` | v2 space list |

## 3. Results

### 3.1 Jira
| # | Capability | Result | Evidence (abridged) |
|---|---|---|---|
| J1 | Event trigger on issue create | ✅ | `{"spike":"B-trigger","key":"AS-2","outcome":"REVIEW_REQUIRED","ms":805}`: fetched as app, screened by the deterministic baseline, stored minimal result in KVS |
| J2 | Retrieve issue (as user): summary, description (ADF → text), labels, type, status, project, comments | ✅ 577 ms | `summary, descriptionText, labels:["article25-synthetic"], issueType:"Task", status:"To Do", project:{key:"AS",simplified:true}, commentCount:1, firstCommentExcerpt:"Synthetic comment: marketing wants weekly exports…"` |
| J3 | Data processed by backend | ✅ | live screening == stored trigger screening; same content fingerprint `a77c56190f135262` |
| J4 | Add comment (as app) | ✅ 201, 616 ms | comment author = app account `article25-core-spike` (`accountType: app`) |
| J5 | Create review task + link | ✅ (side effect) | **AS-3** "Privacy review: AS-2 (Article25 spike)", reporter = app, link `Relates` AS-2↔AS-3. **But** the resolver threw *after* the side effects, due to a bug in my response helper (`POST /issueLink` returns 201 with an empty body; the body was read twice). Fixed. **Lesson:** the UI reported an error although the task had been created, so a naive retry would duplicate it. Task creation must be idempotent (store `reviewTaskKey` per screening). |
| J6 | Update issue with review status (issue entity property) | ✅ 201/200 | `PUT /issue/{key}/properties/article25-review` as app (mirror only; see doc 14 for why it must not be authoritative) |
| J7 | Identify project & work-item type | ✅ | from issue fields and `/project/search` (style `next-gen` vs `classic`) |
| J8 | Permission check | ✅ | `GET /mypermissions` (user) and `GET /user/groups?accountId=` (app, for reviewer authorisation) |
| J9 | JQL | ⚠️ | Project key `AS` is a reserved JQL word, so `project = AS` returns 400. Keys must be quoted. |

### 3.2 Confluence
| # | Capability | Result | Evidence |
|---|---|---|---|
| C1 | List spaces (v2) | ✅ 541 ms | 10 seeded spaces (EO, HR, TK, ITS, MSD, ITO, S, ONEA, LEGAL, SECOPS) |
| C2 | Create page (v2, storage format) as app | ✅ 902 ms | page **3506177** "Article25 Spike - Data Use Policy (SYNTHETIC)", version 1, author = app account |
| C3 | Search (CQL) | ✅ with caveat | as app: found immediately. As user, ~10 s after creation: **empty**. Checked again from the user's browser shortly after: found. **Search-index lag**, not permissions. The product must store page IDs, not rediscover them by search. |
| C4 | Retrieve page + extract text | ✅ 275 ms | storage → text; sections "Approved data uses" / "Prohibited data uses" extracted separately |
| C5 | Identify policy/processing docs | ✅ (basic) | title CQL + section headings. Classifying arbitrary real policies is **UNVERIFIED** (needs AI or a convention such as labels/templates). |
| C6 | Update page with version history | ✅ | register page 3538945 v1→v2→v3→v5→v6 via `PUT` with `version.number = current+1` (doc 17) |
| C7 | Traceability to Jira | ✅ | register rows link to `/browse/<key>`; decision IDs recorded |

### 3.3 Latency observed (frontend-measured or log `ms`)
Jira read 577–779 ms · comment 616 ms · create+link ~2.2 s · Confluence list 0.5–2.1 s · page create 0.9–1.8 s · page update 1.2–1.9 s · panel resolver round trip 2–2.6 s (doc 12).

## 4. Architecture-level findings

### F-B1: Forge storage is per installation; Jira and Confluence installs of one app do NOT share it (VERIFIED)
- Installed normally, the app had **two installations** (Jira `76e52bbc…`, Confluence `c70e7eb6…`).
- An approval written from the Jira issue panel was **invisible** to the Confluence global page. The register page published from Confluence came out **empty** (header row only); evidence via `GET /wiki/api/v2/pages/3538945` body.
- The same `getRegister` resolver from the Jira global page showed the AS-2 entry, with `page: null`.

### F-B2: Calling Confluence from the Jira installation requires the app to be installed in Confluence (VERIFIED)
- After uninstalling only the Confluence installation, the Jira installation's Confluence calls returned **`403 "The app is not installed on this instance"`** (both `listSpaces` and page publish).
- After reinstalling in Confluence, the calls succeeded again.

### F-B3: Multiple-app compatibility resolves both (VERIFIED WITH LIMITATIONS; Preview)
Manifest:
```yaml
app:
  compatibility:
    jira: { required: true }
    confluence: { required: false }
```
Procedure used: uninstall **all** installations (the required app can only be set with no installations; [docs](https://developer.atlassian.com/platform/forge/app-compatibility/)) → `forge deploy` → `forge install --product jira` → `forge install --product confluence`.
Results:
- `forge install list` shows **one** installation `d0a43ce8…` "Jira (required)".
- An entry written from the **Jira** page was visible from the **Confluence** page. Replaying its decisionId from Confluence was **deduplicated**. **Shared storage confirmed.**
- Confluence calls from the Jira page worked.
- Existing workflow validator rules continued to invoke the app after reinstall.

Limitations (from the docs; not tested): required/optional links are only supported between Jira and Confluence. Apps with a required app can be **listed on the Marketplace only as paid apps**. Single site only. The required app can't be changed once installations exist.

### F-B4: Uninstall deletes app data (OBSERVED)
After the uninstall/reinstall cycle, KVS was empty (`entries: {}`): all review decisions, markers and the page pointer were gone. Consequences:
1. **App storage alone is not a durable audit record.** Decisions must be mirrored somewhere durable that the customer owns (e.g. Confluence register page history, Jira comments/properties) and exportable.
2. **Previously approved work becomes blocked again** after a reinstall (A25C-1 was blocked with "no privacy review recorded"); see doc 14.

## 5. Acceptance criteria (brief §5)
| Criterion | Status |
|---|---|
| Jira issue retrieval works | **VERIFIED** |
| Confluence document retrieval works | **VERIFIED** |
| Permissions are correct | **VERIFIED** (lint-validated minimal scopes; user vs app context exercised) |
| Data can be processed by our backend | **VERIFIED** (trigger + resolver screening) |
| Relevant records can be linked | **VERIFIED** (issue link AS-2↔AS-3; register rows link to issues) |
| Appropriate Jira updates are possible | **VERIFIED** (property, comment, task) |
| Confluence content can be created or updated | **VERIFIED** (create v1 and versioned updates) |
| Subscription/permission limitations | Documented: granular scopes, search lag, per-installation storage, Confluence-install requirement, reserved JQL keys, broken Create dialog on demo project |

## 6. Remaining uncertainty
- Multiple-app compatibility is **Preview**, and only this demo site has been tested. Judge installation flow with "Sharing" links for a Jira-required, Confluence-optional app is **UNVERIFIED** (whether judges get prompted to connect Confluence).
- Behaviour with users who lack Confluence access (asUser calls) is untested.
