/* ============ FitFlow — app logic ============ */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  let currentWorkout = null;
  let swapIndex = null;
  let editingSessionId = null;   // set when editing a session from History

  const LOADING_MESSAGES = [
    "Building your workout…",
    "Checking your equipment list…",
    "Matching exercises to your level…",
    "Balancing muscle groups…",
    "Almost there…",
  ];
  let loadingTimer = null;

  /* ---------------- Tabs ---------------- */
  function switchTab(name) {
    $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    $$(".tab").forEach(t => t.classList.toggle("active", t.id === `tab-${name}`));
    if (name === "history") renderHistory();
    window.scrollTo({ top: 0 });
  }
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  /* ---------------- Chips ---------------- */
  function initChipGroup(containerId, { deselectable = true } = {}) {
    const container = $(containerId);
    container.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      const wasSelected = chip.classList.contains("selected");
      container.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
      if (!(wasSelected && deselectable)) chip.classList.add("selected");
      if (containerId === "#duration-chips") {
        $("#custom-duration").classList.toggle("hidden", chip.dataset.min !== "custom" || !chip.classList.contains("selected"));
      }
    });
  }
  initChipGroup("#duration-chips", { deselectable: false });
  initChipGroup("#focus-chips");
  initChipGroup("#bodypart-chips");

  function selectedDuration() {
    const chip = $("#duration-chips .chip.selected");
    if (!chip) return Store.getSettings().defaultDuration;
    if (chip.dataset.min === "custom") {
      const v = parseInt($("#custom-duration").value, 10);
      return (v >= 10 && v <= 180) ? v : Store.getSettings().defaultDuration;
    }
    return parseInt(chip.dataset.min, 10);
  }

  function selectedFocus() {
    const chip = $("#focus-chips .chip.selected");
    return chip ? chip.dataset.focus : null;
  }

  function preselectDefaultDuration() {
    const def = String(Store.getSettings().defaultDuration);
    $$("#duration-chips .chip").forEach(c => c.classList.toggle("selected", c.dataset.min === def));
    if (!$("#duration-chips .chip.selected")) $$("#duration-chips .chip")[1].classList.add("selected");
  }

  /* ---------------- Generate ---------------- */
  $("#btn-generate").addEventListener("click", async () => {
    const settings = Store.getSettings();
    const errEl = $("#generate-error");
    errEl.classList.add("hidden");

    if (!settings.apiKey) {
      errEl.textContent = "Add your Anthropic API key in Settings first.";
      errEl.classList.remove("hidden");
      return;
    }

    const comment = $("#user-comment").value.trim();
    const minutes = selectedDuration();
    const focus = selectedFocus();

    setLoading(true);
    try {
      const plan = await Api.generateWorkout({
        settings,
        history: Store.getHistory(),
        recent: Store.getRecentSuggestions(),
        comment, minutes, focus,
      });
      Store.addRecentSuggestion(plan.exercises.map(e => e.name));

      currentWorkout = {
        ...plan,
        comment,
        requestedMinutes: minutes,
        exercises: plan.exercises.map(e => ({ ...e, done: false, actualSets: "", actualReps: "", actualWeight: "" })),
        startedAt: new Date().toISOString(),
      };
      Store.saveCurrentWorkout(currentWorkout);
      renderWorkout();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    } finally {
      setLoading(false);
    }
  });

  function setLoading(on, text) {
    $("#loading").classList.toggle("hidden", !on);
    $("#generator").classList.toggle("hidden", on || !!currentWorkout);
    $("#workout-view").classList.toggle("hidden", on || !currentWorkout);
    $("#btn-generate").disabled = on;
    clearInterval(loadingTimer);
    if (on) {
      let i = 0;
      $("#loading-text").textContent = text || LOADING_MESSAGES[0];
      if (!text) {
        loadingTimer = setInterval(() => {
          i = Math.min(i + 1, LOADING_MESSAGES.length - 1);
          $("#loading-text").textContent = LOADING_MESSAGES[i];
        }, 6000);
      }
    }
  }

  /* ---------------- Render workout ---------------- */
  function workMinutes() {
    return currentWorkout.exercises.reduce((sum, e) => sum + (e.minutes || 0), 0);
  }

  function renderWorkout() {
    if (!currentWorkout) return;
    $("#generator").classList.add("hidden");
    $("#finished-view").classList.add("hidden");
    $("#workout-view").classList.remove("hidden");

    const editing = !!editingSessionId;
    $("#edit-banner").classList.toggle("hidden", !editing);
    $("#btn-finish").textContent = editing ? "💾 Save changes" : "🏁 Finish session";
    $("#btn-discard").title = editing ? "Cancel editing" : "Discard workout";

    $("#workout-title").textContent = currentWorkout.title;
    $("#coach-note").textContent = currentWorkout.coach_note;
    $("#workout-meta").innerHTML = [
      `⏱️ ~${workMinutes()} min of work`,
      `🎯 ${escapeHtml(currentWorkout.focus)}`,
      `${currentWorkout.exercises.length} exercises`,
      `+ ${Api.RESERVED_MINUTES} min your own warm-up & stretch`,
    ].map(t => `<span class="meta-pill">${t}</span>`).join("");

    const list = $("#exercise-list");
    list.innerHTML = "";
    currentWorkout.exercises.forEach((ex, i) => list.appendChild(exerciseCard(ex, i)));

    updateProgress();
  }

  // What the user actually did — falls back to the suggested values
  function effective(ex) {
    return {
      sets: ex.actualSets || ex.sets,
      reps: ex.actualReps || ex.reps,
      weight: ex.actualWeight || ex.weight,
    };
  }

  function isEdited(ex) {
    const e = effective(ex);
    return String(e.sets) !== String(ex.sets) || e.reps !== ex.reps || e.weight !== ex.weight;
  }

  function detailLine(ex) {
    const e = effective(ex);
    const main = `${escapeHtml(e.sets)} × ${escapeHtml(e.reps)} · ${escapeHtml(e.weight)} · ~${ex.minutes} min`;
    if (!isEdited(ex)) return main;
    return `${main} <span class="edited-badge">✎ edited</span>
      <div class="ex-suggested">suggested: ${escapeHtml(ex.sets)} × ${escapeHtml(ex.reps)} · ${escapeHtml(ex.weight)}</div>`;
  }

  function exerciseCard(ex, i) {
    const card = document.createElement("div");
    card.className = "exercise-card" + (ex.done ? " done" : "");
    card.dataset.index = i;

    const ytUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(ex.youtube_query);

    card.innerHTML = `
      <div class="ex-main">
        <div class="ex-check" role="checkbox" aria-checked="${ex.done}" title="Mark done">✓</div>
        <div class="ex-info">
          <div class="ex-name">${escapeHtml(ex.name)}</div>
          <div class="ex-detail">${detailLine(ex)}</div>
        </div>
        <button class="ex-expand" title="Details">▾</button>
      </div>
      <div class="ex-body">
        <div class="actual-editor">
          <div class="actual-head">
            <label>💪 What you actually did</label>
            <div class="actual-head-btns">
              <button class="btn-reset-actual" title="Clear back to the suggested numbers">↺ Reset</button>
              <button class="btn-save-actual">Save</button>
            </div>
          </div>
          <div class="actual-grid">
            <div class="actual-field">
              <span>Sets</span>
              <input type="text" inputmode="numeric" class="ex-sets-input" value="${escapeHtml(ex.actualSets || "")}" placeholder="${escapeHtml(ex.sets)}" />
            </div>
            <div class="actual-field">
              <span>Reps</span>
              <input type="text" class="ex-reps-input" value="${escapeHtml(ex.actualReps || "")}" placeholder="${escapeHtml(ex.reps)}" />
            </div>
            <div class="actual-field">
              <span>Weight</span>
              <input type="text" class="ex-weight-input" value="${escapeHtml(ex.actualWeight || "")}" placeholder="${escapeHtml(ex.weight)}" />
            </div>
          </div>
          <div class="weight-hint">Suggested: ${escapeHtml(ex.sets)} × ${escapeHtml(ex.reps)} @ ${escapeHtml(ex.weight)}</div>
        </div>
        <div class="ex-target">🎯 ${escapeHtml(ex.target)}</div>
        <div class="ex-actions">
          <a class="btn btn-video" href="${ytUrl}" target="_blank" rel="noopener">▶ Watch</a>
          <button class="btn btn-swap-ex">🔄 Swap</button>
          <button class="btn btn-remove-ex">🗑 Remove</button>
        </div>
      </div>`;

    card.querySelector(".ex-check").addEventListener("click", () => {
      ex.done = !ex.done;
      card.classList.toggle("done", ex.done);
      card.querySelector(".ex-check").setAttribute("aria-checked", ex.done);
      Store.saveCurrentWorkout(currentWorkout);
      updateProgress();
    });

    if (ex._expanded) card.classList.add("expanded");
    const toggle = () => { ex._expanded = card.classList.toggle("expanded"); };
    card.querySelector(".ex-info").addEventListener("click", toggle);
    card.querySelector(".ex-expand").addEventListener("click", toggle);

    // --- sets / reps / weight editing ---
    const inputs = {
      actualSets: card.querySelector(".ex-sets-input"),
      actualReps: card.querySelector(".ex-reps-input"),
      actualWeight: card.querySelector(".ex-weight-input"),
    };
    const commit = () => {
      Object.entries(inputs).forEach(([field, el]) => { ex[field] = el.value.trim(); });
      Store.saveCurrentWorkout(currentWorkout);
      card.querySelector(".ex-detail").innerHTML = detailLine(ex);
    };
    Object.values(inputs).forEach(el => {
      el.addEventListener("change", commit);
      el.addEventListener("blur", commit);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") el.blur(); });
    });
    card.querySelector(".btn-reset-actual").addEventListener("click", () => {
      Object.values(inputs).forEach(el => { el.value = ""; });
      commit();
    });

    // Explicit save: stores the numbers, closes the card and flashes the updated summary
    card.querySelector(".btn-save-actual").addEventListener("click", () => {
      commit();
      ex._expanded = false;
      card.classList.remove("expanded");
      card.classList.add("just-saved");
      setTimeout(() => card.classList.remove("just-saved"), 900);
    });

    card.querySelector(".btn-swap-ex").addEventListener("click", () => openSwap(i));
    card.querySelector(".btn-remove-ex").addEventListener("click", () => removeExercise(i));

    return card;
  }

  function updateProgress() {
    const total = currentWorkout.exercises.length;
    const done = currentWorkout.exercises.filter(e => e.done).length;
    $("#progress-fill").style.width = total ? `${(done / total) * 100}%` : "0%";
    $("#progress-label").textContent = `${done}/${total} done`;
  }

  /* ---------------- Remove ---------------- */
  function removeExercise(index) {
    const ex = currentWorkout.exercises[index];
    if (!confirm(`Remove "${ex.name}" from this workout?`)) return;
    currentWorkout.exercises.splice(index, 1);
    Store.saveCurrentWorkout(currentWorkout);
    renderWorkout();
  }

  /* ---------------- Swap ---------------- */
  function openSwap(index) {
    swapIndex = index;
    $("#swap-target-name").textContent = currentWorkout.exercises[index].name;
    $("#swap-reason").value = "";
    $("#swap-error").classList.add("hidden");
    $("#swap-overlay").classList.remove("hidden");
  }

  $("#btn-swap-cancel").addEventListener("click", () => $("#swap-overlay").classList.add("hidden"));
  $("#swap-overlay").addEventListener("click", (e) => {
    if (e.target === $("#swap-overlay")) $("#swap-overlay").classList.add("hidden");
  });

  $("#btn-swap-confirm").addEventListener("click", async () => {
    const btn = $("#btn-swap-confirm");
    const errEl = $("#swap-error");
    errEl.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "Finding alternative…";

    try {
      const result = await Api.swapExercise({
        settings: Store.getSettings(),
        history: Store.getHistory(),
        workout: currentWorkout,
        exercise: currentWorkout.exercises[swapIndex],
        reason: $("#swap-reason").value.trim(),
      });
      currentWorkout.exercises[swapIndex] = { ...result.exercise, done: false, actualSets: "", actualReps: "", actualWeight: "" };
      Store.addRecentSuggestion([result.exercise.name]);
      Store.saveCurrentWorkout(currentWorkout);
      $("#swap-overlay").classList.add("hidden");
      renderWorkout();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "🔄 Swap it";
    }
  });

  /* ---------------- Add exercise ---------------- */
  $("#btn-add-exercise").addEventListener("click", () => {
    $$("#bodypart-chips .chip").forEach(c => c.classList.remove("selected"));
    $("#add-exercise-name").value = "";
    $("#add-note").value = "";
    $("#add-error").classList.add("hidden");
    $("#add-overlay").classList.remove("hidden");
  });

  // The two inputs are alternatives — choosing one clears the other
  $("#add-exercise-name").addEventListener("input", () => {
    if ($("#add-exercise-name").value.trim()) {
      $$("#bodypart-chips .chip").forEach(c => c.classList.remove("selected"));
    }
  });
  $("#bodypart-chips").addEventListener("click", (e) => {
    if (e.target.closest(".chip")) $("#add-exercise-name").value = "";
  });

  $("#btn-add-cancel").addEventListener("click", () => $("#add-overlay").classList.add("hidden"));
  $("#add-overlay").addEventListener("click", (e) => {
    if (e.target === $("#add-overlay")) $("#add-overlay").classList.add("hidden");
  });

  $("#btn-add-confirm").addEventListener("click", async () => {
    const btn = $("#btn-add-confirm");
    const errEl = $("#add-error");
    errEl.classList.add("hidden");

    const chip = $("#bodypart-chips .chip.selected");
    const exerciseName = $("#add-exercise-name").value.trim();

    if (!chip && !exerciseName) {
      errEl.textContent = "Pick a body part, or type the name of an exercise.";
      errEl.classList.remove("hidden");
      return;
    }

    // Warn if they're naming something already in the session
    if (exerciseName) {
      const dupe = currentWorkout.exercises.find(
        e => e.name.toLowerCase().trim() === exerciseName.toLowerCase()
      );
      if (dupe && !confirm(`"${dupe.name}" is already in this workout. Add it again anyway?`)) return;
    }

    btn.disabled = true;
    btn.textContent = exerciseName ? "Adding it…" : "Finding an exercise…";
    try {
      const result = await Api.addExercise({
        settings: Store.getSettings(),
        history: Store.getHistory(),
        workout: currentWorkout,
        bodyPart: chip ? chip.dataset.part : null,
        exerciseName,
        note: $("#add-note").value.trim(),
      });
      currentWorkout.exercises.push({ ...result.exercise, done: false, actualSets: "", actualReps: "", actualWeight: "" });
      Store.addRecentSuggestion([result.exercise.name]);
      Store.saveCurrentWorkout(currentWorkout);
      $("#add-overlay").classList.add("hidden");
      renderWorkout();
      const cards = $$(".exercise-card");
      cards[cards.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "➕ Add exercise";
    }
  });

  /* ---------------- Finish / save edits / discard ---------------- */
  // Full exercise data is stored so a session can be reopened for editing later
  function serializeExercises() {
    return currentWorkout.exercises.map(e => ({
      name: e.name,
      sets: e.sets, reps: e.reps, weight: e.weight,
      actualSets: e.actualSets || "", actualReps: e.actualReps || "", actualWeight: e.actualWeight || "",
      equipment: e.equipment || "", target: e.target || "", minutes: e.minutes || 0,
      youtube_query: e.youtube_query || `${e.name} form tutorial`,
      done: e.done,
    }));
  }

  $("#btn-finish").addEventListener("click", () => {
    // --- saving edits to an existing history entry ---
    if (editingSessionId) {
      Store.updateSession(editingSessionId, {
        title: currentWorkout.title,
        focus: currentWorkout.focus,
        requestedMinutes: currentWorkout.requestedMinutes,
        comment: currentWorkout.comment,
        exercises: serializeExercises(),
      });
      editingSessionId = null;
      currentWorkout = null;
      Store.clearCurrentWorkout();
      $("#workout-view").classList.add("hidden");
      $("#generator").classList.remove("hidden");
      updateStreak();
      switchTab("history");
      return;
    }

    const done = currentWorkout.exercises.filter(e => e.done).length;
    const total = currentWorkout.exercises.length;
    if (done === 0 && !confirm("No exercises are marked as done. Finish anyway?")) return;

    Store.addSession({
      id: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      title: currentWorkout.title,
      focus: currentWorkout.focus,
      requestedMinutes: currentWorkout.requestedMinutes,
      comment: currentWorkout.comment,
      exercises: serializeExercises(),
    });

    $("#finished-summary").textContent = `You completed ${done} of ${total} exercises. It's saved to your history and will shape your next workouts.`;
    currentWorkout = null;
    Store.clearCurrentWorkout();
    $("#workout-view").classList.add("hidden");
    $("#finished-view").classList.remove("hidden");
    updateStreak();
    window.scrollTo({ top: 0 });
  });

  $("#btn-new-workout").addEventListener("click", () => {
    $("#finished-view").classList.add("hidden");
    $("#generator").classList.remove("hidden");
    $("#user-comment").value = "";
    $$("#focus-chips .chip").forEach(c => c.classList.remove("selected"));
    preselectDefaultDuration();
  });

  $("#btn-discard").addEventListener("click", () => {
    if (editingSessionId) {
      if (!confirm("Stop editing? Changes you made here will not be saved to History.")) return;
      editingSessionId = null;
      currentWorkout = null;
      Store.clearCurrentWorkout();
      $("#workout-view").classList.add("hidden");
      $("#generator").classList.remove("hidden");
      switchTab("history");
      return;
    }
    if (!confirm("Discard this workout without saving it to history?")) return;
    currentWorkout = null;
    Store.clearCurrentWorkout();
    $("#workout-view").classList.add("hidden");
    $("#generator").classList.remove("hidden");
  });

  /* ---------------- Edit a saved session ---------------- */
  function startEditingSession(session) {
    if (currentWorkout && !editingSessionId) {
      alert("You have a workout in progress. Finish or discard it before editing a saved session.");
      switchTab("workout");
      return;
    }
    if (editingSessionId && editingSessionId !== session.id &&
        !confirm("You're already editing another saved session. Switch to this one? Unsaved changes will be lost.")) return;

    editingSessionId = session.id;
    currentWorkout = {
      _editingId: session.id,
      title: session.title,
      focus: session.focus,
      coach_note: session.coach_note || `Saved session from ${formatDate(session.date)}.`,
      requestedMinutes: session.requestedMinutes,
      comment: session.comment || "",
      exercises: session.exercises.map(e => ({
        name: e.name,
        sets: e.sets, reps: e.reps, weight: e.weight,
        actualSets: e.actualSets || "", actualReps: e.actualReps || "", actualWeight: e.actualWeight || "",
        equipment: e.equipment || "", target: e.target || "—", minutes: e.minutes || 0,
        youtube_query: e.youtube_query || `${e.name} form tutorial`,
        done: !!e.done,
      })),
    };
    Store.saveCurrentWorkout(currentWorkout);
    renderWorkout();
    switchTab("workout");
  }

  /* ---------------- History ---------------- */
  function renderHistory() {
    const history = Store.getHistory();
    $("#history-empty").classList.toggle("hidden", history.length > 0);
    const list = $("#history-list");
    list.innerHTML = "";

    history.forEach(s => {
      const done = s.exercises.filter(e => e.done).length;
      const card = document.createElement("div");
      card.className = "card history-card";
      card.innerHTML = `
        <div class="history-head">
          <span class="history-title">${escapeHtml(s.title)}</span>
          <span class="history-date">${formatDate(s.date)}</span>
        </div>
        <div class="history-stats">🎯 ${escapeHtml(s.focus)} · ⏱️ ${s.requestedMinutes} min · ✅ ${done}/${s.exercises.length} done</div>
        <div class="history-exercises">
          ${s.comment ? `<div class="history-comment">💬 "${escapeHtml(s.comment)}"</div>` : ""}
          ${s.exercises.map(e => {
            const a = effective(e);
            const changed = isEdited(e);
            const planned = changed
              ? ` <span class="weight-edited">(planned ${escapeHtml(e.sets)}×${escapeHtml(e.reps)} @ ${escapeHtml(e.weight)})</span>`
              : "";
            return `<div class="${e.done ? "hist-done" : "hist-skip"}">${e.done ? "✓" : "✕"} ${escapeHtml(e.name)} — ${escapeHtml(a.sets)}×${escapeHtml(a.reps)} @ ${escapeHtml(a.weight)}${planned}</div>`;
          }).join("")}
          <div class="history-actions">
            <button class="btn btn-edit-session">✏️ Edit session</button>
            <button class="btn btn-delete-session">🗑 Delete</button>
          </div>
        </div>`;

      card.querySelector(".history-head").addEventListener("click", () => card.classList.toggle("expanded"));
      card.querySelector(".history-stats").addEventListener("click", () => card.classList.toggle("expanded"));
      card.querySelector(".btn-edit-session").addEventListener("click", (e) => {
        e.stopPropagation();
        startEditingSession(s);
      });
      card.querySelector(".btn-delete-session").addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Delete this session from history?")) {
          Store.deleteSession(s.id);
          renderHistory();
          updateStreak();
        }
      });
      list.appendChild(card);
    });
  }

  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function updateStreak() {
    const history = Store.getHistory();
    const badge = $("#streak-badge");
    if (!history.length) { badge.classList.add("hidden"); return; }
    const week = history.filter(s => (Date.now() - new Date(s.date)) < 7 * 864e5).length;
    badge.textContent = `${week} this week · ${history.length} total`;
    badge.classList.remove("hidden");
  }

  /* ---------------- Settings ---------------- */
  function loadSettingsForm() {
    const s = Store.getSettings();
    $("#set-equipment").value = s.equipment;
    $("#set-levels").value = s.levels;
    $("#set-goals").value = s.goals;
    $("#set-duration").value = String(s.defaultDuration);
    $("#set-apikey").value = s.apiKey;
  }

  $("#btn-save-settings").addEventListener("click", () => {
    Store.saveSettings({
      equipment: $("#set-equipment").value.trim(),
      levels: $("#set-levels").value.trim(),
      goals: $("#set-goals").value.trim(),
      defaultDuration: parseInt($("#set-duration").value, 10),
      apiKey: $("#set-apikey").value.trim(),
    });
    preselectDefaultDuration();
    const ok = $("#settings-saved");
    ok.classList.remove("hidden");
    setTimeout(() => ok.classList.add("hidden"), 2000);
  });

  /* ---------------- Utils ---------------- */
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  /* ---------------- Init ---------------- */
  function init() {
    loadSettingsForm();
    preselectDefaultDuration();
    updateStreak();

    const saved = Store.getCurrentWorkout();
    if (saved) {
      currentWorkout = saved;
      editingSessionId = saved._editingId || null;
      currentWorkout.exercises.forEach(e => {
        ["actualSets", "actualReps", "actualWeight"].forEach(f => { if (e[f] === undefined) e[f] = ""; });
      });
      renderWorkout();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  init();
})();
