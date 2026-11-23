"use strict";

const app = document.querySelector("#app");
const sheet = document.querySelector("#sheet");
const toast = document.querySelector("#toast");
const { dateKey, dayDistance, normalizeCycle, cycleSummary, savePeriodStart, savePeriodEnd } = window.BloomCycle;

const modules = [
  { id: "todo", title: "今日待办", detail: "从一件重要小事开始", foot: "添加待办", tone: "" },
  { id: "plan", title: "一日时间规划", detail: "按自己的节奏安排时间", foot: "规划一天", tone: "mint" },
  { id: "storage", title: "收纳与物品", detail: "衣物、药品、卫生备品", foot: "整理物品", tone: "rose" },
  { id: "cycle", title: "经期与周期", detail: "记录身体节律与变化", foot: "开始记录", tone: "coral" },
  { id: "meals", title: "手账食记", detail: "记录每一餐与卡路里", foot: "添加餐食", tone: "" },
  { id: "mood", title: "情绪日记", detail: "留下一点今天的心情", foot: "记录心情", tone: "" },
  { id: "growth", title: "成就与成长", detail: "写下自己的目标与里程碑", foot: "添加目标", tone: "" },
  { id: "notes", title: "随心记事", detail: "记录日常，留下灵感", foot: "写下第一条", tone: "mint" },
];

const categories = [
  { id: "clothes", title: "衣物收纳", total: 56, status: "正常", icon: "clothes" },
  { id: "medicine", title: "药品管理", total: 18, status: "1件待换", icon: "medicine" },
  { id: "pantry", title: "食物储藏", total: 32, status: "2件临期", icon: "pantry" },
  { id: "care", title: "卫生护理", total: 22, status: "2款缺货", icon: "care" },
];

const weather = [
  ["☀", "晴朗平稳"], ["⛅", "轻快愉悦"], ["☁", "偶有疲惫"], ["☂", "低落易感"], ["ϟ", "焦虑紧绷"],
];

const warmMoments = [
  "☕ 喝了喜欢的咖啡", "🌿 窗边吹风发呆", "📖 读了半小时书",
  "💤 昨夜睡眠安稳", "🌙 经期后平稳期", "💻 工作告一段落",
];

const createEmptyState = () => ({
  tasks: [], schedule: [], items: [], notes: [], meals: [], mood: null,
  moments: [], journal: ["", "", ""], cycle: { start: "", end: "", reminder: false, history: [] }, milestones: [],
});

let account = null;
let state = createEmptyState();
let isAuthenticated = false;
let restoringSession = true;
let sessionError = "";
let stateSaveTimer;
let stateSaveMessage = "";
let activeRoute = "";
let filter = "全部";
let inventorySort = false;
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let chosenDay = new Date().toISOString().slice(0, 10);
let toastTimer;

const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function imgSource(value) {
  if (/^data:image\/(?:png|jpeg|webp);base64,/.test(value)) return escapeText(value);
  return `assets/${escapeText(value)}.png`;
}

function glyph(name, round = true) {
  return `<img class="glyph${round ? " round" : ""}" src="${imgSource(name)}" alt="">`;
}

function photo(name, className = "list-photo") {
  return name ? `<img class="${className}" src="${imgSource(name)}" alt="" loading="lazy">` : "";
}

function pill(label, tone = "") {
  return `<span class="pill ${tone}">${escapeText(label)}</span>`;
}

function iconButton(label, content, attributes) {
  return `<button type="button" class="icon-button" aria-label="${label}" ${attributes}>${content}</button>`;
}

function topbar(title, options = {}) {
  const { home = false, sub = "", serif = false, center = false, parent = "home" } = options;
  return `<header class="topbar">
    ${home ? "" : `<a class="icon-button" href="#${parent}" aria-label="返回${parent === "home" ? "首页" : "收纳主页"}">‹</a>`}
    <div class="topbar-title${serif ? " serif" : ""}${center ? " center" : ""}">${title}${sub ? `<small>${sub}</small>` : ""}</div>
    <div class="top-actions">
      ${home ? `<a class="icon-button" href="#rhythm" aria-label="节律">${glyph("sprout")}</a>` : `<a class="icon-button" href="#home" aria-label="首页">⌂</a>`}
      <a class="icon-button" href="#profile" aria-label="我的">${glyph("avatar")}</a>
    </div>
  </header>`;
}

const navItems = [
  ["home", "首页", "flower"], ["journal", "手账", "journal"], ["rhythm", "节律", "rhythm"], ["profile", "我的", "profile"],
];

function nav(current) {
  return `<nav class="bottom-nav" aria-label="主导航">${navItems.map(([id, label, icon]) =>
    `<a href="#${id}"${current === id ? ' aria-current="page"' : ""}>${glyph(icon)}${label}</a>`).join("")}</nav>`;
}

function tile({ id, title, detail, badge, foot, tone, icon }) {
  return `<a class="tile" href="#${id}">
    <div class="row split">${glyph(icon || id)}${badge ? pill(badge, tone) : ""}</div>
    <h3>${title}</h3>
    <p class="subtext">${detail}</p>
    <div class="row split"><small class="${tone === "mint" ? "positive" : "brand"}">${foot || ""}</small><span class="arrow" aria-hidden="true">→</span></div>
  </a>`;
}

function mainButton(label, attrs, icon = "camera") {
  return `<button class="primary main-action" ${attrs}>${icon ? glyph(icon, false) : ""}${label}</button>`;
}

