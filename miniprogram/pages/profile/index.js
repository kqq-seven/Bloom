Page({
  data: { nickname: "", avatarText: "✿", signingOut: false, error: "", passwordSet: true, stats: { notes: 0, milestones: 0, tasks: 0 } },

  onShow() {
    const app = getApp();
    const name = app.globalData.user?.display_name || "朋友";
    const state = app.globalData.state || {};
    this.setData({
      nickname: name,
      avatarText: Array.from(name)[0] || "✿",
      passwordSet: Boolean(app.globalData.user?.password_set),
      stats: {
        notes: Object.values(state.dailyRecords || {}).reduce((count, record) => count + (record.notes?.length || 0), 0),
        milestones: (state.milestones || []).filter(item => item.done).length,
        tasks: Object.values(state.dailyRecords || {}).flatMap(record => record.tasks || []).filter(item => item.done).length,
      },
    });
  },

  openSpace(event) {
    const module = event.currentTarget.dataset.module;
    wx.navigateTo({ url: `/pages/space/index?module=${module}` });
  },

  openStorage() { wx.navigateTo({ url: "/pages/space/index?module=storage" }); },

  async savePassword(event) {
    const password = String(event.detail.value.password || "");
    if (password.length < 8) return this.setData({ error: "密码至少需要 8 个字符。" });
    this.setData({ error: "" });
    try {
      await getApp().request("/api/auth/password", { method: "POST", data: { password } });
      getApp().globalData.user.password_set = 1;
      this.setData({ passwordSet: true });
      wx.showToast({ title: "登录密码已设置", icon: "success" });
    } catch (error) {
      this.setData({ error: error.message || "设置失败，请重试。" });
    }
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
