# Article25 demo film: creative direction

**Deliverable:** `build/article25-demo-final.mp4`, 3:59.3, 1920×1080, 30 fps, H.264 + AAC, −15.0 LUFS integrated, −1.1 dBTP. Captions: `article25-demo.en.srt`.

## 1. What the film must do for judges
The 2026 rules judge five criteria equally. Presentation explicitly asks for:
- the project working end to end;
- what problem it solves, who it's for and why it matters;
- ease of following.

The film is built around one sentence a judge should remember: **"Privacy review that actually enforces the decision."**

## 2. What we learned from strong product films (principles, not imitation)
- **Open on the problem, not the logo.** The first frames state a tension the audience already feels; the product appears only once the stakes are clear.
- **The product is the hero.** The best enterprise demos show real UI performing real work. Effects-heavy pieces without a real result are forgotten. Every product frame here is a real capture of Article25's own UI.
- **One story, one work item.** A single work item (SHOP-214) carries the whole film: detected → reviewed → approved → blocked → changed → invalidated → recorded → restored. Judges follow a character, not a feature list.
- **Motion explains what can't be seen.** Type and diagrams appear only for things with no UI: the problem, the architecture, the recovery sequence. They never imitate product screens.
- **Restraint.** No fake dashboards, no 3D-tilted UI, no stock imagery, no AI-generated pictures.

## 3. Visual identity (original)
| Element | Choice | Why |
|---|---|---|
| Concept | **The margin**: an annotated document, reviewed and signed | Mirrors the product's evidence-in-the-margin review |
| Ground | Warm paper `#F3F0E8` for product scenes; deep ink `#121318` for the problem and the close | Paper reads as "record"; ink frames the stakes |
| Accent | Evidence amber `#E9B93A` (the product's own highlight); text-safe amber `#8A5A00` on paper | One accent, tied to the UI |
| Status colours | The product's own red (blocked), green (approved/verified) and blue (monitoring) | Meaning stays consistent with the UI |
| Type | **EB Garamond** for statements, **Inter** for labels, **IBM Plex Mono** for hashes and the verifier | Editorial authority + clarity + technical credibility |
| Product framing | Captures in a rounded window with a soft shadow; slow push-ins (2–6%) | Keeps stills alive without faking interaction |
| Mark | The app's own icon (`desk/public/icon.svg`) | Real brand asset |

## 4. Structure (3:59)
| Act | Scenes | Purpose |
|---|---|---|
| Problem (0:00–0:30) | hook, tension | Everyday Jira work changes how personal data is handled; reviews are informal and approvals go stale |
| Promise (0:30–0:59) | reveal, setup | Article25 and its loop; honest setup: installing protects nothing until a transition carries the gate |
| Proof (0:59–2:43) | detect, review, separation of duties, gate, modes, invalidation | One work item, end to end, in real UI |
| Trust (2:43–3:43) | record, recover, under the hood | Signed history, offline verification, recovery, the architecture on Forge |
| Close (3:43–3:59) | close | Name, promise, platform |

## 5. Sound
- **Narration:** a synthetic voice (Kokoro-82M, voice `af_heart`, generated locally; Apache-2.0 model). **It is not a human recording**, and the notes say so.
- **Effects:** soft whooshes on scene changes (three takes, rotated), pops when a chip or step lands, one riser into the final mark. All are Pixabay-licensed (bundled with the toolchain; commercial use allowed).
- **Music:** none yet. See [VIDEO_PRODUCTION_NOTES.md §5](VIDEO_PRODUCTION_NOTES.md) for the one approval this needs.

## 6. Honesty rules for the film
- Every product frame is captured from Article25's own code. States come from the real services on synthetic data; one live Jira capture is used.
- Captions on the screen describe what the UI shows; none adds a capability.
- The mode is stated: "Each result says whether it came from AI-assisted or rule-based checks. This one is rule based." This holds for the AI-assisted judging build too.
- No third-party trademarks. Vendors (Fernwick, Tidepost) and people (Maya Okafor, Daniel Reyes, Sam Whitlock) are invented. Atlassian and Jira are named only to describe the platform the app runs on, as the rules require footage of it running there.
