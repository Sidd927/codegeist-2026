# Article25 release checklist: from the repository to a submitted Codegeist 2026 entry

**State as of:** 24 Nov 2026. **Deadline:** 22 Dec 2026, 12:00 PT. **Permission freeze:** 4 Dec 2026.

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

## 1. Git: the real state, and the merge order
**Current state (verified 24 Nov):**
- Branch: `milestone-m5-record`, clean, in sync with origin.
- **Last code change:** `f22baaf` (the approval-validity fix and its docs). CI on it: push run `45252793765` ✅ and PR run `45252805791` ✅. All steps executed: 204 backend, 89 UI, 24 contrast, lint with the freeze guard, build.
- **Later commits are documentation and housekeeping only:**
  - `cf22627`, this checklist;
  - `5a522ee`, which stops tracking `.DS_Store` (CI ✅ on push run `45254776057` and PR run `45254790367`);
  - the commit that added this paragraph.
- Check the live head with `git log -1 --oneline origin/milestone-m5-record` and `gh pr checks 7`.
- Repository: public, default branch `main` (still only the "Initial commit" `f45568b`). Merge commits are allowed. **Delete-branch-on-merge is off**, so GitHub will *not* retarget the next PR by itself.

**Recent history on the release branch:**

| Commit | Change |
|---|---|
| `5a522ee` | chore: untrack `.DS_Store` |
| `cf22627` | docs: this release checklist |
| `f22baaf` | docs: approval-validity investigation |
| `5a3dc54` | fix(review): no AI → rules carry-over |
| `ef87c66` | docs: final reports |
| `ec577dc` | docs: readiness, README |
| `e4fb097` | Devpost copy |
| `821b277` | video kit |
| `0f600f5` | release docs |
| `62e8421` | permission guard |
| `c66aab8` | key-adoption audit |
| `78f638e` | AI spend fixes |
| `ff8c2e5` | $5 cap decision |

**The PR stack** (all open drafts, mergeable, no reviews or comments). Each branch contains the previous one (verified with `git merge-base --is-ancestor`):