function login() {
  return `<main class="auth-page">
    <section class="auth-panel">
      <div class="auth-brand"><span class="auth-mark">✿</span><span class="wordmark">Bloom 拾光</span></div>
      <p class="eyebrow">A SPACE OF YOUR OWN</p>
      <h1>留一方空间，给自己的生活</h1>
      ${restoringSession ? '<p class="subtext" role="status">正在打开你的空间…</p>' : sessionError
        ? `<p class="subtext" role="alert">${escapeText(sessionError)}</p><button class="primary" type="button" data-action="retry-session">重试</button>`
        : `<p class="subtext">输入昵称和密码。新组合会创建空间，已注册的组合会登录。</p>
        <form class="auth-form" data-form="account">
          <label>昵称<input name="nickname" required maxlength="32" placeholder="输入你的昵称" autocomplete="username" aria-describedby="nickname-hint nickname-error"></label>
          <p id="nickname-hint" class="subtext">1–10 个字符，支持中文、英文、数字和表情。</p>
          <label>密码<input name="password" type="password" required minlength="8" maxlength="128" placeholder="至少 8 个字符" autocomplete="current-password" aria-describedby="password-hint"></label>
          <p id="password-hint" class="subtext">首次使用此昵称时设置密码。之后使用同一组合登录。</p>
          <p id="nickname-error" class="subtext danger" role="alert" hidden></p>
          <button class="primary" type="submit">登录 / 注册</button>
        </form>
        <small>昵称已存在或密码错误时，请检查后重试。</small>`}
    </section>
  </main>`;
}

function home() {
  const cycleInfo = cycleSummary(state.cycle);
  const todayModules = modules.map(item => {
    if (item.id === "todo" && state.tasks.length) return { ...item, badge: `${state.tasks.filter(task => task.done).length}/${state.tasks.length} 件` };
    if (item.id === "mood" && state.mood !== null) return { ...item, badge: weather[state.mood][1] };
    if (item.id === "meals" && state.meals.length) return { ...item, badge: `${state.meals.length} 餐` };
    if (item.id === "storage") return { ...item, badge: `${state.items.length} 件` };
    return item;
  });

  return `${topbar('<span class="wordmark">Bloom 拾光</span> Home', { home: true })}
    <main class="page with-nav">
      <section class="greeting">
        <div><h1>你好，${escapeText(account?.display_name || "朋友")}</h1><small>${new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())} · 按自己的节律生活</small></div>
        ${iconButton("搜索空间", glyph("search"), 'data-open="search"')}
        ${iconButton("查看全部空间", glyph("tune"), 'data-open="spaces"')}
      </section>
      ${!state.tasks.length && !state.items.length && !state.notes.length ? `<section class="empty-start"><span class="empty-start-mark">✿</span><h2>这里是属于你的空间</h2><p>从一件物品、一条待办或一段手记开始，慢慢添上自己的生活。</p><button class="primary" data-open="quick-note">写下第一条记录</button></section>` : ""}
      ${cycleInfo.last ? `<a class="alert urgent" href="#cycle"><span class="alert-icon">♡</span><div><strong>${cycleInfo.last.end ? "距上次经期结束" : "本次经期进行中"}</strong>${pill(cycleInfo.last.end ? `第 ${cycleInfo.daysSinceEnd} 天` : `第 ${cycleInfo.currentPeriodDay} 天`)}<p>${cycleInfo.daysUntilNext === null ? "再记录一次经期开始日，即可生成个人周期估算。" : cycleInfo.daysUntilNext > 0 ? `按你的记录，预计约 ${cycleInfo.daysUntilNext} 天后来经。` : cycleInfo.daysUntilNext === 0 ? "按你的记录，预计今天来经。" : `预计日期已过 ${Math.abs(cycleInfo.daysUntilNext)} 天，记录新周期可更新估算。`}</p></div><span class="arrow">›</span></a>` : ""}
      <div class="section-title"><h2><span class="brand" aria-hidden="true">⊞</span> 我的空间</h2><small>内容由你添加</small></div>
      <div class="grid">${todayModules.map(tile).join("")}</div>
      ${state.notes.length ? `<aside class="quote"><small>我的手记</small><blockquote>${escapeText(state.notes[0].text || "照片记录")}</blockquote></aside>` : ""}
      ${state.items.length ? "" : mainButton("添加第一件物品", 'data-open="item"')}
    </main>${nav("home")}`;
}

function todo() {
  const done = state.tasks.filter(task => task.done).length;
  const next = state.tasks.findIndex(task => !task.done);
  const progress = state.tasks.length ? Math.round(done / state.tasks.length * 100) : 0;
  return `${topbar("今日待办", { sub: "TODO & FLOW", center: true })}
    <main class="page">
      <section class="card task-hero">
        <p class="eyebrow">${new Intl.DateTimeFormat("zh-CN", { dateStyle: "full" }).format(new Date())}</p>
        <h1>把心力留给最重要的事</h1>
        <p class="subtext">写下今天想完成的事，按自己的节奏一件件来。</p>
        <div class="progress-box"><div class="row split"><span>✧ 心流进展</span><strong class="brand">${done} / ${state.tasks.length} 项完成</strong></div>
          <div class="progress-track" role="progressbar" aria-label="待办完成进度" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
        </div>
      </section>
      <div class="section-title"><h2 class="dot section-title-label">今日待办</h2>${pill(`${state.tasks.length} 项`)}</div>
      ${state.tasks.map((task, index) => `<button type="button" class="task card${index === next ? " is-next" : ""}" data-task="${index}" aria-pressed="${task.done}">
        <span class="check" aria-hidden="true">${task.done ? "✓" : ""}</span>
        <span><strong class="task-name">${escapeText(task.name)}</strong>${pill(task.tag, index === 1 ? "rose" : "mint")} <small>${escapeText(task.time)}</small></span>
        <span class="brand" aria-hidden="true">${index === next ? "◷" : "◇"}</span>
      </button>`).join("")}
      ${state.tasks.length ? "" : `<div class="empty-state"><h3>清单还是空的</h3><p>添加第一件今天想完成的事。</p></div>`}
      <form class="inline-form" data-form="task" style="margin-top:20px">
        <input name="name" required maxlength="100" aria-label="新待办" placeholder="随手记一笔今日待办…">
        <button class="primary" type="submit">＋ 添入</button>
      </form>
    </main>`;
}

