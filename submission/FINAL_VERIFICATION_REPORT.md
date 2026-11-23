# Final verification report (final release pass, 23 Nov 2026)

**Scope:** everything verifiable without your approval. Production, the sharing link, YouTube and Devpost are untouched.

**Evidence rule:**
- **Live** means done by hand on the development site or in the isolated `recovery` environment, with synthetic data.
- **Automated** means tests only.
- Nothing is claimed beyond its evidence.

## 1. Build and checks (run at the final commit of this pass)
| Check | Result |
|---|---|
| `npm run check` (local, Node 24) | ✅ Exit 0 |
| Lint, copy lint (35 files), **permission-freeze guard** (new) | ✅ |
| Backend tests | ✅ 204 / 204 (183 at the start of the pass; +4 AI cap and spend; +17 approval validity on 24 Nov) |
| UI tests (jsdom + axe) | ✅ 89 / 89 (87 at the start; +1 spend line; +1 invalidation reason) |
| Real-browser contrast (Chromium, light and dark ADS tokens) | ✅ 24 / 24 |
| Bundles (gzip, initial) | ✅ Panel 81.6 KB (budget 200); desk 101.5 KB (budget 400) |
| `forge lint` | ✅ No issues |
| `npm audit` | ⚠️ 7 moderate, all `glob`/`minimatch` pulled in by `@forge/manifest` (build-time tooling, not reachable with user input). The offered fix downgrades `@forge/sql` (breaking), so not applied. **Accepted risk** |
| GitHub Actions on the latest head `f22baaf` (24 Nov) | ✅ Both runs succeeded (§8): 204 backend, 89 UI, 24 contrast |

## 2. AI safeguards (verified in code and tests)
| Safeguard | Where | Evidence | Status |
|---|---|---|---|
| Hard spend cap, server-side | `screening.js extract()`: `spend.reserve()` is one conditional `UPDATE … WHERE micros + ? <= cap` in SQL, before the call; settled to the actual cost after | Tests: cap blocks the call; reserve-then-settle; **20 parallel screenings never reserve past the cap** (new) | ✅ |
| Reservation is a true upper bound | `pricing.js estimateInputTokens` | **Fixed:** it assumed 3 characters per token, so unusual text could overshoot the cap slightly. Now one token per character. Test added | ✅ Fixed |
| No cap → no AI | `screening.js` (`!settings.aiSpendCapMicros` → rules) | Test: AI disabled without a cap even if switched on | ✅ |
| Settings must not claim AI is on when it can't run | `desk.js aiActive` | **Fixed:** without a cap, Settings said "On". Now it needs the switch, availability **and** a cap. Test added | ✅ Fixed |
| Daily call budget (300 planned) | `usage.reserveAiCall`: conditional `UPDATE … WHERE llm_calls < budget` | Tests: budget 0 → no call; **12 parallel jobs, budget 4 → exactly 4 calls** (new) | ✅ |
| Fallback is labelled, with the right reason | `copy.screening.aiStatus` | **Fixed:** a reached cap was shown as "Today's AI check budget is used up". It now has its own status: *The AI spending limit for this installation is reached.* | ✅ Fixed |
| Admins can see spend | Settings → Privacy checks → *AI spending limit* ("$x of $5.00 used") | UI test (new) | ✅ New |
| AI cannot approve | Human decisions need a reviewer (`decide`, server-side). System decisions are only *invalidated* or *carried over*, computed deterministically from signal sets | Code review; review tests | ✅ |
| AI cannot remove findings | `analyse.js`: the rules floor always runs; AI signals are merged on top | Pipeline tests ("never CLEAR without AI" etc.) | ✅ |
| Grounded evidence | `verifySignals`: every AI quote must match the text verbatim, or it is discarded; excerpts are 120 characters or fewer | Tests; M2 live: 0 quotes rejected | ✅ |
| No content in logs | `logger.js` allow-list; no `console.*` in app code; gate logs key names only | Logger tests; a repository scan | ✅ |
| Prompt injection | The ticket text is data in `<ITEM>`; the output must be a schema-valid tool call; the rules floor still applies | Pipeline tests (malformed output → rules) | ✅ |

**Approval validity across check modes (resolved 24 Nov):** an approval granted on an AI-assisted check could be carried over by a rule-based re-check of edited text (AI unavailable, or over a limit). This was confirmed as a genuine defect and fixed: a carry-over now needs a re-check at least as thorough as the approval's basis, otherwise the approval is invalidated and needs a human. Details, code references and 18 new tests: [`product/APPROVAL_VALIDITY_INVESTIGATION.md`](../product/APPROVAL_VALIDITY_INVESTIGATION.md).

