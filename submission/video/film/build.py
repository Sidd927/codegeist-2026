#!/usr/bin/env python3
"""Builds the Article25 demo film (HyperFrames project) from the scene table below.

Timing comes from the measured narration (assets/voice/*.wav), so re-voicing a line re-times the film.
Product images are real captures (see ../VIDEO_PRODUCTION_NOTES.md); diagrams and type are motion
graphics that explain, and never pose as product UI. Run: python3 build.py  (then npx hyperframes check)
"""
import json, subprocess, html, pathlib

HERE = pathlib.Path(__file__).parent
COMP = HERE / "compositions"
COMP.mkdir(exist_ok=True)


def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(HERE / path)]))


NARRATION = {l["id"]: l["text"] for l in json.load(open(HERE.parent / "narration.json"))}

AMBER_TEXT = '#8A5A00'  # amber for text on paper (contrast)
PAPER, INK, MUTED, AMBER, RED, GREEN, BLUE, NIGHT, IVORY = "#F3F0E8", "#17181C", "#5E6068", "#E9B93A", "#C9372C", "#2F7A57", "#1868DB", "#121318", "#F3F0E8"
BASE_CSS = f"""
#root {{ position: absolute; inset: 0; overflow: hidden; font-family: 'Inter', sans-serif; }}
.ground-paper {{ position: absolute; inset: 0; background: radial-gradient(120% 90% at 30% 20%, #FAF8F3 0%, {PAPER} 55%, #E7E2D6 100%); }}
.ground-night {{ position: absolute; inset: 0; background: radial-gradient(110% 90% at 50% 35%, #1B1D25 0%, {NIGHT} 60%, #0B0C10 100%); }}
.eyebrow {{ position: absolute; left: 120px; top: 84px; font: 700 28px/1 'Inter', sans-serif; letter-spacing: .22em; text-transform: uppercase; color: {MUTED}; }}
.eyebrow b {{ color: {AMBER_TEXT}; font-weight: 700; margin-right: 14px; }}
.window {{ position: absolute; background: #fff; border-radius: 14px; box-shadow: 0 2px 0 rgba(0,0,0,.04), 0 40px 90px rgba(30,25,10,.20); overflow: hidden; border: 1px solid rgba(0,0,0,.08); }}
.window img {{ display: block; width: 100%; height: auto; }}
.cap {{ position: absolute; font: 600 46px/1.15 'EB Garamond', serif; color: {INK}; letter-spacing: -.01em; }}
.cap em {{ font-style: normal; background: linear-gradient(transparent 62%, rgba(233,185,58,.55) 62%); }}
.note {{ position: absolute; font: 500 28px/1.4 'Inter', sans-serif; color: {MUTED}; }}
.chip {{ position: absolute; font: 600 28px/1 'Inter', sans-serif; padding: 12px 18px; border-radius: 10px; }}
.mono {{ font-family: 'IBM Plex Mono', monospace; }}
"""