function storage() {
  return `${topbar('<span class="wordmark">Bloom</span> 拾光收纳', { sub: "Mindful Living" })}
    <main class="page stack">
      <section><h1>拾光收纳</h1><p class="subtext">物品概览与状态管理</p></section>
      <div class="stats"><div>核心品类<strong>4 类</strong></div><div>我的物品<strong>${state.items.length} 件</strong></div><div>已建立分类<strong>${new Set(state.items.map(item => item.category)).size} 类</strong></div></div>
      ${!state.items.length ? `<section class="empty-state"><h2>收纳空间还空着</h2><p>添加自己的衣物、食品、药品或护理用品，按类别整理。</p><button class="primary" data-open="item">添加第一件物品</button></section>` : ""}
      <section><div class="section-title"><h2 class="dot">空间收纳</h2><small>4 大分类</small></div>
        <div class="grid">${categories.map(item => {
          const count = state.items.filter(product => product.category === item.id).length;
          return tile({ ...item, badge: `${count} 件`, detail: item.title, foot: count ? "查看物品" : "添加物品" });
        }).join("")}</div>
      </section>
      ${mainButton("快速录入物品", 'data-open="item"')}
    </main>`;
}

function tabs(labels) {
  return `<div class="tabs" aria-label="筛选">${labels.map(label =>
    `<button type="button" data-filter="${escapeText(label)}" aria-pressed="${filter === label}">${escapeText(label)}</button>`).join("")}</div>`;
}

const collectionCopy = {
  clothes: ["衣物收纳管理", "WARDROBE CAPSULE", "按款式精简分类 · 重塑轻盈呼吸感", ["全部", "短袖", "长裤", "短裤", "外套", "长裙"]],
  pantry: ["食物与零食储藏", "PANTRY JOURNAL", "细致记录每一份温热餐食与佐茶零嘴，顺应时节品尝最佳赏味状态。", ["全部", "临期赏味", "随心零食", "冷藏保鲜"]],
  care: ["护理备品匣", "SANCTUARY SYNC", "温和记录 · 临期与存量轻声守候", ["全部", "经期铠护", "洁净湿巾", "棉柔备品"]],
  medicine: ["药匣整理手记", "MEDICINE JOURNAL", "归档常备药品与临期记录", ["全部", "临期", "常备药品"]],
};

function itemCard(item, index) {
  const search = escapeText(`${item.name} ${item.detail} ${item.kind}`.toLowerCase());
  if (item.category === "clothes") return `<article class="card" data-inventory-name="${search}">
    <div class="caption-wrap">${photo(item.photo)}${pill([item.kind, item.season].filter(Boolean).join(" · "))}</div>
    <h3>${escapeText(item.name)}</h3><p class="subtext">${escapeText(item.detail)}</p>
  </article>`;
  const low = item.status?.includes("临期") || (item.category === "care" && item.count < 4);
  return `<article class="card product" data-inventory-name="${search}">
    ${item.photo ? photo(item.photo, "photo") : glyph(item.category)}
    <div><div class="row">${pill(item.kind, "mint")}${low ? pill("需关注", "rose") : ""}</div>
      <h3 class="${item.category === "pantry" ? "serif" : ""}">${escapeText(item.name)}</h3>
      <p class="subtext">${escapeText(item.detail)}</p>
      <p class="subtext ${low ? "danger" : "positive"}">${escapeText(item.status)}</p>
      <div class="quantity"><button data-quantity="${index}" data-step="-1" aria-label="减少 ${escapeText(item.name)}" ${item.count === 0 ? "disabled" : ""}>−</button>
        <strong>${item.count} ${escapeText(item.unit)}</strong><button data-quantity="${index}" data-step="1" aria-label="增加 ${escapeText(item.name)}">＋</button></div>
    </div>
  </article>`;
}

function collection(id) {
  const category = categories.find(item => item.id === id);
  const [heading, label, caption, filters] = collectionCopy[id];
  let products = state.items.map((item, index) => ({ ...item, index })).filter(item => item.category === id);
  const total = state.items.filter(item => item.category === id).length;
  if (filter !== "全部") products = products.filter(item => item.kind === filter || item.status?.includes(filter));
  if (inventorySort) products.sort((a, b) => a.detail.localeCompare(b.detail, "zh-CN"));
  const title = id === "pantry" ? "Ensuite Linen &amp; Pantry" : id === "care" ? "Walk In Closet Detail" : `<span class="wordmark">Bloom</span> ${category.title}`;
  const intro = id === "pantry" || id === "care"
    ? `<aside class="soft row">${glyph(id)}<div><h3>${id === "pantry" ? "食物与赏味期" : "护理备品"}</h3><p class="subtext">添加你自己的物品，随时更新数量与到期信息。</p></div></aside>`
    : "";
  return `${topbar(title, { serif: id !== "clothes", parent: "storage" })}
    <main class="page stack">
      <section class="section-intro"><p class="eyebrow">${label}</p><div class="row split"><h1>${heading}</h1>${pill(`${total} 件`, "mint")}</div><p class="subtext">${caption}</p></section>
      ${intro}
      ${id === "clothes" ? `<label class="search-field">${glyph("search")}<input type="search" id="inventory-search" aria-label="搜索衣物" placeholder="搜索衣物名称、颜色、存放位置…"></label>` : ""}
      ${tabs(filters)}
      ${id === "clothes" ? `<div class="row split"><small>展示中 · ${escapeText(filter)}</small><button class="subtext" type="button" data-action="sort" aria-pressed="${inventorySort}">按位置排序 ↕</button></div>` : ""}
      ${products.map(item => itemCard(item, item.index)).join("")}
      <section id="inventory-empty" class="empty-state"${products.length ? " hidden" : ""}><h2>这里还没有物品</h2><p>添加属于你的物品后，它们会显示在这里。</p><button class="primary" data-open="item" data-category="${id}">添加第一件</button></section>
      ${products.length ? mainButton("添加物品", `data-open="item" data-category="${id}"`) : ""}
    </main>`;
}

