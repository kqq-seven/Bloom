const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function dayNumber(value) {
  return Math.floor(Date.parse(value + "T00:00:00Z") / DAY_MS);
}

function dayDistance(from, to) {
  if (!from || !to) return null;
  return dayNumber(to) - dayNumber(from);
}

function keyFromDayNumber(value) {
  return new Date(value * DAY_MS).toISOString().slice(0, 10);
}

function normalizeCycle(value) {
  const cycle = value && typeof value === "object" ? value : {};
  const history = Array.isArray(cycle.history)
    ? cycle.history.filter(item => item && /^\d{4}-\d{2}-\d{2}$/.test(item.start))
    : [];
  if (!history.length && cycle.start) {
    history.push({ start: cycle.start, end: cycle.end || "" });
  }
  const byStart = new Map();
  history.forEach(item => byStart.set(item.start, { start: item.start, end: item.end || "" }));
  const sorted = [...byStart.values()].sort((left, right) => left.start.localeCompare(right.start));
  const latest = sorted.length ? sorted[sorted.length - 1] : null;
  return { ...cycle, history: sorted, start: latest?.start || "", end: latest?.end || "", reminder: Boolean(cycle.reminder) };
}

function cycleSummary(value, todayValue = new Date()) {
  const cycle = normalizeCycle(value);
  const today = dateKey(todayValue);
  const starts = cycle.history.map(item => item.start);
  const intervals = starts.slice(1)
    .map((start, index) => dayDistance(starts[index], start))
    .filter(days => days >= 15 && days <= 60);
  const averageCycle = intervals.length
    ? Math.round(intervals.reduce((sum, days) => sum + days, 0) / intervals.length)
    : null;
  const periodLengths = cycle.history
    .filter(item => item.end)
    .map(item => dayDistance(item.start, item.end) + 1)
    .filter(days => days >= 1 && days <= 10);
  const averagePeriod = periodLengths.length
    ? Math.round(periodLengths.reduce((sum, days) => sum + days, 0) / periodLengths.length)
    : null;
  const last = cycle.history.length ? cycle.history[cycle.history.length - 1] : null;
  const nextStart = last && averageCycle ? keyFromDayNumber(dayNumber(last.start) + averageCycle) : "";
  const predictedEnd = nextStart && averagePeriod
    ? keyFromDayNumber(dayNumber(nextStart) + averagePeriod - 1)
    : "";
  return {
    ...cycle,
    today,
    last,
    startsCount: starts.length,
    averageCycle,
    averagePeriod,
    nextStart,
    predictedEnd,
    daysSinceEnd: last?.end ? dayDistance(last.end, today) : null,
    daysUntilNext: nextStart ? dayDistance(today, nextStart) : null,
    currentPeriodDay: last && !last.end ? dayDistance(last.start, today) + 1 : null,
  };
}

function savePeriodStart(value, start) {
  const cycle = normalizeCycle(value);
  const previous = cycle.history.length ? cycle.history[cycle.history.length - 1] : null;
  if (previous && !previous.end) previous.start = start;
  else if (!cycle.history.some(item => item.start === start)) cycle.history.push({ start, end: "" });
  return normalizeCycle(cycle);
}

function savePeriodEnd(value, end) {
  const cycle = normalizeCycle(value);
  const latest = cycle.history.length ? cycle.history[cycle.history.length - 1] : null;
  if (latest) latest.end = end;
  return normalizeCycle(cycle);
}

const cycleHelpers = { dateKey, dayDistance, normalizeCycle, cycleSummary, savePeriodStart, savePeriodEnd };

if (typeof module !== "undefined" && module.exports) module.exports = cycleHelpers;
if (typeof window !== "undefined") window.BloomCycle = cycleHelpers;
