> **⚠️ DRAFT: NOT YET REHEARSED ON A CLEAN SITE.** Updated for the final release on 23 Nov 2026.
>
> Still to do before submission:
> - the **install link**: it exists only after a production deploy with Distribution → Sharing, and both need the owner's approval;
> - a run of this guide on a clean site (`docs/CLEAN_SITE_REHEARSAL.md`).
>
> The test texts and their rule-based results below were checked with the app's own rules engine. AI-assisted checks may add findings; they never remove them.

# Installing and trying Article25 (judges)

**Time:** about 10 minutes.

**You need:**
- an Atlassian Cloud site with **Jira**, on which you are a **site admin**;
- a test project, with test data only.

Confluence is not needed.

## 1. Install
1. Open the install link: **[INSTALL LINK: generated when Distribution = Sharing]**.
2. Choose your site and **Jira**.
3. Review the permissions and accept:

   | Permission | Why Article25 needs it |
   |---|---|
   | View Jira issue data (`read:jira-work`) | Read the text of new and changed work items to check them, and read the current text when a protected transition runs |
   | View user profiles (`read:jira-user`) | Check membership of the reviewer group and show reviewers' names |
   | View workflows (`read:workflow:jira`) | Read-only: show which workflow transitions carry the Article25 gate |

   - Article25 **writes nothing to Jira** and sends nothing outside Atlassian.
   - AI-assisted checks run on Atlassian's Forge LLM, within a daily limit and a spending cap.
   - Every AI finding must quote the text it relies on, and a rules engine sets the outcome.
   - If AI is unavailable or over a limit, checks fall back to rules only. The panel says which mode produced each result.

## 2. Set up (site admin, about 5 minutes)
1. **Reviewer group.** In *Admin → Groups*, create the group **`article25-reviewers`** and add yourself.
2. **Open the desk.** *Apps → Article25*. As a site admin you see **Get started**: each required step, what Article25 found just now, and a link to the exact setting.
   - If a page says *"Article25 is setting up"*, wait a few seconds and choose **Try again**.
   - That only happens in the first minute after installing.
3. **Single-person trial: separation of duties.** It is on by default: nobody can decide on a work item they reported or are assigned to.
   - If you are the only tester, you will be the reporter of your test work item.
   - In that case, go to *Settings → Review → Separation of duties → Turn off*. The change is audited.
   - Turn it back on afterwards.
4. **Protect a transition.** In your **test** project's workflow:
   - select the transition into *In Progress*;
   - choose **Rules → Validate details → Marketplace rules → Article25 privacy gate**;
   - choose **Update workflow**.

   Company-managed and team-managed projects are both supported. Then check *Settings → Workflow gate*: the workflow should be listed as **Complete**.
5. **Choose the mode.** The gate starts in **Monitoring**: it records what it would block but blocks nothing.
   - To see it block, choose **Start enforcing** in *Settings → Workflow gate*. This is audited, and you can switch back at any time.
   - Before enforcing, check which transitions are listed: enforcing affects every transition that carries the gate.

## 3. Try it (about 3 minutes)
The names in these texts are invented.

1. **Create a work item** in the test project.
   - **Summary:** *Add session replay to checkout with Fernwick*
   - **Description:** *Record checkout sessions to understand where shoppers drop off. Group shoppers who abandon carts containing prescription items for a follow-up campaign.*
2. **Open the panel.** Use the apps icon under the work item's title and choose **Article25 privacy**. It usually shows a result within 30 seconds; if not, choose **Re-check**.
   - Expected: **DPIA likely**, with quoted findings for *health data*, *systematic monitoring* and *behavioural data*, and a note that a review is needed.
   - With AI on, the recipient *Fernwick* is usually found as well.
3. **Try to move it to In Progress.**
   - Enforcing: Jira refuses with *"Article25: This work item needs a privacy review…"*.
   - Monitoring: the move succeeds, and *Settings → Workflow gate → Recent gate checks* shows *Would block*.
4. **Review it.**
   - Open *Apps → Article25 → Inbox*, then the work item.
   - Select a finding to see its words highlighted.
   - Choose **Approve** (or **Approve with conditions**) and give a short rationale.
5. **Move it to In Progress again.** It is allowed, because the approval covers the current text.
6. **Change the text.** Add this sentence to the description: *Send shopper email addresses to Tidepost for follow-up texts.*
   - Within about 30 seconds the approval is **invalidated**: contact data is new.
   - The gate blocks again until a reviewer re-approves.
   - A harmless edit, such as fixing a typo, keeps the approval, and the record says why.
7. **See the record.**
   - *Record* lists every decision with its signature.
   - *Settings → Decision record and recovery* → **Verify the whole record**, then **Download signed archive**.

## 4. Check the record yourself (optional, needs Node.js 18+ and the repository)

```bash
node app/scripts/verify-archive.mjs article25-record-<date>-seq<N>.json --fingerprint "<fingerprint shown in Settings>"
```

It prints **VALID and complete**. If one character of the file is changed, it reports what is wrong.

## 5. Troubleshooting
| What you see | Why | What to do |
|---|---|---|
| "Article25 is setting up" | The database is being prepared, in the first minute after install | Wait a few seconds, then **Try again** |
| The panel says *Not checked yet* or *Queued* | Checks run in the background | Wait up to a minute, or choose **Re-check** |
| *Rule-based check (limited recall)* | AI was off, unavailable or over a limit for that check | Expected. The result is still valid; rule-based checks find fewer signals |
| You can't approve: *Another reviewer must decide* | Separation of duties: you reported or are assigned to the work item | For a one-person trial, turn it off (Set up, step 3) |
| You can't decide: *Only members of the reviewer group can record decisions* | You are not in `article25-reviewers` | Add yourself to the group, then reload the page |
| The move is not blocked | The gate is in **Monitoring**, or the transition doesn't carry the gate | Check *Settings → Workflow gate*: the mode, and that the workflow is listed as **Complete** |
| Get started shows *Protect a workflow transition: Not protected* | No transition carries the gate yet | Set up, step 4 |
| A move is blocked with a record or restore reason | The gate fails closed when it cannot verify an approval | *Settings → Decision record and recovery* → **Verify the whole record**; switch to Monitoring if you need to unblock work while you investigate |
| The workflow editor doesn't list *Article25 privacy gate* | The app is not installed on this site, or the page is cached | Reload the workflow editor; check *Apps → Manage apps* |

## Uninstalling
*Apps → Manage apps → Article25 → Uninstall.* Article25's data (screenings, decisions, the signed record) is **deleted**; this was confirmed in a live uninstall test.

- **Before uninstalling,** download a signed archive if you want to keep the decisions.
- **Remove the gate from your workflows first.** Jira blocks transitions whose validator app is missing.

**Privacy policy:** [PUBLIC URL: pending your approval]