function cycle() {
  const year = month.getFullYear();
  const currentMonth = month.getMonth();
  const days = new Date(year, currentMonth + 1, 0).getDate();
  const offset = new Date(year, currentMonth, 1).getDay();
  const summary = cycleSummary(state.cycle);
  const last = summary.last;
  const signedEstimate = summary.daysUntilNext;
  const nextPeriodText = signedEstimate === null
    ? "记录至少两次经期开始日后，可按你的周期估算下次时间。"
    : signedEstimate > 0
      ? `按你已记录的周期，预计约 ${signedEstimate} 天后开始。`
      : signedEstimate === 0
        ? "按你的记录，预计今天开始。"
        : `预计日期已过 ${Math.abs(signedEstimate)} 天，记录新周期后会更新估算。`;
  const latestDay = summary.currentPeriodDay;
  return `${topbar("经期日历与记录", { sub: "记录自己的身体节律" })}
    <main class="page stack">
      <section class="card">
        <div class="row split"><div class="row"><h2 class="serif">${year}年 ${currentMonth + 1}月</h2>${summary.startsCount ? pill(`已记录 ${summary.startsCount} 次`, "mint") : ""}</div>
          <div class="row">${iconButton("上个月", "‹", 'data-month="-1"')}${iconButton("下个月", "›", 'data-month="1"')}</div></div>
        <div class="calendar-grid">${"日一二三四五六".split("").map(day => `<small>${day}</small>`).join("")}${"<span></span>".repeat(offset)}
          ${Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const date = `${year}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const recorded = summary.history.some(item => date >= item.start && (!item.end || date <= item.end));
            const predicted = summary.nextStart && summary.predictedEnd && date >= summary.nextStart && date <= summary.predictedEnd;
            return `<button class="${recorded ? "logged" : predicted ? "prediction" : ""}" data-day="${date}" aria-pressed="${chosenDay === date}" aria-label="${date}">${day}</button>`;
          }).join("")}</div>
        <div class="legend"><span class="brand">● 已记录经期</span><span>◌ 预计经期</span></div>
      </section>
      ${last ? `<section class="soft stack">
        <div class="row split"><h2>身体节律</h2>${pill(last.end ? `上次经期持续 ${dayDistance(last.start, last.end) + 1} 天` : `本次第 ${latestDay} 天`, "mint")}</div>
        <div class="card"><small>上次经期结束至今</small><h1 class="brand serif" style="margin:5px 0">${last.end ? `${summary.daysSinceEnd} 天` : "经期尚未结束"}</h1><p class="subtext">${last.end ? `结束日期 ${escapeText(last.end)}` : `开始日期 ${escapeText(last.start)}`}</p></div>
        <div class="card"><small>下次经期估算</small><h2 class="brand" style="margin:6px 0">${nextPeriodText}</h2>${summary.nextStart ? `<p class="subtext">预计开始 ${escapeText(summary.nextStart)}${summary.averageCycle ? ` · 平均周期 ${summary.averageCycle} 天` : ""}</p>` : ""}<p class="subtext" style="margin-top:5px">按已记录的经期开始日期估算，仅作个人节律参考。</p></div>
        <div class="row"><button class="primary" data-open="${last.end ? "cycle-start" : "cycle-start"}">记录新一期开始</button>${last.end ? "" : `<button class="secondary" data-open="cycle-end">记录本次结束</button>`}</div>
        <label class="card row split"><span>显示周期提醒</span><input type="checkbox" data-action="reminder" ${state.cycle.reminder ? "checked" : ""}></label>
      </section>` : `<section class="empty-state"><h2>记录你的第一期经期</h2><p>先记录开始和结束日期。再记录下一次开始后，就能根据你的实际间隔估算下次经期。</p><button class="primary" data-open="cycle-start">记录开始日期</button></section>`}
      ${summary.history.length ? `<section class="stack"><div class="row split"><h2>经期记录</h2><small>${summary.history.length} 次</small></div>
        ${[...summary.history].reverse().map((item, index) => `<article class="card row split"><div><strong>第 ${summary.history.length - index} 次</strong><p class="subtext">${escapeText(item.start)} 至 ${item.end ? escapeText(item.end) : "进行中"}</p></div>${item.end ? pill(`持续 ${dayDistance(item.start, item.end) + 1} 天`, "mint") : pill(`第 ${dayDistance(item.start, summary.today) + 1} 天`, "coral")}</article>`).join("")}
      </section>` : ""}
    </main>`;
}

function mood() {
  const charge = state.mood === null ? null : [85, 95, 60, 40, 50][state.mood];
  return `${topbar("New Journal Entry", { serif: true, sub: "情绪手账 · MOOD JOURNAL" })}
    <main class="page stack">
      <section class="section-intro"><p class="eyebrow">我的情绪记录</p><h1 class="serif">${new Intl.DateTimeFormat("zh-CN", { dateStyle: "full" }).format(new Date())}</h1></section>
      <section class="soft"><div class="row split"><h2>☁ 今日情绪天气</h2><small>TAP TO SELECT</small></div>
        <div class="mood-grid">${weather.map(([symbol, label], idx) => `<button type="button" data-mood="${idx}" aria-pressed="${state.mood === idx}"><span class="weather" aria-hidden="true">${symbol}</span>${label}</button>`).join("")}</div>
        ${charge === null ? "" : `<div class="card row split"><strong>今日心情</strong><span class="positive">${charge}% · ${weather[state.mood][1]}</span></div>`}
      </section>
      <section class="soft"><div class="row split"><h2>微光滋养 · 是什么温暖了今天</h2><small>已选 ${state.moments.length} 项</small></div>
        <div class="mood-tags">${warmMoments.map((label, idx) => `<button class="pill" type="button" data-moment="${idx}" aria-pressed="${state.moments.includes(idx)}">${label}</button>`).join("")}</div></section>
      <section class="card"><h2>三行微确幸 · 拾光便笺</h2><div class="journal-lines">${state.journal.map((line, index) =>
        `<label>${pill(index + 1, "rose")}<textarea aria-label="第 ${index + 1} 行便笺" data-line="${index}" maxlength="240">${escapeText(line)}</textarea></label>`).join("")}</div></section>
      ${state.mood !== null || state.journal.some(Boolean) || state.moments.length ? mainButton("保存今天的心情", 'data-action="save-mood"', "") : `<p class="subtext">选一种心情，或写下今天的感受。</p>`}
    </main>`;
}

function meals() {
  const calories = meal => meal.lines.reduce((total, line) => total + line[1], 0);
  const total = state.meals.reduce((sum, meal) => sum + calories(meal), 0);
  return `${topbar("手账食记", { serif: true, sub: "DAILY JOURNAL · 一日三餐" })}
    <main class="page">
      <section class="card stack">
        <div class="row split"><h2 class="serif">${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date())}</h2><small>今日食记</small></div>
        ${state.meals.map((meal, index) => meal.snack
          ? `<article class="soft row split"><div><strong>${escapeText(meal.name)} · ${escapeText(meal.lines[0][0])}</strong><p class="subtext">${escapeText(meal.detail)}</p></div><strong class="brand">+${calories(meal)} kcal</strong></article>`
          : `<article class="soft meal-card stack">
            <div class="row split"><h2>${meal.name}</h2><small>${meal.time}</small></div>
            <div class="row">
              <button class="meal-photo" data-open="meal-photo" data-index="${index}" aria-label="${meal.photo ? "更换" : "添加"}餐食照片">${meal.photo ? photo(meal.photo, "meal-image") : "＋"}<small>照片</small></button>
              <div class="meal-info"><div class="row split">${pill(meal.label, index === 1 ? "rose" : "mint")}<span class="meal-amount serif">${calories(meal)}<small>kcal</small></span></div>
                <div class="meal-items">${meal.lines.map(([name, kcal]) => `<p class="row split subtext"><span>${escapeText(name)}</span><span class="brand">~${kcal}</span></p>`).join("")}</div>
              </div>
            </div></article>`).join("")}
        ${state.meals.length ? `<div class="soft row split"><div><h2>今日总热量</h2><small>DAILY TOTAL CALORIES</small></div><strong class="meal-amount serif">${total.toLocaleString("en-US")}<small> kcal</small></strong></div>` : `<div class="empty-state"><h2>今天还没有餐食记录</h2><p>添加第一餐，也可以附上照片与热量。</p></div>`}
      </section>
      <button class="secondary main-action" data-open="meal">＋ 记录餐食</button>
    </main>`;
}

function photoPicker() {
  return `<label class="photo-pick">${glyph("camera")}<strong>拍一张照 / 从相册选取</strong><small>JPG、PNG 或 WebP，最大 8 MB</small>
    <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" data-photo-input hidden></label>`;
}

