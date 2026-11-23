> **⚠️ DRAFT: NOT YET REHEARSED ON A CLEAN SITE.** Rewritten at the final readiness audit (23 Nov 2026) to match the app as built. The Stage 2 draft described a Confluence register, write permissions and a recovery group that the product does not have; it is kept in the Git history.
>
> Still to do:
> - Steps marked *(unverified)* must be confirmed in the clean-site rehearsal.
> - The install link exists only after a production deploy with Distribution → Sharing. Both need the owner's approval.

# Installing and trying Article25 (judges)

**Time:** about 10 minutes.

**You need:**
- an Atlassian Cloud site with **Jira**, on which you are a **site admin**;
- test data only.

Confluence is not needed.

## 1. Install
1. Open the install link: **[INSTALL LINK — generated when Distribution = Sharing]**.
2. Choose your site and **Jira**.
3. Review the permissions and accept:

   | Permission | Why Article25 needs it |
   |---|---|
   | View Jira issue data (`read:jira-work`) | Read the text of new and changed work items to screen them, and read the current text when a protected transition runs |
   | View user profiles (`read:jira-user`) | Check membership of the reviewer group and show reviewers' names |
   | View workflows (`read:workflow:jira`) | Read-only: show which workflow transitions carry the Article25 gate |

   Article25 **writes nothing to Jira** and sends nothing outside Atlassian. AI extraction runs on Atlassian's Forge LLM and is **off** unless the operator switches it on. Without it, screening uses the rule-based extractor and the result says so.

## 2. Set up (site admin, about 5 minutes)
1. **Reviewer group.** In *Admin → Groups*, create the group **`article25-reviewers`** and add yourself.
2. **Open the desk.** *Apps → Article25*. As a site admin, you see **Get started**: each required step, what Article25 found just now, and a link to the exact setting. The steps below follow the same order.
   - If a page says *"Article25 is setting up"*, wait a few seconds and choose **Try again**.
   - That only happens in the first minute after installing.
3. **Single-person trial: separation of duties.** It is on by default: nobody can decide on a work item they reported or are assigned to.
   - If you are the only tester, you will be the reporter of your test work item.
   - In that case, go to *Settings → Review → Separation of duties → Turn off*. The change is audited.
   - Turn it back on afterwards.
4. **Protect a transition.** In a **test** project's workflow:
   - select the transition into *In Progress*;
   - choose **Rules → Validate details → Marketplace rules → Article25 privacy gate**;
   - choose **Update workflow**.

   Company-managed and team-managed projects are both supported. Then check *Settings → Workflow gate*: the workflow should be listed as **Complete**.
5. **Choose the mode.** The gate starts in **Monitoring**: it records what it would block but blocks nothing.
   - To see it block, choose **Start enforcing** in *Settings → Workflow gate*. This is audited, and you can switch back at any time.
   - Before enforcing, check which transitions are listed: enforcing affects every transition that carries the gate.

## 3. Try it (about 3 minutes)
1. **Create a work item** in the test project. Summary: *"Session replay on checkout"*. Description: *"Record checkout sessions and segment shoppers who abandon carts containing prescription items. Send shopper email addresses to Twilio for follow-up texts."* *(unverified on a clean site: the exact rule-based outcome)*
2. **Open the panel.** Use the apps icon under the work item's title and choose **Article25 privacy**. It shows the outcome, the quoted findings and that a review is needed.
3. **Try to move it to In Progress.**
   - Enforcing: Jira refuses with *"This work item needs a privacy review…"*.
   - Monitoring: the move succeeds, and *Settings → Recent gate checks* shows *Would block*.
4. **Review it.**
   - Open *Apps → Article25 → Inbox*, then the work item.
   - Read the highlighted evidence and choose **Approve** with a short rationale.
5. **Move it to In Progress again.** It is allowed, because the approval covers the current text.
6. **Change the text** (for example, add *"and share their location with an advertising partner"*). Within seconds the approval is **invalidated** and the gate blocks again until a reviewer re-approves.
7. **See the record.**
   - *Record* lists every decision with its signature.
   - *Settings → Decision record and recovery* → **Verify the whole record**, then **Download signed archive**.

## 4. Check the record yourself (optional, needs Node.js 18+ and the repository)

```bash
node app/scripts/verify-archive.mjs article25-record-<date>-seq<N>.json --fingerprint "<fingerprint shown in Settings>"
```

It prints **VALID and complete**. If one character of the file is changed, it reports what is wrong.

## Uninstalling
*Apps → Manage apps → Article25 → Uninstall.* Article25's data (screenings, decisions, the signed record) is **deleted**; this was confirmed in a live uninstall test.

- **Before uninstalling,** download a signed archive if you want to keep the decisions.
- **Remove the gate from your workflows first.** Jira blocks transitions whose validator app is missing.

**Privacy policy:** [PUBLIC URL — pending approval]
