# Permissions matrix and freeze recommendation

**Status:** recommendation, 23 Nov 2026. **Freeze date:** 4 Dec 2026, when you approve it.

**Source:** `app/manifest.yml` and `app/src/backend/adapters/jira.js`, the only module that calls Jira. **Guard:** `app/scripts/check-permissions.mjs` runs in `npm run lint` and CI, and fails the build if a scope, egress, external content or a new module type is added.

## 1. Why freeze
On Forge, changing scopes or egress after a site has installed the app needs a site administrator to re-approve the upgrade. Until they do, the installed version stays on the old permissions.
- A judge who installs in January must get exactly what was tested.
- So no permission may change after the judge build is deployed to production.

## 2. Scopes
| Scope | Feature | Essential? | Where it is used (code) | If removed |
|---|---|---|---|---|
| `read:jira-work` | Screening, panel, review workspace, Inbox, gate, administrator check | **Essential** | `getIssueForScreening` (as app, `GET /rest/api/3/issue/{id}?fields=summary,description,project`); `getIssueDocument` and `getIssueIdentity` (as user, browse check before any data is shown); `visibleIssues` (as user, `POST /rest/api/3/search/jql`, filters the Inbox and register to what the viewer can see); `statusName` (`GET /rest/api/3/status/{id}`); `isJiraAdmin` (as user, `GET /rest/api/3/mypermissions?permissions=ADMINISTER`) | The product does not work: nothing can be read or screened |
| `read:jira-user` | Reviewer group, reviewer picker, names in the record, separation of duties | **Essential** | `groupsOf` (`GET /rest/api/3/user/groups`), whether the caller is in the reviewer group; `searchUsers` (`GET /rest/api/3/user/search`, reviewers only); `usersBulk` (`GET /rest/api/3/user/bulk`), display names | No reviewer authorisation: decisions and assignment fail closed (`NOT_AUTHORISED`). Separation of duties cannot be applied |
| `read:workflow:jira` | Settings → Workflow gate coverage; Get started "Protect a workflow transition" | **Essential for an honest setup** | `searchWorkflowsWithTransitions` (`GET /rest/api/3/workflows/search?expand=values.transitions`), admin health check only, read-only | The gate still works, but Article25 could not show which transitions carry it, and Get started could never claim protection (it reports "unknown", never "protected") |

**Not requested** (and not needed):
- any `write:*` scope: Article25 never changes Jira data;
- `manage:jira-configuration`: the reviewer picker uses search plus a membership check, not group listing;
- Confluence scopes: decided at the final audit, the record is archive-only;
- `storage:app`: Forge SQL is used instead.

## 3. Other permissions and consent-bearing modules
| Item | Feature | Essential? | Evidence | If removed |
|---|---|---|---|---|
| **No `permissions.external`** (no egress) | n/a | n/a | The manifest has no `external` block; no `fetch` to other hosts | n/a: this is the strongest privacy claim, so keep it |
| **No `permissions.content`** | n/a | n/a | Custom UI uses bundled assets only | n/a |
| `llm` module (`claude`) | AI-assisted extraction | **Optional at runtime, but required in the manifest** for the hybrid judging build | `src/backend/adapters/llm.js`, gated by `A25_AI_ENABLED`, a daily budget, and a hard spend cap (`A25_AI_SPEND_CAP_USD`; without it no call is made) | Rules-only screening (lower recall; M2 held-out: 4 sensitive misses). Removing it later is a manifest change, so decide **before** the freeze |
| `sql` module | All storage | **Essential** | `src/backend/repositories/sql-repositories.js` | Nothing persists |
| `jira:workflowValidator` | The gate | **Essential** | `src/backend/handlers/gate.js` | No enforcement |
| `trigger`, `consumer`, `scheduledTrigger` | Background screening and reconciliation | **Essential** | `src/backend/handlers/events.js` | No automatic screening |

## 4. Recommendation
**Freeze the current set:**
- three read scopes;
- no egress;
- the `llm` module, kept because you chose "Hybrid with a cap".

Nothing is unused, and nothing more is needed for the submitted scope.

**After the freeze:**
- code, copy and fixes may still change;
- permissions may not change (the guard enforces this);
- a later change that needs a new scope goes after judging (3 Feb 2027).

## 5. Exact commands (for you to run; none have been run)
```bash
# 1. Confirm the manifest is valid and the permission set is the frozen one
cd app && forge lint && node scripts/check-permissions.mjs

# 2. Mark the freeze point in git (local tag; push it when you're ready)
git tag -a permissions-freeze-2026-12-04 -m "Article25 permission freeze for Codegeist 2026 judging"
git push origin permissions-freeze-2026-12-04

# 3. Before every later production deploy: prove the permissions are unchanged since the freeze
git diff permissions-freeze-2026-12-04 -- app/manifest.yml | grep -E '^[+-]\s+(- (read|write|manage|storage)|external|content|llm)' && echo "PERMISSIONS CHANGED: do not deploy" || echo "Permissions unchanged"
```
The production deploy itself (`forge deploy -e production`) is in `product/PRODUCTION_RUNBOOK.md` and needs your approval.