class Scene:
    def __init__(self, sid, voice, pad_in=0.6, pad_out=1.8, night=False, eyebrow=None):
        self.sid, self.voice, self.pad_in, self.pad_out, self.night, self.eyebrow = sid, voice, pad_in, pad_out, night, eyebrow
        self.vdur = dur(f"assets/voice/{voice}.wav") if voice else 0
        self.duration = round(self.pad_in + self.vdur + self.pad_out, 2)
        self.els, self.tw, self.sfx = [], [], []
        self.n = 0

    def at(self, phrase, offset=0.0):
        """Time (scene-local) of a phrase in this scene's narration, by character position."""
        text = NARRATION[self.voice]
        i = text.find(phrase)
        assert i >= 0, (self.voice, phrase)
        return round(self.pad_in + self.vdur * i / len(text) + offset, 2)

    def id(self, k):
        self.n += 1
        return f"{self.sid}-{k}{self.n}"

    def add(self, inner, start, end=None, cls="", style="", anim="rise", d=0.7, drift=False):
        eid = self.id("e")
        end = self.duration - 0.05 if end is None else end
        self.els.append(f'<div id="{eid}" class="clip" data-start="{start:.2f}" data-duration="{end - start:.2f}" data-track-index="1"><div id="{eid}-i" class="{cls}" style="{style}">{inner}</div></div>')
        if self.night or drift:
            self.tw.append(f'tl.fromTo("#{eid}", {{y: 0}}, {{y: -14, duration: {end - start:.2f}, ease: "none"}}, {start:.2f});')
        if anim == "rise":
            self.tw.append(f'tl.fromTo("#{eid}-i", {{opacity: 0, y: 28}}, {{opacity: 1, y: 0, duration: {d}, ease: "power3.out"}}, {start:.2f});')
        elif anim == "fade":
            self.tw.append(f'tl.fromTo("#{eid}-i", {{opacity: 0}}, {{opacity: 1, duration: {d}, ease: "power2.out"}}, {start:.2f});')
        elif anim == "pop":
            self.tw.append(f'tl.fromTo("#{eid}-i", {{opacity: 0, scale: .86}}, {{opacity: 1, scale: 1, duration: .45, ease: "back.out(2)"}}, {start:.2f});')
        return eid

    def window(self, src, start, end=None, x=0, y=0, w=1000, push=1.035, origin="50% 40%", anim="rise", clip_h=None):
        """A product capture in a window; a slow push keeps it alive without faking interaction."""
        eid = self.add(f'<div class="window" style="left:{x}px;top:{y}px;width:{w}px;{f"height:{clip_h}px;" if clip_h else ""}"><img id="IMG" src="assets/shots/{src}" alt=""></div>', start, end, anim=anim)
        img = f"{eid}-img"
        self.els[-1] = self.els[-1].replace('id="IMG"', f'id="{img}"')
        e = (self.duration - 0.05) if end is None else end
        self.tw.append(f'tl.fromTo("#{img}", {{scale: 1}}, {{scale: {push}, duration: {e - start:.2f}, ease: "none", transformOrigin: "{origin}"}}, {start:.2f});')
        return eid

    def out(self, eid, t, d=0.5):
        self.tw.append(f'tl.to("#{eid}-i", {{opacity: 0, duration: {d}, ease: "power2.in"}}, {t - d:.2f});')

    def cap(self, text, start, x=120, y=860, w=900, end=None, size=None):
        st = f"left:{x}px;top:{y}px;width:{w}px;" + (f"font-size:{size}px;" if size else "")
        return self.add(text, start, end, cls="cap", style=st)

    def chip(self, text, start, x, y, bg, fg="#fff", end=None):
        self.sfx.append(("pop.mp3", start + 0.03, 0.35))
        return self.add(text, start, end, cls="chip", style=f"left:{x}px;top:{y}px;background:{bg};color:{fg};", anim="pop")

    def html(self):
        ground = "ground-night" if self.night else "ground-paper"
        eb = ""
        if self.eyebrow:
            num, word = self.eyebrow
            eb = f'<div id="{self.sid}-eb" class="clip" data-start="0.10" data-duration="{self.duration - 0.15:.2f}" data-track-index="2"><div id="{self.sid}-eb-i" class="eyebrow"><b>{num}</b>{word}</div></div>'
            self.tw.append(f'tl.fromTo("#{self.sid}-eb-i", {{opacity: 0, x: -18}}, {{opacity: 1, x: 0, duration: .6, ease: "power3.out"}}, 0.15);')
        return f"""<template>
<style>{BASE_CSS}</style>
<div id="root" data-composition-id="{self.sid}" data-width="1920" data-height="1080">
  <div id="{self.sid}-bg" class="clip" data-start="0" data-duration="{self.duration:.2f}" data-track-index="0"><div class="{ground}"></div></div>
  {eb}
  {chr(10).join(self.els)}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{chr(10).join(self.tw)}
window.__timelines["{self.sid}"] = tl;
</script>
</template>
"""


