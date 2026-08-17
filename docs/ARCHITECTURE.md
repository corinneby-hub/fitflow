# Architecture

## Shape of the project

FitFlow is a static, dependency-free progressive web app. There is no backend: the browser talks straight to the Claude API, and all user data stays in `localStorage` on the device.

```
index.html          Every screen (three tabs + two bottom sheets), all present in the DOM at once
css/style.css       Design tokens and all styling
js/storage.js       localStorage read/write — the only module that touches persistence
js/api.js           Claude API calls, JSON schemas, prompt construction, pattern learning
js/app.js           UI: rendering, interaction, state
sw.js               Service worker — offline cache and update strategy
manifest.webmanifest  PWA metadata (name, icons, standalone display)
icons/              App icons, generated at 192px and 512px
dev-server.ps1      Tiny local static server for development
docs/               This documentation
```

Load order matters: `storage.js` → `api.js` → `app.js`. Each exposes one global (`Store`, `Api`, and an IIFE respectively) — no modules, no bundler.

### Why no framework

The app must be uploadable as plain files, run with no build step on a machine without Node, and load instantly offline. A framework would add a compile stage and more bytes than the entire app currently weighs. The cost is manual re-rendering: after changing `currentWorkout`, code calls `renderWorkout()` rather than relying on reactivity.

---

## The three layers

### `Store` (js/storage.js)

A thin wrapper over `localStorage` with four keys. Every read is guarded, so corrupt or missing JSON degrades to a default instead of throwing.

| Key | Holds |
|---|---|
| `fitflow_settings` | Profile and API key |
| `fitflow_history` | Finished sessions, newest first, capped at 100 |
| `fitflow_current_workout` | The workout in progress (or the session being edited) |
| `fitflow_recent_suggestions` | Names from the last 10 generations, used to force variety |

### `Api` (js/api.js)

Owns everything about talking to Claude: the JSON schemas, the system prompt, the three request types (generate / swap / add), and the functions that learn from history (`learnPattern`, `tierCounts`). See [AI-PROMPTING.md](AI-PROMPTING.md).

### App (js/app.js)

Everything the user sees and does. Holds three pieces of module state:

- `currentWorkout` — the active session object, or `null`
- `editingSessionId` — set when the active session is a history entry being edited
- `swapIndex` — which exercise the swap sheet is targeting

`renderWorkout()` rebuilds the exercise list from `currentWorkout`; `updateProgress()` refreshes only the progress bar and counter.

---

## Data shapes

### Settings

```js
{
  equipment: "Dumbbells 3–10 kg, lifting bar, 5 and 10 kg plates…",
  levels:    "Romanian deadlift: 13 kg, 10 reps × 3 sets…",   // secondary level source
  goals:     "Full body, focus on glutes and core",
  defaultSize: "express" | "standard" | "extended",
  apiKey:    "sk-ant-…"                                        // never exported, never in the repo
}
```

### Session (a finished workout, stored in history)

```js
{
  id: 1723459200000,          // Date.now() at finish; the identity used for edit, delete, import dedupe
  date: "2026-08-12",
  title: "Steady Strength Builder",
  focus: "Full body",
  tier: "standard",           // Express | Standard | Extended
  plannedCount: 6,            // how many exercises were requested
  comment: "shoulder sore",   // what the user typed that day
  exercises: [ /* see below */ ]
}
```

Sessions saved before v17 carry `requestedMinutes` instead of `tier`/`plannedCount`; History renders whichever it finds.

### Exercise

```js
{
  name: "Romanian Deadlift",
  sets: 3, reps: "10", weight: "13 kg bar",       // what the coach suggested
  actualSets: "4", actualReps: "8", actualWeight: "22 kg bar",  // what the user really did ("" = unchanged)
  equipment: "lifting bar", target: "Hamstrings, glutes",
  minutes: 9,
  youtube_query: "romanian deadlift barbell form tutorial",
  done: true,
  _expanded: false            // UI only; survives re-renders, ignored when saving
}
```

The suggested/actual split is the backbone of the app. `effective()` resolves which to display, `isEdited()` decides whether to show the ✎ badge, and the API layer sends the actual values as the user's true capacity. Full exercise data is stored (not just names and numbers) so a session can be reopened for editing with its video links and targets intact.

### Backup file

```js
{
  app: "FitFlow", type: "history-backup", version: 1,
  exportedAt: "2026-08-12T09:14:00.000Z",
  settings: { equipment, levels, goals, defaultSize },   // deliberately no apiKey
  history: [ /* sessions */ ]
}
```

Import merges by session `id` and never deletes; profile fields are restored only where the device has none.

---

## Session lifecycle

```
Generator ──generate──▶ currentWorkout ──finish──▶ history entry
                             │                          │
                             │◀──────edit───────────────┘
                             │   (editingSessionId set;
                             ▼    finish updates in place)
                          discard
```

Both a live workout and a history session being edited use the same `currentWorkout` object and the same rendering path, which is why every editing feature — drag to reorder, swap, add, remove, number editing — works identically in both. The difference is `editingSessionId`: when set, the banner shows, the finish button reads "Save changes", and finishing calls `Store.updateSession()` instead of `Store.addSession()`.

An interrupted edit survives a reload because `_editingId` is written into the stored workout and read back on startup.

Only one session can be active at a time. Trying to edit history while a workout is in progress is blocked with an explanation rather than silently replacing it.

---

## Service worker and updates

`sw.js` is **network-first**: it tries the network, caches each successful response, and falls back to the cache only when offline. An earlier cache-first version made updates arrive days late, which is the bug this strategy exists to prevent.

Update flow: `install` calls `skipWaiting()`, `activate` deletes old caches and calls `clients.claim()`, and `app.js` listens for `controllerchange` to reload the page once when a new worker takes over. `CACHE` in `sw.js` and `APP_VERSION` in `app.js` are bumped together on every release so the version shown in Settings identifies exactly what's running.

---

## Conventions worth keeping

- **All model output is escaped** with `escapeHtml()` before being inserted via `innerHTML`. URLs go through `encodeURIComponent()`.
- **`Store` is the only module that touches `localStorage`.**
- **Rendering is centralised**: mutate `currentWorkout`, save it, then call `renderWorkout()`.
- **Weight is free text**, not a number — "bodyweight" and "red band" are valid entries. `normalizeWeight()` appends "kg" only to values that are purely numeric.
- **Version bumps are mandatory** for anything that ships, or the phone can't tell what it's running.
