import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function loadHelpers(path = "utils/daily.js") {
  const context = vm.createContext({ Date });
  vm.runInContext(read(path), context);
  return context.BloomDaily;
}

test("legacy records migrate once, keep explicit note dates and survive a new day", () => {
  const daily = loadHelpers();
  const state = {
    schedule: [{ name: "旧安排", time: "09:00" }], meals: [{ name: "午餐" }],
    notes: [{ text: "有日期", date: "2026-11-23 12:00" }, { text: "无日期" }],
    mood: 0, moments: [1], journal: ["旧日记", "", ""],
  };
  daily.ensureDailyRecords(state, "2026-11-27");
  assert.equal(state.dailyRecords["2026-11-23"].notes[0].text, "有日期");
  assert.equal(state.dailyRecords["2026-11-27"].notes.length, 1);
  const restored = JSON.parse(JSON.stringify(state));
  daily.ensureDailyRecords(restored, "2026-11-28");
  assert.equal(daily.getDailyRecord(restored, "2026-11-28").mood, null);
  assert.equal(restored.dailyRecords["2026-11-27"].mood, 0);
  assert.equal(restored.dailyRecords["2026-11-27"].schedule[0].name, "旧安排");
  assert.equal(daily.allNotes(restored).length, 2);
  assert.equal(read("utils/daily.js"), read("miniprogram/utils/daily.js"));
});

function loadPage(path, app, daily, extraWx = {}) {
  let page;
  const context = vm.createContext({
    Date, Intl, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    Page: value => { page = value; }, getApp: () => app,
    require: () => daily,
    wx: { showToast() {}, navigateBack() {}, navigateTo() {}, ...extraWx },
  });
  vm.runInContext(read(path), context);
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = values => Object.assign(page.data, values);
  return page;
}

test("mini program switches four modules between dates and passes selected date to creation", async () => {
  const daily = loadHelpers();
  const state = { dailyRecordsInitialized: true, dailyRecords: {} };
  const previous = daily.getDailyRecord(state, "2026-11-23");
  previous.schedule.push({ name: "旧安排", time: "09:00" });
  previous.notes.push({ text: "旧手记" });
  previous.meals.push({ name: "旧餐食", lines: [["米饭", 300]] });
  previous.mood = 2;
  let destination = "";
  const app = { globalData: { state }, async saveState() {} };
  for (const module of ["plan", "notes", "meals", "mood"]) {
    const page = loadPage("miniprogram/pages/space/index.js", app, daily, { navigateTo: value => { destination = value.url; } });
    page.onLoad({ module });
    page.selectCalendarDay({ currentTarget: { dataset: { date: "2026-11-23" } } });
    assert.equal(page.data.kind, module);
    assert.equal(page.data.calendarMode, false);
    assert.equal(page.data.schedule[0].name, "旧安排");
    assert.equal(page.data.notes[0].text, "旧手记");
    assert.equal(page.data.totalCalories, 300);
    assert.equal(page.data.mood, 2);
    page.addEntry({ currentTarget: { dataset: { type: "time" } } });
    assert.match(destination, /date=2026-11-23/);
    page.selectCalendarDay({ currentTarget: { dataset: { date: "2026-11-24" } } });
    assert.equal(page.data.schedule.length, 0);
    assert.equal(page.data.notes.length, 0);
    assert.equal(page.data.totalCalories, 0);
    assert.equal(page.data.mood, null);
    page.data.today = "2000-01-01";
    page.data.selectedDate = "2000-01-01";
    page.refreshToday();
    assert.equal(page.data.selectedDate, daily.dateKey());
    page.data.selectedDate = "1999-12-31";
    page.refreshToday();
    assert.equal(page.data.selectedDate, "1999-12-31");
    page.calendarYear = 2024;
    page.calendarMonth = 1;
    assert.equal(page.makeCalendar(state).filter(cell => !cell.blank).length, 29);
  }
});

test("mini program backfills selected date, including a retry after failed save", async () => {
  const daily = loadHelpers();
  const state = { dailyRecordsInitialized: true, dailyRecords: {} };
  let failSave = true;
  const app = { globalData: { state }, async saveState() { if (failSave) throw Error("offline"); } };
  const page = loadPage("miniprogram/pages/entry/index.js", app, daily);
  page.onLoad({ type: "time", date: "2026-11-23" });
  const event = { detail: { value: { name: "补记", time: "11:30", detail: "" } } };
  await page.submit(event);
  assert.equal(state.dailyRecords["2026-11-23"].schedule.length, 0);
  failSave = false;
  await page.submit(event);
  assert.equal(state.dailyRecords["2026-11-23"].schedule.length, 1);
  assert.equal(state.dailyRecords["2026-11-23"].schedule[0].time, "11:30");
});

test("mini program saves snapshots in order when changes happen during a slow request", async () => {
  let app;
  const daily = loadHelpers();
  const context = vm.createContext({
    App: value => { app = value; },
    require: path => path.includes("daily") ? daily : { normalizeCycle: value => value },
  });
  vm.runInContext(read("miniprogram/app.js"), context);
  app.globalData.token = "local-test";
  app.globalData.state = { dailyRecordsInitialized: true, dailyRecords: {} };
  const day = daily.getDailyRecord(app.globalData.state, "2026-11-23");
  const saved = [];
  let release;
  app.request = async (path, options) => {
    saved.push(options.data.state);
    if (saved.length === 1) await new Promise(resolve => { release = resolve; });
  };
  day.mood = 1;
  const first = app.saveState();
  await new Promise(resolve => setImmediate(resolve));
  day.mood = 2;
  const second = app.saveState();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].dailyRecords["2026-11-23"].mood, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(saved[1].dailyRecords["2026-11-23"].mood, 2);
});

test("website loads scripts together, renders calendar and keeps each day's mood", async () => {
  const elements = { "#app": { innerHTML: "" }, "#sheet": { open: false }, "#toast": {} };
  const listeners = {};
  const context = vm.createContext({
    Date, Intl, console, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    document: { querySelector: id => elements[id], addEventListener: (name, handler) => { listeners[name] = handler; } },
    location: { hash: "#plan" }, fetch: async () => ({ status: 401 }),
  });
  context.window = context;
  context.addEventListener = () => {};
  context.scrollTo = () => {};
  for (const path of ["utils/cycle.js", "utils/daily.js", "app.js"]) vm.runInContext(read(path), context, { filename: path });
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext('isAuthenticated = true; account = { display_name: "测试" }; selectedDailyDate = "2026-11-23"; dailyRecord().schedule.push({name: "旧安排", time: "09:00"}); render();', context);
  assert.match(elements["#app"].innerHTML, /旧安排/);
  const click = dataset => listeners.click({ target: { closest: selector => selector === "button" ? { dataset } : null } });
  await click({ action: "daily-mode", mode: "calendar" });
  assert.match(elements["#app"].innerHTML, /daily-calendar-grid/);
  await click({ action: "daily-select", day: "2026-11-24" });
  assert.doesNotMatch(elements["#app"].innerHTML, /旧安排/);
  vm.runInContext('activeRoute = "mood";', context);
  await click({ mood: "1" });
  await click({ action: "daily-select", day: "2026-11-23" });
  assert.equal(vm.runInContext('dailyRecord().mood', context), null);
  await click({ action: "daily-select", day: "2026-11-24" });
  assert.equal(vm.runInContext('dailyRecord().mood', context), 1);
});
