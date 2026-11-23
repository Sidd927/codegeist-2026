# Production notes: how to rebuild, re-voice and finish the film

## 1. Status
| Item | State |
|---|---|
| Picture | ✅ Final cut rendered: `build/article25-demo-final.mp4` (3:56.7; 1920×1080; 30 fps; H.264 CRF 18; 51 MB). `build/` is git-ignored; rebuild with §2 |
| Narration | ✅ Synthetic voice (Kokoro `af_heart`, local). **Swap for a human recording if you prefer (§4).** |
| Effects | ✅ Pixabay-licensed (whooshes, pops, riser, impact) |
| Music | ⛔ **Missing asset: needs your approval** (§5) |
| Loudness | ✅ Measured (not heard): −15.0 LUFS integrated, −1.3 dBTP, LRA 5.1 LU |
| Captions | ✅ `article25-demo.en.srt` (one cue per narration line), for the YouTube upload |
| Checks | ✅ `npx hyperframes check`: 0 errors. Minor warnings (two 3.15 s holds, dense effect lanes) accepted |
| Upload | ⛔ Not uploaded. The rules require **public YouTube**: your account, your approval |

## 2. Rebuild from scratch (about 5 minutes)
**Paths:** run everything from the repository root, unless a step `cd`s. Use Node 24 (`export PATH=/opt/homebrew/opt/node@24/bin:$PATH`).

**1. State data** from the real services:

```bash
node app/scripts/film-data.mjs /tmp/a25-film/data.json /tmp/a25-film
```

**2. Verifier output** (real), from the fingerprint in the data:

```bash
FP=$(node -e "console.log(require('/tmp/a25-film/data.json').fingerprint)")
node app/scripts/verify-archive.mjs /tmp/a25-film/article25-record-demo.json --fingerprint "$FP" > submission/video/verify-ok.txt
node app/scripts/verify-archive.mjs /tmp/a25-film/article25-record-demo-TAMPERED.json --fingerprint "$FP" > submission/video/verify-bad.txt
```

**3. Harness and captures:**

```bash
cd app/frontend && npx vite --config film/vite.config.js &
```

```bash
node film/capture.mjs /tmp/a25-film/shots
```

**Sound effects.** Copy `whoosh*.mp3`, `pop.mp3`, `riser.mp3` and `impact-bass-1.mp3` from the HyperFrames media-use skill (`audio/assets/sfx/`, Pixabay licence) into `film/assets/sfx/`. They are not committed: the licence forbids redistributing the files as-is.

**4. Crops.** Copy the shots to `submission/video/film/assets/shots/`, then crop:
- `getstarted-fresh` CSS 160–1440 × 40–840;
- `record` 150–1430 × 30–530;
- `settings-gate` 160–1100 × 40–700;
- `settings-record` / `settings-restored` 160–1100 × 60–760;
- `workspace(-note-active)` px 340,300 1880×940;
- `sod-zone` px 0,935 598×470;
- `approved`/`invalidated-zone` px 0,0 598×560.

(CSS coordinates × 2 = pixels.)

**5. Narration** (local Kokoro; needs `kokoro-onnx` in a Python 3.12 virtual environment). For each line in `narration.json`:

```bash
HYPERFRAMES_PYTHON=/path/to/venv/bin/python npx hyperframes tts line.txt -v af_heart -o film/assets/voice/<id>.wav
```

**6. Compose, check and render:**

```bash
cd submission/video/film && python3 build.py && npx hyperframes check
```

```bash
npx hyperframes render -o ../build/article25-demo.mp4 --crf 18
```

**7. Loudness.** Two-pass `loudnorm` to I=−15, TP=−1.5, LRA=11, video copied (see the shell history in the final audit notes) → `build/article25-demo-final.mp4`.

## 3. Editing
- Open the project in the HyperFrames desktop app (`npx hyperframes preview` from `film/`) to adjust any scene.
- Or edit the scene table in `build.py` and re-run it. Scene timing derives from the voice files, so wording changes re-time automatically.

## 4. Replacing the synthetic voice (recommended if possible)
**Options**, in order of preference:
1. **Your own voice:** free; the most authentic for a solo entry.
2. A licensed voice artist: paid, so it needs approval.
3. HeyGen Starfish voices through `npx hyperframes auth login`: free sign-up, 3 minutes a month on the free plan, but the narration is 3:17, so it needs a paid plan or two months. **Needs your approval.**

**Recording spec:** one WAV per line id; quiet room; 48 kHz mono; peaks around −3 dBFS; about 150 words a minute.

## 5. Music: the missing asset
**Why it's missing:**
- No licensed bed is included. The HeyGen catalog needs an account (your approval).
- Local MusicGen weights are licensed for **non-commercial** use only, which is unsafe for a public YouTube entry in a prize competition.
- Generating music in code is not credible.

**Options** (pick one):
- **A. Pixabay Music:** a calm, minimal electronic track at about 90–110 bpm with no vocals. The Pixabay Content License allows commercial use without attribution. **Needs approval to download.**
- **B. A track you own or compose** (for example in GarageBand with Apple Loops, which Apple licenses for use in your own compositions).
- **C. Ship without music.** The narration and effects carry it; the film is already complete.

**To add it:**
1. Place the file at `film/assets/music/bed.wav`.
2. Add `<audio id="bed" class="clip" data-start="0" data-duration="236.7" data-track-index="7" data-volume="0.14" data-fade-in="1.5" data-fade-out="3" src="assets/music/bed.wav">` to the root.
3. Re-render and re-run the loudness pass.

## 6. Accessibility and compliance of the film
- Captions file provided.
- Text on screen is at least 28 px at 1080p, with contrast checked by `hyperframes check`.
- No flashing.
- No third-party trademarks beyond naming the Atlassian platform the app runs on.
- Synthetic data only. No real people, companies or account details.
- The synthetic voice is disclosed here and in the Devpost text.
