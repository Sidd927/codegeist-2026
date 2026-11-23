# Clean-site rehearsal: report and script

## Part 0: evidence status by scenario (final release pass, 23 Nov 2026)
"Live" means it was done by hand on the development site or in the isolated `recovery` environment, with synthetic data. "Automated" means only tests cover it (backend 187, UI 88, real-browser contrast 24). **Nothing here has run on production or on a second site.**

| Scenario | Live | Automated | Not tested yet | Needs a 2nd user or site |
|---|---|---|---|---|
| Install, first load, "setting up" self-heal | ✅ (`recovery`, 3.5 s) | ✅ | Production install | Clean site |
| Get started on a fresh install, environment-specific coverage | ✅ | ✅ | | |
| Screening a new and an edited item (rules mode) | ✅ | ✅ | | |
| **AI-assisted screening in the judging configuration** | ❌ (development AI stays off, by your rule) | ✅ (mocked transport; M2 measured it live in Stage 1) | **Production with AI on** | |
| AI daily budget and **spending cap**, including concurrency | ❌ | ✅ (new concurrency tests) | Reaching the cap for real | |
| The four decisions; stale-evidence and concurrency refusals | ✅ | ✅ | | |
| Separation of duties: the reporter is refused, with guidance | ✅ (single account) | ✅ | | **Two accounts**: a second person approving |
| Gate: block in Enforcing, allow after approval, *Would block* in Monitoring | ✅ (company- and team-managed) | ✅ | | |
| Approval invalidated on a material change; carried over on a harmless edit | ✅ / ✅ | ✅ | | |
| Verify, export, offline verification, tamper detection | ✅ | ✅ | | |
| Uninstall → reinstall → restore → verify → re-check | ✅ (`recovery`) | ✅ | | |
| Restore killed mid-way, large restores in rounds | ❌ | ✅ | | |
| Key rotation and key loss (adopt previous key) | ❌ | ✅ | | |
| Judge sharing link, install by a non-developer account | ❌ | n/a | **Yes** | **Clean site** |
| Long-running judging period (5 Jan–3 Feb 2027) | ❌ | n/a | Yes | |


## Part 1: what was rehearsed (isolated environment, live, 23 Nov 2026)
A genuinely clean *site* needs a second Atlassian site, which you create. The closest safe substitute is a **fresh installation in an isolated Forge environment** (`recovery`). It has its own storage, keys and installation, and was installed on the development site without touching the development installation.

| Check | Result |
|---|---|
| Fresh install (`forge install -e recovery`) | Installed with the three read-only scopes |
| First page load after install | Get started rendered; no error. The "setting up" state covers the first-minute migration window (self-heal measured at 3.5 s) |
| Get started on a fresh install | *You are a member*, *Configured* (signing), **Not protected**, with the exact Jira path to add the gate. Workflows protected by the *development* environment were correctly **not** counted (environment-specific coverage) |
| Uninstall → reinstall → restore → verify → re-check → gate | Passed live, twice (final readiness audit §5) |
| Tampered archive | Refused live |
| Clean-up | Recovery installation uninstalled; the empty environment is kept for re-runs |

**Not covered here:**
- **the judge's sharing link** (production + Sharing; your approval);
- **a site with no prior Article25 groups or data** (the reviewer group already existed on this site);
- **a second human account** for real separation of duties.

## Part 2: the script for the real clean site [YOU: create the site; I can drive the rest]
**Prerequisites:**
- a new Atlassian Cloud developer site with Jira, no Article25 history;
- production deployed with Sharing on ([PRODUCTION_RUNBOOK.md](../product/PRODUCTION_RUNBOOK.md));
- optionally, a second user account for the reviewer role.

| # | Step (time-box) | Pass condition |
|---|---|---|
| 1 | Open the sharing link and install on the clean site (2 min) | Three read-only scopes listed; install completes |
| 2 | *Admin → Groups*: create `article25-reviewers` and add yourself (1 min) | — |
| 3 | *Apps → Article25*: read Get started (1 min) | *Choose who decides* shows *You are a member*; *Protect a workflow transition* shows *Not protected* |
| 4 | Create a test project (team-managed); add the gate to *To Do → In Progress* (3 min) | Get started → *Protected*; Settings shows the workflow as **Complete** |
| 5 | Create the work item from `docs/JUDGE_INSTALL.md` §3 | The panel shows **DPIA likely** (health, systematic monitoring, behavioural), labelled AI-assisted if AI is on; check that AI findings quote the text |
| 6 | Try *In Progress* in **Monitoring** | Allowed; Settings → Recent gate checks shows *Would block* |
| 7 | Start enforcing; try again | Jira refuses: "This work item needs a privacy review…" |
| 8 | Approve your own item | Refused with *Another reviewer must decide* (you are the reporter). Turn separation of duties **off** (audited) and approve |
| 9 | Move to *In Progress* | Allowed |
| 10 | Add the sentence from `JUDGE_INSTALL.md` §3 step 6 (*Send shopper email addresses to Tidepost…*) | Within about 30 s: *Approval invalidated* (new: contact data); the transition is blocked again |
| 11 | Record → Settings → *Verify the whole record*, then *Download signed archive* | *verified*; file saved |
| 12 | `node app/scripts/verify-archive.mjs <file> --fingerprint "<from Settings>"` | VALID and complete |
| 13 | Switch separation of duties back on and return the mode to Monitoring | Audited in the change history |
| 14 | Note every friction point with a timestamp | The fix list feeds the code freeze (17 Dec) |

**Target:**
- Steps 1–4 in at most 10 minutes;
- the whole script in at most 25 minutes;
- zero steps needing knowledge outside `JUDGE_INSTALL.md`.
