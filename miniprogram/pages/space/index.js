const moduleTitles = {
  todo: "今日待办", plan: "一日时间规划", storage: "收纳与物品", meals: "手账食记",
  mood: "情绪日记", growth: "成就与成长", notes: "随心记事",
};
const { dateKey, ensureDailyRecords, getDailyRecord, hasEntries } = require("../../utils/daily");
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
    selectedDate: "", today: "", selectedDateLabel: "", calendarMode: false, calendarLabel: "", calendarDays: [], usesDailyCalendar: false, weekDays: ["日", "一", "二", "三", "四", "五", "六"],
  },

  onLoad(options) {
    this.kind = moduleTitles[options.module] ? options.module : "todo";
    this.category = options.category || "";
    const selectedDate = dateKey();
    const now = new Date();
    this.calendarYear = now.getFullYear();
    this.calendarMonth = now.getMonth();
    this.setData({ kind: this.kind, category: this.category, selectedDate, today: dateKey(), calendarYear: this.calendarYear, calendarMonth: this.calendarMonth });
    this.refreshView();
  },

  onShow() {
    this.refreshToday();
    this.refreshView();
    this.dateTimer = setInterval(() => {
      if (this.data.today !== dateKey()) {
        this.refreshToday();
        this.refreshView();
      }
    }, 30000);
  },

  onHide() { clearInterval(this.dateTimer); },
  onUnload() { clearInterval(this.dateTimer); },

  refreshToday() {
    const today = dateKey();
    if (this.data.today && this.data.today !== today && this.data.selectedDate === this.data.today) {
      this.setData({ selectedDate: today });
      const now = new Date();
      this.calendarYear = now.getFullYear();
      this.calendarMonth = now.getMonth();
    }
    this.setData({ today });
  },

  refreshView() {
    const state = getApp().globalData.state || {};
    ensureDailyRecords(state);
    const daily = getDailyRecord(state, this.data.selectedDate || dateKey());
    const category = categories.find(item => item.id === this.category);
    const tasks = (state.tasks || []).map((item, index) => ({ ...item, index }));
    const schedule = [...daily.schedule].map((item, index) => ({ ...item, index })).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    const allItems = (state.items || []).map((item, index) => ({ ...item, index })).filter(item => !this.category || item.category === this.category);
    const filterValues = [...new Set(allItems.map(item => item.kind).filter(Boolean))];
    const filters = ["全部", ...filterValues];
    let items = allItems;
    if (this.data.activeFilter !== "全部") items = items.filter(item => item.kind === this.data.activeFilter);
    if (this.data.search) items = items.filter(item => `${item.name} ${item.detail || ""} ${item.kind || ""}`.toLowerCase().includes(this.data.search.toLowerCase()));
    if (this.data.sortByPlace) items.sort((a, b) => String(a.detail || "").localeCompare(String(b.detail || ""), "zh-CN"));
    const meals = daily.meals.map((meal, index) => {
      const lines = Array.isArray(meal.lines) ? meal.lines : [];
      return { ...meal, lines, index, calories: lines.reduce((sum, line) => sum + (Number(line?.[1]) || 0), 0) };
    });
    const doneCount = tasks.filter(task => task.done).length;
    this.setData({
      title: this.kind === "storage" ? (category ? category.title : moduleTitles.storage) : moduleTitles[this.kind],
      categoryTitle: category?.title || "",
      categories: categories.map(item => ({ ...item, count: (state.items || []).filter(product => product.category === item.id).length })),
      filters: filters.map(label => ({ label, selected: label === this.data.activeFilter })),
      items, tasks, schedule, meals,
      totalCalories: meals.reduce((sum, meal) => sum + meal.calories, 0),
      moods: moodLabels.map((label, index) => ({ label, index, selected: daily.mood === index, energy: [85, 95, 60, 40, 50][index] })),
      mood: daily.mood,
      moments: warmMoments.map((label, index) => ({ label, index, selected: daily.moments.includes(index) })),
      journal: daily.journal,
      milestones: (state.milestones || []).map((item, index) => ({ ...item, index })),
      notes: daily.notes.map((item, index) => ({ ...item, index })),
      selectedDateLabel: this.dateLabel(this.data.selectedDate || dateKey()),
      calendarLabel: `${this.calendarYear}年${this.calendarMonth + 1}月`,
      calendarDays: this.makeCalendar(state),
      usesDailyCalendar: ["plan", "mood", "notes", "meals"].includes(this.kind),
      doneCount, progress: tasks.length ? Math.round(doneCount / tasks.length * 100) : 0,
    });
  },

  dateLabel(value) {
    const date = new Date(`${value}T12:00:00`);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${["日", "一", "二", "三", "四", "五", "六"][date.getDay()]}`;
  },

  makeCalendar(state) {
    const first = new Date(this.calendarYear, this.calendarMonth, 1);
    const days = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();
    const cells = [];
    for (let index = 0; index < first.getDay(); index += 1) cells.push({ key: `blank-${index}`, blank: true });
    for (let day = 1; day <= days; day += 1) {
      const value = dateKey(new Date(this.calendarYear, this.calendarMonth, day));
      cells.push({ key: value, value, day, selected: value === this.data.selectedDate, today: value === dateKey(), recorded: hasEntries(state.dailyRecords[value], this.kind) });
    }
    return cells;
  },

  showCalendar() { this.setData({ calendarMode: true }); },
  previousCalendarMonth() { const date = new Date(this.calendarYear, this.calendarMonth - 1, 1); this.calendarYear = date.getFullYear(); this.calendarMonth = date.getMonth(); this.refreshView(); },
  nextCalendarMonth() { const date = new Date(this.calendarYear, this.calendarMonth + 1, 1); this.calendarYear = date.getFullYear(); this.calendarMonth = date.getMonth(); this.refreshView(); },
  selectCalendarDay(event) {
    const selectedDate = event.currentTarget.dataset.date;
    if (!selectedDate) return;
    this.setData({ selectedDate, calendarMode: false });
    this.refreshView();
  },
  selectToday() {
    const today = dateKey();
    const date = new Date(`${today}T12:00:00`);
    this.calendarYear = date.getFullYear();
    this.calendarMonth = date.getMonth();
    this.setData({ selectedDate: today, calendarMode: false });
    this.refreshView();
  },

  addEntry(event) {
    const type = event.currentTarget.dataset.type;
    const category = event.currentTarget.dataset.category || this.category || "clothes";
    wx.navigateTo({ url: `/pages/entry/index?type=${type}&category=${category}&date=${this.data.selectedDate}` });
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
    const record = getDailyRecord(getApp().globalData.state, this.data.selectedDate);
    record.mood = Number(event.currentTarget.dataset.index);
    await this.persist();
  },

  async toggleMoment(event) {
    const state = getApp().globalData.state;
    const record = getDailyRecord(state, this.data.selectedDate);
    const selected = record.moments;
    const index = Number(event.currentTarget.dataset.index);
    record.moments = selected.includes(index) ? selected.filter(item => item !== index) : [...selected, index];
    await this.persist();
  },

  onJournalInput(event) {
    getDailyRecord(getApp().globalData.state, this.data.selectedDate).journal[Number(event.currentTarget.dataset.index)] = event.detail.value;
    clearTimeout(this.journalSaveTimer);
    this.journalSaveTimer = setTimeout(() => {
      getApp().saveState().catch(error => wx.showToast({ title: error.message || "保存失败，请重试", icon: "none" }));
    }, 350);
  },

  async chooseNotePhoto() {
    const selectedDate = this.data.selectedDate;
    const result = await new Promise(resolve => wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], success: resolve, fail: () => resolve(null) }));
    const source = result?.tempFiles?.[0]?.tempFilePath;
    if (!source) return;
    wx.compressImage({ src: source, quality: 45, success: compressed => {
      wx.getFileSystemManager().readFile({ filePath: compressed.tempFilePath, encoding: "base64", success: async file => {
        const photo = `data:image/jpeg;base64,${file.data}`;
        if (photo.length > 420000) return wx.showToast({ title: "图片太大，请换一张", icon: "none" });
        const record = getDailyRecord(getApp().globalData.state, selectedDate);
        record.notes = [{ text: "", photo, date: selectedDate }, ...record.notes];
        await this.persist("照片已保存");
      } });
    } });
  },

  async saveMood() {
    getDailyRecord(getApp().globalData.state, this.data.selectedDate).moodSaved = true;
    await this.persist("当日心情已保存");
  },

  async toggleLike(event) {
    const notes = getDailyRecord(getApp().globalData.state, this.data.selectedDate).notes;
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
