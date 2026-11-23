Page({
  data: { nickname: "", avatarText: "✿", signingOut: false, error: "" },

  onShow() {
    const app = getApp();
    const name = app.globalData.user?.display_name || "朋友";
    this.setData({ nickname: name, avatarText: Array.from(name)[0] || "✿" });
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
