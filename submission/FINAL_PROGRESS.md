# Final release: progress checklist (persistent)

**Purpose:** so the final-release work can resume without repeating finished steps. Update this file as each step completes.

**Mission:** final release, judge readiness and the Codegeist 2026 submission. **Deadline:** 22 Dec 2026, 12:00 PT. **Permission freeze:** 4 Dec 2026.

**Key:**
- `[x]` done and verified;
- `[~]` done, but needs a human step;
- `[ ]` not done;
- `[B]` blocked (the blocker is named).

## 0. Baseline (23 Nov 2026)
**Repository**
- Branch `milestone-m5-record`, at `ff8c2e5` at the start of the mission; working tree clean; in sync with origin.

**Pull requests**
- PR stack: #1 → #2 → #3 → #4 → #5 → #6 → #7.
- All seven are open **drafts**, with no reviews and no comments.
- CI on #7 head `ff8c2e5` passed (two runs).

**Environments**

| Environment | State |
|---|---|
| Development | Installed, AI **off**, gate in **Monitoring** |
| Production | Deployed once on 22 Nov 2026, **no installations, no variables** (no signing key, AI unset) |
| `recovery` | Custom development environment, empty, used for the isolated recovery test |

**Film**
- `submission/video/build/article25-demo-final.mp4` exists locally (git-ignored), 3:59.

**Status by area**

| Area | Status |
|---|---|
| **Complete** | Product loop (Detect → Review → Decide → Enforce → Record → Verify/Recover); P1 experience; the final readiness audit (11 fixes); production runbook; AI decision ($5 per installation, 300 checks/day); privacy policy draft; Devpost draft; demo film |
| **Incomplete** | The judge installation link; a clean-site rehearsal on a second site; a public YouTube upload; legal details in the privacy policy |
| **Broken** | Nothing known |
| **Risky** | Rules-only recall is low (the M2 held-out test missed 4 sensitive items), so the judging build depends on AI being configured in production. The production signing key does not exist yet. Production has never been installed |
| **Manual (needs you)** | Production key; production AI variables; deploy; Sharing link; privacy policy contact and legal review; listening to the film; YouTube upload; Devpost submit; merge |
| **Autonomous (this pass)** | Verifying AI safeguards; security audit; permission matrix; video files; Devpost copy; docs consistency; checks; commits; push; handover |

## 1. Checklist
| # | Task | Status | Evidence / blocker |
|---|---|---|---|
| 1 | Baseline and this checklist | [x] | This file §0 |
| 2 | AI safeguards verified in code and tests (cap, daily budget, concurrency, no AI approvals, grounding, labels, logs) | [x] | 3 fixes + 4 tests (`78f638e`); verification report §2 |
| 3 | End-to-end and failure states: live vs automated | [x] | `docs/CLEAN_SITE_REHEARSAL.md` Part 0; report §6 |
| 4 | Security audit pass | [x] | 1 fix (`c66aab8`); report §3; npm audit accepted |
| 5 | Permissions matrix and freeze recommendation | [~] | `product/PERMISSIONS_MATRIX.md`; CI guard. **You approve the freeze** |
| 6 | Privacy policy accuracy against the code | [~] | Rows added (`0f600f5`). **You: contact, review, publish** |
| 7 | Judge install route (production commands, signing key, Sharing, troubleshooting) | [B] | Docs done. **Blocked on your approval**: key, deploy, Sharing link |
| 8 | Clean-site rehearsal document (live / automated / not tested) | [B] | Document done. **Real run blocked**: needs a second site and the link |
| 9 | Video: technical checks, captions, thumbnail, YouTube kit, assets record, upload checklist | [~] | `821b277`. **You: listen, then upload** |
| 10 | Devpost: every field | [~] | `e4fb097`. **You: link, video URL, policy URL, submit** |
| 11 | Docs consistency and the final verification report | [x] | `submission/FINAL_VERIFICATION_REPORT.md` |
| 12 | `npm run check`, `forge lint`, `npm audit` | [x] | All pass; audit: 7 moderate, transitive, accepted |
| 13 | Commit, push, verify CI, merge-readiness report; **stack merged into `main` on 24 Nov (`2a40efe`, CI ✅)** | [x] | Latest head `f22baaf`; CI success (runs 45252793765, 45252805791); handover §H; path to submission in `RELEASE_CHECKLIST.md`. **Merge is yours** |
| 14 | Final handover (A–I, with a verdict) | [x] | `submission/FINAL_HANDOVER.md`: **READY FOR FINAL HUMAN APPROVAL** |

## 2. Human-only steps (not authorised for the agent)
See `product/RELEASE_READINESS.md` → approvals list. These are tracked in the final handover.
