/* ============ FitFlow — app logic ============ */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  let currentWorkout = null;   // { title, focus, total_minutes, coach_note, exercises:[{...,done}], comment, requestedMinutes }
  let swapIndex = null;

  const LOADING_MESSAGES = [
    "Building your workout…",
    "Checking your equipment list…",
    "Matching exercises to your level…",
    "Balancing muscle groups…",
    "Almost there…",
  ];
  let loadingTimer = null;

  /* ---------------- Tabs ---------------- */
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      $$(".tab").forEach(t => t.classList.remove("active"));
      $(`#tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "history") renderHistory();
      window.scrollTo({ top: 0 });
    });
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
    $$("#duration-chips .chip").forEach(c => {
      c.classList.toggle("selected", c.dataset.min === def);
    });
    if (!$("#duration-chips .chip.selected")) {
      $$("#duration-chips .chip")[1].classList.add("selected"); // 45 fallback
    }
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
        comment, minutes, focus,
      });
      currentWorkout = {
        ...plan,
        comment,
        requestedMinutes: minutes,
        exercises: plan.exercises.map(e => ({ ...e, done: false })),
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

  function setLoading(on) {
    $("#loading").classList.toggle("hidden", !on);
    $("#generator").classList.toggle("hidden", on || !!currentWorkout);
    $("#workout-view").classList.toggle("hidden", on || !currentWorkout);
    $("#btn-generate").disabled = on;
    clearInterval(loadingTimer);
    if (on) {
      let i = 0;
      $("#loading-text").textContent = LOADING_MESSAGES[0];
      loadingTimer = setInterval(() => {
        i = Math.min(i + 1, LOADING_MESSAGES.length - 1);
        $("#loading-text").textContent = LOADING_MESSAGES[i];
      }, 6000);
    }
  }

  /* ---------------- Render workout ---------------- */
  const SECTION_LABELS = { warmup: "🔥 Warm-up", main: "💪 Main workout", cooldown: "🧘 Cool-down" };

  function renderWorkout() {
    if (!currentWorkout) return;
    $("#generator").classList.add("hidden");
    $("#finished-view").classList.add("hidden");
    $("#workout-view").classList.remove("hidden");

    $("#workout-title").textContent = currentWorkout.title;
    $("#coach-note").textContent = currentWorkout.coach_note;
    $("#workout-meta").innerHTML = [
      `⏱️ ~${currentWorkout.total_minutes} min`,
      `🎯 ${escapeHtml(currentWorkout.focus)}`,
      `${currentWorkout.exercises.length} exercises`,
    ].map(t => `<span class="meta-pill">${t}</span>`).join("");

    const list = $("#exercise-list");
    list.innerHTML = "";
    let lastSection = null;

    currentWorkout.exercises.forEach((ex, i) => {
      if (ex.section !== lastSection) {
        lastSection = ex.section;
        const h = document.createElement("div");
        h.className = "section-header";
        h.textContent = SECTION_LABELS[ex.section] || ex.section;
        list.appendChild(h);
      }
      list.appendChild(exerciseCard(ex, i));
    });

    updateProgress();
  }

  function exerciseCard(ex, i) {
    const card = document.createElement("div");
    card.className = "exercise-card" + (ex.done ? " done" : "");
    card.dataset.index = i;

    const detail = `${ex.sets} × ${escapeHtml(ex.reps)} · ${escapeHtml(ex.weight)} · ~${ex.minutes} min`;
    const ytUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(ex.youtube_query);

    card.innerHTML = `
      <div class="ex-main">
        <div class="ex-check" role="checkbox" aria-checked="${ex.done}" title="Mark done">✓</div>
        <div class="ex-info">
          <div class="ex-name">${escapeHtml(ex.name)}</div>
          <div class="ex-detail">${detail}</div>
        </div>
        <button class="ex-expand" title="Details">▾</button>
      </div>
      <div class="ex-body">
        <div class="ex-instructions">${escapeHtml(ex.instructions)}</div>
        <div class="ex-target">🎯 ${escapeHtml(ex.target)}</div>
        <div class="ex-actions">
          <a class="btn btn-video" href="${ytUrl}" target="_blank" rel="noopener">▶ Watch video</a>
          <button class="btn btn-swap-ex">🔄 Swap</button>
        </div>
      </div>`;

    card.querySelector(".ex-check").addEventListener("click", () => {
      ex.done = !ex.done;
      card.classList.toggle("done", ex.done);
      card.querySelector(".ex-check").setAttribute("aria-checked", ex.done);
      Store.saveCurrentWorkout(currentWorkout);
      updateProgress();
    });

    const toggle = () => card.classList.toggle("expanded");
    card.querySelector(".ex-info").addEventListener("click", toggle);
    card.querySelector(".ex-expand").addEventListener("click", toggle);

    card.querySelector(".btn-swap-ex").addEventListener("click", () => openSwap(i));

    return card;
  }

  function updateProgress() {
    const total = currentWorkout.exercises.length;
    const done = currentWorkout.exercises.filter(e => e.done).length;
    $("#progress-fill").style.width = total ? `${(done / total) * 100}%` : "0%";
    $("#progress-label").textContent = `${done}/${total} done`;
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
    const settings = Store.getSettings();
    const btn = $("#btn-swap-confirm");
    const errEl = $("#swap-error");
    errEl.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "Finding alternative…";

    try {
      const result = await Api.swapExercise({
        settings,
        workout: currentWorkout,
        exercise: currentWorkout.exercises[swapIndex],
        reason: $("#swap-reason").value.trim(),
      });
      currentWorkout.exercises[swapIndex] = { ...result.exercise, done: false };
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

  /* ---------------- Finish / discard ---------------- */
  $("#btn-finish").addEventListener("click", () => {
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
      exercises: currentWorkout.exercises.map(e => ({
        name: e.name, section: e.section, sets: e.sets,
        reps: e.reps, weight: e.weight, done: e.done,
      })),
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
    if (!confirm("Discard this workout without saving it to history?")) return;
    currentWorkout = null;
    Store.clearCurrentWorkout();
    $("#workout-view").classList.add("hidden");
    $("#generator").classList.remove("hidden");
  });

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
          ${s.exercises.map(e =>
            `<div class="${e.done ? "hist-done" : "hist-skip"}">${e.done ? "✓" : "✕"} ${escapeHtml(e.name)} — ${e.sets}×${escapeHtml(e.reps)} @ ${escapeHtml(e.weight)}</div>`
          ).join("")}
          <button class="btn-delete-session">Delete this session</button>
        </div>`;

      card.querySelector(".history-head").addEventListener("click", () => card.classList.toggle("expanded"));
      card.querySelector(".history-stats").addEventListener("click", () => card.classList.toggle("expanded"));
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
      renderWorkout();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  init();
})();