S = []

# 1 · Hook (night): the problem, in type only.
s = Scene("hook", "s01-hook", pad_in=1.2, pad_out=1.4, night=True); S.append(s)
s.add('<div style="position:absolute;left:160px;top:250px;font:500 30px/1 Inter;letter-spacing:.2em;color:#8C8F99;text-transform:uppercase">Every week, in every Jira</div>', 0.0, anim="none")
s.add(f'<div style="position:absolute;left:160px;top:330px;font:600 76px/1.08 \'EB Garamond\';color:{IVORY};width:1500px">A session replay tool here.</div>', s.at("A session replay"))
s.add(f'<div style="position:absolute;left:160px;top:430px;font:600 76px/1.08 \'EB Garamond\';color:{IVORY};width:1500px">A new messaging vendor there.</div>', s.at("A new messaging"))
s.add(f'<div style="position:absolute;left:160px;top:600px;font:600 54px/1.2 \'EB Garamond\';color:#B9BBC3;width:1500px">Nobody meant to skip the privacy review.<br><span style="color:{AMBER}">It just wasn’t part of the workflow.</span></div>', s.at("Nobody meant"))

# 2 · Tension (night): an approval that outlives the work it approved (illustration, not product UI).
s = Scene("tension", "s02-tension", pad_out=1.6, night=True); S.append(s)
s.add(f'<div style="position:absolute;left:160px;top:250px;width:1100px;padding:40px 48px;border:1px solid #2C2F3A;border-radius:16px;background:#181A22"><div style="font:500 28px Inter;color:#9A9DA7;letter-spacing:.14em">PRIVACY REVIEW · EMAIL THREAD</div><div style="font:600 52px/1.2 \'EB Garamond\';color:{IVORY};margin-top:18px">“Looks fine to me 👍”</div></div>'.replace("👍", "— approved"), 0.5)
s.add(f'<div style="position:absolute;left:160px;top:560px;font:600 40px/1.3 \'EB Garamond\';color:#B9BBC3;width:1500px">Weeks later the work changes:<br><span style="color:{IVORY};background:linear-gradient(transparent 78%, rgba(201,55,44,.75) 78%)">+ send shopper email addresses to a new vendor</span></div>', s.at("Weeks later"))
s.chip("Still approved", s.at("still says yes", -0.2), 1340, 300, GREEN)

# 3 · Reveal: the product and its loop.
s = Scene("reveal", "s03-reveal", pad_in=0.5, pad_out=2.2); S.append(s)
s.add('<div style="position:absolute;left:0;right:0;top:250px;text-align:center"><img src="assets/article25-icon.svg" style="width:110px;height:110px" alt=""></div>', 0.3, anim="pop")
s.add(f'<div style="position:absolute;left:0;right:0;top:390px;text-align:center;font:600 120px/1 \'EB Garamond\';color:{INK};letter-spacing:-.02em">Article25</div>', 0.5)
s.add(f'<div style="position:absolute;left:0;right:0;top:540px;text-align:center;font:500 40px/1.3 \'EB Garamond\';color:{MUTED}">Privacy review that <em style="font-style:normal;background:linear-gradient(transparent 62%, rgba(233,185,58,.55) 62%);color:{INK}">actually enforces the decision.</em></div>', s.at("actually enforces"))
for i, w in enumerate(["Detect", "Review", "Decide", "Enforce", "Record"]):
    s.add(f'<div style="position:absolute;left:{460 + i * 210}px;top:720px;width:190px;text-align:center;font:700 28px/1 Inter;letter-spacing:.16em;text-transform:uppercase;color:{INK}"><span style="display:block;font:600 28px IBM Plex Mono;color:{AMBER_TEXT};margin-bottom:12px">0{i + 1}</span>{w}</div>', s.at(w + "."), anim="pop")
    s.sfx.append(("pop.mp3", s.at(w + ".") + 0.03, 0.25))

