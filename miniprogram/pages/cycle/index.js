const { cycleSummary, dateKey, dayDistance, savePeriodStart, savePeriodEnd } = require("../../utils/cycle");

function makeCalendar(summary, year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = dateKey();
  const cells = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push({ key: "blank-" + index, label: "", className: "day-empty" });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = [year, String(month + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
    const recorded = summary.history.some(item => date >= item.start && (!item.end || date <= item.end));
    const predicted = summary.nextStart && summary.predictedEnd && date >= summary.nextStart && date <= summary.predictedEnd;
    const className = [recorded ? "day-recorded" : predicted ? "day-estimate" : "", date === today ? "day-today" : ""].filter(Boolean).join(" ");
    cells.push({ key: date, label: day, className: className });
  }
  return cells;
}

Page({
  data: { weekdays: ["日", "一", "二", "三", "四", "五", "六"], today: dateKey(), monthYear: new Date().getFullYear(), monthIndex: new Date().getMonth(), monthLabel: "", calendar: [], cycle: { history: [], reminder: false }, summary: {}, history: [], estimateText: "", lastPeriodLength: 0 },

  async onShow() {
    const app = getApp();
    await app.readyPromise;
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/auth/index" });
      return;
    }
    this.refreshView();
  },

  refreshView() {
    const app = getApp();
    const cycle = (app.globalData.state || {}).cycle || { history: [], reminder: false };
    const summary = cycleSummary(cycle);
    const days = summary.daysUntilNext;
    const estimateText = days === null
      ? "记录至少两次经期开始日后，可按你的周期估算下次时间。"
      : days > 0 ? `按你已记录的周期，预计约 ${days} 天后开始。`
        : days === 0 ? "按你的记录，预计今天开始。"
          : `估算日期已过 ${Math.abs(days)} 天，记录新周期后会更新。`;
    const history = [...summary.history].reverse().map((item, index) => ({
      ...item,
      number: summary.history.length - index,
      durationLabel: item.end ? `持续 ${dayDistance(item.start, item.end) + 1} 天` : `第 ${dayDistance(item.start, summary.today) + 1} 天`,
    }));
    this.setData({
      cycle: cycle,
      summary: summary,
      history: history,
      estimateText: estimateText,
      lastPeriodLength: summary.last?.end ? dayDistance(summary.last.start, summary.last.end) + 1 : 0,
      monthLabel: `${this.data.monthYear}年 ${this.data.monthIndex + 1}月`,
      calendar: makeCalendar(summary, this.data.monthYear, this.data.monthIndex),
    });
  },

  previousMonth() {
    const target = new Date(this.data.monthYear, this.data.monthIndex - 1, 1);
    this.setData({ monthYear: target.getFullYear(), monthIndex: target.getMonth() });
    this.refreshView();
  },

  nextMonth() {
    const target = new Date(this.data.monthYear, this.data.monthIndex + 1, 1);
    this.setData({ monthYear: target.getFullYear(), monthIndex: target.getMonth() });
    this.refreshView();
  },

  async onStartDate(event) {
    await this.updateCycle(savePeriodStart(this.data.cycle, event.detail.value));
  },

  async onEndDate(event) {
    await this.updateCycle(savePeriodEnd(this.data.cycle, event.detail.value));
  },

  async onReminderChange(event) {
    await this.updateCycle({ ...this.data.cycle, reminder: event.detail.value });
  },

  async updateCycle(cycle) {
    const app = getApp();
    app.globalData.state.cycle = cycle;
    this.refreshView();
    try {
      await app.saveState();
      wx.showToast({ title: "经期记录已保存", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败，请重试", icon: "none" });
    }
  },
});
