# Article25 release checklist: from the repository to a submitted Codegeist 2026 entry

**State as of:** 24 Nov 2026, after the merge to `main`. **Deadline:** 22 Dec 2026, 12:00 PT. **Permission freeze:** 4 Dec 2026.

This is the one list to follow. Every step says:
- **What** needs to happen;
- **How**: the exact command or console location;
- **Needs**: what must be done first;
- **Who** does it;
- **Approval**: whether your explicit approval is required;
- **Done when**: how completion is verified.

**Who:**
- **You** means only you can do it: your accounts, legal or publishing decisions.
- **Agent** means the agent can do it in a session, but only after the approval named.

Run Forge commands from `app/`, with Node 24, signed in with `forge login` (which you do yourself):

```bash
cd app && export PATH=/opt/homebrew/opt/node@24/bin:$PATH
```

---

## 1. Git and GitHub
**State (verified 24 Nov, after the merge):**
- `main` = `2a40efe` "Merge pull request #7 from Sidd927/milestone-m5-record". CI ✅ on it (push run `45259908481`).
- On `main`: `npm run check` passes (204 backend, 89 UI, 24 contrast, lint, copy lint, permission guard, build, budgets), and `forge lint` reports no issues.
- No tracked `.DS_Store`, `node_modules`, `dist`, `.env`, `.pem` or `.key` files. A history scan found no credentials or keys.
- The 11 committed evidence screenshots were checked by text recognition: no name, email or site is visible.
- Repository: public, default branch `main`, no branch protection, merge commits allowed, delete-branch-on-merge off. Branches are kept as history.

### G1. Merge the seven-PR stack ✅ Done (24 Nov)
- Merged in order with **merge commits**, one at a time.
- Before each merge: retargeted to `main`, confirmed that the changed-file count equals the PR's own work, and confirmed mergeable (#6 and #7 also CI-green).
- After each merge: confirmed the head is in `main` and the tree of `main` equals the merged branch.

| PR | Merge commit on `main` |
|---|---|
| #1 Stage 1 & 1.5 | `f8dc58c` |
| #2 Stage 2 | `8cb0f50` |
| #3 Stage 3 | `1e6ef1c` |
| #4 M2 Detect | `1243a80` |
| #5 M3 Review | `ac681a7` |
| #6 M4 Enforce | `0b6ee83` |
| #7 M5 Record | `2a40efe` |

**Verify:** `gh pr list --state merged` lists #1–#7, and `git log --merges --oneline origin/main` shows the seven merges.

**From now on:** every change goes on a new branch with a PR to `main`. The code freeze is 17 Dec.

### G2. Merge [PR #8](https://github.com/Sidd927/codegeist-2026/pull/8): redact development-site identifiers ⏳ needs your approval
- **What:** removes the development site name, your email, and account and installation IDs from the current Stage 1 research notes (8 docs files, no code). Earlier history keeps them; it is not rewritten. They were never credentials.
- **How:**
  ```bash
  gh pr ready 8 && gh pr merge 8 --merge
  ```
- **Needs:** CI ✅ (passed).
- **Who:** You, or the Agent after you write "merge PR 8".
- **Approval:** **yes**: merges beyond PRs #1–#7 were not covered by the stack authorisation.
- **Done when:** `git grep -c one-atlas-psvy origin/main` prints nothing.

### G3. Merge the release PR (`release/v1.0.0`) ⏳ needs your approval
- **What:**
  - app version 1.0.0 (Settings shows "Version 1.0.0");
  - README "For judges" section and current status;
  - `docs/RELEASE_NOTES.md`;
  - this checklist's updates.
- **How:** `gh pr merge <number> --merge` (the number is in §10).
- **Needs:** its CI ✅.
- **Who:** You, or the Agent on "merge the release PR".
- **Approval:** **yes**.
- **Done when:** `main` contains `docs/RELEASE_NOTES.md` and CI on `main` is ✅.