function notes() {
  return `${topbar('<span class="wordmark">Bloom</span> · Inspiration Notes', { serif: true })}
    <main class="page stack">
      <section><h1 class="brand" style="font-size:21px">随心记事 · 随手拍与日常</h1><p class="subtext">定格眼前的微光，写下当下的小心意。</p></section>
      <form class="card note-composer" data-form="note"><div class="row split"><strong class="brand">● 今日随手记</strong><small>随时随刻 · 纯粹记录</small></div>
        ${photoPicker()}<textarea name="text" maxlength="500" aria-label="随手记" placeholder="放下此刻想写的话，不用工整，随心就好…"></textarea>
        <div class="row split"><span class="muted" aria-hidden="true">♧ ☺</span><button class="primary" type="submit">✓ 留存此刻</button></div>
      </form>
      <div class="section-title"><h2>随手手账流</h2><small>纯粹时刻 · 真实生活</small></div>
      ${state.notes.length ? state.notes.map((entry, index) => `<article class="card note-entry">
        ${photo(entry.photo)}<p>${escapeText(entry.text)}</p>
        <div class="row split" style="margin-top:8px"><div class="row"><small>${escapeText(entry.date)}</small>${pill(entry.tag || "随手记", "mint")}</div>
          <button type="button" class="like" data-like="${index}" aria-label="收藏这条手记" aria-pressed="${Boolean(entry.liked)}">${entry.liked ? "♥" : "♡"}</button></div>
      </article>`).join("") : `<section class="empty-state"><h2>还没有手记</h2><p>在上方写下第一条，或拍一张照片留作记录。</p></section>`}
      ${mainButton("随手快拍", 'data-open="quick-note"')}
    </main>`;
}

