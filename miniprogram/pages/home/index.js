const { cycleSummary, dateKey } = require("../../utils/cycle");

Page({
  data: { nickname: "", avatarText: "✿", todayLabel: "", empty: true, taskCount: 0, noteCount: 0, latestNote: "", cycleSummary: {}, cycleStatus: "", cycleForecast: "", cycleTile: "" },

  async onShow() {
    const app = getApp();
    await app.readyPromise;
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/auth/index" });
      return;
    }
    const state = app.globalData.state || {};
    const summary = cycleSummary(state.cycle);
    const days = summary.daysUntilNext;
    const cycleForecast = days === null
      ? "记录更多周期，形成个人估算。"
      : days > 0 ? `按你的记录，预计约 ${days} 天后来经。`
        : days === 0 ? "按你的记录，预计今天来经。"
          : `估算日期已过 ${Math.abs(days)} 天，可记录新一期。`;
    const date = new Date();
    const nickname = app.globalData.user?.display_name || "朋友";
    this.setData({
      nickname,
      avatarText: Array.from(nickname)[0],
      todayLabel: `${date.getMonth() + 1}月${date.getDate()}日 · ${["星期日","星期一","星期二","星期三","星期四","星期五","星期六"][date.getDay()]}`,
      empty: !Boolean(state.tasks?.length || state.items?.length || state.notes?.length || summary.last),
      taskCount: state.tasks?.length || 0,
      noteCount: state.notes?.length || 0,
      latestNote: state.notes?.[0]?.text || "",
      cycleSummary: summary,
      cycleStatus: summary.last?.end ? `第 ${summary.daysSinceEnd} 天` : summary.last ? `本次第 ${summary.currentPeriodDay} 天` : "",
      cycleForecast,
      cycleTile: summary.last ? `距上次结束 ${summary.daysSinceEnd ?? "—"} 天` : "记录开始与结束日期",
    });
  },

  openCycle() { wx.switchTab({ url: "/pages/cycle/index" }); },
  openProfile() { wx.switchTab({ url: "/pages/profile/index" }); },

  addTask() {
    wx.showModal({ title: "添加今日待办", editable: true, placeholderText: "写下一件想完成的事", success: async result => {
      const name = (result.content || "").trim();
      if (!result.confirm || !name) return;
      const app = getApp();
      app.globalData.state.tasks = [...(app.globalData.state.tasks || []), { name, tag: "今日待办", time: "", done: false }];
      try { await app.saveState(); this.onShow(); }
      catch (error) { wx.showToast({ title: error.message || "保存失败", icon: "none" }); }
    }});
  },

  addNote() {
    wx.showModal({ title: "随心记事", editable: true, placeholderText: "写下此刻想记住的事", success: async result => {
      const text = (result.content || "").trim();
      if (!result.confirm || !text) return;
      const app = getApp();
      app.globalData.state.notes = [{ text, date: dateKey() }, ...(app.globalData.state.notes || [])];
      try { await app.saveState(); this.onShow(); }
      catch (error) { wx.showToast({ title: error.message || "保存失败", icon: "none" }); }
    }});
  },
});
