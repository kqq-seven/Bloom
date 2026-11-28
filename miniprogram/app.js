const { normalizeCycle } = require("./utils/cycle");
const { ensureDailyRecords } = require("./utils/daily");

App({
  globalData: {
    apiBaseUrl: "https://bloom-4rx.pages.dev",
    user: null,
    token: "",
    state: null,
    loadError: "",
  },

  onLaunch() {
    this.readyPromise = this.restoreSession();
  },

  request(path, options = {}) {
    const token = this.globalData.token || wx.getStorageSync("bloom-mini-token") || "";
    const header = {
      "Content-Type": "application/json",
      "X-Bloom-Client": "wechat-miniprogram",
    };
    if (token) header.Authorization = "Bearer " + token;
    return new Promise((resolve, reject) => {
      wx.request({
        url: this.globalData.apiBaseUrl + path,
        method: options.method || "GET",
        data: options.data,
        header,
        success: response => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(response.data || {});
            return;
          }
          reject({ statusCode: response.statusCode, message: response.data?.error || "请求失败，请稍后重试。" });
        },
        fail: reject,
      });
    });
  },

  async restoreSession() {
    const token = wx.getStorageSync("bloom-mini-token");
    this.globalData.token = token || "";
    if (!token) return false;
    try {
      const result = await this.request("/api/me");
      this.globalData.user = result.user;
      const saved = await this.request("/api/state");
      const value = saved.state || {};
      this.globalData.state = {
        ...value,
        dailyRecords: value.dailyRecords || {},
        dailyRecordsInitialized: Boolean(value.dailyRecordsInitialized),
        cycle: normalizeCycle(value.cycle),
      };
      ensureDailyRecords(this.globalData.state, undefined, saved.updatedAt);
      if (value.dailyRecordsVersion !== 2) await this.saveState();
      this.globalData.loadError = "";
      return true;
    } catch (error) {
      this.globalData.loadError = error.message || "暂时无法连接 Bloom 服务。";
      if (error.statusCode === 401) {
        this.globalData.token = "";
        this.globalData.user = null;
        this.globalData.state = null;
        wx.removeStorageSync("bloom-mini-token");
      }
      return false;
    }
  },

  async signInOrRegister(nickname, password) {
    const result = await this.request("/api/auth/register", {
      method: "POST",
      data: { nickname, password },
    });
    if (!result.token) throw { message: "服务没有返回登录凭证，请重新提交。" };
    this.globalData.token = result.token;
    this.globalData.user = result.user;
    wx.setStorageSync("bloom-mini-token", result.token);
    const saved = await this.request("/api/state");
    const value = saved.state || {};
    this.globalData.state = { ...value, dailyRecords: value.dailyRecords || {}, dailyRecordsInitialized: Boolean(value.dailyRecordsInitialized), cycle: normalizeCycle(value.cycle) };
    ensureDailyRecords(this.globalData.state, undefined, saved.updatedAt);
    if (value.dailyRecordsVersion !== 2) await this.saveState();
    this.globalData.loadError = "";
    return result.user;
  },

  async saveState() {
    if (!this.globalData.token || !this.globalData.state) throw new Error("请重新登录后保存记录。");
    const payload = JSON.parse(JSON.stringify(this.globalData.state));
    const token = this.globalData.token;
    const pending = (this.saveQueue || Promise.resolve()).catch(() => {}).then(() => {
      if (this.globalData.token !== token) throw new Error("账号已切换，请重新打开记录。");
      return this.request("/api/state", { method: "PUT", data: { state: payload } });
    });
    this.saveQueue = pending;
    await pending;
  },

  async signOut() {
    try {
      await this.request("/api/auth/logout", { method: "POST", data: {} });
    } catch (_) {}
    wx.removeStorageSync("bloom-mini-token");
    this.globalData.token = "";
    this.globalData.user = null;
    this.globalData.state = null;
  },
});