# 4 · Set up: Get started, checked live.
s = Scene("setup", "s04-setup", eyebrow=("Set up", "Get started, checked live")); S.append(s)
s.window("crop-getstarted.png", 0.4, x=120, y=170, w=1180, push=1.06, origin="40% 38%")
s.cap('Installing protects <em>nothing</em> by itself.', s.at("Installing protects"), x=1350, y=300, w=470)
s.add('<div class="note" style="left:1350px;top:470px;width:460px">Each line is a server-side check: reviewer group, signing key, real workflow coverage, mode, backups.</div>', s.at("checked live"))
s.chip("Not protected", s.at("so Article25 says so"), 1350, 640, "#FFECEB", RED)

# 5 · Detect: the developer's view in the Jira issue panel.
s = Scene("detect", "s05-detect", eyebrow=("01", "Detect")); S.append(s)
s.add(f'<div style="position:absolute;left:120px;top:200px;width:720px;font:500 28px/1.45 Inter;color:{MUTED}">A developer files <b style="color:{INK}">SHOP-214</b><br><span style="font:600 44px/1.2 \'EB Garamond\';color:{INK}">Add session replay to checkout with Fernwick</span></div>', 0.5)
s.window("panel.png", 1.2, x=1000, y=150, w=720, push=1.03, origin="50% 30%")
s.chip("Health data", s.at("Health data"), 120, 520, "#FFF5DB", "#7A4A00")
s.chip("Systematic monitoring", s.at("Systematic monitoring"), 330, 520, "#FFF5DB", "#7A4A00")
s.chip("DPIA likely", s.at("A data protection"), 120, 600, RED)
s.cap('Every finding quotes <em>the exact words</em> it is based on.', s.at("Every finding"), x=120, y=720, w=800)
s.add('<div class="note" style="left:120px;top:900px;width:780px">Each result names its mode: AI-assisted or rule-based. This one: rule-based.</div>', s.at("Each result says"))

# 6 · Review: the margin, then the decision.
s = Scene("review", "s06-review", eyebrow=("02 · 03", "Review and decide")); S.append(s)
a = s.window("crop-evidence-idle.png", 0.4, s.at("Select a finding"), x=120, y=190, w=1680, push=1.02)
s.out(a, s.at("Select a finding") + 0.2, 0.4)
b = s.window("crop-evidence.png", s.at("Select a finding") - 0.2, None, x=120, y=190, w=1680, push=1.04, origin="20% 40%", anim="fade")
s.tw.append(f'tl.to("#{b}-i", {{scale: .62, duration: .7, ease: "power3.inOut", transformOrigin: "0% 0%"}}, {s.at("She approves") - 0.3:.2f});')
dfw = s.window("decision-filled.png", s.at("She approves") - 0.3, x=1180, y=60, w=560, push=1.0, clip_h=960, anim="fade")
# Scroll the real form (displayed 560 × 1706 px) so the chosen outcome, conditions and rationale come into view.
s.tw.append(f'tl.fromTo("#{dfw}-img", {{y: 0}}, {{y: -700, duration: 4.5, ease: "power2.inOut"}}, {s.at("mask every form") - 1.5:.2f});')
s.cap('Bound to <em>this exact text</em> — and signed.', s.at("The decision is bound"), x=140, y=760, w=980)
s.add('<div class="note" style="left:140px;top:860px;width:980px">Conditions: mask every form input · exclude prescription pages.</div>', s.at("mask every form"))

# 7 · Separation of duties.
s = Scene("sod", "s07-sod", pad_out=1.4, eyebrow=("Guardrail", "Separation of duties")); S.append(s)
s.window("crop-sod.png", 0.4, x=820, y=230, w=980, push=1.03)
s.cap('You can’t approve <em>your own work</em>.', 0.6, x=120, y=330, w=640)
s.add('<div class="note" style="left:120px;top:520px;width:620px">The server refuses it regardless of the screen; the screen explains why and what to do next.</div>', s.at("Article25 explains"))

