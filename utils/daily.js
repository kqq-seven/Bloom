(function (root) {
  "use strict";

  function dateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function validDay(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && dateKey(new Date(`${value}T12:00:00`)) === value;
  }

  function entryDay(entry, referenceDay) {
    if (validDay(entry?.recordDate)) return entry.recordDate;
    const match = String(entry?.date || "").match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日|\b)/);
    const value = match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "";
    if (validDay(value)) return value;
    const short = String(entry?.date || "").match(/^(\d{1,2})[月/.-](\d{1,2})(?:日|\b)/);
    if (!short || !validDay(referenceDay)) return "";
    let year = Number(referenceDay.slice(0, 4));
    const suffix = `${short[1].padStart(2, "0")}-${short[2].padStart(2, "0")}`;
    if (`${year}-${suffix}` > referenceDay) year -= 1;
    const inferred = `${year}-${suffix}`;
    return validDay(inferred) ? inferred : "";
  }

  function emptyRecord() {
    return { tasks: [], schedule: [], meals: [], notes: [], mood: null, moments: [], journal: ["", "", ""] };
  }

  function ensureDailyRecords(state, today = dateKey(), savedAt = "") {
    if (!state || typeof state !== "object") return state;
    if (!state.dailyRecords || typeof state.dailyRecords !== "object" || Array.isArray(state.dailyRecords)) state.dailyRecords = {};
    const records = state.dailyRecords;
    for (const [key, record] of Object.entries(records)) {
      if (!validDay(key) || !record || typeof record !== "object" || Array.isArray(record)) {
        state.legacyDailyRecords = { ...state.legacyDailyRecords, [key]: record };
        delete records[key];
      }
    }
    if (state.dailyRecordsVersion !== 2) {
      // Undated old lists belong to the last saved day, rather than the day of reopening.
      const anchor = (savedAt && dateKey(savedAt)) || Object.keys(records).sort().pop() || today;
      const target = day => records[day] || (records[day] = emptyRecord());
      for (const field of ["tasks", "schedule", "meals", "notes"]) {
        const existing = Object.values(records).flatMap(record => Array.isArray(record[field]) ? record[field] : []);
        const known = new Set(existing.map(entry => JSON.stringify(entry)));
        // Old global food lists may remain after a completed migration. Never import them again.
        const importLegacy = field === "tasks" || field === "notes" || !existing.length;
        if (importLegacy) {
          for (const entry of Array.isArray(state[field]) ? state[field] : []) {
            if (known.has(JSON.stringify(entry))) continue;
            const day = entryDay(entry, anchor) || anchor;
            const record = target(day);
            if (!Array.isArray(record[field])) record[field] = [];
            record[field].push(entry);
            known.add(JSON.stringify(entry));
          }
        }
      }
      if (!state.dailyRecordsInitialized) {
        const record = target(anchor);
        if (record.mood == null) record.mood = state.mood ?? null;
        if (!record.moments?.length) record.moments = state.moments || [];
        if (!record.journal?.some(Boolean)) record.journal = state.journal || ["", "", ""];
      }
      for (const field of ["tasks", "schedule", "meals", "notes"]) {
        const entries = Object.entries(records).flatMap(([day, record]) =>
          (Array.isArray(record[field]) ? record[field] : []).map(entry => ({ day, entry })));
        for (const record of Object.values(records)) record[field] = [];
        for (const { day, entry } of entries) {
          if (!entry || typeof entry !== "object") continue;
          const correctDay = entryDay(entry, day) || day;
          const record = target(correctDay);
          if (!Array.isArray(record[field])) record[field] = [];
          record[field].push({ ...entry, recordDate: correctDay });
        }
        // Keep a backup of obsolete lists; the application only reads daily buckets now.
        if (state[field]?.length) state.legacyDailyLists = { ...state.legacyDailyLists, [field]: state[field] };
        state[field] = [];
      }
      state.dailyRecordsInitialized = true;
      state.dailyRecordsVersion = 2;
    }
    for (const record of Object.values(records)) {
      for (const field of ["tasks", "schedule", "meals", "notes", "moments"]) {
        if (!Array.isArray(record[field])) record[field] = [];
      }
      record.mood = Number.isInteger(record.mood) && record.mood >= 0 && record.mood < 5 ? record.mood : null;
      if (!Array.isArray(record.journal)) record.journal = ["", "", ""];
      while (record.journal.length < 3) record.journal.push("");
    }
    return state;
  }

  function getDailyRecord(state, date = dateKey()) {
    if (!validDay(date)) throw new Error("记录日期无效，请重新选择日期。");
    ensureDailyRecords(state);
    if (!state.dailyRecords[date]) state.dailyRecords[date] = emptyRecord();
    return state.dailyRecords[date];
  }

  function hasEntries(record, module) {
    if (module === "todo") return Boolean(record?.tasks?.length);
    if (module === "plan") return Boolean(record?.schedule?.length);
    if (module === "meals") return Boolean(record?.meals?.length);
    if (module === "notes") return Boolean(record?.notes?.length);
    if (module === "mood") return Boolean(record && (record.mood != null || record.moments?.length || record.journal?.some(Boolean)));
    return Boolean(record && (record.tasks?.length || record.schedule?.length || record.meals?.length || record.notes?.length
      || record.mood != null || record.moments?.length || record.journal?.some(Boolean)));
  }

  function allNotes(state) {
    ensureDailyRecords(state);
    return Object.keys(state.dailyRecords).sort().reverse().flatMap(date => state.dailyRecords[date].notes);
  }

  const helpers = { dateKey, validDay, ensureDailyRecords, getDailyRecord, hasEntries, allNotes };
  if (typeof module !== "undefined" && module.exports) module.exports = helpers;
  root.BloomDaily = helpers;
})(typeof globalThis !== "undefined" ? globalThis : this);
