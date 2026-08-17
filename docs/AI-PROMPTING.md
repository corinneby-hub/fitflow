# How the AI side works

All Claude interaction lives in `js/api.js`. The browser calls the Anthropic API directly, with the user's own key.

## Request basics

```js
POST https://api.anthropic.com/v1/messages
model: "claude-opus-4-8"
max_tokens: 16000
thinking: { type: "adaptive" }
output_config: { format: { type: "json_schema", schema } }
headers: x-api-key, anthropic-version: 2023-06-01,
         anthropic-dangerous-direct-browser-access: true
```

Two choices worth explaining:

**Structured outputs.** Every response is constrained to a JSON schema, so the app never parses prose or guesses at formatting. A workout comes back with a guaranteed `exercises` array where every entry has the fields the UI needs.

**Direct browser calls.** The `anthropic-dangerous-direct-browser-access` header is what allows a browser to call the API without a proxy. The trade-off is that the key lives on the device — acceptable here because it's the user's own personal key on their own phone, and it removes the need for a backend entirely.

Errors are translated to human sentences: a 401 becomes "Invalid API key — check it in Settings", a 429 becomes "Rate limited — wait a moment". A `stop_reason: "refusal"` is handled explicitly.

---

## The three request types

| Function | Returns | Used by |
|---|---|---|
| `generateWorkout()` | A full session (`WORKOUT_SCHEMA`) | The Generate button |
| `swapExercise()` | One replacement exercise (`SINGLE_EXERCISE_SCHEMA`) | Swap sheet |
| `addExercise()` | One additional exercise (`SINGLE_EXERCISE_SCHEMA`) | Add sheet |

All three share `buildSystemPrompt(settings, history)`, so level calibration and equipment rules apply identically whether a session is being created or amended.

---

## Level calibration — the priority order

This is the most important piece of prompt design in the app. The system prompt states an explicit hierarchy:

1. **Proven levels from recorded sessions.** For each exercise, the most recent recorded performance, using the user's edited numbers. Entries the user changed are flagged: *"USER-ADJUSTED — this is their real capacity, not the suggestion"*, with an instruction never to revert to the earlier suggested value.
2. **The written level notes** from Settings — used only for movements history doesn't cover, or when there is no history.
3. **Inference** from the closest comparable movement for anything neither source covers.

Built by `provenLevels(history)`: one entry per exercise, most recent first, capped at 30, marked where a session was skipped rather than completed.

The effect is that the app converges on your real strength. Edit a suggestion once and that number becomes the reference from then on.

---

## Learning the session pattern

`learnPattern(history)` reads the last 12 sessions and returns:

- **`typical`** — the *median* exercise count. Median rather than mean so one unusually short or long session doesn't drag the baseline.
- **`mix`** — average exercises per session per muscle group, e.g. `Legs 2, Glutes 1, Back 1, Core 1, Chest 0.3`.

Body parts are inferred by `bodyPartOf()`, matching keywords against each exercise's `target` and `name` ("glute", "hamstring", "plank", "row"…). It's approximate by design — it feeds a prompt, not a calculation.

`tierCounts(history)` turns `typical` into the three session sizes:

```
standard = typical (or 5 with no history)
express  = max(3, round(standard × 0.65))
extended = round(standard × 1.35)
```

The generate prompt then carries the learned mix and asks for the same balance scaled to the requested count, with size-specific instructions:

- **Express** — trim proportionally across the mix rather than deleting a muscle group the user trains regularly; protect the areas named in their goals first.
- **Extended** — deepen the same balance, favouring goal areas, without piling the extra volume onto one area.
- **Standard** — stay close to the usual distribution.

The count itself is stated as a hard rule: *"Return exactly N exercises. Not more, not fewer."*

---

## Forcing variety

Claude produces near-identical output for identical input, and this model has no temperature control — so early versions kept suggesting the same staples. Two mechanisms fix that:

1. **`fitflow_recent_suggestions`** stores exercise names from the last 10 generations (including swaps and additions). Each request lists them under *"EXERCISES ALREADY SUGGESTED IN RECENT WORKOUTS"* with a hard rule that at least half of today's exercises must not appear on it.
2. The system prompt instructs rotation of movement patterns, implements, angles, and variations.

Crucially, names are recorded when a workout is **generated**, not when it's finished — otherwise generating several sessions without completing them would send identical context every time.

---

## Steering swaps and additions

Both sheets support three modes, and the prompt branches accordingly:

- **Named exercise** — program exactly that; use the closest viable variation if the equipment can't support it and explain the substitution; if the name is ambiguous, choose the common home-gym interpretation and say which.
- **Body part** — must train that area, preferring a movement pattern the session doesn't already cover.
- **Neither** — for a swap, match the original's target muscles; for an addition, complement what's there.

Every one of these requests also includes the current session with the user's live numbers (`describeCurrentWorkout()`), flagging anything they adjusted, so a new exercise arrives calibrated to how the session is actually going rather than to what was planned.

---

## Other prompt rules

- Equipment is a hard constraint; bodyweight is always allowed.
- No warm-up, mobility, or cool-down entries — working exercises only.
- Pain, soreness, or fatigue in the comment must change the programming, not just be acknowledged.
- Prefer exercises with clear, well-known names so the video search finds a good demonstration.
