# Voice-over script (final, as recorded)

**Source of truth:** `narration.json`. `film/build.py` times every scene to these lines.

**Voice:** Kokoro-82M `af_heart`, local synthesis, speed 1.0. **Synthetic; not a human recording.**

**To re-record with a human voice:**
1. Record each line as `film/assets/voice/<id>.wav` (mono, 48 kHz, peaks around −3 dBFS, no music).
2. Run `python3 film/build.py`; the scenes re-time automatically.
3. Render (see [VIDEO_PRODUCTION_NOTES.md](VIDEO_PRODUCTION_NOTES.md)).

**Delivery notes:** calm and confident, not salesy. A slight pause before each step word in the reveal ("Detect. Review. Decide. Enforce. Record."). Say "S M S" as letters, and "Article25" as "Article twenty-five".

| Time | Id | Line | Seconds |
|---|---|---|---|
| 0:01 | s01-hook | Every week, someone opens a Jira work item that quietly changes how a company handles personal data. A session replay tool here. A new messaging vendor there. Nobody meant to skip the privacy review. It just wasn't part of the workflow. | 15.0 |
| 0:18 | s02-tension | And when a review does happen, it is an email thread and a thumbs up. Weeks later, the work changes. New data, a new vendor. And the old approval still says yes. | 9.7 |
| 0:30 | s03-reveal | Article25 is privacy review that lives inside Jira, and actually enforces the decision. Detect. Review. Decide. Enforce. Record. | 10.1 |
| 0:43 | s04-setup | An administrator installs it, and Get started shows exactly what is left to do, checked live. Installing protects nothing by itself, so Article25 says so, until a workflow transition carries the Article25 gate. | 14.8 |
| 1:00 | s05-detect | A developer files a work item: add session replay to checkout, with a vendor called Fernwick. Article25 reads the text and flags it. Health data. Systematic monitoring. A data protection impact assessment is likely. Every finding quotes the exact words it is based on. Each result says whether it came from AI assisted or rule based checks. This one is rule based. | 21.8 |
| 1:24 | s06-review | The privacy reviewer opens it in the review desk. The text is on the left, the evidence in the margin. Select a finding, and its words light up. She approves with conditions: mask every form input, and keep prescription pages out. The decision is bound to this exact text, and signed. | 17.9 |
| 1:44 | s07-sod | The developer who reported it cannot approve their own work. Article25 explains why, and what to do instead. | 7.2 |
| 1:54 | s08-gate | Jira's workflow now asks Article25 before work can start. Without an approval, the transition is refused, and the developer is told what to do next. | 10.0 |
| 2:07 | s08b-modes | Teams can start in Monitoring, where nothing is blocked and Article25 records what it would have stopped, then switch to Enforcing when they are ready. Settings shows exactly which transitions carry the gate. | 12.5 |
| 2:22 | s09-invalidate | Then the work changes. Someone adds one sentence: send shopper email addresses to an S M S provider. Article25 checks the new text, finds contact data that was never reviewed, and invalidates the approval on its own. The gate closes again, until a reviewer looks at what is new. | 18.8 |
| 2:43 | s10-record | Every decision becomes a signed record in a hash chain. An administrator can verify the whole history, and export a signed archive. Anyone can check that archive offline, with nothing but a public key. Change a single word, and the verifier says so. | 15.7 |
| 3:02 | s11-recover | Uninstalling a Forge app deletes its data. Article25 restores the signed archive into a fresh install, verifies the entire chain, and checks every work item again. Only approvals of unchanged text count. | 14.5 |
| 3:19 | s11b-tech | Under the hood, Forge triggers and queues check every change. A versioned rules engine sets each outcome, and an optional AI step must quote the text it relies on. The workflow validator reads only Article25's own records, and every decision is signed with Ed25519. | 20.0 |
| 3:43 | s12-close | Article25. Privacy review that actually enforces the decision. Built entirely on Atlassian Forge, with no external services. | 9.2 |

**Fact check for every line:**

| Line | Claim | Evidence |
|---|---|---|
| s05 | Mode labelling: every result names AI-assisted or rule-based |
| s05 | Rules-mode result | `film-data.mjs` output: DPIA likely; health; systematic monitoring |
| s05 | Quotes | Evidence verifier; excerpts of 120 characters or fewer |
| s06 | Bound and signed | `decisionIdOf` covers the fingerprint; Ed25519 record |
| s07 | Separation of duties | Server `SOD_BLOCKED`, plus P1 guidance |
| s08 | Refusal | Validator; live M4 capture |
| s08b | Modes and coverage | M4, plus the audit environment fix |
| s09 | Invalidation | System decision `APPROVAL_INVALIDATED` (added: contact, combining) |
| s10 | Verification | Real `verify-archive.mjs` output in the film |
| s11 | Recovery | Live recovery test (final audit §5) |
| s11b | Architecture | Manifest and code |
| s12 | No external services | No egress in the manifest |
