/* ============ FitFlow — Claude API layer ============ */
const Api = (() => {
  const API_URL = "https://api.anthropic.com/v1/messages";
  const MODEL = "claude-opus-4-8";

  const EXERCISE_SCHEMA = {
    type: "object",
    properties: {
      name: { type: "string", description: "Short exercise name" },
      sets: { type: "integer" },
      reps: { type: "string", description: "Reps or duration, e.g. '10' or '30 sec each side'" },
      weight: { type: "string", description: "Load using the user's available equipment, e.g. '6 kg dumbbells' or 'bodyweight'" },
      equipment: { type: "string", description: "Equipment needed, or 'none'" },
      target: { type: "string", description: "Body part and specific muscles trained" },
      minutes: { type: "integer", description: "Estimated minutes including rest" },
      youtube_query: { type: "string", description: "Precise YouTube search phrase that will surface a good form tutorial for this exact exercise, e.g. 'romanian deadlift dumbbell form tutorial'" },
    },
    required: ["name", "sets", "reps", "weight", "equipment", "target", "minutes", "youtube_query"],
    additionalProperties: false,
  };

  const WORKOUT_SCHEMA = {
    type: "object",
    properties: {
      title: { type: "string", description: "Short motivating session title" },
      focus: { type: "string", description: "Main focus of the session" },
      total_minutes: { type: "integer", description: "Sum of the exercise minutes" },
      coach_note: { type: "string", description: "1-2 sentences addressing the user's comment/state and explaining how the session was adapted" },
      exercises: { type: "array", items: EXERCISE_SCHEMA },
    },
    required: ["title", "focus", "total_minutes", "coach_note", "exercises"],
    additionalProperties: false,
  };

  const SINGLE_EXERCISE_SCHEMA = {
    type: "object",
    properties: {
      exercise: EXERCISE_SCHEMA,
      why: { type: "string", description: "One short sentence on why this exercise fits" },
    },
    required: ["exercise", "why"],
    additionalProperties: false,
  };

  /* ---- Learning the user's habitual session shape ---- */

  const BODY_PARTS = {
    Glutes: ["glute", "hip thrust", "hip bridge"],
    Core: ["core", " ab", "abs", "oblique", "plank", "trunk", "dead bug"],
    Chest: ["chest", "pec", "push-up", "pushup", "press-up", "bench"],
    Back: ["back", "lat", "row", "pull-up", "pullup", "rhomboid", "trap", "posture"],
    Shoulders: ["shoulder", "delt", "overhead"],
    Arms: ["bicep", "tricep", "curl", "arm"],
    Legs: ["quad", "hamstring", "leg", "squat", "lunge", "calf", "thigh", "deadlift"],
    Conditioning: ["cardio", "conditioning", "full body", "burpee", "metabolic", "sprint"],
  };

  function bodyPartOf(ex) {
    const hay = `${ex.target || ""} ${ex.name || ""}`.toLowerCase();
    for (const [part, keys] of Object.entries(BODY_PARTS)) {
      if (keys.some(k => hay.includes(k))) return part;
    }
    return "Other";
  }

  // Typical session size + muscle-group mix, learned from recorded sessions
  function learnPattern(history) {
    const sessions = (history || []).slice(0, 12).filter(s => Array.isArray(s.exercises) && s.exercises.length);
    if (!sessions.length) return null;

    const counts = sessions.map(s => s.exercises.length).sort((a, b) => a - b);
    const typical = counts[Math.floor(counts.length / 2)];      // median resists odd sessions

    const tally = {};
    sessions.forEach(s => s.exercises.forEach(e => {
      const p = bodyPartOf(e);
      tally[p] = (tally[p] || 0) + 1;
    }));
    const mix = Object.entries(tally)
      .map(([part, n]) => ({ part, perSession: +(n / sessions.length).toFixed(1) }))
      .sort((a, b) => b.perSession - a.perSession);

    return { typical, sessions: sessions.length, mix };
  }

  // How many exercises each size tier means for this user
  function tierCounts(history) {
    const p = learnPattern(history);
    const standard = p ? p.typical : 5;
    return {
      express: Math.max(3, Math.round(standard * 0.65)),
      standard,
      extended: Math.round(standard * 1.35),
      learned: !!p,
      basedOn: p ? p.sessions : 0,
    };
  }

  // Most recent recorded performance per exercise — the primary level reference
  function provenLevels(history) {
    const seen = new Map();
    (history || []).forEach(s => {              // history is newest-first
      (s.exercises || []).forEach(e => {
        const key = e.name.toLowerCase().trim();
        if (seen.has(key)) return;              // keep only the latest entry per exercise
        const a = actual(e);
        const flags = [
          wasAdjusted(e) ? "USER-ADJUSTED — this is their real capacity, not the suggestion" : null,
          e.done ? null : "not completed",
        ].filter(Boolean);
        seen.set(key, `- ${e.name}: ${a.sets} × ${a.reps} @ ${a.weight} (${s.date}${flags.length ? "; " + flags.join("; ") : ""})`);
      });
    });
    return [...seen.values()].slice(0, 30);
  }

  function buildSystemPrompt(settings, history) {
    const proven = provenLevels(history);
    return [
      "You are an expert functional fitness coach creating personalized home workouts.",
      "",
      "USER PROFILE:",
      `Available equipment: ${settings.equipment || "Not specified — assume bodyweight only."}`,
      `Goals: ${settings.goals || "General full-body functional fitness."}`,
      "",
      "LEVEL CALIBRATION — FOLLOW THIS PRIORITY ORDER:",
      "1. PROVEN LEVELS FROM RECORDED SESSIONS (below) are the primary and most reliable source. Where an entry is marked USER-ADJUSTED, the user overrode your suggestion with what they actually did — treat that number as the truth and never revert to the earlier suggested value.",
      "2. THEN, for movements the recorded sessions do not cover — or if there are no recorded sessions at all — fall back to the user's written level notes below.",
      "3. For anything neither source covers, infer a sensible level from the closest comparable movement in the proven levels.",
      "",
      "PROVEN LEVELS FROM RECORDED SESSIONS (most recent entry per exercise):",
      proven.length ? proven.join("\n") : "No recorded sessions yet — use the written level notes below.",
      "",
      "WRITTEN LEVEL NOTES (secondary source):",
      settings.levels || "Not specified — if there is also no history, assume a beginner and start conservative.",
      "",
      "HARD RULES:",
      "- Only suggest exercises doable with the listed equipment (bodyweight always allowed).",
      "- Calibrate loads/reps using the priority order above, and progress gradually from the proven numbers.",
      "- Functional training style: compound movements, movement quality, balanced programming.",
      "- DO NOT include warm-up, mobility, cool-down or stretching exercises. The user handles those separately. Every exercise you return is a real working exercise.",
      "- VARIETY IS CRITICAL: you have a broad exercise library — do not default to the same staple exercises every time. Rotate movement patterns, implements, angles, and variations (e.g. single-leg, tempo, unilateral, different grips).",
      "- If the user mentions pain, soreness or fatigue, adapt: avoid loading the affected area, reduce intensity, pick alternatives.",
      "- Prefer exercises with a clear, well-known name so the user can look up a demonstration video.",
    ].join("\n");
  }

  // What the user actually performed — their edits win over the suggestion
  function actual(e) {
    return {
      sets: e.actualSets || e.sets,
      reps: e.actualReps || e.reps,
      weight: e.actualWeight || e.weight,
    };
  }
  function wasAdjusted(e) {
    const a = actual(e);
    return String(a.sets) !== String(e.sets) || a.reps !== e.reps || a.weight !== e.weight;
  }

  function summarizeHistory(history) {
    if (!history.length) return "No previous sessions recorded.";
    return history.slice(0, 6).map(s => {
      const done = s.exercises.filter(e => e.done).map(e => {
        const a = actual(e);
        const note = wasAdjusted(e) ? ` — user adjusted this from the prescribed ${e.sets}×${e.reps} @ ${e.weight}` : "";
        return `${e.name} (${a.sets}×${a.reps} @ ${a.weight}${note})`;
      });
      const skipped = s.exercises.filter(e => !e.done).map(e => e.name);
      let line = `${s.date} — "${s.title}" (${s.focus}, ${s.requestedMinutes} min)`;
      if (s.comment) line += ` | user said: "${s.comment}"`;
      line += ` | completed: ${done.join("; ") || "none"}`;
      if (skipped.length) line += ` | skipped: ${skipped.join(", ")}`;
      return line;
    }).join("\n");
  }

  // Describes the session as it currently stands, using the numbers the user actually recorded
  function describeCurrentWorkout(workout) {
    return workout.exercises.map(e => {
      const a = actual(e);
      const edited = wasAdjusted(e)
        ? ` [user changed this from the suggested ${e.sets} × ${e.reps} @ ${e.weight} — the adjusted numbers reflect their true level]`
        : "";
      return `- ${e.name}: ${a.sets} × ${a.reps} @ ${a.weight} (targets: ${e.target})${edited}`;
    }).join("\n");
  }

  async function callClaude(apiKey, system, userMessage, schema) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system,
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: { type: "json_schema", schema } },
      }),
    });

    if (!res.ok) {
      let msg = `API error (${res.status})`;
      try {
        const err = await res.json();
        if (err?.error?.message) msg = err.error.message;
      } catch { /* keep generic message */ }
      if (res.status === 401) msg = "Invalid API key — check it in Settings.";
      if (res.status === 429) msg = "Rate limited — wait a moment and try again.";
      throw new Error(msg);
    }

    const data = await res.json();
    if (data.stop_reason === "refusal") {
      throw new Error("The model declined this request. Try rephrasing your comment.");
    }
    const textBlock = data.content.find(b => b.type === "text");
    if (!textBlock) throw new Error("Empty response from the model — please try again.");
    return JSON.parse(textBlock.text);
  }

  function recentNames(recent) {
    return [...new Set((recent || []).flatMap(r => r.names))];
  }

  return {
    learnPattern,
    tierCounts,

    async generateWorkout({ settings, history, recent, comment, count, tier, focus }) {
      const already = recentNames(recent);
      const pattern = learnPattern(history);

      const userMessage = [
        `Create a functional workout session made of EXACTLY ${count} exercises.`,
        `Session size requested: ${tier.toUpperCase()} (${count} exercises).`,
        "",
        "SESSION SIZE AND BALANCE — THIS IS THE LENGTH CONTROL, NOT TIME:",
        `- Return exactly ${count} exercises. Not more, not fewer.`,
        "- No warm-up, mobility or cool-down entries. Working exercises only.",
        pattern
          ? [
              `- The user's habitual session is ${pattern.typical} exercises, with this muscle-group mix per session: ` +
                pattern.mix.map(m => `${m.part} ${m.perSession}`).join(", ") + ".",
              `- Mirror that mix, scaled proportionally to ${count} exercises.`,
              tier === "express"
                ? "- This is a SHORTER session: trim proportionally across the mix rather than deleting a muscle group the user trains regularly. Protect the areas named in their goals first."
                : tier === "extended"
                ? "- This is a LONGER session: add work that deepens the same balance, favouring the areas named in their goals. Do not pile the extra volume onto one area."
                : "- Keep the balance close to their usual distribution.",
            ].join("\n")
          : "- No session history yet: build a balanced session across the main movement patterns, weighted toward the user's stated goals.",
        "",
        focus ? `Today's requested focus: ${focus}.` : "Focus: follow the user's general goals.",
        comment ? `The user says today: "${comment}" — take this seriously and adapt the session.` : "The user left no comment today.",
        "",
        "RECENT SESSION HISTORY (newest first):",
        summarizeHistory(history),
        "",
        already.length
          ? [
              "EXERCISES ALREADY SUGGESTED IN RECENT WORKOUTS:",
              already.join(", "),
              "HARD VARIETY RULE: at least half of today's exercises must NOT appear on that list (different exercises, not just renamed variations). Pick fresh alternatives that still fit the equipment, level and focus.",
            ].join("\n")
          : "This is one of the first workouts — establish good fundamentals.",
      ].join("\n");

      return callClaude(settings.apiKey, buildSystemPrompt(settings, history), userMessage, WORKOUT_SCHEMA);
    },

    async swapExercise({ settings, history, workout, exercise, reason, bodyPart, exerciseName }) {
      const others = workout.exercises.filter(e => e !== exercise).map(e => e.name);

      // The user can name the replacement, pick a body part, or leave it to the coach
      const steer = exerciseName
        ? [
            `REPLACE IT WITH THIS SPECIFIC EXERCISE: "${exerciseName}"`,
            "- Program exactly this exercise. Use the user's own wording for the name where it is a real exercise; correct only obvious typos.",
            "- If their available equipment cannot support it, program the closest viable variation and explain the substitution in \"why\".",
            "- If the name is ambiguous, pick the most common interpretation for a home functional-training setting and say which one in \"why\".",
          ]
        : bodyPart
        ? [
            `THE REPLACEMENT MUST TRAIN: ${bodyPart}`,
            "- Prefer a movement pattern the session does not already cover, so it complements the other exercises.",
          ]
        : [
            "- Choose a replacement with similar target muscles, unless the reason given calls for something different.",
          ];

      const userMessage = [
        `In the current session "${workout.title}" (focus: ${workout.focus}), the user wants to REPLACE one exercise.`,
        "",
        "CURRENT SESSION (loads shown are what the user is actually doing):",
        describeCurrentWorkout(workout),
        "",
        `REPLACE: ${exercise.name}`,
        reason ? `Reason given: "${reason}"` : "No reason given.",
        "",
        ...steer,
        `- Keep a similar time cost (~${exercise.minutes} min).`,
        "- Calibrate its sets, reps and load to the levels shown in the current session above — especially any numbers the user changed themselves.",
        `- Do NOT suggest any exercise already in the session: ${others.join(", ")}.`,
      ].join("\n");

      return callClaude(settings.apiKey, buildSystemPrompt(settings, history), userMessage, SINGLE_EXERCISE_SCHEMA);
    },

    async addExercise({ settings, history, workout, bodyPart, exerciseName, note }) {
      const existing = workout.exercises.map(e => e.name);

      // Two modes: the user named an exact exercise, or asked for a body part
      const request = exerciseName
        ? [
            `SPECIFIC EXERCISE REQUESTED: "${exerciseName}"`,
            "",
            "RULES FOR THE ADDED EXERCISE:",
            `- Program exactly this exercise. Use the user's own wording for the name where it is a real exercise; correct only obvious typos.`,
            "- If their available equipment cannot support it, program the closest viable variation instead and explain the substitution in \"why\".",
            "- If the name is ambiguous or could mean several movements, pick the most common interpretation for a home functional-training setting and say which one you chose in \"why\".",
          ]
        : [
            `BODY PART REQUESTED: ${bodyPart}`,
            "",
            "RULES FOR THE ADDED EXERCISE:",
            `- It must train ${bodyPart}.`,
            `- It must NOT be any exercise already in the session: ${existing.join(", ")}.`,
            `- Prefer a different muscle group or movement pattern within ${bodyPart} than what is already covered, so the session becomes more complete rather than repetitive.`,
          ];

      const userMessage = [
        `The user wants to ADD one more exercise to their current session "${workout.title}" (focus: ${workout.focus}).`,
        "",
        "CURRENT SESSION (loads shown are what the user is actually doing):",
        describeCurrentWorkout(workout),
        "",
        ...request,
        note ? `- Extra request from the user: "${note}" — honour it.` : "",
        "- CALIBRATE TO THIS SESSION: match the sets, reps and loading of the exercises listed above. Where the user changed a suggested number, that adjusted value is the true indicator of their current capacity — use it as your reference, not the original suggestion.",
        "- Session length is not a constraint here; the user has explicitly chosen to add volume.",
      ].filter(Boolean).join("\n");

      return callClaude(settings.apiKey, buildSystemPrompt(settings, history), userMessage, SINGLE_EXERCISE_SCHEMA);
    },
  };
})();