function plan() {
  const schedule = [...state.schedule].sort((a, b) => a.time.localeCompare(b.time));
  return `${topbar("一日时间规划", { sub: "DAILY RHYTHM" })}
    <main class="page stack">
      <section class="soft"><p class="eyebrow">${new Intl.DateTimeFormat("zh-CN", { dateStyle: "full" }).format(new Date())}</p><h1>一日时间规划</h1><p class="subtext">按自己的节奏安排时间。</p></section>
      <section class="stack"><h2>今日时间线</h2>${schedule.length ? schedule.map(block => `<div class="card row">
        <time class="pill mint">${escapeText(block.time)}</time><div><h3>${escapeText(block.name)}</h3><small>${escapeText(block.detail)}</small></div></div>`).join("") : '<div class="empty-state"><p>还没有时间安排，添加一段适合自己的时间。</p></div>'}</section>
      ${mainButton("＋ 添加时间块", 'data-open="time"', "")}
    </main>`;
}

function growth() {
  return `${topbar("成就与成长", { sub: "GROWTH JOURNAL" })}
    <main class="page stack"><section class="soft"><h1>成就与成长</h1><p class="subtext">自定义梦想里程碑 · 记录每一次小小的前进。</p></section>
      <section><h2 style="margin-bottom:12px">我的里程碑</h2>
        ${state.milestones.length ? state.milestones.map((item, index) => `<button class="task card" data-milestone="${index}" aria-pressed="${item.done}"><span class="check">${item.done ? "✓" : ""}</span><span class="task-name">${escapeText(item.name)}</span></button>`).join("") : `<div class="empty-state"><h3>还没有设定目标</h3><p>添加一个对自己重要的小目标。</p></div>`}</section>
      ${mainButton("＋ 添加里程碑", 'data-open="milestone"', "")}
    </main>`;
}

function landing(id, title, choices) {
  return `${topbar(`<span class="wordmark">Bloom</span> ${title}`, { home: true })}
    <main class="page with-nav"><div class="section-intro"><h1>${title}</h1></div><div class="grid">${modules.filter(item => choices.includes(item.id)).map(tile).join("")}</div></main>${nav(id)}`;
}

function profile() {
  return `${topbar('<span class="wordmark">Bloom</span> 我的', { home: true })}
    <main class="page with-nav stack"><section class="card row">${glyph("avatar")}<div><h1>${escapeText(account?.display_name || "朋友")}</h1></div></section>
      <div class="stats"><div>手记<strong>${state.notes.length}</strong></div><div>里程碑<strong>${state.milestones.filter(item => item.done).length}</strong></div><div>完成待办<strong>${state.tasks.filter(item => item.done).length}</strong></div></div>
      <div class="inventory-lines"><a href="#notes">我的手记 <span>›</span></a><a href="#growth">我的里程碑 <span>›</span></a><a href="#storage">我的收纳 <span>›</span></a></div>
      ${account?.password_set ? "" : `<form class="card auth-form" data-form="password-setup">
        <h2>设置登录密码</h2><p class="subtext">为之前已进入的昵称账号添加密码，之后可在其他设备登录。</p>
        <label>新密码<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="至少 8 个字符"></label>
        <button class="primary" type="submit">保存密码</button>
      </form>`}
      <button class="secondary" data-action="logout">退出登录</button>
    </main>${nav("profile")}`;
}

const routes = {
  home, todo, plan, storage, cycle, meals, mood, notes, growth, profile,
  clothes: () => collection("clothes"),
  medicine: () => collection("medicine"),
  pantry: () => collection("pantry"),
  care: () => collection("care"),
  journal: () => landing("journal", "手账", ["meals", "mood", "notes"]),
  rhythm: () => landing("rhythm", "节律", ["todo", "plan", "cycle"]),
};

function notify(message) {
  toast.value = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2300);
}

function persist(message) {
  if (!account) return;
  stateSaveMessage = message || stateSaveMessage;
  clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(saveState, 350);
}

async function saveState() {
  if (!account) return;
  clearTimeout(stateSaveTimer);
  try {
    const response = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "保存失败");
    if (stateSaveMessage) notify(stateSaveMessage);
    stateSaveMessage = "";
  } catch {
    notify("保存失败，请检查网络后重试");
  }
}

function render() {
  app.innerHTML = isAuthenticated ? routes[activeRoute]() : login();
}

async function readApiResponse(response, fallback) {
  if (!response.headers.get("Content-Type")?.includes("application/json")) {
    throw new Error("暂时无法连接 Bloom 服务，请稍后重试。");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || fallback);
  return result;
}

async function loadPersonalSpace(user) {
  const saved = await readApiResponse(await fetch("/api/state"), "个人数据无法读取。");
  const empty = createEmptyState();
  state = { ...empty, ...saved.state, cycle: normalizeCycle(saved.state.cycle) };
  account = user;
  isAuthenticated = true;
}

async function restoreSession() {
  restoringSession = true;
  sessionError = "";
  render();
  try {
    const response = await fetch("/api/me");
    if (response.status !== 401) {
      const result = await readApiResponse(response, "无法打开个人空间。");
      await loadPersonalSpace(result.user);
    }
  } catch {
    sessionError = "暂时无法打开 Bloom，请检查网络后重试。";
  } finally {
    restoringSession = false;
    render();
  }
}

