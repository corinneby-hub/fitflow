# Features

A walkthrough of every screen, and the reasoning behind the less obvious choices.

---

## Workout tab

### Generating a session

**The comment line.** Free text describing how you feel — "my right shoulder is sore", "feeling strong today", "slept badly". It's sent to the coach and genuinely changes the programming: a sore shoulder means nothing overhead, low energy means reduced intensity. Every workout comes back with a coach note at the top explaining how it adapted.

**Session size.** Three chips: **Express**, **Standard**, **Extended**, each showing an exercise count, e.g. `Standard · 6`. Those counts are learned from your history — Standard is the median number of exercises across your last twelve sessions, Express is about 65% of it, Extended about 135%. Before you have any history it starts at 5. A line underneath tells you what it's based on.

Length is measured in exercises rather than minutes because that's what you actually control in a home gym; a session drifts in duration depending on rests, but "six exercises" is a real plan.

**Focus.** Optional chips (Full body, Upper, Lower, Core, Glutes, Back) that override your usual goals for a single session.

### The exercise list

Each exercise shows its name and `sets × reps · weight`. Tapping it opens the details:

- **What you actually did** — three fields for sets, reps, and weight, pre-filled with the suggestion as a placeholder. Change only what differed, press **Save**, and the card closes with a green flash. A bare number in the weight field is stored as kilograms ("18" → "18 kg"), while "bodyweight" or "red band" are kept verbatim. **↺ Reset** clears all three back to the suggestion.
- **▶ Watch** — opens a YouTube search for a form tutorial for that exact exercise.
- **🔄 Swap** — replace this exercise (see below).
- **🗑 Remove** — drop it from the session.

An edited exercise shows a small **✎ edited** badge on the collapsed card; the original suggestion stays visible inside the expanded view only.

**The checkbox** marks an exercise done and updates the progress bar, which counts exercises: `3/6 · 3 to go`, ending at `6/6 done 🎉`.

**Long-press and drag** any card to reorder the session. Hold for about half a second — the card lifts with a shadow and vibrates briefly — then drag and release. Quick taps still expand, and scrolling never starts a drag.

### Swapping an exercise

The swap sheet takes an optional reason ("hurts my knee", "want something harder") and then offers three levels of steering:

- Leave everything empty and you get a similar exercise for the same muscles.
- Pick a **body part** and the replacement trains that area, preferring a pattern the session doesn't already cover.
- **Name an exercise** and it programs exactly that, falling back to the closest variation your equipment supports.

### Adding an exercise

Same two options: choose a body part and it picks something that complements what's already there, or name the exercise yourself. Session length isn't treated as a constraint here — adding volume is a deliberate choice. If you name something already in the workout it asks first.

### Finishing

**🏁 Finish session** saves everything to History. **✕** discards without saving.

---

## History tab

Every finished session, newest first, showing focus, size, and how many exercises you completed. Tap one to expand it: your comment that day, and each exercise with what you actually did — `4×8 @ 20 kg bar (planned 3×10 @ 13 kg bar)` where you changed something.

**✏️ Edit session** reopens it in the full workout editor. Everything works exactly as in a live session: fix numbers, tick or untick exercises, reorder by dragging, swap, add, remove. **💾 Save changes** updates that same entry — it never creates a duplicate — and the ✕ cancels without saving. If a workout is currently in progress, editing is blocked until you finish or discard it.

**Delete session** is deliberately small, grey, and set apart below a divider so it's hard to hit by accident. It always asks first.

---

## Settings tab

**🏋️ My equipment** — everything available in your home gym. The coach only suggests exercises you can actually do (bodyweight is always allowed).

**📊 My current level** — your working weights and reps in free text. This is the *secondary* source: once you have logged sessions, your recorded numbers take priority. It matters most at the start and for movements you haven't done yet.

**🎯 My goals** — what you want to train. Used to weight the programming, and to decide what to protect when an Express session has to be trimmed.

**📋 Default session size** — which chip is preselected.

**🔑 Anthropic API key** — stored only on this device.

**💾 Backup** — **Export** downloads a JSON file with your history and profile; **Import** reads one back. Import *merges*: it adds sessions you don't already have, matched by id, and never deletes or overwrites. Importing the same file twice does nothing. Your equipment, level, and goals are restored only if empty on this device, so a new phone comes up configured without clobbering settings you've already made. **The API key is never included in the file.**

**🔄 App version** — which build you're running, plus **Force refresh now** to clear the file cache and reload. It never touches your history or settings.

---

## Design decisions

**Why no warm-up or cool-down.** Sessions contain working exercises only. Warm-up and stretching are handled your own way rather than being programmed and padding the list.

**Why no written instructions.** Text form cues were removed in favour of a video link — a demonstration is more useful than a paragraph, and it keeps cards compact.

**Why the app tracks suggested vs actual separately.** Keeping both means the coach can see when it under- or over-shot, and progression comes from real performance rather than its own guesses.

**Why history is only on the device.** No account, no server, no data leaving your phone — which is exactly why the backup feature exists.
