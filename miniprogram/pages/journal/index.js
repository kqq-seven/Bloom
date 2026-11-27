const { getDailyRecord, dateKey } = require("../../utils/daily");

Page({
  data: { modules: [] },

  onShow() {
    const state = getApp().globalData.state || {};
    const records = Object.values(state.dailyRecords || {});
    const today = getDailyRecord(state, dateKey());
    this.setData({ modules: [
      { id: "meals", title: "手账食记", detail: `${records.reduce((count, record) => count + (record.meals?.length || 0), 0)} 条餐食记录`, icon: "☕", tone: "rose" },
      { id: "mood", title: "情绪日记", detail: today.mood == null ? "留下一点今天的心情" : "今天的心情已记录", icon: "☁", tone: "mint" },
      { id: "notes", title: "随心记事", detail: `${records.reduce((count, record) => count + (record.notes?.length || 0), 0)} 条生活手记`, icon: "✎", tone: "sand" },
    ] });
  },

  openModule(event) {
    wx.navigateTo({ url: `/pages/space/index?module=${event.currentTarget.dataset.id}` });
  },
});
