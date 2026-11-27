const categoryOptions = [
  { id: "clothes", title: "衣物收纳", unit: "件" },
  { id: "medicine", title: "药品管理", unit: "盒" },
  { id: "pantry", title: "食物储藏", unit: "份" },
  { id: "care", title: "卫生护理", unit: "件" },
];
const mealOptions = ["早餐", "午餐", "晚餐", "加餐"];
const titles = { task: "添加今日待办", time: "添加时间块", item: "添加收纳物品", meal: "记录餐食", note: "随心记事", milestone: "添加里程碑" };
const { dateKey, getDailyRecord } = require("../../utils/daily");

Page({
  data: { type: "task", title: "添加记录", categories: [], categoryNames: [], categoryIndex: 0, mealOptions, mealIndex: 0, time: "09:00", selectedDate: "", photoPath: "", photoData: "", busy: false },

  onLoad(options) {
    const type = titles[options.type] ? options.type : "task";
    const index = Math.max(0, categoryOptions.findIndex(item => item.id === options.category));
    this.setData({
      type, title: titles[type], categories: categoryOptions, categoryNames: categoryOptions.map(item => item.title),
      categoryIndex: index, mealOptions, selectedDate: /^\d{4}-\d{2}-\d{2}$/.test(options.date || "") ? options.date : dateKey(),
    });
  },

  onCategoryChange(event) { this.setData({ categoryIndex: Number(event.detail.value) }); },
  onMealChange(event) { this.setData({ mealIndex: Number(event.detail.value) }); },
  onTimeChange(event) { this.setData({ time: event.detail.value }); },

  choosePhoto() {
    wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], success: result => {
      const source = result.tempFiles?.[0]?.tempFilePath;
      if (!source) return;
      wx.compressImage({ src: source, quality: 45, success: compressed => {
        wx.getFileSystemManager().readFile({
          filePath: compressed.tempFilePath,
          encoding: "base64",
          success: file => {
            const photoData = `data:image/jpeg;base64,${file.data}`;
            if (photoData.length > 420000) {
              wx.showToast({ title: "图片太大，请换一张较小的图片", icon: "none" });
              return;
            }
            this.setData({ photoPath: compressed.tempFilePath, photoData });
          },
          fail: () => wx.showToast({ title: "读取图片失败", icon: "none" }),
        });
      }, fail: () => wx.showToast({ title: "压缩图片失败，请重试", icon: "none" }) });
    } });
  },

  async submit(event) {
    if (this.data.busy) return;
    const values = event.detail.value;
    const name = String(values.name || "").trim();
    const type = this.data.type;
    if (type !== "note" && !name) {
      wx.showToast({ title: "请填写名称", icon: "none" });
      return;
    }
    if (type === "note" && !name && !this.data.photoData) {
      wx.showToast({ title: "写几句话或添加一张照片", icon: "none" });
      return;
    }
    const app = getApp();
    const state = app.globalData.state;
    const daily = getDailyRecord(state, this.data.selectedDate);
    const now = new Date();
    const category = categoryOptions[this.data.categoryIndex];
    switch (type) {
      case "task":
        state.tasks = [...(state.tasks || []), { name, tag: String(values.tag || "今日待办"), time: "", done: false }];
        break;
      case "time":
        daily.schedule.push({ name, time: String(values.time || this.data.time || "09:00"), detail: String(values.detail || "").trim() });
        break;
      case "item":
        state.items = [...(state.items || []), {
          name, category: category.id, detail: String(values.detail || "").trim(), photo: this.data.photoData,
          kind: String(values.kind || "新录入").trim(), status: String(values.status || "").trim(),
          count: values.quantity === "" || values.quantity == null ? 1 : Number(values.quantity), unit: category.unit,
        }];
        break;
      case "meal": {
        const mealType = mealOptions[this.data.mealIndex];
        daily.meals.push({
          name: mealType, time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(now),
          label: mealType, lines: [[name, Number(values.kcal || 0)]], photo: this.data.photoData,
        });
        break;
      }
      case "note":
        daily.notes.unshift({ text: name, photo: this.data.photoData, date: `${this.data.selectedDate} ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(now)}` });
        break;
      case "milestone":
        state.milestones = [...(state.milestones || []), { name, done: false }];
        break;
      default:
        return;
    }
    this.setData({ busy: true });
    try {
      await app.saveState();
      wx.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 350);
    } catch (error) {
      switch (type) {
        case "task": state.tasks.pop(); break;
        case "time": daily.schedule.pop(); break;
        case "item": state.items.pop(); break;
        case "meal": daily.meals.pop(); break;
        case "note": daily.notes.shift(); break;
        case "milestone": state.milestones.pop(); break;
      }
      wx.showToast({ title: error.message || "保存失败，请重试", icon: "none" });
      this.setData({ busy: false });
    }
  },
});
