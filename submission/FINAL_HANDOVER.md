# Article25: final handover (Codegeist 2026)

**Date:** 23 Nov 2026. **Branch:** `milestone-m5-record` at `f22baaf` (24 Nov). The step-by-step path to submission is [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

**Read with:**
- [FINAL_VERIFICATION_REPORT.md](FINAL_VERIFICATION_REPORT.md) (the evidence);
- [FINAL_PROGRESS.md](FINAL_PROGRESS.md) (the checklist).

## A. Verdict
# READY FOR FINAL HUMAN APPROVAL

**The product, documents, film and Devpost copy are complete and verified.** CI is green on the pushed head, and every step executed.

**It is not "READY TO SUBMIT", because:**
- there is **no judge installation link** (it needs your approved production deploy and Sharing);
- there is **no public YouTube video** (you must listen to the film, then upload it).

**Other items that are yours:**
- the production signing key;
- the privacy-policy contact, legal review and publication;
- the permission freeze;
- the merge of the PR stack;
- the Devpost submission.

None of these can be done by the agent under your rules.

## B. What changed in this pass
| Change | Why it matters |
|---|---|
| **AI spending limit labelled correctly** (`spend_cap_reached`) | A reached $5 cap was shown as "Today's AI check budget is used up", which is untrue |
| **Reservation is a true upper bound** (one token per character) | The cap could have been slightly exceeded on unusual text; now it can't |
| **Settings shows AI spend** ("$x of $5.00 used"), and says AI is off when no cap is set | Administrators and judges see the real state |
| **Concurrency tests** for the cap (20 parallel) and the daily budget (12 parallel) | Proves the server-side atomic limits hold under load |
| **Key adoption audited** (`key_adopted`, with the administrator) | The only trust-changing action without an audit entry |
| **Permission-freeze guard** in lint and CI | A scope, egress or module added by mistake fails the build |
| Permissions matrix; runbook (verify the key without revealing it, Sharing steps); judge guide (synthetic text checked by the rules engine, troubleshooting); rehearsal evidence table; privacy policy rows | Judge route and accuracy |
| Captions rebuilt; thumbnail; YouTube kit; asset and licence record | Presentation |
| Devpost copy for every field; checklist | Submission |

## C. Verification summary
**Checks:**
- `npm run check`: ✅ (204 backend, 89 UI, 24 contrast, lint, guards, build, budgets; as of 24 Nov).
- `forge lint`: ✅.
- `npm audit`: 7 moderate, build-time and transitive; accepted (report §1).

**CI on `f22baaf`:**
- push run `45252793765`: ✅ success;
- PR run `45252805791`: ✅ success.
- Every step ran: lint (incl. the freeze guard), test, test:ui, Chromium install, test:contrast, build:ui.

**Evidence status:**

| Status | Scenarios |
|---|---|
| Live (development and isolated environments) | The whole loop, including restore after uninstall |
| Automated only | AI-assisted screening, the AI limits, restore edge cases, key rotation |
| Not tested | Production; the sharing link; a clean second site; a second reviewer |

The detail is in report §6 and `docs/CLEAN_SITE_REHEARSAL.md` Part 0.

## D. AI and security
**AI safeguards:**
- the cap and the daily budget are atomic in SQL, verified under concurrency;
- no cap means no AI;
- AI can't approve or remove findings;
- every quote is verified;
- fallbacks are labelled with the right reason;
- logs are content-free.

**Approval validity (fixed 24 Nov):** an approval granted on an AI-assisted check is no longer carried over when an edit can only be checked rule-based; it is invalidated and needs a reviewer. See `product/APPROVAL_VALIDITY_INVESTIGATION.md`.

**Security pass:**
- server-side authorisation on every resolver;
- parameterised SQL;
- no unsafe rendering;
- no egress;
- no secrets in the repository;
- one fix (key-adoption audit).

## E. Judge installation route (your steps, in order)
All commands are in `product/PRODUCTION_RUNBOOK.md`. **None were run.**

1. **Freeze permissions (by 4 Dec).** Follow `product/PERMISSIONS_MATRIX.md` §5 (`forge lint`, the guard, `git tag permissions-freeze-2026-12-04`).
2. **Publish the privacy policy.**
   - Add a contact email and confirm the limits ($5 and 300/day).
   - Get legal review of the [REVIEW] items.
   - Publish it at a public URL.
3. **Production signing key** (runbook §1.1). Run it once, on your own machine. It is generated and stored encrypted, and never printed.
   ```bash
   cd app && forge variables set --encrypt -e production A25_RECORD_SIGNING_KEY "$(node -e "process.stdout.write(require('crypto').generateKeyPairSync('ed25519').privateKey.export({format:'der',type:'pkcs8'}).toString('base64'))")"
   ```
   To verify it: `forge variables list -e production` shows `A25_RECORD_SIGNING_KEY` as `****`.
4. **Production AI variables** (runbook §1.3): enabled, `claude-haiku-5-5`, 300 a day, cap 5.
5. **Approve the production deploy** (runbook §2). I can run `forge deploy -e production` once you say so.
6. **Sharing** (runbook §3): Developer console → Article25 → Distribution → Sharing. Add the policy URL and contact, then generate the install link.
7. **Clean-site rehearsal** with the link (`docs/CLEAN_SITE_REHEARSAL.md` Part 2). This needs a new site; ideally a second user too.
8. Paste the link into `docs/JUDGE_INSTALL.md` and Devpost §9.

## F. Video
**The film:** `submission/video/build/article25-demo-final.mp4`.
- 3:59.3, 1080p30.
- Decodes cleanly; −15.0 LUFS and −1.1 dBTP.

**Supporting files:**
- captions: `article25-demo.en.srt`;
- thumbnail: `build/article25-thumbnail.png`;
- upload kit: `video/YOUTUBE_UPLOAD_KIT.md`;
- rights: `video/VIDEO_ASSETS_AND_LICENCES.md`.

**Before publishing, you must:**
- listen to all of it (nobody has heard it yet);
- confirm no personal information is visible;
- decide whether the Pixabay effects' set-level licence is enough for you. The alternative is a narration-only re-render, or effects you download yourself.

Upload as Unlisted, check it signed out, then switch to Public.

## G. Devpost
`submission/DEVPOST_FINAL_SUBMISSION.md` has copy for every field:
- the name and tagline (176 characters);
- the short and full story (Inspiration … What's next);
- the technology requirement;
- Built with;
- the category recommendation (Software Teams);
- bonus: none.

**Placeholders:**
- install link;
- YouTube URL;
- privacy-policy URL.

The repository is public: https://github.com/Sidd927/codegeist-2026. The checklist is in `submission/SUBMISSION_CHECKLIST.md`.

## H. Merge readiness (do not merge without your word)
**The stack:**

| Order | PR | Head → base | State | Size |
|---|---|---|---|---|
| 1 | #1 Stage 1 & 1.5 | `stage1-research-and-spikes` → `main` | Draft · mergeable · no reviews or comments | 75 files |
| 2 | #2 Stage 2 | `stage2-product-blueprint` → #1's branch | Draft · mergeable | 11 files |
| 3 | #3 Stage 3 | `stage3-product-foundation` → #2's branch | Draft · mergeable | 50 files |
| 4 | #4 M2 Detect | `milestone-m2-detect` → #3's branch | Draft · mergeable | 44 files |
| 5 | #5 M3 Review | `milestone-m3-review` → #4's branch | Draft · mergeable | 41 files |
| 6 | #6 M4 Enforce | `milestone-m4-enforce` → #5's branch | Draft · mergeable | 47 files |
| 7 | #7 M5 Record | `milestone-m5-record` → #6's branch | Draft · mergeable · **CI green on `f22baaf`** | 143 files |

**How to merge:**
- Merge in order #1 → #7.
- Mark each **Ready for review** first, use **"Create a merge commit"** (not squash or rebase), and let GitHub retarget the next PR to `main`.
- Squashing would rewrite the commits the next PR is built on and cause conflicts.
- Never force-push.

**Alternative (one step):** retarget #7 to `main` and merge it alone. It contains the whole history. Then close #1–#6 as merged-through.

**Risks:**
- the stack is large;
- there are no human reviews, because it is single-author;
- `main` currently shows none of the product, so judges browsing the repository see the old state until you merge.

## I. What I did not do (by your rules), and the order for you
**Not done:**
- no production deploy, variables or key;
- no sharing link;
- no YouTube upload;
- no Devpost submission;
- no merge;
- no purchase or download of music;
- no legal or company details invented;
- development AI stays **off** and the gate stays in **Monitoring**;
- nothing deleted.

**Your order:**

| # | Action | By |
|---|---|---|
| 1 | Listen to the film | Any time |
| 2 | Privacy policy: contact, review, publish | 4 Dec |
| 3 | Permission freeze | **4 Dec** |
| 4 | Production key and AI variables | ~6 Dec |
| 5 | Approve the deploy | ~7 Dec |
| 6 | Sharing link | ~7 Dec |
| 7 | Clean-site rehearsal | 15 Dec |
| 8 | Merge the stack | 17 Dec |
| 9 | YouTube Public | 18 Dec |
| 10 | Devpost submit | 21 Dec (deadline 22 Dec, 12:00 PT) |
