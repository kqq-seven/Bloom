const moduleTitles = {
  todo: "今日待办", plan: "一日时间规划", storage: "收纳与物品", meals: "手账食记",
  mood: "情绪日记", growth: "成就与成长", notes: "随心记事",
};
const categories = [
  { id: "clothes", title: "衣物收纳" }, { id: "medicine", title: "药品管理" },
  { id: "pantry", title: "食物储藏" }, { id: "care", title: "卫生护理" },
];
const moodLabels = ["☀ 晴朗平稳", "⛅ 轻快愉悦", "☁ 偶有疲惫", "☂ 低落易感", "ϟ 焦虑紧绷"];
const warmMoments = ["☕ 喝了喜欢的咖啡", "🌿 窗边吹风发呆", "📖 读了半小时书", "💤 昨夜睡眠安稳", "🌙 经期后平稳期", "💻 工作告一段落"];

Page({
  data: {
    kind: "todo", title: "今日待办", category: "", categoryTitle: "", categories: [], items: [], tasks: [], schedule: [], meals: [],
    totalCalories: 0, moods: [], moments: [], journal: ["", "", ""], milestones: [], notes: [], doneCount: 0, progress: 0,
    search: "", sortByPlace: false, filters: [], activeFilter: "全部",
  },

  onLoad(options) {
    this.kind = moduleTitles[options.module] ? options.module : "todo";
    this.category = options.category || "";
    this.refreshView();
  },

  onShow() { this.refreshView(); },

  refreshView() {
    const state = getApp().globalData.state || {};
    const category = categories.find(item => item.id === this.category);
    const tasks = (state.tasks || []).map((item, index) => ({ ...item, index }));
    const schedule = [...(state.schedule || [])].map((item, index) => ({ ...item, index })).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    const allItems = (state.items || []).map((item, index) => ({ ...item, index })).filter(item => !this.category || item.category === this.category);
    const filterValues = [...new Set(allItems.map(item => item.kind).filter(Boolean))];
    const filters = ["全部", ...filterValues];
    let items = allItems;
    if (this.data.activeFilter !== "全部") items = items.filter(item => item.kind === this.data.activeFilter);
    if (this.data.search) items = items.filter(item => `${item.name} ${item.detail || ""} ${item.kind || ""}`.toLowerCase().includes(this.data.search.toLowerCase()));
    if (this.data.sortByPlace) items.sort((a, b) => String(a.detail || "").localeCompare(String(b.detail || ""), "zh-CN"));
    const meals = (state.meals || []).map((meal, index) => {
      const lines = Array.isArray(meal.lines) ? meal.lines : [];
      return { ...meal, lines, index, calories: lines.reduce((sum, line) => sum + (Number(line?.[1]) || 0), 0) };
    });
    const doneCount = tasks.filter(task => task.done).length;
    const selectedMoments = Array.isArray(state.moments) ? state.moments : [];
    this.setData({
      title: this.kind === "storage" ? (category ? category.title : moduleTitles.storage) : moduleTitles[this.kind],
      categoryTitle: category?.title || "",
      categories: categories.map(item => ({ ...item, count: (state.items || []).filter(product => product.category === item.id).length })),
      filters: filters.map(label => ({ label, selected: label === this.data.activeFilter })),
      items, tasks, schedule, meals,
      totalCalories: meals.reduce((sum, meal) => sum + meal.calories, 0),
      moods: moodLabels.map((label, index) => ({ label, index, selected: state.mood === index, energy: [85, 95, 60, 40, 50][index] })),
      moments: warmMoments.map((label, index) => ({ label, index, selected: selectedMoments.includes(index) })),
      journal: Array.isArray(state.journal) ? state.journal : ["", "", ""],
      milestones: (state.milestones || []).map((item, index) => ({ ...item, index })),
      notes: (state.notes || []).map((item, index) => ({ ...item, index })),
      doneCount, progress: tasks.length ? Math.round(doneCount / tasks.length * 100) : 0,
    });
  },

  addEntry(event) {
    const type = event.currentTarget.dataset.type;
    const category = event.currentTarget.dataset.category || this.category || "clothes";
    wx.navigateTo({ url: `/pages/entry/index?type=${type}&category=${category}` });
  },

  openCategory(event) {
    wx.navigateTo({ url: `/pages/space/index?module=storage&category=${event.currentTarget.dataset.category}` });
  },

  async toggleTask(event) {
    const state = getApp().globalData.state;
    const index = Number(event.currentTarget.dataset.index);
    state.tasks[index].done = !state.tasks[index].done;
    await this.persist();
  },

  async toggleMilestone(event) {
    const state = getApp().globalData.state;
    const index = Number(event.currentTarget.dataset.index);
    state.milestones[index].done = !state.milestones[index].done;
    await this.persist();
  },

  async adjustQuantity(event) {
    const state = getApp().globalData.state;
    const item = state.items[Number(event.currentTarget.dataset.index)];
    item.count = Math.min(9999, Math.max(0, (Number(item.count) || 0) + Number(event.currentTarget.dataset.step)));
    await this.persist();
  },

  onSearch(event) { this.setData({ search: event.detail.value }); this.refreshView(); },
  onFilter(event) { this.setData({ activeFilter: event.currentTarget.dataset.filter }); this.refreshView(); },
  toggleSort() { this.setData({ sortByPlace: !this.data.sortByPlace }); this.refreshView(); },

  async selectMood(event) {
    getApp().globalData.state.mood = Number(event.currentTarget.dataset.index);
    await this.persist();
  },

  async toggleMoment(event) {
    const state = getApp().globalData.state;
    const selected = Array.isArray(state.moments) ? state.moments : [];
    const index = Number(event.currentTarget.dataset.index);
    state.moments = selected.includes(index) ? selected.filter(item => item !== index) : [...selected, index];
    await this.persist();
  },

  onJournalInput(event) {
    getApp().globalData.state.journal[Number(event.currentTarget.dataset.index)] = event.detail.value;
  },

  async chooseNotePhoto() {
    const result = await new Promise(resolve => wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], success: resolve, fail: () => resolve(null) }));
    const source = result?.tempFiles?.[0]?.tempFilePath;
    if (!source) return;
    wx.compressImage({ src: source, quality: 45, success: compressed => {
      wx.getFileSystemManager().readFile({ filePath: compressed.tempFilePath, encoding: "base64", success: async file => {
        const photo = `data:image/jpeg;base64,${file.data}`;
        if (photo.length > 420000) return wx.showToast({ title: "图片太大，请换一张", icon: "none" });
        const notes = getApp().globalData.state.notes || [];
        getApp().globalData.state.notes = [{ text: "", photo, date: new Date().toLocaleDateString("zh-CN") }, ...notes];
        await this.persist("照片已保存");
      } });
    } });
  },

  async saveMood() {
    getApp().globalData.state.moodSaved = true;
    await this.persist("今日情绪已保存");
  },

  async toggleLike(event) {
    const notes = getApp().globalData.state.notes;
    const index = Number(event.currentTarget.dataset.index);
    notes[index].liked = !notes[index].liked;
    await this.persist();
  },

  async persist(message) {
    try {
      await getApp().saveState();
      this.refreshView();
      if (message) wx.showToast({ title: message, icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败，请重试", icon: "none" });
    }
  },
});