### G4. GitHub Release `v1.0.0` (after P5, the production deploy)
- **Decision:** a release is worthwhile, but only on the commit that is actually deployed to production, so the tag, the deployed build and the judges' install match. Creating it earlier would describe a build judges can't install.
- **How:**
  ```bash
  gh release create v1.0.0 --target <deployed main commit> --title "Article25 1.0.0 (Codegeist 2026)" --notes-file docs/RELEASE_NOTES.md
  ```
- **Needs:** P5.
- **Who:** the Agent, on "create the release". **Approval:** yes (a public release).
- **Done when:** `gh release view v1.0.0` shows the tag on the deployed commit.

## 2. Release documents match the implementation (verified 24 Nov)
| Document | Reflects | Status |
|---|---|---|
| `submission/FINAL_VERIFICATION_REPORT.md` | Head `f22baaf`, CI runs, 204 / 89 / 24, the approval-validity fix | ✅ |
| `submission/FINAL_HANDOVER.md` | Same; #7 = 143 files | ✅ |
| `submission/FINAL_PROGRESS.md` | Same | ✅ |
| `submission/DEVPOST_FINAL_SUBMISSION.md` | 204 backend, 89 UI, 24 contrast; carry-over behaviour | ✅ |
| `product/PRODUCTION_RUNBOOK.md` | 204 / 89 / 24 preconditions; the key command; $5 and 300 | ✅ |
| `product/RELEASE_READINESS.md` | 204 / 89; scopes guarded | ✅ (its §4 dates are superseded by §10 here) |
| `product/PERMISSIONS_MATRIX.md` | Three scopes, `llm`, no egress, the guard | ✅ |
| `product/APPROVAL_VALIDITY_INVESTIGATION.md` | The 24 Nov fix | ✅ |
| `docs/JUDGE_INSTALL.md` | UI strings and test text checked against the build | ✅ (install link pending) |
| `docs/privacy-policy.md` | Data rows match the schema and retention code | ✅ content (your inputs pending, §3) |
| `submission/video/*` | 3:59.3 film, 56-cue captions, thumbnail, kit, licences | ✅ |

**D1. Re-verify after any later change.**
- **How:** `cd app && npm run check`, then compare the counts printed (`ℹ pass`, `Tests N passed`) with the table above.
- **Who:** Agent. **Approval:** no. **Done when:** the counts match, or the documents are updated in the same PR.

---

