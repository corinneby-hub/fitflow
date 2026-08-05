/* ============ FitFlow — Claude API layer ============ */
const Api = (() => {
  const API_URL = "https://api.anthropic.com/v1/messages";
  const MODEL = "claude-opus-4-8";

  // Minutes reserved (not programmed) for the user's own warm-up and stretching
  const RESERVED_MINUTES = 10;

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

  function buildSystemPrompt(settings) {
    return [
      "You are an expert functional fitness coach creating personalized home workouts.",
      "",
      "USER PROFILE:",
      `Available equipment: ${settings.equipment || "Not specified — assume bodyweight only."}`,
      `Current level (working weights/reps): ${settings.levels || "Not specified — assume a beginner and start conservative."}`,
      `Goals: ${settings.goals || "General full-body functional fitness."}`,
      "",
      "HARD RULES:",
      "- Only suggest exercises doable with the listed equipment (bodyweight always allowed).",
      "- Match loads/reps to the user's stated level; progress gradually based on history.",
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
    RESERVED_MINUTES,

    async generateWorkout({ settings, history, recent, comment, minutes, focus }) {
      const workMinutes = Math.max(15, minutes - RESERVED_MINUTES);
      const already = recentNames(recent);

      const userMessage = [
        `Create a functional workout session for today with ${workMinutes} minutes of actual working exercises.`,
        `(The user's total session is ${minutes} minutes; ${RESERVED_MINUTES} minutes are reserved for their own warm-up and stretching, which you do NOT program.)`,
        "",
        "SESSION DENSITY:",
        `- Fill the ${workMinutes} minutes with real working exercises — aim for roughly one exercise per 7-9 minutes, so around ${Math.max(3, Math.round(workMinutes / 8))} exercises.`,
        "- No warm-up, mobility or cool-down entries. Working exercises only.",
        "- The sum of the exercises' minutes should be close to the working minutes above.",
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

      return callClaude(settings.apiKey, buildSystemPrompt(settings), userMessage, WORKOUT_SCHEMA);
    },

    async swapExercise({ settings, workout, exercise, reason }) {
      const others = workout.exercises.filter(e => e !== exercise).map(e => e.name);
      const userMessage = [
        `In the current session "${workout.title}" (focus: ${workout.focus}), the user wants to REPLACE one exercise.`,
        "",
        "CURRENT SESSION (loads shown are what the user is actually doing):",
        describeCurrentWorkout(workout),
        "",
        `REPLACE: ${exercise.name}`,
        reason ? `Reason given: "${reason}"` : "No reason given — just offer a different exercise.",
        "",
        `Suggest ONE replacement with a similar time cost (~${exercise.minutes} min) and, unless the reason says otherwise, similar target muscles.`,
        "Calibrate its sets, reps and load to the levels shown in the current session above — especially any numbers the user changed themselves.",
        `Do NOT suggest any exercise already in the session: ${others.join(", ")}.`,
      ].join("\n");

      return callClaude(settings.apiKey, buildSystemPrompt(settings), userMessage, SINGLE_EXERCISE_SCHEMA);
    },

    async addExercise({ settings, workout, bodyPart, exerciseName, note }) {
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

      return callClaude(settings.apiKey, buildSystemPrompt(settings), userMessage, SINGLE_EXERCISE_SCHEMA);
    },
  };
})();
