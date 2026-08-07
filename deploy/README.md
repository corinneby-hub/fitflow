# FitFlow — AI Functional Workouts (PWA)

A personal workout app: it generates functional training sessions with Claude AI, adapted to your equipment, level, goals, session length, daily condition ("sore shoulder", "feeling weak"…), and your past sessions.

## Features
- **Prompt line** — tell it how you feel today; the workout adapts.
- **Settings** — your equipment list, current working weights/reps, goals, default session length.
- **Session length** — 25 / 45 / 60 min or custom.
- **Exercise cards** — mark done ✓, expand for step-by-step form instructions + a YouTube tutorial link, or **swap** any exercise (with an optional reason).
- **Finish session** — saved to History; future workouts consider what you completed/skipped and keep exercises varied.
- **PWA** — installable on Android, works offline (app shell), responsive on all phone sizes.

## Run locally (Windows)
```powershell
powershell -ExecutionPolicy Bypass -File dev-server.ps1
```
Then open http://localhost:8765

## Get it on your Android phone
The app is static files — host them on any free HTTPS host, then open the URL in Chrome on your phone and choose **Add to Home screen**:

1. **GitHub Pages** (recommended): create a repo, upload all files, enable Pages in repo settings.
2. Or **Netlify / Cloudflare Pages**: drag-and-drop the folder.

Your API key is **not** in the code — it's entered once in the app's Settings and stored only on the device, so a public repo is safe.

## API key
1. Create a key at https://console.anthropic.com → API Keys.
2. Paste it in the app: **Settings → Anthropic API key → Save**.

Each generated workout costs a few cents (model: Claude Opus 4.8). The key is sent directly from your phone to Anthropic — no middleman server.

## Files
- `index.html`, `css/style.css` — UI
- `js/app.js` — screens, exercise cards, history, settings
- `js/api.js` — Claude API calls (structured JSON output for workouts & swaps)
- `js/storage.js` — localStorage persistence
- `manifest.webmanifest`, `sw.js`, `icons/` — PWA install & offline support
- `dev-server.ps1` — tiny local dev server (no Node/Python needed)
