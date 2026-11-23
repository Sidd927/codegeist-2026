# YouTube upload kit (for you to upload; nothing has been uploaded)

**Files** (local, git-ignored; rebuild with `VIDEO_PRODUCTION_NOTES.md`):

| File | Details |
|---|---|
| `build/article25-demo-final.mp4` | Video: 3:59.3, 1920×1080, 30 fps, H.264 + AAC, 53.3 MB |
| `article25-demo.en.srt` | Captions: English, 56 cues |
| `build/article25-thumbnail.png` | Thumbnail: 1280×720, PNG, 343 KB (YouTube's limit is 2 MB) |

## Title (100 characters or fewer)
```
Article25: privacy review that actually enforces the decision | Jira app on Atlassian Forge
```

## Description
```
Article25 is a Jira app, built on Atlassian Forge, that makes privacy review part of the workflow, and enforces it.

• Detect: new and changed work items are checked for planned processing of personal data. Every finding quotes the exact words it is based on.
• Review and decide: reviewers decide in a margin-style workspace. Each decision is bound to the exact text that was reviewed, with separation of duties.
• Enforce: a Jira workflow gate lets work move only when a reviewer has approved the current text. Start in Monitoring, then switch to Enforcing.
• Invalidate: if the text changes in a way that matters, the approval is invalidated automatically.
• Record and recover: every decision is an Ed25519-signed record in a hash chain, verifiable offline and restorable after a reinstall.

Built for Atlassian Codegeist 2026.

Chapters
0:00 The problem
0:29 Article25
0:42 Setting up
0:59 Detect
1:26 Review, decide and separation of duties
1:55 Enforce in Jira
2:08 Monitoring, then Enforcing
2:23 Approval invalidated
2:45 A signed record
3:04 Recovery after reinstall
3:21 Under the hood
3:45 Close

About this video
- All data, work items, companies and people are synthetic and invented.
- The product footage is captured from Article25's own interface. One capture is from Jira itself.
- The narration is a synthetic voice (Kokoro-82M, generated locally).
- There is no music. The sound effects are used under the Pixabay Content License.

Source code: [REPOSITORY URL, or remove this line if the repository stays private]
```

## Settings
| Setting | Value |
|---|---|
| Visibility | **Public** (the rules require public). Upload as **Unlisted** first, check it, then switch to Public |
| Audience | "No, it's not made for kids" |
| Category | Science & Technology |
| Tags | Atlassian, Jira, Forge, Codegeist, privacy, privacy review, DPIA, workflow, data protection |
| Language and caption language | English |
| Captions | Upload `article25-demo.en.srt` (*Subtitles → Upload file → With timing*) |
| Altered or synthetic content | **Yes**: the narration is a synthetic voice. Answer YouTube's disclosure question honestly |
| Paid promotion | No |
| License | Standard YouTube License |
| Comments | Your choice |

## Upload checklist
- [ ] **Listen to the whole film** with headphones and on speakers: voice pronunciation ("Article twenty-five", "SMS"), levels, any artefacts. *(Not done by a person yet.)*
- [ ] Watch every frame once at full screen. Confirm no user name, email or avatar is visible (Jira capture at 1:56–2:08).
- [ ] Upload `build/article25-demo-final.mp4` as **Unlisted**.
- [ ] Paste the title and description; set the thumbnail; upload the SRT.
- [ ] Answer the synthetic-content disclosure question.
- [ ] Check processing finished in HD (1080p available).
- [ ] Open the link in a **private/incognito window**, signed out: it plays, the captions show, the chapters appear.
- [ ] Switch to **Public**.
- [ ] Put the URL into Devpost ("Video demo link") and `submission/DEVPOST_FINAL_SUBMISSION.md`.
- [ ] Re-check it plays signed out after switching to Public.
