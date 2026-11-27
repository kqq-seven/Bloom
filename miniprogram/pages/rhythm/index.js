const { cycleSummary } = require("../../utils/cycle");

Page({
  data: { modules: [], reminder: "" },

  onShow() {
    const state = getApp().globalData.state || {};
    const cycle = cycleSummary(state.cycle);
    const forecast = cycle.daysUntilNext == null ? "记录个人周期" : cycle.daysUntilNext > 0 ? `预计约 ${cycle.daysUntilNext} 天后` : cycle.daysUntilNext === 0 ? "预计今天" : `估算日期已过 ${Math.abs(cycle.daysUntilNext)} 天`;
    this.setData({
      reminder: cycle.last ? (cycle.last.end ? `距上次经期结束 ${cycle.daysSinceEnd} 天 · ${forecast}来经` : `本次经期第 ${cycle.currentPeriodDay} 天`) : "记录经期，了解身体节律",
      modules: [
        { id: "todo", title: "今日待办", detail: `${state.tasks?.length || 0} 项待办`, icon: "✓", tone: "mint" },
        { id: "plan", title: "一日时间规划", detail: `${Object.values(state.dailyRecords || {}).reduce((count, record) => count + (record.schedule?.length || 0), 0)} 段安排`, icon: "◷", tone: "sand" },
        { id: "cycle", title: "经期与周期", detail: cycle.last ? `${cycle.daysSinceEnd ?? "经期进行中"} 天 · ${forecast}` : "记录身体节律", icon: "♡", tone: "rose" },
      ],
    });
  },

  openModule(event) {
    const id = event.currentTarget.dataset.id;
    const url = id === "cycle" ? "/pages/cycle/index" : `/pages/space/index?module=${id}`;
    wx.navigateTo({ url });
  },
});
