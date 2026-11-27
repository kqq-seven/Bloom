(function (root) {
  "use strict";

  function dateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function ensureDailyRecords(state, today = dateKey()) {
    if (!state || typeof state !== "object") return state;
    if (!state.dailyRecords || typeof state.dailyRecords !== "object" || Array.isArray(state.dailyRecords)) state.dailyRecords = {};
    if (!state.dailyRecordsInitialized) {
      const legacy = state.dailyRecords[today] || {};
      const hasLegacy = ["schedule", "meals", "notes"].some(key => Array.isArray(state[key]) && state[key].length)
        || state.mood != null || (Array.isArray(state.moments) && state.moments.length)
        || (Array.isArray(state.journal) && state.journal.some(Boolean));
      if (hasLegacy) {
        state.dailyRecords[today] = {
          ...legacy,
          schedule: legacy.schedule?.length ? legacy.schedule : (state.schedule || []),
          meals: legacy.meals?.length ? legacy.meals : (state.meals || []),
          notes: legacy.notes?.length ? legacy.notes : (state.notes || []),
          mood: legacy.mood != null ? legacy.mood : state.mood ?? null,
          moments: legacy.moments?.length ? legacy.moments : (state.moments || []),
          journal: legacy.journal?.some(Boolean) ? legacy.journal : (state.journal || ["", "", ""]),
        };
      }
      for (const note of state.dailyRecords[today]?.notes || []) {
        const date = typeof note.date === "string" ? note.date.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] : "";
        if (!date || date === today) continue;
        const record = state.dailyRecords[date] || { notes: [] };
        record.notes = [...(record.notes || []), note];
        state.dailyRecords[date] = record;
      }
      if (state.dailyRecords[today]) {
        state.dailyRecords[today].notes = (state.dailyRecords[today].notes || []).filter(note => {
          const date = typeof note.date === "string" ? note.date.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] : "";
          return !date || date === today;
        });
      }
      state.dailyRecordsInitialized = true;
    }
    for (const [key, record] of Object.entries(state.dailyRecords)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !record || typeof record !== "object") {
        delete state.dailyRecords[key];
        continue;
      }
      record.schedule = Array.isArray(record.schedule) ? record.schedule : [];
      record.meals = Array.isArray(record.meals) ? record.meals : [];
      record.notes = Array.isArray(record.notes) ? record.notes : [];
      record.mood = Number.isInteger(record.mood) && record.mood >= 0 && record.mood < 5 ? record.mood : null;
      record.moments = Array.isArray(record.moments) ? record.moments : [];
      record.journal = Array.isArray(record.journal) ? [...record.journal, "", ""].slice(0, 3) : ["", "", ""];
    }
    return state;
  }

  function getDailyRecord(state, date) {
    ensureDailyRecords(state);
    if (!state.dailyRecords[date]) {
      state.dailyRecords[date] = { schedule: [], meals: [], notes: [], mood: null, moments: [], journal: ["", "", ""] };
    }
    return state.dailyRecords[date];
  }

  function hasEntries(record, module) {
    if (module === "plan") return Boolean(record?.schedule?.length);
    if (module === "meals") return Boolean(record?.meals?.length);
    if (module === "notes") return Boolean(record?.notes?.length);
    if (module === "mood") return Boolean(record && (record.mood != null || record.moments?.length || record.journal?.some(Boolean)));
    return Boolean(record && (record.schedule?.length || record.meals?.length || record.notes?.length
      || record.mood != null || record.moments?.length || record.journal?.some(Boolean)));
  }

  function allNotes(state) {
    ensureDailyRecords(state);
    return Object.keys(state.dailyRecords).sort().reverse().flatMap(date => state.dailyRecords[date].notes);
  }

  const helpers = { dateKey, ensureDailyRecords, getDailyRecord, hasEntries, allNotes };
  if (typeof module !== "undefined" && module.exports) module.exports = helpers;
  root.BloomDaily = helpers;
})(typeof globalThis !== "undefined" ? globalThis : this);
