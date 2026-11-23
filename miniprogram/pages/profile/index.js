Page({
  data: { nickname: "", avatarText: "✿", signingOut: false, error: "", stats: { tasks: 0, done: 0, notes: 0, milestones: 0, items: 0 } },

  onShow() {
    const app = getApp();
    const name = app.globalData.user?.display_name || "朋友";
    const state = app.globalData.state || {};
    this.setData({
      nickname: name,
      avatarText: Array.from(name)[0] || "✿",
      stats: {
        tasks: state.tasks?.length || 0,
        done: (state.tasks || []).filter(item => item.done).length,
        notes: state.notes?.length || 0,
        milestones: (state.milestones || []).filter(item => item.done).length,
        items: state.items?.length || 0,
      },
    });
  },

  async signOut() {
    if (this.data.signingOut) return;
    this.setData({ signingOut: true, error: "" });
    const app = getApp();
    try {
      await app.signOut();
      wx.redirectTo({ url: "/pages/auth/index" });
    } catch (error) {
      this.setData({ error: error.message || "退出失败，请重试。" });
    } finally {
      this.setData({ signingOut: false });
    }
  },
});