## 3. Security audit (one focused pass)
| Area | Finding | Status |
|---|---|---|
| Resolver authorisation | Every admin resolver calls `requireAdmin()` server-side, failing closed if the check errors. Reviewer resolvers check the reviewer group. The actor always comes from the Forge context, never the payload | ✅ |
| **Audit of trust changes** | `adoptPreviousKey` (adopting a lost key) recorded **no actor** | ✅ **Fixed**: now a `key_adopted` record event with the administrator; test added |
| As-user access | The workspace, panel and Inbox read Jira as the user before showing stored data; the Inbox and register filter to visible issues | ✅ |
| SQL | All values are parameterised. Dynamic parts are `LIMIT` integers (`Number(x) \| 0`), placeholder lists, or constant table and column names | ✅ |
| Jira paths | The `route` template everywhere, except `usersBulk`: ids are regex-validated and URL-encoded first | ✅ |
| Rendering | No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in app code | ✅ |
| Egress and content | None in the manifest; the guard enforces it | ✅ |
| Secrets in the repository | No keys, tokens, site names or environment IDs added (diff scanned before push) | ✅ |
| Dependencies | See `npm audit` above | ⚠️ Accepted |

## 4. Permissions
See [`product/PERMISSIONS_MATRIX.md`](../product/PERMISSIONS_MATRIX.md).
- **Recommendation:** freeze the three read scopes, no egress and the `llm` module on 4 Dec.
- The new CI guard fails on any change.

## 5. Privacy policy accuracy (draft vs code)
- Every data row and retention period matches the schema and code: gate checks purged after 30 days, transfers after 1 hour, screenings removed with the work item.
- **Added:**
  - the work-item tracking row;
  - the usage and spend counters (no text, no account IDs);
  - key adoption in record activity;
  - the AI limits ([CONFIRM] the published values).
- **Still open (yours):**
  - the contact email;
  - the publication date;
  - the [REVIEW] items (controller/processor role, data residency, Forge LLM terms, rights wording).

## 6. End-to-end and failure states: live vs automated
The full table is in [`docs/CLEAN_SITE_REHEARSAL.md`](../docs/CLEAN_SITE_REHEARSAL.md) Part 0.

| Status | Scenarios |
|---|---|
| **Live** | Install and self-heal; Get started; rules-mode screening; four decisions; separation of duties (one account); gate in both modes and both project types; invalidation and carry-over; verify, export, offline verification, tamper; uninstall → restore → re-check |
| **Automated only** | AI-assisted screening (development AI stays off by your rule); the spending cap and daily budget, including concurrency; killed and large restores; key rotation and loss |
| **Not tested** | Production; the sharing link; a clean second site; a second human reviewer; the judging period |

## 7. Video
| Check | Result |
|---|---|
| Duration, format | 3:59.3 (under 5:00); 1920×1080, 30 fps; H.264 + AAC 48 kHz stereo; 53.3 MB |
| Integrity | Full decode (`ffmpeg -f null`): **0 errors** |
| Loudness | −15.0 LUFS integrated; −1.1 dBTP (docs corrected from −1.3) |
| Captions | Rebuilt: 56 cues of at most two 42-character lines; written spellings (SMS, AI-assisted, rule-based) |
| Thumbnail | 1280×720 PNG, 343 KB, from the film's palette and type |
| Rights | `submission/video/VIDEO_ASSETS_AND_LICENCES.md`: no music; invented names; synthetic voice (Apache-2.0); Pixabay effects (set-level licence, per-file provenance not recorded). The Jira frame checked: no user name visible |
| **Listening** | ⛔ **Not heard by a person.** Only measured. You must listen before publishing |

## 8. Git and CI
**Commits (all authored by Siddhant Patil, no trailers):**

| Commit | Change |
|---|---|
| `78f638e` | fix(ai): spending-limit label, upper-bound reservation, spend shown to admins |
| `c66aab8` | fix(record): key adoption attributed to the administrator |
| `62e8421` | chore(release): permission freeze guard and permissions matrix |
| `0f600f5` | docs(release): judge guide, runbook, rehearsal, privacy policy |
| `821b277` | video: captions, YouTube kit, thumbnail, licence record |
| `e4fb097` | docs(devpost): every field, and the checklist |
| `ec577dc` | docs(release): readiness and README; the guard made lint-clean |
| `ef87c66` | docs(release): final verification report, handover, progress checklist |
| `5a3dc54` | fix(review): never carry an AI-assisted approval over on a rule-based re-check (24 Nov) |
| `f22baaf` | docs: approval-validity investigation; reports and counts updated (24 Nov) |

**Push:** `ff8c2e5..f22baaf` to `milestone-m5-record` (normal pushes).

**CI** (read from GitHub after the runs finished): both runs on the latest head `f22baaf` concluded **success**.
- push run `45252793765`;
- PR #7 run `45252805791`.

Every step executed: checkout, `npm ci`, lint (incl. *Permission freeze: 3 scopes and 9 module types match the frozen set.*), tests (*pass 204, fail 0*), test:ui (89 passed), the Chromium install, test:contrast (24 passed) and build:ui. (Earlier heads `ec577dc` and `ef87c66` were also green.)
