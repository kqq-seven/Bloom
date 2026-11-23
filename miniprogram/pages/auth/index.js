Page({
  data: { submitting: false, error: "", nickname: "" },

  async onShow() {
    const app = getApp();
    await app.readyPromise;
    if (app.globalData.token && app.globalData.user) {
      wx.switchTab({ url: "/pages/home/index" });
    }
  },

  async submit(event) {
    if (this.data.submitting) return;
    const nickname = String(event.detail.value.nickname || "").trim();
    const password = String(event.detail.value.password || "");
    if (!nickname) return this.setData({ error: "请填写昵称。" });
    if (!password) return this.setData({ error: "请填写密码。" });
    this.setData({ submitting: true, error: "" });
    try {
      const app = getApp();
      await app.signInOrRegister(nickname, password);
      wx.switchTab({ url: "/pages/home/index" });
    } catch (error) {
      this.setData({ nickname: nickname, error: error.message || "暂时无法连接，请稍后重试。" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