function route() {
  const next = location.hash.slice(1);
  activeRoute = Object.hasOwn(routes, next) ? next : "home";
  filter = "全部";
  inventorySort = false;
  if (sheet.open) sheet.close();
  render();
  window.scrollTo(0, 0);
}

const searchLinks = [...modules, ...categories];

function searchList(query = "") {
  const results = searchLinks.filter(item => `${item.title} ${item.detail || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return results.length ? results.map(item => `<a class="row split" href="#${item.id}"><strong>${item.title}</strong><span class="arrow">›</span></a>`).join("")
    : '<p class="empty">没有找到匹配的空间</p>';
}

function openSheet(name, options) {
  const category = options.category || "clothes";
  const itemOptions = categories.map(item => `<option value="${item.id}"${item.id === category ? " selected" : ""}>${item.title}</option>`).join("");
  const cycleState = normalizeCycle(state.cycle);
  const activePeriod = cycleState.history.length
    ? cycleState.history[cycleState.history.length - 1]
    : null;
  const cycleDate = name === "cycle-end" ? activePeriod?.end || "" : activePeriod && !activePeriod.end ? activePeriod.start : "";
  const dialogContents = {
    "quick-note": ["随手记录", `${photoPicker()}<label>想写的话<textarea name="text" rows="3" maxlength="500" placeholder="记下此刻…"></textarea></label>`, "留存此刻"],
    "item": ["快速录入物品", `<label>类别<select name="category">${itemOptions}</select></label><label>物品名称<input name="name" required maxlength="70" placeholder="例如 纯棉短袖"></label>
      <label>存放位置或到期日<input name="detail" maxlength="80" placeholder="抽屉、收纳盒或赏味日期"></label><label>数量<input type="number" name="quantity" required min="0" max="9999" value="1"></label>${photoPicker()}`, "保存物品"],
    "time": ["添加时间块", '<label>安排<input name="name" required maxlength="70"></label><label>开始时间<input name="time" type="time" required></label><label>备注<input name="detail" maxlength="80"></label>', "添加时间块"],
    "milestone": ["添加里程碑", '<label>里程碑名称<input name="name" required maxlength="70"></label>', "添加里程碑"],
    "cycle-start": [activePeriod && !activePeriod.end ? "修改本次经期开始日" : "记录新一期经期", `<label>开始日期<input name="date" type="date" value="${cycleDate || dateKey()}" max="${dateKey()}" required></label>`, "保存日期"],
    "cycle-end": ["记录本次经期结束日", `<label>结束日期<input name="date" type="date" min="${activePeriod?.start || ""}" max="${dateKey()}" value="${cycleDate || dateKey()}" required></label>`, "保存日期"],
    "meal": ["记录餐食", '<label>餐次<select name="mealType"><option>早餐</option><option>午餐</option><option>晚餐</option><option>加餐</option></select></label><label>餐食名称<input name="name" required maxlength="70"></label><label>热量（千卡）<input name="kcal" type="number" min="0" max="9999" value="0" required></label>', "添入食记"],
    "meal-photo": ["餐食照片", `<input type="hidden" name="index" value="${escapeText(options.index)}">${photoPicker()}`, "保存照片"],
  };
  if (name === "search" || name === "spaces") {
    sheet.innerHTML = `<div class="row split"><h2 id="sheet-title">${name === "search" ? "搜索空间" : "全部空间"}</h2>${iconButton("关闭", "×", 'data-action="close"')}</div>
      ${name === "search" ? '<label class="search-field"><input id="module-search" type="search" placeholder="输入空间名称" aria-label="输入空间名称"></label>' : ""}
      <div class="search-results">${searchList()}</div>`;
  } else {
    const [title, fields, submit] = dialogContents[name];
    sheet.innerHTML = `<form data-form="${name}"><div class="row split"><h2 id="sheet-title">${title}</h2>${iconButton("关闭", "×", 'data-action="close"')}</div>${fields}<button class="primary" type="submit">${submit}</button></form>`;
  }
  sheet.setAttribute("aria-labelledby", "sheet-title");
  sheet.showModal();
}

function readPhoto(file) {
  if (!file || !file.size) return Promise.resolve("");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error("请选择 8 MB 以内的 JPG、PNG 或 WebP 图片"));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 900 / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", .78));
      } catch {
        reject(new Error("无法处理这张照片"));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取这张照片"));
    };
    image.src = url;
  });
}

document.addEventListener("input", event => {
  const target = event.target;
  if (target.id === "module-search") sheet.querySelector(".search-results").innerHTML = searchList(target.value);
  if (target.id === "inventory-search") {
    const query = target.value.trim().toLowerCase();
    const cards = [...app.querySelectorAll("[data-inventory-name]")];
    cards.forEach(card => { card.hidden = !card.dataset.inventoryName.includes(query); });
    app.querySelector("#inventory-empty").hidden = cards.some(card => !card.hidden);
  }
  if (target.dataset.line !== undefined) {
    state.journal[Number(target.dataset.line)] = target.value;
    persist();
  }
  if (target.dataset.action === "reminder") {
    state.cycle.reminder = target.checked;
    persist("提醒偏好已保存");
  }
});

document.addEventListener("change", async event => {
  const input = event.target;
  if (!input.matches("[data-photo-input]") || !input.files?.length) return;
  const picker = input.closest("label");
  try {
    const data = await readPhoto(input.files[0]);
    picker.querySelector("img.preview")?.remove();
    picker.insertAdjacentHTML("afterbegin", photo(data, "preview"));
  } catch (error) {
    input.value = "";
    notify(error.message);
  }
});

document.addEventListener("click", async event => {
  const link = event.target.closest("a");
  if (link && sheet.open && sheet.contains(link)) sheet.close();
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;
  if (data.open) return openSheet(data.open, data);
  if (data.action === "close") return sheet.close();
  if (data.action === "retry-session") return restoreSession();
  if (data.action === "logout") {
    await saveState();
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    account = null;
    state = createEmptyState();
    isAuthenticated = false;
    route();
    return;
  }
  if (data.task !== undefined) state.tasks[data.task].done = !state.tasks[data.task].done;
  else if (data.milestone !== undefined) state.milestones[data.milestone].done = !state.milestones[data.milestone].done;
  else if (data.like !== undefined) state.notes[data.like].liked = !state.notes[data.like].liked;
  else if (data.quantity !== undefined) {
    const item = state.items[data.quantity];
    item.count = Math.min(9999, Math.max(0, item.count + Number(data.step)));
  } else if (data.filter) {
    filter = data.filter;
    return render();
  } else if (data.action === "sort") {
    inventorySort = !inventorySort;
    return render();
  } else if (data.month) {
    month = new Date(month.getFullYear(), month.getMonth() + Number(data.month), 1);
    return render();
  } else if (data.day) {
    chosenDay = data.day;
    return render();
  } else if (data.mood !== undefined) state.mood = Number(data.mood);
  else if (data.moment !== undefined) {
    const index = Number(data.moment);
    state.moments = state.moments.includes(index) ? state.moments.filter(moment => moment !== index) : [...state.moments, index];
  } else if (data.action === "save-mood") {
    state.moodSaved = true;
    return persist("今日情绪手账已封存");
  } else if (data.action === "save-meals") {
    state.mealSaved = true;
    return persist("已保存到今日手账");
  } else return;
  persist();
  render();
});

document.addEventListener("submit", async event => {
  const form = event.target;
  const key = form.dataset.form;
  if (!key) return;
  event.preventDefault();
  const data = new FormData(form);
  if (key === "account") {
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    const input = form.elements.nickname;
    const passwordInput = form.elements.password;
    const feedback = form.querySelector("#nickname-error");
    feedback.hidden = true;
    input.removeAttribute("aria-invalid");
    passwordInput.removeAttribute("aria-invalid");
    submit.disabled = true;
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: data.get("nickname"), password: data.get("password") }),
      });
      if ([400, 401, 409].includes(response.status)) {
        input.setAttribute("aria-invalid", "true");
        passwordInput.setAttribute("aria-invalid", "true");
      }
      const result = await readApiResponse(response, "暂时无法使用这个昵称。");
      await loadPersonalSpace(result.user);
      activeRoute = "home";
      location.hash = "home";
      render();
      window.scrollTo(0, 0);
    } catch (error) {
      feedback.textContent = error instanceof TypeError ? "暂时无法连接，请检查网络后重试。" : error.message;
      feedback.hidden = false;
      if (error.message.includes("昵称已存在或密码错误")) passwordInput.focus();
      else input.focus();
    } finally {
      submit.disabled = false;
    }
    return;
  }
  if (key === "password-setup") {
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await readApiResponse(await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: data.get("password") }),
      }), "暂时无法设置密码。");
      account.password_set = 1;
      render();
      notify("登录密码已设置");
    } catch (error) {
      notify(error instanceof TypeError ? "暂时无法连接，请稍后重试。" : error.message);
      submit.disabled = false;
    }
    return;
  }
  const name = String(data.get("name") || "").trim();
  const detail = String(data.get("detail") || "").trim();
  const text = String(data.get("text") || "").trim();
  if (data.has("name") && !name) return notify("请填写名称");
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const picture = await readPhoto(data.get("photo"));
    if ((key === "note" || key === "quick-note") && !text && !picture) return notify("写下几句话，或选一张照片");
    if (key === "meal-photo" && !picture) return notify("请先选择照片");

    switch (key) {
      case "task": state.tasks.push({ name, tag: "随手记", time: "", done: false }); break;
      case "time": state.schedule.push({ name, time: String(data.get("time")), detail }); break;
      case "milestone": state.milestones.push({ name, done: false }); break;
      case "note":
      case "quick-note":
        state.notes.unshift({ text, photo: picture, date: new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date()) });
        break;
      case "item": {
        const category = String(data.get("category"));
        const unit = { clothes: "件", pantry: "份", medicine: "盒", care: "件" }[category];
        state.items.push({ name, category, detail, photo: picture, kind: "新录入", count: Number(data.get("quantity")), unit });
        break;
      }
      case "cycle-start": state.cycle = savePeriodStart(state.cycle, String(data.get("date"))); break;
      case "cycle-end": state.cycle = savePeriodEnd(state.cycle, String(data.get("date"))); break;
      case "meal": {
        const mealType = String(data.get("mealType"));
        state.meals.push({
          name: mealType,
          time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
          label: mealType,
          lines: [[name, Number(data.get("kcal"))]],
        });
        break;
      }
      case "meal-photo": state.meals[Number(data.get("index"))].photo = picture; break;
      default: return;
    }

    if (sheet.open) sheet.close();
    persist("已保存");
    if (key === "quick-note" && activeRoute !== "notes") location.hash = "notes";
    else render();
  } catch (error) {
    notify(error.message);
  } finally {
    submit.disabled = false;
  }
});

window.addEventListener("hashchange", route);
route();
restoreSession();