# 8 · Enforce: the real Jira refusal (captured live during the M4 enforcement test).
s = Scene("gate", "s08-gate", pad_out=2.4, eyebrow=("04", "Enforce")); S.append(s)
s.window("jira-transition-failed.jpg", 0.5, x=980, y=120, w=700, push=1.04, origin="40% 85%")
s.cap('No approval? <em>The transition is refused.</em>', s.at("Without an approval"), x=120, y=330, w=780)
s.add('<div class="note" style="left:120px;top:520px;width:760px">Jira’s workflow asks Article25’s validator before work starts. Captured live in Jira.</div>', s.at("Jira's workflow"))

s = Scene("modes", "s08b-modes", eyebrow=("04", "Monitoring → Enforcing")); S.append(s)
s.window("crop-gate.png", 0.4, x=820, y=150, w=980, push=1.04, origin="40% 30%")
s.chip("Monitoring", s.at("Monitoring"), 120, 330, "#E9F2FE", BLUE)
s.add(f'<div class="note" style="left:120px;top:400px;width:600px">Nothing is blocked; Article25 records what it <i>would</i> have stopped.</div>', s.at("where nothing is blocked"))
s.chip("Enforcing", s.at("switch to Enforcing"), 120, 540, RED)
s.add(f'<div class="note" style="left:120px;top:610px;width:600px">Verified coverage: exactly which transitions carry the gate — for this environment only.</div>', s.at("Settings shows"))

# 9 · Invalidation: before and after one sentence.
s = Scene("invalidate", "s09-invalidate", pad_out=2.4, eyebrow=("Evidence-locked", "Approval invalidated")); S.append(s)
s.add(f'<div style="position:absolute;left:120px;top:200px;width:600px;font:600 40px/1.3 \'EB Garamond\';color:{INK}">One sentence is added:<br><span style="background:linear-gradient(transparent 58%, rgba(233,185,58,.6) 58%)">“Send shopper email addresses to Tidepost for follow-up texts.”</span></div>', s.at("Someone adds"))
s.add('<div style="position:absolute;left:760px;top:150px;font:700 28px Inter;letter-spacing:.14em;color:#5E6068">BEFORE</div>', 0.4)
s.window("crop-approved-top.png", 0.5, x=760, y=200, w=500, push=1.04, origin="50% 30%")
s.add('<div style="position:absolute;left:1310px;top:150px;font:700 28px Inter;letter-spacing:.14em;color:#C9372C">AFTER</div>', s.at("invalidates the approval"))
s.window("crop-invalidated-top.png", s.at("invalidates the approval"), x=1310, y=200, w=500, push=1.05, origin="50% 30%", anim="fade")
s.chip("New: contact details", s.at("finds contact data"), 120, 560, "#FFF5DB", "#7A4A00")
s.chip("Approval invalidated", s.at("invalidates the approval"), 120, 640, RED)
s.chip("Gate: blocked again", s.at("The gate closes"), 120, 720, INK)

