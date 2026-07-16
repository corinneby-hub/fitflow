/* ============ FitFlow — local storage layer ============ */
const Store = (() => {
  const KEYS = {
    settings: "fitflow_settings",
    history: "fitflow_history",
    current: "fitflow_current_workout",
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  return {
    getSettings() {
      return read(KEYS.settings, {
        equipment: "",
        levels: "",
        goals: "",
        defaultDuration: 45,
        apiKey: "",
      });
    },
    saveSettings(s) { write(KEYS.settings, s); },

    getHistory() { return read(KEYS.history, []); },
    addSession(session) {
      const h = this.getHistory();
      h.unshift(session); // newest first
      write(KEYS.history, h.slice(0, 100)); // keep last 100
    },
    deleteSession(id) {
      write(KEYS.history, this.getHistory().filter(s => s.id !== id));
    },

    getCurrentWorkout() { return read(KEYS.current, null); },
    saveCurrentWorkout(w) { write(KEYS.current, w); },
    clearCurrentWorkout() { localStorage.removeItem(KEYS.current); },
  };
})();
