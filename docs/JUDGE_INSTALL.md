> **⚠️ DRAFT — NOT YET REHEARSED.** Steps marked (unverified) must be confirmed in the C1 install rehearsal on a clean site. The app is not yet available through a sharing link.

# Installing Article25 (judges)

**Time:** about 10 minutes · **You need:** an Atlassian Cloud site with Jira and Confluence, where you are a **site admin**. Use test data only.

## 1. Install
1. Open the install link: **[INSTALL LINK — generated when Distribution = Sharing]**.
2. Choose your site and select **Jira**. Article25 requires Jira; Confluence is optional but recommended. (unverified: whether the link offers Confluence in the same flow or as a second step)
3. Review the requested permissions and click **Accept**:

   | Permission | Why |
   |---|---|
   | View Jira issue data (`read:jira-work`) | Screen new work items; the workflow gate reads review state |
   | Write Jira issue data (`write:jira-work`) | Store the review receipt on the work item, create a linked review task |
   | View user profiles (`read:jira-user`) | Check reviewer and recovery-admin group membership |
   | App storage (`storage:app`) | Store screening results and decisions |
   | Search Confluence, read/write pages, read spaces | Find the privacy policy page, publish the register and decision backup |

4. If prompted, also connect **Confluence** (the app's "Connect apps" / compatibility step). (unverified)

## 2. Set up (site admin, ~5 min)
1. **Groups:** in *Admin → Groups*, create `article25-reviewers` (reviewers) and, optionally, `article25-recovery-admins`. Add yourself to `article25-reviewers`.
2. **Register page:** open *Apps → Article25* in Jira, choose a Confluence space, and create or select the register page.
3. **Workflow gate:** *Project settings → Workflows → Edit*, select the transition into "In Progress", then *Validators → Add → Article25 privacy gate*. Publish the workflow.
   - Company-managed and team-managed projects are both supported.
   - The gate **fails closed**: while no approved review exists, the transition is blocked with a message.

## 3. Try it (3 min)
1. Create a work item: *"Implement a customer analytics dashboard that collects customer location, purchase history and behavioural information."*
2. Try to move it to **In Progress**. You should see it **blocked**: "no privacy review recorded".
3. Open the **Article25** panel on the work item, review the flagged categories, and choose **Approve with conditions**.
4. Move it to **In Progress** again. It is now **allowed**. The decision appears in the Confluence register.

## Uninstalling
*Apps → Manage apps → Article25 → Uninstall.* App storage is deleted. Gated transitions then **stay blocked** until you remove the validator from the workflow. The Confluence register page and work-item properties remain on your site until you delete them (see the privacy policy).

**Privacy policy:** [PUBLIC URL — pending approval]