| Order | PR | Head (commit) → base | Adds |
|---|---|---|---|
| 1 | [#1](https://github.com/Sidd927/codegeist-2026/pull/1) Stage 1 & 1.5 | `stage1-research-and-spikes` (9db3f25) → `main` | 3 commits |
| 2 | [#2](https://github.com/Sidd927/codegeist-2026/pull/2) Stage 2 | `stage2-product-blueprint` (c98cb5d) → `stage1-…` | 7 |
| 3 | [#3](https://github.com/Sidd927/codegeist-2026/pull/3) Stage 3 | `stage3-product-foundation` (c405a83) → `stage2-…` | 6 |
| 4 | [#4](https://github.com/Sidd927/codegeist-2026/pull/4) M2 Detect | `milestone-m2-detect` (0f8e579) → `stage3-…` | 10 |
| 5 | [#5](https://github.com/Sidd927/codegeist-2026/pull/5) M3 Review | `milestone-m3-review` (0852246) → `milestone-m2-detect` | 9 |
| 6 | [#6](https://github.com/Sidd927/codegeist-2026/pull/6) M4 Enforce | `milestone-m4-enforce` (7254fbb) → `milestone-m3-review` | 9 |
| 7 | [#7](https://github.com/Sidd927/codegeist-2026/pull/7) M5 Record | `milestone-m5-record` (latest head) → `milestone-m4-enforce` | 40 at `f22baaf`, plus the docs commits above |

### G1. Merge the stack into `main` (recommended by 1 Dec, before the freeze and the deploy)
**What:** merge #1 → #7 in order, each with a **merge commit**. Never squash or rebase: that rewrites the commits the next PR is built on. Never force-push.

**How:**
```bash
gh pr ready 1 && gh pr merge 1 --merge
```
```bash
for n in 2 3 4 5 6 7; do gh pr edit $n --base main && gh pr ready $n && gh pr merge $n --merge || break; done
```

**Needs:** CI green on #7 (✅ now).

**Who:** You, or the Agent if you write "merge the stack".

**Approval:** **Yes, explicit.**

**Done when:**
- `gh pr list --state merged` shows #1–#7;
- `git log origin/main -1` is the merge of #7;
- the Actions run on `main` is green.

**Why before the deploy:** production is then deployed from `main`, the freeze tag sits on `main`, and the repository link and privacy-policy URL point at the final files.

**After G1:** any later fix goes on a new branch with its own PR to `main`. The code freeze is 17 Dec.

---

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
**Missing information** (exact markers in the file):

| Line | Marker | What you supply |
|---|---|---|
| 1–5 | Draft banner | Remove when publishing |
| 9 | `[DATE OF PUBLICATION] [CONFIRM]` | The publication date |
| 16 | `[PRIVATE CONTACT EMAIL] [CONFIRM]` | An email address you are willing to publish for privacy and deletion requests |
| 18 | `[REVIEW: the developer's role (controller, processor or neither)…]` | A professional's wording, or delete the sentence |
| 55 | `[REVIEW]` on data residency | Keep "no claim", or a reviewed statement |
| 62 | `[CONFIRM: the published limits, currently 300 checks a day and USD 5 per installation]` | Confirm that these are the values you will set |
| 68 | `[REVIEW: confirm Atlassian's published Forge LLM terms…]` | Check Atlassian's current Forge LLM terms; keep the sentence general unless they say more |
| 101 | `[REVIEW: the rights and requests wording, jurisdiction]` | A reviewed sentence, or keep the general wording |

**Publication requirements:**
- a URL anyone can open without signing in, stable until after judging (3 Feb 2027);
- content that matches the deployed build;
- no `[CONFIRM]` or `[REVIEW]` markers left.

### PP1. Provide the inputs
- **How:** reply in chat with the email, the date, and your decision on each [REVIEW] line. Or edit the file yourself.
- **Needs:** for the [REVIEW] lines, a lawyer or privacy professional if you want one.
- **Who:** You. **Approval:** yes (legal declarations are yours).
- **Done when:** `grep -c "\[CONFIRM\|\[REVIEW\|\[PRIVATE\|\[DATE" docs/privacy-policy.md` prints `0`.

### PP2. Apply the inputs and remove the draft banner
- **How:** the Agent edits `docs/privacy-policy.md` on a branch and opens a PR to `main`.
- **Needs:** PP1 and G1.
- **Who:** Agent. **Approval:** yes (to publish your contact details).
- **Done when:** the PR is merged; the grep above prints `0`.

### PP3. Publish it
- **Recommended:** the public repository file. No new service is needed.
  - **URL:** `https://github.com/Sidd927/codegeist-2026/blob/main/docs/privacy-policy.md`
  - **Alternative:** GitHub Pages, via repository *Settings → Pages*.
- **Needs:** PP2.
- **Who:** You (choose the location). **Approval:** yes (publishing).
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

### F1. Confirm the frozen set
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

### P0. Check you are in the right app and account
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

### Y1. Listen and watch, all of it
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
| # | Action | Step | Approval you give | Target date |
|---|---|---|---|---|
| 1 | **Listen** to and watch the film; reply "film approved" or list fixes | Y1 | Audio and content | 27 Nov |
| 2 | Provide the privacy-policy email, date, limits confirmation and [REVIEW] decisions | PP1 | Legal content | 28 Nov |
| 3 | **Approve the merge** of PRs #1–#7 into `main` ("merge the stack") | G1 | Merge | 1 Dec |
| 4 | Approve the privacy-policy PR, and choose where to publish | PP2, PP3 | Publishing your contact details | 2 Dec |
| 5 | **Approve the permission freeze** ("freeze permissions") | F2 | Freeze | **4 Dec** |
| 6 | `forge login`; run the **production signing-key command** yourself | P0, P1 | Key generation (yours only) | 5 Dec |
| 7 | **Approve production AI** ("configure production AI": on, 300/day, $5) | P2 | Paid usage up to $5 per installation | 5 Dec |
| 8 | **Approve the production deploy** ("approve the production deploy") | P5 | Deploy | 6 Dec |
| 9 | Turn on **Sharing** and copy the install link | S1 | Public install link | 7 Dec |
| 10 | Create the **clean site** and a **second user** | §7 | Account creation | 8 Dec |
| 11 | Install from the link; run the rehearsal; pin the fingerprint | R1, R2, P7 | Install on your site | 12 Dec |
| 12 | Approve fixes from the rehearsal, if any (PRs) | R3 | Merges | 17 Dec (code freeze) |
| 13 | Upload to YouTube Unlisted, check, then **Public** | Y2, Y3 | Publishing | 15 Dec |
| 14 | Optional: decide on a Marketplace listing (bonus) | §9 | Vendor account | 14 Dec |
| 15 | Fill in Devpost; run DV1; **Submit** | DV1, DV2 | Legal submission | **21 Dec** |

**The Agent can do these on your word:**
- G1 merges, F2 tag, P2 variables, P5 deploy;
- the PRs for PP2, PP4, S2 and Y4;
- the checks in D1, F1, F3, P4 and P6;
- R3, and the DV1 grep.

**Never done by the Agent:** generating the production key (P1), Sharing (S1), YouTube (Y2–Y3), Devpost (DV2), or legal content (PP1).
