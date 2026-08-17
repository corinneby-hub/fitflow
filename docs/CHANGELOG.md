# Changelog

Versions are the value of `APP_VERSION` in `js/app.js`, shown in Settings. Versions before v11 predate the in-app version display and are grouped by what changed.

## v17 — session size by exercise count

- Session length is now **Express / Standard / Extended** instead of minutes. The counts behind those labels are learned per user: Standard is the median exercise count of the last 12 sessions (5 with no history), Express ≈ 65%, Extended ≈ 135%.
- The app learns the habitual **muscle-group distribution** and asks for the same balance scaled to the chosen size — trimming proportionally for Express, deepening for Extended, protecting goal areas first.
- In-workout progress counts exercises (`3/6 · 3 to go`) rather than minutes.
- Sessions saved before this version still display their original duration in History.

## v16 — remaining time and backups

- Ticking exercises off updated a live estimate of remaining work.
- **Backup** added to Settings: export history to a JSON file and import it back. Import merges by session id and never deletes; profile fields are restored only where the device has none; the API key is never exported.

## v15 — drag to reorder, steerable swaps

- **Long-press and drag** an exercise card to reorder the session, in both a live workout and history edit mode. Quick taps still expand, scrolling never starts a drag, and the dropped card doesn't spring open.
- The **swap** sheet gained the same choice as Add: pick a body part, or name the replacement exercise yourself.

## v14 — quieter delete

- In History, **Edit session** became the full-width action and **Delete session** a small muted text button below a divider, to prevent mis-taps.

## v13 — cleaner collapsed cards

- The original suggestion is shown only in the expanded editor; a collapsed card shows your own numbers plus an ✎ edited badge.

## v12 — kilograms by default

- A bare number typed into the weight field is saved as kilograms. Text entries like "bodyweight" or "10 lb" are left exactly as typed.

## v11 — the update system

- Service worker switched from **cache-first to network-first**, so updates arrive immediately when online while still working offline.
- The app now checks for a new version at launch and hourly, and reloads itself once when one activates.
- Settings shows the running **version number** and a **Force refresh now** button that clears the file cache without touching user data.

## Earlier versions

**History editing.** Saved sessions can be reopened in the full workout editor and updated in place; interrupted edits survive a reload; editing is blocked while another workout is in progress.

**Editable performance.** Sets, reps, and weight became editable per exercise, with an explicit Save button, a reset to the suggestion, and the edited values flowing into future level calibration.

**Level priority.** Recorded sessions became the primary source for load calibration, with the written notes in Settings demoted to a fallback for movements history doesn't cover. User-adjusted numbers are flagged so the coach never reverts to its earlier suggestion.

**Add and remove exercises.** Exercises can be removed, or added by choosing a body part (complementing what's already programmed) or by naming the exercise directly.

**No warm-up or cool-down.** Programmed sessions became working exercises only, with more real exercises per session.

**Instructions replaced by video.** Written form cues were dropped in favour of a per-exercise YouTube tutorial link.

**Forced variety.** Names from recent generations are sent with each request, with a rule that at least half of a new session must be different exercises — recorded at generation time, not completion, so repeated generations don't look identical to the model.

**Initial release.** PWA with three tabs (Workout, History, Settings), free-text daily comment, equipment/level/goals profile, Claude-generated sessions with structured output, mark-as-done, swap, and session history.