# 10 · Record: signed history, export, independent verification.
s = Scene("record", "s10-record", pad_out=2.6, eyebrow=("05", "Record")); S.append(s)
r1 = s.window("crop-record.png", 0.4, s.at("Anyone can check"), x=120, y=190, w=1180, push=1.03)
s.out(r1, s.at("Anyone can check") + 0.1, 0.4)
s.cap('A signed record, <em>Ed25519</em>, in a hash chain.', s.at("Every decision"), x=1360, y=260, w=460)
ok = open(HERE.parent / "verify-ok.txt").read().strip().splitlines()
bad = open(HERE.parent / "verify-bad.txt").read().strip().splitlines()
term = lambda lines, col: "".join(f'<div style="color:{col if l.startswith("RESULT") or l.startswith("error") else "#C9CBD3"}">{html.escape(l)}</div>' for l in lines)
s.add(f'<div style="position:absolute;left:120px;top:190px;width:1680px;padding:34px 40px;background:#14161C;border-radius:14px;font:500 28px/1.55 \'IBM Plex Mono\';color:#C9CBD3;box-shadow:0 40px 90px rgba(0,0,0,.25)"><div style="color:#8C8F99">$ node verify-archive.mjs archive.json --fingerprint "…"</div>{term(ok, "#6CCB8F")}</div>', s.at("Anyone can check"), s.at("Change a single word"), drift=True)
s.add(f'<div style="position:absolute;left:120px;top:190px;width:1680px;padding:34px 40px;background:#14161C;border-radius:14px;font:500 28px/1.55 \'IBM Plex Mono\';color:#C9CBD3;box-shadow:0 40px 90px rgba(0,0,0,.25)"><div style="color:#8C8F99">$ node verify-archive.mjs archive-one-word-changed.json --fingerprint "…"</div>{term(bad, "#FF7A6E")}</div>', s.at("Change a single word"), anim="fade", drift=True)
s.add('<div class="note" style="left:120px;top:760px;width:1600px">Offline. No Jira access. No secrets. Just the public key you pinned.</div>', s.at("offline"))

# 11 · Recovery.
s = Scene("recover", "s11-recover", pad_out=2.0, eyebrow=("Recovery", "Uninstall → restore")); S.append(s)
for i, (t, sub, col) in enumerate([("Uninstall", "data deleted · gate fails closed", RED), ("Reinstall", "empty record", MUTED), ("Restore", "signed archive · whole chain verified", GREEN)]):
    s.add(f'<div style="position:absolute;left:120px;top:{230 + i * 150}px;width:620px"><div style="font:600 44px \'EB Garamond\';color:{INK}"><span style="font:600 28px IBM Plex Mono;color:{col};margin-right:16px">0{i + 1}</span>{t}</div><div class="note" style="position:static;margin-top:6px">{sub}</div></div>', [0.6, s.at("into a fresh install"), s.at("verifies the entire chain")][i])
s.window("crop-restored.png", s.at("Article25 restores"), x=820, y=150, w=980, push=1.04, origin="40% 45%")
s.cap('Only approvals of <em>unchanged text</em> count.', s.at("Only approvals"), x=120, y=760, w=680)

# 11b · Under the hood (diagram; labels name real components).
s = Scene("tech", "s11b-tech", pad_out=3.2, eyebrow=("Under the hood", "Atlassian Forge")); S.append(s)
boxes = [
    ("Jira change", "trigger + queue", 140, 300, "Forge triggers"),
    ("Rules engine", "versioned · sets the outcome", 560, 300, "A versioned rules engine"),
    ("Optional AI", "Forge LLM · must quote the text", 560, 520, "an optional AI step"),
    ("Forge SQL", "Article25’s own records", 980, 300, "Article25's own records"),
    ("Workflow validator", "allow · block · fail closed", 1400, 300, "The workflow validator"),
    ("Ed25519 ledger", "signed · chained · exportable", 980, 520, "signed with Ed25519"),
]
for title, sub, x, y, phrase in boxes:
    s.add(f'<div style="position:absolute;left:{x}px;top:{y}px;width:360px;padding:26px 28px;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:14px;box-shadow:0 20px 50px rgba(30,25,10,.12)"><div style="font:600 34px \'EB Garamond\';color:{INK}">{title}</div><div class="note" style="position:static;margin-top:6px">{sub}</div></div>', s.at(phrase), anim="pop")
    s.sfx.append(("pop.mp3", s.at(phrase) + 0.03, 0.22))
s.add(f'<div class="note" style="left:140px;top:820px;width:1640px;color:{INK};font-weight:600">No external services · no data leaves Atlassian’s platform · scopes: read-only Jira</div>', s.at("signed with Ed25519") + 1.0)