## 3. Privacy policy (`docs/privacy-policy.md`)
**Status:** the final text is in draft [PR #9](https://github.com/Sidd927/codegeist-2026/pull/9) (branch `docs/privacy-policy-final`).
- The draft banner and every `[CONFIRM]`/`[REVIEW]` marker are resolved, conservatively, from the implementation and your recorded decisions:
  - no legal-role claim;
  - no data-residency claim (it is determined by Atlassian's platform);
  - AI limits stated as 300 checks a day and USD 5 per installation;
  - Atlassian's Forge LLM terms referenced by a verified link, not paraphrased;
  - plain wording for rights and deletion;
  - neutral wording on log access.
- Every data statement still matches the code. The approval-validity fix adds no personal data.

**Only two inputs remain, both yours:**

| Placeholder in PR #9 | What you supply |
|---|---|
| `{{CONTACT_EMAIL}}` | An email address you are willing to publish for privacy questions and deletion requests |
| `{{PUBLICATION_DATE}}` | The date you publish (normally the day PR #9 is merged) |

**Also confirm:**
- that the policy may name you ("built by an individual developer, Siddhant Patil");
- whether you want a privacy professional to review the wording. It's optional; nothing here is legal certification.

**Publication requirements:**
- a URL anyone can open without signing in, stable until after judging (3 Feb 2027);
- content that matches the deployed build;
- no `{{` placeholders left.

### PP1. Provide the inputs
- **How:** reply in chat with the email and the date (and any wording changes), or edit PR #9 yourself.
- **Needs:** none.
- **Who:** You. **Approval:** yes (publishing your contact details).
- **Done when:** you have replied.

### PP2. Fill the placeholders and merge PR #9
- **How:** the Agent fills both placeholders on `docs/privacy-policy-final`, marks PR #9 ready, waits for CI, then runs `gh pr merge 9 --merge` on your word.
- **Needs:** PP1, G1 ✅.
- **Who:** Agent. **Approval:** **yes** ("merge the privacy policy").
- **Done when:**
  - `grep -c "{{" docs/privacy-policy.md` on `main` prints `0`;
  - PR #9 shows as merged.

### PP3. Publish it
- **Recommended:** the public repository file. No new service is needed.
  - **URL:** `https://github.com/Sidd927/codegeist-2026/blob/main/docs/privacy-policy.md`
  - **Alternative:** GitHub Pages, via repository *Settings → Pages*.
- **Needs:** PP2.
- **Recommendation:** the repository URL above. It is public as soon as PR #9 is merged, needs no new service, and is versioned.
- **Who:** You (confirm the location). **Approval:** yes (publishing).
- **Done when:** the URL opens in a private/incognito window, signed out, and shows the final text.

### PP4. Put the policy URL in the documents
- **How:** the Agent replaces `[PUBLIC URL…]` in `docs/JUDGE_INSTALL.md` and `submission/DEVPOST_FINAL_SUBMISSION.md` §13, through a PR to `main`.
- **Needs:** PP3.
- **Who:** Agent. **Approval:** yes (merging).
- **Done when:** `grep -c "\[PUBLIC URL" docs/JUDGE_INSTALL.md submission/DEVPOST_FINAL_SUBMISSION.md` prints `0`s.

---

## 4. Permissions freeze (by 4 Dec)
**The final manifest permissions** (`app/manifest.yml`, unchanged since 23 Nov):
```yaml
permissions:
  scopes:
    - read:jira-work
    - read:jira-user
    - read:workflow:jira
```

**Consent-bearing modules:**
- `llm` (model `claude`): needed for the hybrid build;
- `jira:issuePanel`, `jira:globalPage`, `jira:workflowValidator`;
- `trigger`, `consumer`, `scheduledTrigger`;
- `sql`, `function`.

**Not present:** no `permissions.external` (no egress), no `permissions.content`, no `write:*` scope.

**Why each is needed:** `product/PERMISSIONS_MATRIX.md`.

**Guard:** `app/scripts/check-permissions.mjs` runs in `npm run lint` and CI, and fails the build on any added scope, egress, content permission or module type.

### F1. Confirm the frozen set ✅ Done on `main` `2a40efe` (24 Nov): "No issues found"; "3 scopes and 9 module types match the frozen set"
- **How:** `cd app && forge lint && node scripts/check-permissions.mjs` (expect "No issues found" and "3 scopes and 9 module types match the frozen set").
- **Needs:** G1 (so this runs on `main`).
- **Who:** Agent. **Approval:** no.
- **Done when:** both commands pass on `main`.

### F2. Approve the freeze, and tag it
- **How:**
  ```bash
  git checkout main && git pull
  ```
  ```bash
  git tag -a permissions-freeze-2026-12-04 -m "Article25 permission freeze for Codegeist 2026 judging"
  ```
  ```bash
  git push origin permissions-freeze-2026-12-04
  ```
- **Needs:** F1.
- **Who:** You, or the Agent if you write "freeze permissions".
- **Approval:** **yes** (from then on, no permission change until after 3 Feb 2027).
- **Done when:** `git ls-remote --tags origin permissions-freeze-2026-12-04` returns one line.

### F3. Before every later production deploy
- **How:**
  ```bash
  git diff permissions-freeze-2026-12-04 -- app/manifest.yml | grep -E '^[+-]\s+(- (read|write|manage|storage)|external|content|llm)' && echo "PERMISSIONS CHANGED: do not deploy" || echo "Permissions unchanged"
  ```
- **Needs:** F2.
- **Who:** Agent. **Approval:** no.
- **Done when:** it prints "Permissions unchanged".

---

## 5. Production (preparation only; nothing here has been run)
**Current production state:** deployed 22 Nov from an early build, **no installations, no variables**.

**Note:** variables take effect on the **next deploy**, so set P1–P3 before P5.

### P0. Check you are in the right app and account ✅ Read-only check done (24 Nov)
**Found:**
- the Forge CLI is signed in to your developer account;
- the `production` environment exists, last deployed 22 Nov (an early build, so P5 is still needed);
- **no production variables**;
- **no production installations**: the only installation is development, version 6, on the development site.
- The Forge CLI is 15.1.0 (16.0.0 is available). **Stay on 15.1.0 for the release:** every deploy and test so far used it, and a major CLI upgrade right before production adds risk for no benefit. Re-run P0 yourself just before P1 to confirm nothing has changed.

- **How:**
  ```bash
  forge whoami
  ```
  ```bash
  forge environments list
  ```
  ```bash
  forge variables list -e production
  ```
- **Needs:** `forge login` (you).
- **Who:** You. **Approval:** no.
- **Done when:**
  - your account is shown;
  - `production` is listed;
  - the variables list is empty.

### P1. Production record-signing key
Generated locally and stored encrypted. Never printed, never in a file.
- **How:** run this **once**, on your own machine (not a shared one):
  ```bash
  forge variables set --encrypt -e production A25_RECORD_SIGNING_KEY "$(node -e "process.stdout.write(require('crypto').generateKeyPairSync('ed25519').privateKey.export({format:'der',type:'pkcs8'}).toString('base64'))")"
  ```
  Running it again replaces the key; see runbook §7 (key loss). Do **not** set `A25_SIGNING_KEY` in production.
- **Needs:** P0, F2.
- **Who:** **You only.** The agent must not generate production keys.
- **Approval:** yours (you run it).
- **Done when:** `forge variables list -e production` shows `A25_RECORD_SIGNING_KEY` with the value `****`.

### P2. AI: hybrid, $5 cap per installation, 300 checks a day
- **How:**
  ```bash
  forge variables set -e production A25_AI_ENABLED true
  ```
  ```bash
  forge variables set -e production A25_AI_MODEL claude-haiku-5-5
  ```
  ```bash
  forge variables set -e production A25_AI_DAILY_BUDGET 300
  ```
  ```bash
  forge variables set -e production A25_AI_SPEND_CAP_USD 5
  ```
- **Needs:** P0.
- **Who:** You, or the Agent if you write "configure production AI".
- **Approval:** **yes** (it enables paid Forge LLM usage in production, up to $5 per installation).
- **Done when:** `forge variables list -e production` shows exactly these four values.
- **Billing implications** (read before approving):
  - **Per check:** about **$0.0026** per AI-assisted check, measured live in M2 with Haiku. Re-checking identical text reuses the earlier result and costs nothing.
  - **Per installation:** at most 300 AI checks a day (about $0.78 at that rate). The **lifetime cap is $5** (roughly 1,900 checks). After that, checks continue rule-based and labelled, at no AI cost.
  - **Total exposure:** **$5 × the number of production installations**. The cap is per installation, not global. With about 20 judge installations the theoretical maximum is about $100. Realistic judge use (5–20 checks each) is cents.
  - **Article25's own accounting:** the cap is enforced against the Forge LLM price list read at runtime, with worst-case reservations. Atlassian's invoice is authoritative and can differ slightly.
  - **Other Forge usage:** compute and SQL are billed by Atlassian only above its free allowances, which you accepted in the Developer Terms. That is not expected at judging scale, but it can't be promised.
  - **Free alternative:** set `A25_AI_ENABLED false` (rule-based only, no LLM cost). This lowers detection quality: rules alone missed 4 sensitive items on the M2 held-out set.

### P3. Leave unset
`A25_REVIEWER_GROUP` (default `article25-reviewers`), `A25_SCOPE_PROJECTS` (all projects) and `A25_RECORD_TRUSTED_KEYS`.
- **Who:** n/a.
- **Done when:** none of the three appears in `forge variables list -e production`.

### P4. Pre-deploy checks on the release commit
- **How:**
  ```bash
  git checkout main && git pull && cd app && npm ci && npm run check && forge lint
  ```
  Then run F3.
- **Needs:** G1, F2.
- **Who:** Agent. **Approval:** no.
- **Done when:**
  - every check passes (204 / 89 / 24, guards, budgets);
  - "No issues found";
  - "Permissions unchanged".

### P5. Deploy to production
- **How:**
  ```bash
  forge deploy -e production --non-interactive
  ```
- **Needs:** P1, P2, P4.
- **Who:** the Agent, after you write "approve the production deploy" (or you run it).
- **Approval:** **yes, explicit.**
- **Done when:**
  - the command reports a successful deployment;
  - `forge environments list` shows production updated today.

### P6. Production smoke test (on the clean site, after S1 and R1)
- **How:**
  ```bash
  forge install list
  ```
  ```bash
  forge logs -e production --since 30m
  ```
- **Needs:** P5, S1, R1 (an installation).
- **Who:** Agent (reads only). **Approval:** no.
- **Done when:**
  - the installation is listed;
  - the logs have no `resolver.failed` except `SETTING_UP` in the first minute;
  - *Settings → Decision record and recovery* shows signing **Configured**;
  - *Settings → Privacy checks* shows AI **On · claude-haiku-5-5**, "300 checks per day", and "AI spending limit $0.00 of $5.00 used".

### P7. Pin the production key's fingerprint
- **How:** *Apps → Article25 → Settings → Decision record and recovery*. Copy the fingerprint into your password manager or audit file.
- **Needs:** P6.
- **Who:** You. **Approval:** no.
- **Done when:** it is stored. Later, `node app/scripts/verify-archive.mjs <archive> --fingerprint "<it>"` prints VALID.

---

## 6. Forge Sharing (the judges' installation link)
**Prerequisites:**
- P5, a production deployment of the frozen build;
- PP3, a public privacy-policy URL;
- a contact email you are willing to show to installers.

### S1. Turn on Sharing and generate the link
- **Where:** [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps) → **Article25** → left menu **Distribution** → **Edit** (or *Manage distribution*). Console labels may differ slightly.
- **What:**
  1. Set *Distribution status* to **Sharing**.
  2. Complete the app details:
     - name: Article25;
     - description: the tagline in `DEVPOST_FINAL_SUBMISSION.md` §2.
  3. Complete *vendor and security details*: your name as developer, the contact email, and the privacy-policy URL.
  4. Answer the *personal data* questions:
     - stores personal data: **yes**, Atlassian account IDs of reviewers and short text excerpts of 120 characters or fewer;
     - storage: Forge SQL, hosted by Atlassian;
     - external transfer: **none** (no egress);
     - AI: Forge LLM (Atlassian-hosted), capped.
  5. **Save.**
  6. In *Installation link*, choose **Production** and **Jira**, then **Copy**.
- **Needs:** P5, PP3.
- **Who:** **You** (your developer account; publishing a link).
- **Approval:** **yes**.
- **Done when:** the link opens Atlassian's install screen for Article25 in a signed-out private window. Don't install it on the development site.

### S2. Put the link in the documents
- **How:** the Agent replaces `[INSTALL LINK: generated when Distribution = Sharing]` in `docs/JUDGE_INSTALL.md` and `[SHARING LINK…]` in `submission/DEVPOST_FINAL_SUBMISSION.md` §9, through a PR to `main`.
- **Needs:** S1.
- **Who:** Agent. **Approval:** yes (merging that PR).
- **Done when:** `grep -c "INSTALL LINK\|SHARING LINK" docs/JUDGE_INSTALL.md submission/DEVPOST_FINAL_SUBMISSION.md` prints `0`s.

---

## 7. Clean-site judge rehearsal (by 12 Dec)
**Required access:**
1. **A new Atlassian Cloud site** with Jira and no Article25 history. A free developer site works: <http://go.atlassian.com/cloud-dev>. **You** create it (account creation).
2. **A second user** on that site, for real separation of duties: invite a second email address you control, via *Admin → Users → Invite*. **You** do this. Optional, but it is the only way to test a second reviewer.
3. The S1 link.

### R1. Install as a judge would
- **How:** open the S1 link signed in as the clean site's admin → choose the site → Jira → accept.
- **Needs:** S1 and site 1.
- **Who:** You (or the Agent driving your browser, with your sign-in).
- **Approval:** yes (installing on your site).
- **Done when:** *Apps → Manage apps* lists Article25, and the consent screen showed exactly the three read scopes plus AI.

### R2. Run the judge guide verbatim, timed
- **How:** follow `docs/JUDGE_INSTALL.md` §2–§4 word for word, and note the minutes and any friction. These are the scenarios, each with its pass condition:

| # | Scenario | Pass condition |
|---|---|---|
| a | First load | "Article25 is setting up" for no more than 1 minute, then Get started |
| b | Get started | *Choose who decides* = you are a member (after creating `article25-reviewers`); *Protect a workflow transition* = **Not protected** |
| c | Add the gate to *To Do → In Progress* in a team-managed test project | Settings → Workflow gate lists it as **Complete**; Get started shows **Protected** |
| d | Create the guide's work item (Fernwick text) | Panel within about 30 s: **DPIA likely**, labelled **AI-assisted**; every finding quotes the text |
| e | Monitoring: move to In Progress | Allowed; *Recent gate checks* shows **Would block** |
| f | Start enforcing; move again | Refused: "Article25: This work item needs a privacy review…" |
| g | Approve as the reporter | Refused: *Another reviewer must decide* |
| h | Approve: second user (preferred), or yourself after turning separation of duties off | Decision recorded; move allowed |
| i | Add the Tidepost sentence | Within about 30 s: **Approval invalidated** (new: contact data); move blocked |
| j | Re-approve; harmless typo edit | Allowed again; the typo edit is **carried over** |
| k | *Settings → Verify the whole record*, then *Download signed archive*; run `verify-archive.mjs` with the P7 fingerprint | "verified"; **VALID and complete** |
| l | *Settings → Privacy checks* | AI On; spend shown, well under $5.00 |
| m | Restore separation of duties and Monitoring | Both audited in the history |

- **Needs:** R1, and the second user for h.
- **Who:** You (or the Agent with your browser sign-in).
- **Approval:** no, beyond R1.
- **Done when:**
  - every row passes;
  - §2–§3 of the guide take at most 10 minutes;
  - no step needed knowledge outside the guide.

### R3. Record the result
- **How:** the Agent fills Part 1 of `docs/CLEAN_SITE_REHEARSAL.md` with your notes. No screenshots with your name.
- **Needs:** R2.
- **Who:** Agent. **Approval:** no.
- **Done when:** the table is filled; any fixes go into a PR before the 17 Dec code freeze.

---

## 8. YouTube (by 15 Dec)
**Files** (local, git-ignored):
- video: `submission/video/build/article25-demo-final.mp4` (3:59.3, 1920×1080, 30 fps, 53.3 MB, −15.0 LUFS);
- captions: `submission/video/article25-demo.en.srt` (56 cues);
- thumbnail: `submission/video/build/article25-thumbnail.png` (1280×720).

If `build/` is missing, rebuild with `submission/video/VIDEO_PRODUCTION_NOTES.md` §2.

**Metadata:** title, description with chapters, tags and settings are copy-ready in `submission/video/YOUTUBE_UPLOAD_KIT.md`.

### Y1. Listen and watch, all of it ✅ Done: you watched and approved the film (24 Nov). No regeneration.
- **How:** play the film once on headphones and once on speakers, and check:

| # | Check |
|---|---|
| 1 | Pronunciation: "Article twenty-five", "SMS", "Ed25519", "Forge" |
| 2 | No clipped, robotic or repeated words; voice level steady against the effects |
| 3 | Effects are not distracting (sound effects only; there is no music) |
| 4 | The captions match the voice and are readable |
| 5 | No user name, email or avatar anywhere, especially the Jira capture at 1:56–2:08 |
| 6 | Every claim matches what you deployed (AI-assisted labels, gate messages) |

- **Needs:** none.
- **Who:** **You** (nobody has listened yet).
- **Approval:** this *is* your approval of the audio.
- **Done when:** you reply "film approved", or list the timestamps to fix.

### Y2. Upload as Unlisted
- **Where:** [studio.youtube.com](https://studio.youtube.com) → **Create → Upload videos**.
- **How:**
  1. Upload the MP4.
  2. Paste the title and description from the kit.
  3. Set the thumbnail.
  4. *Subtitles → Upload file → With timing* → the SRT.
  5. Audience: "not made for kids".
  6. *Altered or synthetic content*: **Yes** (synthetic voice).
  7. Visibility: **Unlisted**.
- **Needs:** Y1.
- **Who:** **You** (your channel). **Approval:** yes (publishing).
- **Done when:** processing finishes and 1080p is available.

### Y3. Check it signed out, then make it Public
- **How:** open the link in a private/incognito window and confirm it plays, the captions show and the chapters appear. Then *Visibility → **Public***.
- **Needs:** Y2.
- **Who:** You. **Approval:** yes.
- **Done when:** the link plays signed out with visibility Public. **The rules require Public.**

### Y4. Record the URL
- **How:** the Agent puts the URL into `submission/DEVPOST_FINAL_SUBMISSION.md` §10, through a PR.
- **Needs:** Y3.
- **Who:** Agent. **Approval:** no (merging: yes).
- **Done when:** the `[YOUTUBE URL` placeholder is gone.

---

## 9. Devpost (submit by 21 Dec; deadline 22 Dec, 12:00 PT)
**Where:** [codegeist2026.devpost.com](https://codegeist2026.devpost.com) → *Enter a submission* (or *Edit submission*). The copy is in `submission/DEVPOST_FINAL_SUBMISSION.md`.

| Field | Source | Remaining input | Who |
|---|---|---|---|
| Project name | §1 | none | You (paste) |
| Elevator pitch (176 characters) | §2 | none | You |
| Category | §3: Apps for Software Teams | **Confirm** | You |
| Bonus prizes | §4: none | Leave empty unless a Marketplace listing is submitted | You |
| Short description / thumbnail | §5; `build/article25-thumbnail.png` | none | You |
| About the project (the story) | §6 | none | You |
| Main technology requirement | §7 | none | You |
| Built with | §8 | none | You |
| Installation link and instructions ("Try it out") | §9 | **S1 link**; paste or link `docs/JUDGE_INSTALL.md` | You |
| Video demo link | §10 | **Y3 URL** | You |
| Repository | §11: https://github.com/Sidd927/codegeist-2026 | Merged (G1) | You |
| Image gallery | §12 | Optional stills | You |
| Privacy policy (if asked) | §13 | **PP3 URL** | You |

### DV1. Pre-submit checks
All must be true:
1. The S1 link installs on a site that has never had Article25.
2. The video plays signed out, Public, under 5:00, with captions.
3. The privacy-policy URL opens signed out.
4. `main` has the final code; CI is green; no `[` placeholders remain:
   ```bash
   grep -n "\[INSTALL LINK\|\[SHARING LINK\|\[YOUTUBE URL\|\[PUBLIC URL" docs/JUDGE_INSTALL.md docs/privacy-policy.md submission/DEVPOST_FINAL_SUBMISSION.md
   ```
   This must print nothing.
5. Production AI shows On, with spend under the cap.
6. The category is selected and the bonus section is empty.
7. You are the sole author, and the materials are in English.

- **Who:** You, with Agent help on item 4. **Approval:** n/a.
- **Done when:** all seven are ticked.

### DV2. Submit
- **How:** Devpost → **Submit**. You accept Devpost's terms yourself.
- **Needs:** DV1.
- **Who:** **You**. **Approval:** yes (a legal submission).
- **Done when:** Devpost shows the entry as *Submitted*, and the confirmation email arrives.

### DV3. During judging (5 Jan – 3 Feb 2027)
- **How:**
  ```bash
  forge logs -e production --since 24h | grep -E "resolver.failed|gate.error|migrations.failed"
  ```
  Run it daily. Weekly, check the developer console's installations.
- **Needs:** DV2.
- **Who:** You or the Agent. **Approval:** no.
- **Done when:** there are no errors; any spend stays under each installation's $5.

---

## 10. Your manual actions and approvals, in order
**Done:**
- ✅ the film was approved by you (Y1);
- ✅ PRs #1–#7 were merged (G1);
- ✅ the freeze checks passed on `main` (F1);
- ✅ the read-only production check was run (P0);
- ✅ the privacy policy is prepared in PR #9.

**Remaining, in order:**

| # | Action | Step | Approval you give | Target date |
|---|---|---|---|---|
| 1 | Approve merging [PR #8](https://github.com/Sidd927/codegeist-2026/pull/8) (redaction) and the release PR (version 1.0.0, README, notes, this checklist) | G2, G3 | Merges | 26 Nov |
| 2 | Give the privacy contact email and publication date; confirm your name may appear | PP1 | Publishing your contact details | 28 Nov |
| 3 | Approve merging [PR #9](https://github.com/Sidd927/codegeist-2026/pull/9) (policy) and confirm the repository URL as the public location | PP2, PP3 | Publishing | 30 Nov |
| 4 | **Approve the permission freeze** ("freeze permissions") | F2 | Freeze | **4 Dec** |
| 5 | Run the **production signing-key command** yourself (P1), after re-checking P0 | P0, P1 | Key generation (yours only) | 5 Dec |
| 6 | **Approve production AI** ("configure production AI": on, Haiku, 300/day, $5); billing in P2 | P2 | Paid usage, at most $5 per installation | 5 Dec |
| 7 | **Approve the production deploy** ("approve the production deploy") | P4, P5 | Deploy | 6 Dec |
| 8 | Turn on **Sharing** and copy the install link | S1 | Public install link | 7 Dec |
| 9 | Create the **clean site** and invite a **second user** | §7 | Account creation | 8 Dec |
| 10 | Install from the link; run the rehearsal with the Agent; pin the fingerprint | R1, R2, P7 | Install on your site | 12 Dec |
| 11 | Upload to YouTube Unlisted, check signed out, then **Public**; send the URL | Y2, Y3 | Publishing | 15 Dec |
| 12 | Approve the PRs that add the link, URLs and rehearsal results; approve the GitHub Release | S2, PP4, Y4, R3, G4 | Merges, release | 16 Dec |
| 13 | Approve fixes from the rehearsal, if any | R3 | Merges | 17 Dec (code freeze) |
| 14 | Optional: decide on a Marketplace listing (bonus) | §9 | Vendor account | 14 Dec |
| 15 | Fill in Devpost; run DV1; **Submit** | DV1, DV2 | Legal submission | **21 Dec** |

**The Agent can do these on your word:**
- merges (G2, G3, PP2, S2, PP4, Y4, R3);
- the F2 tag, P2 variables and the P5 deploy;
- the G4 release.

**The Agent does these without asking:** the checks in D1, F3, P4 and P6, and the DV1 grep.

**Never done by the Agent:** generating the production key (P1), Sharing (S1), YouTube (Y2–Y3), Devpost (DV2), or legal content (PP1).
