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

test("mini program switches five modules between dates and passes selected date to creation", async () => {
  const daily = loadHelpers();
  const state = { dailyRecordsInitialized: true, dailyRecords: {} };
  const previous = daily.getDailyRecord(state, "2026-11-23");
  previous.schedule.push({ name: "旧安排", time: "09:00" });
  previous.notes.push({ text: "旧手记" });
  previous.meals.push({ name: "旧餐食", lines: [["米饭", 300]] });
  previous.mood = 2;
  previous.tasks.push({ name: "旧待办", done: false });
  let destination = "";
  const app = { globalData: { state }, async saveState() {} };
  for (const module of ["todo", "plan", "notes", "meals", "mood"]) {
    const page = loadPage("miniprogram/pages/space/index.js", app, daily, { navigateTo: value => { destination = value.url; } });
    page.onLoad({ module });
    page.selectCalendarDay({ currentTarget: { dataset: { date: "2026-11-23" } } });
    assert.equal(page.data.kind, module);
    assert.equal(page.data.calendarMode, false);
    assert.equal(page.data.schedule[0].name, "旧安排");
    assert.equal(page.data.notes[0].text, "旧手记");
    assert.equal(page.data.totalCalories, 300);
    assert.equal(page.data.mood, 2);
    assert.equal(page.data.tasks[0].name, "旧待办");
    assert.equal(page.data.usesDailyCalendar, true);
    if (module === "todo") {
      await page.toggleTask({ currentTarget: { dataset: { index: 0 } } });
      assert.equal(state.dailyRecords["2026-11-23"].tasks[0].done, true);
    }
    page.addEntry({ currentTarget: { dataset: { type: "time" } } });
    assert.match(destination, /date=2026-11-23/);
    page.selectCalendarDay({ currentTarget: { dataset: { date: "2026-11-24" } } });
    assert.equal(page.data.schedule.length, 0);
    assert.equal(page.data.notes.length, 0);
    assert.equal(page.data.totalCalories, 0);
    assert.equal(page.data.mood, null);
    assert.equal(page.data.tasks.length, 0);
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

test("migration uses persisted day for old meals and tasks, repairs localized and misplaced notes once", () => {
  const daily = loadHelpers();
  const state = {
    tasks: [{ name: "昨天待办", done: true }],
    meals: [{ name: "昨天午饭", lines: [["米饭", 300]] }],
    notes: [{ text: "旧版手记", date: "11/27 10:00" }],
    dailyRecords: {
      "2026-11-28": { notes: [{ text: "放错日期", date: "2026/11/26 12:00" }, { text: "中文日期", date: "2026年11月25日 12:00" }] },
    },
  };
  daily.ensureDailyRecords(state, "2026-11-28", "2026-11-27T12:00:00Z");
  assert.equal(daily.getDailyRecord(state, "2026-11-28").meals.length, 0);
  assert.equal(daily.getDailyRecord(state, "2026-11-28").tasks.length, 0);
  assert.equal(daily.getDailyRecord(state, "2026-11-27").meals[0].name, "昨天午饭");
  assert.equal(daily.getDailyRecord(state, "2026-11-27").tasks[0].done, true);
  assert.equal(daily.getDailyRecord(state, "2026-11-27").notes[0].text, "旧版手记");
  assert.equal(daily.getDailyRecord(state, "2026-11-26").notes[0].text, "放错日期");
  assert.equal(daily.getDailyRecord(state, "2026-11-25").notes[0].text, "中文日期");
  const restored = JSON.parse(JSON.stringify(state));
  daily.ensureDailyRecords(restored, "2026-11-29", "2026-11-28T12:00:00Z");
  assert.equal(daily.getDailyRecord(restored, "2026-11-29").meals.length, 0);
  assert.equal(daily.allNotes(restored).length, 3);
  assert.equal(restored.tasks.length, 0);
  assert.equal(restored.meals.length, 0);
  assert.equal(daily.hasEntries(restored.dailyRecords["2026-11-27"], "todo"), true);
  assert.throws(() => daily.getDailyRecord(restored, "2026-02-30"), /日期无效/);
});

test("already migrated food stays on its original date and orphan short-date notes are recovered", () => {
  const daily = loadHelpers();
  const state = {
    dailyRecordsInitialized: true,
    meals: [{ name: "旧版备份" }], notes: [{ text: "去年笔记", date: "12/31 23:00" }],
    dailyRecords: { "2026-01-02": { meals: [{ name: "1月2日午餐" }] } },
  };
  daily.ensureDailyRecords(state, "2026-01-03", "2026-01-02T12:00:00Z");
  assert.equal(daily.getDailyRecord(state, "2026-01-03").meals.length, 0);
  assert.equal(daily.getDailyRecord(state, "2026-01-02").meals.length, 1);
  assert.equal(daily.getDailyRecord(state, "2025-12-31").notes[0].text, "去年笔记");
  assert.equal(state.legacyDailyLists.meals[0].name, "旧版备份");
});

test("mini program creates tasks, food and notes, saves, restores and queries each day independently", async () => {
  const daily = loadHelpers();
  const app = { globalData: { state: { dailyRecordsInitialized: true, dailyRecords: {} } } };
  let persisted;
  app.saveState = async () => { persisted = JSON.stringify(app.globalData.state); };
  for (const date of ["2026-11-27", "2026-11-28"]) {
    for (const type of ["task", "meal", "note"]) {
      const entry = loadPage("miniprogram/pages/entry/index.js", app, daily);
      entry.onLoad({ type, date });
      await entry.submit({ detail: { value: { name: `${date}-${type}`, kcal: "123" } } });
      app.globalData.state = JSON.parse(persisted);
      daily.ensureDailyRecords(app.globalData.state, "2026-11-29");
    }
  }
  const page = loadPage("miniprogram/pages/space/index.js", app, daily);
  page.onLoad({ module: "notes" });
  for (const date of ["2026-11-27", "2026-11-28"]) {
    page.selectCalendarDay({ currentTarget: { dataset: { date } } });
    assert.equal(page.data.notes.length, 1);
    assert.equal(page.data.notes[0].text, `${date}-note`);
    assert.equal(page.data.notes[0].recordDate, date);
    assert.equal(page.data.meals[0].lines[0][0], `${date}-meal`);
    assert.equal(page.data.totalCalories, 123);
    assert.equal(page.data.tasks[0].name, `${date}-task`);
  }
  page.selectCalendarDay({ currentTarget: { dataset: { date: "2026-11-29" } } });
  assert.equal(page.data.tasks.length + page.data.notes.length + page.data.meals.length, 0);
});

test("website submits tasks, meals and notes, reloads saved state and queries historical days", async () => {
  let clock = "2026-11-27T12:00:00";
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return new Date(clock).getTime(); }
  }
  const elements = { "#app": { innerHTML: "" }, "#sheet": { open: false }, "#toast": {} };
  const listeners = {};
  let persisted = { dailyRecordsInitialized: true, dailyRecords: {}, tasks: [], items: [], milestones: [] };
  const context = vm.createContext({
    Date: TestDate, Intl, console, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    FormData: class { constructor(form) { this.values = form.values; } get(key) { return this.values[key]; } has(key) { return key in this.values; } },
    document: { querySelector: id => elements[id], addEventListener: (name, handler) => { listeners[name] = handler; } },
    location: { hash: "#todo" },
    fetch: async (path, options) => {
      if (path === "/api/me") return { status: 401 };
      if (options?.method === "PUT") persisted = JSON.parse(options.body).state;
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ state: JSON.parse(JSON.stringify(persisted)), updatedAt: "2026-11-27T12:00:00Z" }) };
    },
  });
  context.window = context;
  context.addEventListener = () => {};
  context.scrollTo = () => {};
  for (const path of ["utils/cycle.js", "utils/daily.js", "app.js"]) vm.runInContext(read(path), context, { filename: path });
  await new Promise(resolve => setImmediate(resolve));
  await vm.runInContext('loadPersonalSpace({id:"test",display_name:"测试"})', context);
  for (const date of ["2026-11-27", "2026-11-28"]) {
    clock = `${date}T12:00:00`;
    vm.runInContext('refreshDailyDate()', context);
    vm.runInContext(`selectedDailyDate = "${date}"`, context);
    for (const type of ["task", "meal", "note"]) {
      const form = { dataset: { form: type }, values: type === "note" ? { text: `${date}-note` } : { name: `${date}-${type}`, mealType: "午餐", kcal: "123" }, querySelector: () => ({ disabled: false }) };
      await listeners.submit({ target: form, preventDefault() {} });
      await vm.runInContext('saveState()', context);
      await vm.runInContext('loadPersonalSpace({id:"test",display_name:"测试"})', context);
    }
  }
  clock = "2026-11-29T00:01:00";
  vm.runInContext('refreshDailyDate()', context);
  assert.equal(vm.runInContext('selectedDailyDate', context), "2026-11-29");
  await vm.runInContext('loadPersonalSpace({id:"test",display_name:"测试"})', context);
  for (const field of ["tasks", "meals", "notes"]) assert.equal(vm.runInContext(`dailyRecord().${field}.length`, context), 0);
  const click = dataset => listeners.click({ target: { closest: selector => selector === "button" ? { dataset } : null } });
  for (const date of ["2026-11-27", "2026-11-28"]) {
    for (const route of ["todo", "meals", "notes"]) {
      vm.runInContext(`activeRoute = "${route}"`, context);
      await click({ action: "daily-select", day: date });
      assert.match(elements["#app"].innerHTML, new RegExp(`${date}-${{todo:"task",meals:"meal",notes:"note"}[route]}`));
    }
  }
  vm.runInContext('activeRoute = "todo"', context);
  await click({ task: "0" });
  await vm.runInContext('saveState()', context);
  assert.equal(persisted.dailyRecords["2026-11-28"].tasks[0].done, true);
  assert.equal(persisted.dailyRecords["2026-11-27"].tasks[0].done, false);
  await click({ action: "daily-mode", mode: "calendar" });
  assert.match(elements["#app"].innerHTML, /daily-calendar-grid/);
  await click({ action: "daily-select", day: "2026-11-29" });
  assert.doesNotMatch(elements["#app"].innerHTML, /2026-11-2[78]-task/);
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
