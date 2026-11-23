# Shot list and provenance

**How the product shots were made:**
1. `app/scripts/film-data.mjs` drives the **real** Article25 services over in-memory storage and a fake Jira, exactly as the integration tests do. The services are screening rules, review, evidence-locked approval, gate, Ed25519 ledger, archive and restore. Every resolver payload is saved.
2. `app/frontend/film/` renders the **real** React views from those payloads, with the app's CSS and the real ADS light theme.
3. `app/frontend/film/capture.mjs` captures them in Chromium at 1600×1000, 2× device scale. It also performs the real form interactions (selecting a finding; choosing an outcome and typing a rationale and condition).
4. Crops for close-ups are taken with ffmpeg (coordinates in `submission/video/VIDEO_PRODUCTION_NOTES.md`).

**Data:** synthetic. Invented vendors (Fernwick, Tidepost) and people (Maya Okafor, Daniel Reyes, Sam Whitlock). The development environment badge is visible, honestly.

| Shot (`film/assets/shots/`) | Source | State |
|---|---|---|
| `crop-getstarted.png` | Harness · `setupFresh` | Get started on a fresh install: member, signing configured, **not protected** |
| `panel.png` | Harness · `panelRequester` | Issue panel, developer's view: DPIA likely, quoted findings, rule-based label, gate preview |
| `crop-evidence-idle.png`, `crop-evidence.png` | Harness · `workspaceBefore` (+ real click on "Health data") | Review workspace: evidence marks and margin notes; the selected note highlights its quote |
| `decision-filled.png` | Harness · `workspaceBefore` (+ real form input) | Decision form: Approve with conditions, condition and rationale typed |
| `crop-sod.png` | Harness · `workspaceSod` | Separation-of-duties guidance for the reporter |
| `jira-transition-failed.jpg` | **Live Jira**, development site, M4 enforcement test (`product/m4-evidence/07`) | Jira refuses the transition with Article25's message |
| `crop-gate.png` | Harness · `gateOverview` | Workflow gate: enforcing, verified coverage, recent checks |
| `crop-approved-top.png` → `crop-invalidated-top.png` | Harness · `workspaceApproved` → `workspaceInvalidated` | Approved / Allowed now → Approval invalidated / Blocked now |
| `crop-record.png` | Harness · `register` | Record page with Ed25519 signatures |
| Terminal text | **Real output** of `node app/scripts/verify-archive.mjs` on the archive exported by `film-data.mjs`, and on a copy with one word changed (`verify-ok.txt`, `verify-bad.txt`) | VALID and complete / NOT VALID |
| `crop-restored.png` | Harness · `recordStatusRestored` | Record settings after uninstall → verified restore |
| `article25-icon.svg` | `app/frontend/desk/public/icon.svg` | The app's own icon |

**Live product evidence used to confirm these states:**
- the restore and Get started live runs (final readiness audit §5; `docs/CLEAN_SITE_REHEARSAL.md`);
- the P1 live checks (`product/P1_EXPERIENCE_RESULTS.md` §8).
