# FitFlow

A personal functional-training app for a home gym. It generates workouts with Claude AI, adapted to the equipment you own, the loads you actually lift, your goals, how you feel today, and everything you've logged before.

**Live app:** https://corinneby-hub.github.io/fitflow/

Install it on Android by opening that link in Chrome and choosing **Add to Home screen**. It then behaves like a native app and works offline.

---

## What it does

- **Tell it how you feel.** A prompt line takes free text — "sore right shoulder", "low energy today" — and the workout adapts around it.
- **Sessions sized by exercise count.** Choose **Express**, **Standard**, or **Extended**. The numbers behind those labels are learned from your own history, not fixed.
- **Learns your pattern.** It reads how many exercises you usually do and how you spread them across muscle groups, then keeps that balance at every size.
- **Knows your real numbers.** Edit the sets, reps, or weight on any exercise to what you actually did; future workouts calibrate from those, not from what was originally suggested.
- **Full control of the session.** Mark exercises done, long-press to drag them into a new order, swap one for something else, add exercises, or remove them.
- **History you can edit.** Every finished session is saved, and can be reopened later and corrected.
- **Backup.** Export your history to a file and import it back — on the same phone or a new one.

Full walkthrough: [docs/FEATURES.md](docs/FEATURES.md)

---

## Documentation

| Document | What's in it |
|---|---|
| [docs/FEATURES.md](docs/FEATURES.md) | Every screen and feature, from a user's point of view |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is organised, and the shape of the stored data |
| [docs/AI-PROMPTING.md](docs/AI-PROMPTING.md) | How Claude is prompted: schemas, level priority, variety, pattern learning |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Publishing changes, versioning, and fixing a stale phone |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | What changed in each version |

---

## Setup

You need an Anthropic API key. Create one at [console.anthropic.com](https://console.anthropic.com) → API Keys, then open the app → **Settings** → paste it in → **Save settings**.

The key is stored only in your device's browser storage. It is never in this repository, never in an exported backup, and never sent anywhere except directly from your phone to Anthropic. Each generated workout costs a few cents.

Then fill in the rest of Settings — your equipment, your current working weights, and your goals. The more accurate those are, the better the first few workouts will be; after that the app learns from what you log.

---

## Running it locally

The app is static files, so any web server works. Without Node or Python installed, there's a small PowerShell server in the repo root:

```bash
powershell -ExecutionPolicy Bypass -File dev-server.ps1
```

Then open http://localhost:8765

---

## Tech

Plain HTML, CSS, and JavaScript — no framework, no build step, no dependencies. About 80 KB of code, plus icons. It's a PWA: installable, offline-capable, and responsive across phone sizes. Workouts come from the Claude API (`claude-opus-4-8`) called directly from the browser using structured JSON output, so there is no backend server to run or pay for.
