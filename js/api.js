/* ============ FitFlow — Claude API layer ============ */
const Api = (() => {
  const API_URL = "https://api.anthropic.com/v1/messages";
  const MODEL = "claude-opus-4-8";

  const EXERCISE_SCHEMA = {
    type: "object",
    properties: {
      name: { type: "string", description: "Short exercise name" },
      section: { type: "string", enum: ["warmup", "main", "cooldown"] },
      sets: { type: "integer" },
      reps: { type: "string", description: "Reps or duration, e.g. '10' or '30 sec each side'" },
      weight: { type: "string", description: "Load using the user's available equipment, e.g. '6 kg dumbbells' or 'bodyweight'" },
      equipment: { type: "string", description: "Equipment needed, or 'none'" },
      target: { type: "string", description: "Main muscles / movement pattern trained" },
      minutes: { type: "integer", description: "Estimated minutes including rest" },
      instructions: { type: "string", description: "Clear step-by-step form cues for performing it correctly, 3-6 short lines" },
      youtube_query: { type: "string", description: "Good YouTube search phrase to find a tutorial video, e.g. 'romanian deadlift dumbbell form tutorial'" },
    },
    required: ["name", "section", "sets", "reps", "weight", "equipment", "target", "minutes", "instructions", "youtube_query"],
    additionalProperties: false,
  };

  const WORKOUT_SCHEMA = {
    type: "object",
    properties: {
      title: { type: "string", description: "Short motivating session title" },
      focus: { type: "string", description: "Main focus of the session" },
      total_minutes: { type: "integer" },
      coach_note: { type: "string", description: "1-2 sentences addressing the user's comment/state and explaining how the session was adapted" },
      exercises: { type: "array", items: EXERCISE_SCHEMA },
    },
    required: ["title", "focus", "total_minutes", "coach_note", "exercises"],
    additionalProperties: false,
  };

  const SWAP_SCHEMA = {
    type: "object",
    properties: {
      exercise: EXERCISE_SCHEMA,
      why: { type: "string", description: "One sentence on why this replacement fits" },
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
      "- Always include a short warmup (section 'warmup') and cooldown/stretching (section 'cooldown').",
      "- Vary exercises across sessions — check the recent session history and avoid repeating the same main exercises every time.",
      "- If the user mentions pain, soreness or fatigue, adapt: avoid loading the affected area, reduce intensity, pick alternatives.",
      "- The sum of exercise minutes must fit the requested session length.",
      "- Write instructions clearly for someone who may not know the exercise.",
    ].join("\n");
  }

  function summarizeHistory(history) {
    if (!history.length) return "No previous sessions recorded.";
    return history.slice(0, 6).map(s => {
      const done = s.exercises.filter(e => e.done).map(e => e.name);
      const skipped = s.exercises.filter(e => !e.done).map(e => e.name);
      let line = `${s.date} — "${s.title}" (${s.focus}, ${s.requestedMinutes} min planned)`;
      if (s.comment) line += ` | user said: "${s.comment}"`;
      line += ` | completed: ${done.join(", ") || "none"}`;
      if (skipped.length) line += ` | skipped: ${skipped.join(", ")}`;
      return line;
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

  return {
    async generateWorkout({ settings, history, comment, minutes, focus }) {
      const userMessage = [
        `Create a ${minutes}-minute functional workout session for today.`,
        focus ? `Today's requested focus: ${focus}.` : "Focus: follow the user's general goals.",
        comment ? `The user says today: "${comment}" — take this seriously and adapt the session.` : "The user left no comment today.",
        "",
        "RECENT SESSION HISTORY (newest first):",
        summarizeHistory(history),
      ].join("\n");

      return callClaude(settings.apiKey, buildSystemPrompt(settings), userMessage, WORKOUT_SCHEMA);
    },

    async swapExercise({ settings, workout, exercise, reason }) {
      const others = workout.exercises.filter(e => e !== exercise).map(e => e.name);
      const userMessage = [
        `In the current session "${workout.title}" (focus: ${workout.focus}), the user wants to REPLACE this exercise:`,
        `${exercise.name} — ${exercise.sets} sets × ${exercise.reps} @ ${exercise.weight} (section: ${exercise.section}, targets: ${exercise.target})`,
        reason ? `Reason given: "${reason}"` : "No reason given — just offer a different exercise.",
        "",
        `Suggest ONE replacement for the same section ("${exercise.section}") with a similar time cost (~${exercise.minutes} min) and, unless the reason says otherwise, similar target muscles.`,
        `Do NOT suggest any of these exercises already in the session: ${others.join(", ")}.`,
      ].join("\n");

      return callClaude(settings.apiKey, buildSystemPrompt(settings), userMessage, SWAP_SCHEMA);
    },
  };
})();