# 12 · Close (night).
s = Scene("close", "s12-close", pad_in=0.6, pad_out=4.2, night=True); S.append(s)
s.add('<div style="position:absolute;left:0;right:0;top:300px;text-align:center"><img src="assets/article25-icon.svg" style="width:120px;height:120px" alt=""></div>', 0.5, anim="pop")
s.add(f'<div style="position:absolute;left:0;right:0;top:450px;text-align:center;font:600 128px/1 \'EB Garamond\';color:{IVORY}">Article25</div>', 0.7)
s.add(f'<div style="position:absolute;left:0;right:0;top:610px;text-align:center;font:500 42px/1.3 \'EB Garamond\';color:#B9BBC3">Privacy review that <span style="color:{AMBER}">actually enforces the decision.</span></div>', s.at("Privacy review"))
s.add('<div style="position:absolute;left:0;right:0;top:760px;text-align:center;font:600 28px Inter;letter-spacing:.2em;color:#9A9DA7;text-transform:uppercase">Built on Atlassian Forge · Codegeist 2026</div>', s.at("Built entirely"))
s.sfx.append(("riser.mp3", 0.0, 0.35))
s.sfx.append(("impact-bass-1.mp3", 0.5, 0.45))

# ---------------------------------------------------------------- assemble the root
hosts, audio, t = [], [], 0.0
whooshes = ["whoosh.mp3", "whoosh-short.mp3", "whoosh-cinematic.mp3"]
for i, sc in enumerate(S):
    (COMP / f"{sc.sid}.html").write_text(sc.html())
    hosts.append(f'<div id="{sc.sid}" data-composition-id="{sc.sid}" data-composition-src="compositions/{sc.sid}.html" data-start="{t:.2f}" data-duration="{sc.duration:.2f}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>')
    audio.append(f'<audio id="vo-{sc.sid}" class="clip" data-start="{t + sc.pad_in:.2f}" data-duration="{sc.vdur:.2f}" data-track-index="3" data-volume="1" src="assets/voice/{sc.voice}.wav"></audio>')
    if i:
        f = whooshes[i % 3]
        audio.append(f'<audio id="sw-{sc.sid}" class="clip" data-start="{max(0, t - 0.25):.2f}" data-duration="{dur(f"assets/sfx/{f}"):.2f}" data-track-index="4" data-volume="0.28" src="assets/sfx/{f}"></audio>')
    for k, (f, at, vol) in enumerate(sc.sfx):
        audio.append(f'<audio id="fx-{sc.sid}-{k}" class="clip" data-start="{t + at:.2f}" data-duration="{dur(f"assets/sfx/{f}"):.2f}" data-track-index="{5 + k % 2}" data-volume="{vol}" src="assets/sfx/{f}"></audio>')
    t += sc.duration
total = round(t, 2)
(HERE / "index.html").write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>* {{ margin: 0; padding: 0; box-sizing: border-box; }} html, body {{ width: 1920px; height: 1080px; overflow: hidden; background: {PAPER}; }} #root {{ position: relative; width: 100%; height: 100%; }}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="1920" data-height="1080">
{chr(10).join(hosts)}
{chr(10).join(audio)}
</div>
<script>window.__timelines["main"] = gsap.timeline({{ paused: true }});</script>
</body>
</html>
""")
# Captions (YouTube upload): one cue per narration line, timed to the voice.
srt, t, n = [], 0.0, 1
fmt = lambda x: f"{int(x // 3600):02}:{int(x % 3600 // 60):02}:{int(x % 60):02},{int(round((x % 1) * 1000)):03}"
for sc in S:
    st = t + sc.pad_in
    srt.append(f"{n}\n{fmt(st)} --> {fmt(st + sc.vdur)}\n{NARRATION[sc.voice]}\n")
    n += 1
    t += sc.duration
(HERE.parent / "article25-demo.en.srt").write_text("\n".join(srt))
print(f"scenes {len(S)} · total {total:.1f} s ({int(total // 60)}:{int(total % 60):02})")
