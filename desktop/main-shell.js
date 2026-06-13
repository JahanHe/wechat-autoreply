const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const navItems = [
  { id: "page", target: "page", title: "工作台", icon: "messages", description: "客服页映射、扫码登录和当前接管状态。" },
  { id: "rules", target: "knowledge", title: "知识库", icon: "reply", description: "知识总览、规则库、AI参考和统一测试。" },
  { id: "dashboard", target: "dashboard", title: "监控", icon: "activity", description: "实时状态、回复日志和异常追踪。" },
  { id: "settings", target: "setup", title: "设置", icon: "settings", description: "初始化、Webhook、悬浮窗和退出设置。" }
];

const sectionGroups = {
  page: ["page"],
  rules: ["knowledge", "rules", "aiReference", "testCenter", "customerMemory"],
  dashboard: ["dashboard", "logs"],
  settings: ["setup", "bot", "api", "judgments", "webhook", "floating", "help"]
};

const viewLabels = {
  page: "客服页",
  knowledge: "知识总览",
  rules: "规则库",
  aiReference: "AI参考",
  testCenter: "测试中心",
  customerMemory: "客户记忆",
  bot: "Bot策略",
  api: "AI API",
  judgments: "外部知识同步",
  dashboard: "总览",
  logs: "日志",
  webhook: "Webhook",
  setup: "初始化",
  floating: "悬浮窗",
  help: "说明"
};

const icons = {
  messages: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/></svg>',
  activity: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M2 14h4M10 8h4M18 16h4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="m16.5 3.5 4 4L7 21H3v-4L16.5 3.5z"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><rect x="2" y="2" width="13" height="13" rx="2"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M3 18v-6h6"/><path d="M21 6v6h-6"/></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9"/><path d="M10 13h4"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  database: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  bot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><path d="M8 13h.01M16 13h.01"/><path d="M9 17h6"/></svg>',
  webhook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.5a4 4 0 0 1-6.5 3.1"/><path d="M8 7.5A4 4 0 0 1 14.5 4"/><path d="M7 17a4 4 0 0 1-1.4-7.8"/><path d="M12 8l3 5H9l3-5z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
};

const sourceLabels = {
  action_rule: { label: "本地动作规则", className: "rule" },
  text_rule: { label: "本地规则回复", className: "rule" },
  image_rule: { label: "图片回复", className: "rule" },
  panel_action: { label: "自动化页面动作", className: "rule" },
  quick_ack: { label: "15秒承接语", className: "direct" },
  waiting_reply: { label: "等待补偿", className: "direct" },
  fallback_reply: { label: "60秒延迟处理", className: "direct" },
  ai_followup: { label: "AI API回复", className: "ai" },
  api_remediation: { label: "AI补救回复", className: "ai" },
  judgment_ai: { label: "同步资料增强回复", className: "judgment" },
  rule_candidate: { label: "规则候选池", className: "rule" },
  ignore: { label: "忽略", className: "direct" },
  unknown: { label: "未分类", className: "" }
};

const state = {
  view: "page",
  ruleTab: "actionRules",
  status: null,
  settings: null,
  records: null,
  judgments: null,
  workbench: null,
  menuModel: null,
  runyuAuth: null,
  judgmentDownload: null,
  judgmentPollTimer: null,
  runyuCountdownTimer: null,
  setupChecks: [],
  setupRunning: false,
  ruleTestResult: null,
  pipelineTestResult: null,
  knowledgeOverview: null,
  customerMemories: null,
  memoryFilter: "",
  expandedMemoryId: "",
  memoryCompressionRunning: false,
  aiEditor: null,
  dashboardDetail: "",
  expandedRuleKey: "",
  ruleFilter: "all",
  apiKeyShown: false,
  runyuCookieShown: false,
  loading: false,
  detail: null,
  sidebarCollapsed: window.localStorage?.getItem("mainShellSidebarCollapsed") === "1"
};
window.state = state;

const content = $("#content");
const contextBar = $("#contextBar");
const detailPanel = $("#detailPanel");
const flash = $("#flash");

init().catch((error) => {
  console.error(error);
  showFlash(String(error?.message || error), "error");
});

async function init() {
  applySidebarState();
  renderNav();
  bindGlobalActions();
  window.mainShell.onStatus((payload) => {
    state.status = payload || {};
    if (payload?.runyuAuth) state.runyuAuth = payload.runyuAuth;
    renderChrome();
    if (["dashboard", "logs", "judgments"].includes(state.view)) renderView();
  });
  window.mainShell.onMenuModel?.((payload) => {
    state.menuModel = payload || null;
    renderDesktopMenu();
  });
  window.mainShell.onOpenView?.((payload) => {
    if (payload?.view) switchView(payload.view);
  });
  window.mainShell.onRunyuAuth(async (payload) => {
    state.runyuAuth = payload || {};
    const [settings, judgments] = await Promise.all([
      window.mainShell.getSettings(),
      window.mainShell.getJudgmentsStatus()
    ]);
    state.settings = settings;
    state.judgments = judgments;
    if (["setup", "judgments", "dashboard"].includes(state.view)) renderView();
    renderChrome();
  });
  const [settings, status, records, judgments, judgmentDownload, workbench, menuModel, knowledgeOverview, customerMemories] = await Promise.all([
    window.mainShell.getSettings(),
    window.mainShell.getStatus(),
    window.mainShell.getReplyRecords({ limit: 300 }),
    window.mainShell.getJudgmentsStatus(),
    window.mainShell.getJudgmentsDownloadStatus(),
    window.mainShell.getWorkbenchSnapshot ? window.mainShell.getWorkbenchSnapshot() : Promise.resolve(null),
    window.mainShell.getMenuModel ? window.mainShell.getMenuModel() : Promise.resolve(null),
    window.mainShell.getKnowledgeOverview ? window.mainShell.getKnowledgeOverview() : Promise.resolve(null),
    window.mainShell.getCustomerMemories ? window.mainShell.getCustomerMemories({ limit: 200 }) : Promise.resolve(null)
  ]);
  state.settings = settings;
  state.status = status;
  state.records = records;
  state.judgments = judgments;
  state.workbench = workbench;
  state.menuModel = menuModel;
  state.knowledgeOverview = knowledgeOverview;
  state.customerMemories = customerMemories;
  state.runyuAuth = judgments?.auth || status?.runyuAuth || null;
  state.judgmentDownload = judgmentDownload;
  renderChrome();
  renderDesktopMenu();
  await switchView(needsInitialSetup() ? "setup" : "page");
}

function renderNav() {
  $("#nav").innerHTML = navItems.map((item) => `
    <button type="button" data-top="${item.id}" data-view="${item.target || item.id}" title="${attr(item.description)}">
      <span class="nav-icon">${icons[item.icon] || ""}</span>
      <span class="nav-copy"><span class="nav-title">${escapeHtml(item.title)}</span></span>
    </button>
  `).join("");
  $$("#nav button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
}

function renderDesktopMenu() {
  const menu = $("#desktopMenu");
  if (!menu) return;
  const model = state.menuModel;
  if (!model?.sections?.length) {
    menu.innerHTML = `<div class="hint">菜单正在加载...</div>`;
    return;
  }
  menu.innerHTML = model.sections.map((section, index) => `
    <details class="menu-section" ${index === 0 ? "open" : ""}>
      <summary>${escapeHtml(section.label)}</summary>
      <div class="menu-items">
        ${(section.items || []).map((item) => renderMenuItem(item)).join("")}
      </div>
    </details>
  `).join("");
  $$("[data-command]", menu).forEach((button) => {
    button.addEventListener("click", () => executeMenuCommand(button.dataset.command));
  });
}

function renderMenuItem(item = {}) {
  if (item.type === "separator") return `<div class="menu-separator" role="separator"></div>`;
  return `
    <button type="button" class="menu-command ${item.danger ? "danger" : ""}" data-command="${attr(item.id)}" ${item.enabled === false ? "disabled" : ""}>
      <span class="menu-check">${item.checked === true ? "✓" : ""}</span>
      <span>${escapeHtml(item.label || item.id || "命令")}</span>
      <span class="menu-accelerator">${escapeHtml(formatAccelerator(item.accelerator || ""))}</span>
    </button>
  `;
}

function toggleDesktopMenu(force) {
  const menu = $("#desktopMenu");
  const button = $("#desktopMenuButton");
  if (!menu || !button) return;
  const next = force == null ? !menu.classList.contains("open") : Boolean(force);
  menu.classList.toggle("open", next);
  button.classList.toggle("active", next);
  button.setAttribute("aria-expanded", String(next));
}

function closeDesktopMenu() {
  toggleDesktopMenu(false);
}

async function executeMenuCommand(commandId) {
  if (!commandId) return;
  const options = {};
  if (commandId === "settings.quit") {
    const confirmed = window.confirm("彻底退出小店AI客服？Bot、AI、本机控制服务、Webhook 调度和悬浮窗都会停止。");
    if (!confirmed) return;
    options.confirm = "小店AI客服";
  }
  closeDesktopMenu();
  const result = await window.mainShell.runMenuCommand(commandId, options);
  await handleMenuCommandResult(commandId, result);
}

async function handleMenuCommandResult(commandId, result = {}) {
  if (result.status) state.status = result.status;
  if (result.view) {
    await switchView(result.view);
    return;
  }
  if (["settings.autostart", "settings.preventSleep", "floating.alwaysOnTop", "floating.compact", "floating.mini", "floating.show", "floating.hide"].includes(commandId)) {
    state.settings = await window.mainShell.getSettings();
  }
  if (commandId === "workbench.capture") {
    showFlash(result.ok ? `页面结构已保存：${result.count || 0} 个节点` : result.message || "捕捉失败", result.ok ? "ok" : "error");
  } else if (commandId === "api.checkAi") {
    showFlash(result.ok ? "AI API连接正常" : result.ai?.message || "AI API检查失败", result.ok ? "ok" : "error");
  } else if (commandId === "api.testWebhook") {
    showFlash(result.ok ? "Webhook 测试已发送" : result.message || "Webhook 测试失败", result.ok ? "ok" : "error");
  } else if (result.message) {
    showFlash(result.message, result.ok === false ? "error" : "ok");
  }
  await refreshMenuModel();
  renderChrome();
  renderView();
}

async function refreshMenuModel() {
  if (!window.mainShell.getMenuModel) return;
  state.menuModel = await window.mainShell.getMenuModel();
  renderDesktopMenu();
}

function formatAccelerator(value) {
  return String(value || "")
    .replace(/CmdOrCtrl/g, state.menuModel?.platform === "darwin" ? "Cmd" : "Ctrl")
    .replace(/CommandOrControl/g, state.menuModel?.platform === "darwin" ? "Cmd" : "Ctrl");
}

function bindGlobalActions() {
  $("#desktopMenuButton").addEventListener("click", () => toggleDesktopMenu());
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-sidebar-toggle]");
    if (!toggle) return;
    event.preventDefault();
    setSidebarCollapsed(!state.sidebarCollapsed);
  });
  $("#expandFloatDock")?.addEventListener("click", async () => {
    state.status = await window.mainShell.openFloating("compact");
    renderChrome();
    await refreshMenuModel();
  });
  $("#miniFloatDock")?.addEventListener("click", async () => {
    state.status = await window.mainShell.openFloating("mini");
    renderChrome();
    await refreshMenuModel();
  });
  $("#hideFloatDock")?.addEventListener("click", async () => {
    state.status = await window.mainShell.hideFloating();
    renderChrome();
    await refreshMenuModel();
  });
  document.addEventListener("click", (event) => {
    if (!$("#desktopMenu")?.classList.contains("open")) return;
    if (event.target.closest("#desktopMenu") || event.target.closest("#desktopMenuButton")) return;
    closeDesktopMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDesktopMenu();
  });
}

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = Boolean(collapsed);
  window.localStorage?.setItem("mainShellSidebarCollapsed", state.sidebarCollapsed ? "1" : "0");
  applySidebarState();
}

function applySidebarState() {
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  $$("[data-sidebar-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
    button.title = state.sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏";
    button.setAttribute("aria-label", button.title);
  });
  window.mainShell?.setSidebarWidth?.(state.sidebarCollapsed ? 64 : 268).catch((error) => {
    console.warn("[shell] sidebar width sync failed", error);
  });
}

async function switchView(view) {
  state.view = view || "page";
  state.detail = null;
  renderChrome();
  renderView();
  if (["knowledge", "aiReference", "testCenter"].includes(state.view) && window.mainShell.getKnowledgeOverview) {
    state.knowledgeOverview = await window.mainShell.getKnowledgeOverview().catch(() => state.knowledgeOverview);
    renderView();
  }
  if (state.view === "customerMemory" && window.mainShell.getCustomerMemories) {
    state.customerMemories = await window.mainShell.getCustomerMemories({ limit: 200, query: state.memoryFilter || "" }).catch(() => state.customerMemories);
    renderView();
  }
  try {
    state.status = await window.mainShell.setMode(state.view === "page" ? "page" : state.view);
    renderChrome();
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  }
}

function renderChrome() {
  const status = state.status || {};
  document.body.classList.toggle("platform-darwin", status.platform === "darwin" || state.menuModel?.platform === "darwin");
  document.body.classList.toggle("window-fullscreen", Boolean(status.fullscreen));
  const page = status.page || {};
  const storeName = page.authenticated ? (page.title || "微信小店") : "微信小店";
  const logoUrl = page.authenticated ? safeLogoUrl(page.logoUrl) : "";
  const brandLogo = $("#brandLogo");
  const floatingState = buildSidebarFloatingState(status);

  if (brandLogo) {
    const nextLogo = logoUrl || brandLogo.dataset.defaultSrc || "assets/logo.png";
    if (brandLogo.getAttribute("src") !== nextLogo) brandLogo.setAttribute("src", nextLogo);
    document.body.classList.toggle("shop-logo-loaded", Boolean(logoUrl));
  }
  $("#floatDot").className = `dot ${floatingState.dotClass}`;
  $("#floatTitle").textContent = floatingState.title;
  $("#floatSubtitle").textContent = floatingState.subtitle;
  $("#storeName").textContent = page.loading ? "客服页加载中" : storeName;
  $$("#nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.top === topNavIdFor(state.view));
  });
}

function safeLogoUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\//i.test(url)) return url;
  return "";
}

function buildSidebarFloatingState(payload = {}) {
  const bot = payload.bot || {};
  const tone = runtimeTone(bot.tone);
  const tones = [
    tone,
    payload.ai?.ok ? "ok" : payload.ai?.hasKey ? "warn" : "bad",
    payload.page?.scriptHealthy ? "ok" : payload.page?.loading ? "warn" : "bad"
  ];
  const overallTone = tones.includes("bad") ? "bad" : tone === "active" ? "active" : tones.includes("warn") || !payload.enabled ? "warn" : "ok";
  const title = shortStatus(bot.label || bot.status || "检测中");
  const detail = String(bot.detail || bot.status || "状态同步").trim();
  return {
    dotClass: overallTone === "ok" ? "" : overallTone,
    title,
    subtitle: shortText(detail)
  };
}

function renderView() {
  if (!["setup", "judgments"].includes(state.view) && state.runyuCountdownTimer) {
    window.clearInterval(state.runyuCountdownTimer);
    state.runyuCountdownTimer = null;
  }
  if (!state.settings) {
    content.innerHTML = `<div class="empty">正在读取配置...</div>`;
    return;
  }

  if (state.view === "page") renderPageView();
  else if (state.view === "setup") renderSetup();
  else if (state.view === "dashboard") renderDashboard();
  else if (state.view === "knowledge") renderKnowledgeOverview();
  else if (state.view === "bot") renderBot();
  else if (state.view === "api") renderApi();
  else if (state.view === "aiReference") renderAiReference();
  else if (state.view === "testCenter") renderTestCenter();
  else if (state.view === "customerMemory") renderCustomerMemory();
  else if (state.view === "judgments") renderJudgments();
  else if (state.view === "webhook") renderWebhook();
  else if (state.view === "rules") renderRules();
  else if (state.view === "logs") renderLogs();
  else if (state.view === "floating") renderFloating();
  else renderHelp();
  renderSectionTabs();
  renderDetailPanel();
}

function topNavIdFor(view) {
  return Object.entries(sectionGroups).find(([, items]) => items.includes(view))?.[0] || "page";
}

function renderSectionTabs() {
  const group = sectionGroups[topNavIdFor(state.view)] || [];
  const tabs = group.length ? group : [state.view];
  contextBar.innerHTML = `
    <button id="sidebarCollapseTop" class="top-collapse-button" type="button" title="展开侧边栏" aria-label="展开侧边栏" aria-expanded="false" data-sidebar-toggle>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M9 5v14"/><path class="collapse-arrow" d="m15 9-3 3 3 3"/></svg>
    </button>
    <div class="section-tabs" aria-label="二级功能导航">
      ${tabs.map((id) => `<button type="button" data-subview="${id}" class="${id === state.view ? "active" : ""}">${escapeHtml(viewLabels[id] || id)}</button>`).join("")}
    </div>
  `;
  applySidebarState();
  $$("[data-subview]", contextBar).forEach((button) => button.addEventListener("click", () => switchView(button.dataset.subview)));
}

function renderPageView() {
  content.innerHTML = `
    <div class="page-placeholder">
      <div class="card">
        <h3>客服页映射已打开</h3>
        <p class="muted">微信小店客服页显示在当前工作区。全局操作已迁移到 Mac 菜单栏、Windows 三条杠菜单、托盘和快捷键。</p>
      </div>
    </div>
  `;
}

function renderKnowledgeOverview() {
  const overview = state.knowledgeOverview || {};
  const stats = knowledgeRuleStats(state.settings?.config?.bot || {});
  const external = overview.externalSynced || {};
  const local = overview.local || {};
  const profile = state.settings?.assistantProfile || {};
  const memoryStats = state.customerMemories?.stats || state.workbench?.customerMemories?.stats || {};
  content.innerHTML = `
    ${pageHead("知识总览", "集中查看直接回复规则、本机自建资料和已经下载到本机的外部同步资料。")}
    <div class="grid cols-4 knowledge-metrics">
      ${overviewButton("全部规则", stats.total, `启用 ${stats.enabled} · 停用 ${stats.disabled}`, "rules", "all")}
      ${overviewButton("本机自建资料", Number(local.chunks || 0) + Number(local.manualSections || 0), `${local.files || 0} 个文件 · ${local.manualSections || 0} 个人工区段`, "aiReference", "local")}
      ${overviewButton("外部同步资料", external.records || 0, `${(external.sources || []).length} 个来源 · ${external.updatedAt ? formatFullTime(external.updatedAt) : "尚未下载"}`, "aiReference", "external")}
      ${overviewButton("规则候选", state.status?.ruleCandidates?.pendingReview || 0, `总计 ${state.status?.ruleCandidates?.total || 0} 条`, "rules", "candidates")}
      ${overviewButton("客户记忆", memoryStats.total || 0, `需压缩 ${memoryStats.needCompression || 0} · 未完成 ${memoryStats.unfinishedTasks || 0}`, "customerMemory", "")}
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      <section class="card">
        <div class="section-title"><div><h3>规则分类</h3><div class="hint">点击分类进入紧凑规则列表。</div></div><button data-overview-view="rules" data-rule-filter="all">管理规则</button></div>
        <div class="knowledge-list">
          ${knowledgeSummaryRow("文字规则", stats.text, "rules", "text")}
          ${knowledgeSummaryRow("组合动作", stats.action, "rules", "action")}
          ${knowledgeSummaryRow("图片规则", stats.image, "rules", "image")}
          ${knowledgeSummaryRow("文件规则", stats.file, "rules", "file")}
          ${knowledgeSummaryRow("商品卡", stats.product, "rules", "product")}
          ${knowledgeSummaryRow("邀请下单", stats.invite, "rules", "invite")}
        </div>
      </section>
      <section class="card">
        <div class="section-title"><div><h3>AI 参考状态</h3><div class="hint">AI 只读取本机资料，回复时不会实时查询外部服务器。</div></div><button data-overview-view="aiReference">编辑 AI 参考</button></div>
        <div class="knowledge-list">
          ${knowledgeStatusRow("回复人格", profile.stylePrompt || profile.soulPrompt ? "已配置" : "未配置", Boolean(profile.stylePrompt || profile.soulPrompt))}
          ${knowledgeStatusRow("边界与审核", profile.guardrailsPrompt || profile.reviewPrompt ? "已配置" : "未配置", Boolean(profile.guardrailsPrompt || profile.reviewPrompt))}
          ${knowledgeStatusRow("本机文件索引", `${local.chunks || 0} 个片段`, Number(local.chunks || 0) > 0)}
          ${knowledgeStatusRow("外部同步索引", external.records ? `${external.records} 条可用` : "尚未下载", Number(external.records || 0) > 0)}
          ${knowledgeStatusRow("远端生产查询", "已禁止", true)}
        </div>
      </section>
    </div>
    <section class="card" style="margin-top:14px">
      <div class="section-title"><div><h3>同步与测试</h3><div class="hint">外部连接只用于下载和更新，本机索引负责实际回复检索。</div></div></div>
      <div class="toolbar" style="justify-content:flex-start">
        <button data-overview-view="judgments">外部知识同步</button>
        <button data-overview-view="testCenter" class="primary">打开测试中心</button>
        <button data-overview-view="api">AI API 接入</button>
        <button data-overview-view="bot">Bot 策略</button>
      </div>
    </section>
  `;
  $$('[data-overview-view]').forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.ruleFilter) state.ruleFilter = button.dataset.ruleFilter;
    switchView(button.dataset.overviewView);
  }));
}

function renderAiReference() {
  const profile = state.settings.assistantProfile || {};
  const overview = state.knowledgeOverview || {};
  const external = overview.externalSynced || {};
  content.innerHTML = `
    ${pageHead("AI 参考", "统一管理回复人格、本机自建资料和已经下载到本机的外部同步资料。", `${iconTextButton("save", "保存开关", "id=\"saveAiReference\" class=\"primary\"")}`)}
    ${profileStatus(profile)}
    <div class="grid cols-2 ai-reference-layout">
      <section class="card">
        <div class="section-title"><div><h3>回复人格</h3><div class="hint">开关在当前页直接切换；长文本点编辑进入 Markdown 弹窗。</div></div></div>
        <div class="settings-list">
          ${settingToggleRow("sidebarContextEnabled", "读取客服页右侧上下文", "AI API 生成回复时参考当前客服页可见信息。", profile.sidebarContextEnabled !== false, "eye")}
          ${settingToggleRow("reviewEnabled", "启用回复审核", "发送前过滤越界、承诺和联系方式风险。", profile.reviewEnabled !== false, "alert")}
        </div>
        <div class="ai-card-grid">
          ${aiReferenceCard("stylePrompt", "回复语气", "客服说话的语气和措辞偏好。", profile.stylePrompt || "", "messages")}
          ${aiReferenceCard("soulPrompt", "风格灵魂", "人设、判断方式和品牌感。", profile.soulPrompt || "", "sparkles")}
          ${aiReferenceCard("guardrailsPrompt", "边界规则", "不能说、不能承诺和不能引导的内容。", profile.guardrailsPrompt || "", "alert")}
          ${aiReferenceCard("reviewPrompt", "审核补充规则", "二次审核的额外检查项。", profile.reviewPrompt || "", "check")}
        </div>
      </section>
      <section class="card">
        <div class="section-title"><div><h3>本机自建资料</h3><div class="hint">这里是 AI API 的本机参考资料，不会直接原样发送。</div></div></div>
        <div class="settings-list">
          ${settingToggleRow("knowledgeFilesEnabled", "读取 knowledge-base 文件", "开启后检索应用内本机知识文件。", profile.knowledgeFilesEnabled !== false, "database")}
        </div>
        <div class="ai-card-grid single">
          ${aiReferenceCard("knowledgeText", "手动知识", "直接写入本机配置，作为 AI 参考。", profile.knowledgeText || "", "database")}
          ${aiReferenceCard("referenceText", "参考回复", "供 AI 学习表达方式，不会直接原样发送。", profile.referenceText || "", "reply")}
        </div>
      </section>
    </div>
    <section class="card" style="margin-top:14px">
      <div class="section-title"><div><h3>外部同步资料</h3><div class="hint">资料已下载到本机索引。生产回复不会连接外部服务器。</div></div><button id="openExternalSync">管理同步</button></div>
      <div class="badge-row">
        <span class="badge rule">本机可用 ${external.records || 0} 条</span>
        <span class="badge">来源 ${(external.sources || []).join("、") || "无"}</span>
        <span class="badge">更新 ${external.updatedAt ? formatFullTime(external.updatedAt) : "尚未下载"}</span>
      </div>
      <div class="toolbar" style="justify-content:flex-start;margin-top:12px">${iconTextButton("search", "查询本机同步资料", "id=\"browseExternalKnowledge\"")}</div>
      <div id="externalKnowledgeBrowser" class="knowledge-browser"></div>
    </section>
    ${renderAiReferenceEditorModal()}
  `;
  bindToggleButtons();
  $("#saveAiReference").addEventListener("click", saveAiReferenceSettings);
  $("#openExternalSync").addEventListener("click", () => switchView("judgments"));
  $("#browseExternalKnowledge").addEventListener("click", () => runInlineKnowledgeSearch(true));
  $$("[data-ai-edit]").forEach((button) => button.addEventListener("click", () => openAiReferenceEditor(button.dataset.aiEdit)));
  $("#aiEditorCancel")?.addEventListener("click", closeAiReferenceEditor);
  $("#aiEditorCloseText")?.addEventListener("click", closeAiReferenceEditor);
  $("#aiEditorSave")?.addEventListener("click", saveAiReferenceEditor);
  $("#aiEditorText")?.addEventListener("input", () => {
    const preview = $("#aiEditorPreview");
    if (preview) preview.innerHTML = renderMarkdown(value("aiEditorText"));
  });
}

function renderTestCenter() {
  const result = state.pipelineTestResult;
  content.innerHTML = `
    ${pageHead("测试中心", "统一验证正式路由、规则动作、AI 人格和本机知识资料。默认只模拟，不会发送给客户。")}
    <section class="card">
      <div class="form-grid">
        ${selectField("pipelineTestMode", "测试模式", "smart_route", [
          ["smart_route", "智能路由：规则优先，未命中再 AI"],
          ["rule_match", "规则匹配：只看命中结果"],
          ["rule_action", "规则动作：模拟或真实执行"],
          ["ai_local", "AI：只参考本机自建资料"],
          ["ai_full_local", "AI：包含外部同步资料"],
          ["knowledge_search", "本机知识检索：不调用 AI"]
        ], "真实动作仅在规则动作模式可用。", "span-2")}
        ${textareaField("pipelineTestMessage", "客户测试消息", "会员专区包含什么权益", "使用接近真实客户的问法。", "span-2")}
      </div>
      <div class="toolbar" style="justify-content:flex-start;margin-top:12px">
        <button id="runPipelineSimulation" class="primary">运行模拟测试</button>
        <button id="runPipelineExecution">真实执行规则动作</button>
      </div>
    </section>
    <section id="pipelineTestResult" class="card" style="margin-top:14px;min-height:160px">
      ${result ? renderPipelineTestResult(result) : `<div class="empty">测试结果会显示回复路径、规则、动作、本机资料命中和 AI Trace。</div>`}
    </section>
  `;
  $("#runPipelineSimulation").addEventListener("click", () => runPipelineTest(false));
  $("#runPipelineExecution").addEventListener("click", () => runPipelineTest(true));
}

function renderCustomerMemory() {
  const payload = state.customerMemories || { stats: {}, items: [] };
  const stats = payload.stats || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  content.innerHTML = `
    ${pageHead("客户记忆", "按客户保存历史上下文、已发送规则和未完成任务。内容过长时可以压缩成长期摘要。", `
      ${iconTextButton("refresh", "刷新", "id=\"refreshMemories\"")}
      ${iconTextButton("archive", "本机压缩", "id=\"compressMemoriesLocal\"")}
      ${iconTextButton("sparkles", "AI压缩", "id=\"compressMemoriesAi\" class=\"primary\"")}
    `)}
    <div class="grid cols-4 memory-metrics">
      ${visualStatTile("database", "客户", stats.total || 0, `新客户 ${stats.newCustomers || 0}`, "ok", "memory-total")}
      ${visualStatTile("archive", "待压缩", stats.needCompression || 0, `阈值 ${stats.threshold || 40} 条`, stats.needCompression ? "warn" : "ok", "memory-compress")}
      ${visualStatTile("clock", "未完成", stats.unfinishedTasks || 0, "需要继续跟进", stats.unfinishedTasks ? "bad" : "ok", "memory-open")}
      ${visualStatTile("alert", "压缩错误", stats.withErrors || 0, `本机 ${stats.localSummarized || 0} / AI ${stats.aiSummarized || 0}`, stats.withErrors ? "bad" : "ok", "memory-errors")}
    </div>
    <section class="card" style="margin-top:14px">
      <div class="memory-toolbar">
        <div class="field">
          <label for="memorySearch">搜索客户记忆</label>
          <input id="memorySearch" value="${attr(state.memoryFilter || "")}" placeholder="客户ID、问题、摘要关键词">
        </div>
        ${iconButton("search", "搜索", "id=\"memorySearchButton\"")}
        ${iconButton("close", "清空搜索", "id=\"memoryClearSearch\"")}
      </div>
      <div class="memory-list">
        ${items.length ? items.map(renderCustomerMemoryRow).join("") : `<div class="empty">还没有客户记忆。客户消息进入并完成处理后，会自动写入这里。</div>`}
      </div>
    </section>
  `;
  $("#refreshMemories").addEventListener("click", refreshCustomerMemories);
  $("#compressMemoriesLocal").addEventListener("click", () => compressCustomerMemories("local"));
  $("#compressMemoriesAi").addEventListener("click", () => compressCustomerMemories("ai"));
  $("#memorySearchButton").addEventListener("click", () => {
    state.memoryFilter = value("memorySearch");
    refreshCustomerMemories();
  });
  $("#memoryClearSearch").addEventListener("click", () => {
    state.memoryFilter = "";
    refreshCustomerMemories();
  });
  $("#memorySearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      state.memoryFilter = value("memorySearch");
      refreshCustomerMemories();
    }
  });
  $$(".memory-row [data-memory-command]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const commandNode = event.target.closest("[data-memory-command]") || button;
      const row = commandNode.closest(".memory-row");
      const id = row?.dataset.customerId || "";
      const command = commandNode.dataset.memoryCommand;
      if (command === "expand") {
        state.expandedMemoryId = state.expandedMemoryId === id ? "" : id;
        renderCustomerMemory();
      } else if (command === "local") {
        await compressCustomerMemory(id, "local");
      } else if (command === "ai") {
        await compressCustomerMemory(id, "ai");
      } else if (command === "copy") {
        await copyToClipboard(id);
        showFlash("客户ID已复制", "ok");
      }
    });
  });
  $$(".memory-row").forEach((row) => {
    row.addEventListener("click", () => {
      state.expandedMemoryId = state.expandedMemoryId === row.dataset.customerId ? "" : row.dataset.customerId;
      renderCustomerMemory();
    });
  });
}

function renderCustomerMemoryRow(item = {}) {
  const id = String(item.customerId || item.sessionKey || "");
  const expanded = state.expandedMemoryId === id;
  const lastCustomer = lastMemoryLine(item.recentCustomerMessages);
  const lastReply = lastMemoryLine(item.recentKfReplies);
  const statusClass = item.lastCompressionError ? "fail" : item.needsCompression ? "direct" : item.summary ? "rule" : "";
  const statusText = item.lastCompressionError ? "压缩失败" : item.needsCompression ? "需压缩" : item.summary ? "已摘要" : "原始";
  return `
    <article class="memory-row ${expanded ? "expanded" : ""}" data-customer-id="${attr(id)}">
      <div class="memory-summary-line">
        <span class="signal"><i class="dot ${item.lastCompressionError ? "bad" : item.needsCompression ? "warn" : ""}"></i><strong>${escapeHtml(shortCustomerId(id))}</strong></span>
        <span class="memory-last">${escapeHtml(lastCustomer || "暂无客户消息")}</span>
        <span class="badge ${statusClass}">${escapeHtml(statusText)}</span>
        <span class="memory-count">${Number(item.messageCount || 0)} 条</span>
        <time>${formatFullTime(item.updatedAt || item.lastSeenAt || Date.now())}</time>
        <div class="row-icon-actions">
          ${iconButton("chevron", expanded ? "收起" : "展开", "data-memory-command=\"expand\"")}
          ${iconButton("archive", "本机压缩", "data-memory-command=\"local\"")}
          ${iconButton("sparkles", "AI压缩", "data-memory-command=\"ai\"")}
          ${iconButton("copy", "复制客户ID", "data-memory-command=\"copy\"")}
        </div>
      </div>
      ${expanded ? `<div class="memory-detail">
        <div class="grid cols-2">
          <div class="memory-block">
            <h3>长期摘要</h3>
            ${item.summary ? `<div class="markdown-preview">${renderMarkdown(item.summary)}</div>` : `<div class="hint">还没有摘要。可以点本机压缩或 AI 压缩。</div>`}
            ${item.lastCompressionError ? `<div class="fail-text">最近错误：${escapeHtml(item.lastCompressionError)}</div>` : ""}
          </div>
          <div class="memory-block">
            <h3>当前线索</h3>
            <div class="badge-row">
              <span class="badge">${item.isNewCustomer ? "新客户" : "老客户"}</span>
              <span class="badge">方法 ${escapeHtml(item.summaryMethod || "未压缩")}</span>
              <span class="badge">压缩 ${item.summaryUpdatedAt ? formatFullTime(item.summaryUpdatedAt) : "未执行"}</span>
            </div>
            <p class="hint">客服回复时会读取最近对话和长期摘要，避免重复固定话术。</p>
          </div>
        </div>
        <div class="grid cols-2" style="margin-top:12px">
          ${memoryTranscriptBlock("客户消息", item.recentCustomerMessages)}
          ${memoryTranscriptBlock("客服回复", item.recentKfReplies)}
        </div>
        <div class="grid cols-3" style="margin-top:12px">
          ${memoryTagBlock("已发送规则", item.sentRules)}
          ${memoryTagBlock("已执行动作", item.sentActions)}
          ${memoryTagBlock("未完成任务", item.unfinishedTasks)}
        </div>
      </div>` : ""}
    </article>
  `;
}

function memoryTranscriptBlock(title, entries = []) {
  const items = Array.isArray(entries) ? entries.slice(-8) : [];
  return `
    <div class="memory-block">
      <h3>${escapeHtml(title)}</h3>
      ${items.length ? items.map((entry) => `<div class="memory-message"><span>${escapeHtml(formatFullTime(entry.at || entry.time || entry.createdAt || Date.now()))}</span><p>${escapeHtml(memoryEntryText(entry))}</p></div>`).join("") : `<div class="hint">暂无记录</div>`}
    </div>
  `;
}

function memoryTagBlock(title, entries = []) {
  const items = Array.isArray(entries) ? entries.slice(-12) : [];
  return `
    <div class="memory-block">
      <h3>${escapeHtml(title)}</h3>
      ${items.length ? `<div class="badge-row">${items.map((entry) => `<span class="badge">${escapeHtml(memoryEntryText(entry))}</span>`).join("")}</div>` : `<div class="hint">暂无记录</div>`}
    </div>
  `;
}

function memoryEntryText(entry = {}) {
  if (typeof entry === "string") return entry;
  return String(entry.text || entry.content || entry.message || entry.reply || entry.name || entry.ruleName || entry.type || entry.taskId || "");
}

function lastMemoryLine(entries = []) {
  const items = Array.isArray(entries) ? entries : [];
  return memoryEntryText(items[items.length - 1] || "").slice(0, 90);
}

function shortCustomerId(value = "") {
  const text = String(value || "未知客户");
  return text.length > 18 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text;
}

async function refreshCustomerMemories() {
  state.customerMemories = await window.mainShell.getCustomerMemories({ limit: 200, query: state.memoryFilter || "" });
  renderCustomerMemory();
}

async function compressCustomerMemory(customerId, method) {
  if (!customerId || state.memoryCompressionRunning) return;
  state.memoryCompressionRunning = true;
  showFlash(method === "ai" ? "正在调用 AI 压缩客户记忆..." : "正在本机压缩客户记忆...");
  try {
    const result = await window.mainShell.compressCustomerMemory({ customerId, method });
    showFlash(result.ok ? result.message : (result.message || "压缩失败"), result.ok ? "ok" : "error");
    await refreshCustomerMemories();
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  } finally {
    state.memoryCompressionRunning = false;
  }
}

async function compressCustomerMemories(method) {
  if (state.memoryCompressionRunning) return;
  const aiWarning = method === "ai" ? "AI 压缩会逐条调用远方 AI API，耗时和费用都更高。" : "本机压缩不调用网络，适合批量整理。";
  if (!window.confirm(`${aiWarning}\n是否继续压缩所有超过阈值的客户记忆？`)) return;
  state.memoryCompressionRunning = true;
  showFlash(method === "ai" ? "正在批量 AI 压缩..." : "正在批量本机压缩...");
  try {
    const result = await window.mainShell.compressCustomerMemories({ method, onlyOverThreshold: true, threshold: 40, limit: 100 });
    showFlash(`处理 ${result.processed || 0} 条，成功 ${result.compressed || 0} 条，失败 ${result.failed || 0} 条`, result.ok ? "ok" : "error");
    await refreshCustomerMemories();
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  } finally {
    state.memoryCompressionRunning = false;
  }
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(String(text || ""));
  const area = document.createElement("textarea");
  area.value = String(text || "");
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function buildTopStates(payload) {
  const page = payload.page || {};
  const ai = payload.ai || {};
  const needsLogin = ["need_login", "waiting_qr"].includes(String(payload.bot?.code || "")) || /redirect_url=%2Fkf/.test(String(page.url || ""));
  const loggedIn = Boolean(page.authenticated) && !needsLogin;
  return {
    ai: ai.ok
      ? { tone: "ok", text: "API正常" }
      : ai.hasKey
        ? { tone: "warn", text: "AI待测" }
        : { tone: "bad", text: "缺Key" },
    local: payload.now ? { tone: "ok", text: "中转已接" } : { tone: "bad", text: "中转异常" },
    script: page.scriptHealthy
      ? { tone: "ok", text: "脚本就绪" }
      : page.loading
        ? { tone: "warn", text: "页面加载" }
        : { tone: "bad", text: "脚本待定" },
    login: loggedIn
      ? { tone: "ok", text: "登录正常" }
      : needsLogin
        ? { tone: "warn", text: "待扫码" }
        : { tone: page.ready ? "warn" : "bad", text: page.ready ? "待确认" : "未打开" }
  };
}

function setTopLamp(key, item) {
  const tone = runtimeTone(item?.tone);
  $(`#top${key}Dot`).className = `dot ${tone === "ok" ? "" : tone}`;
  $(`#top${key}Text`).textContent = shortStatus(item?.text || key);
}

function setDetail(type, payload = {}) {
  state.detail = { type, payload };
  renderDetailPanel();
}

function renderDetailPanel() {
  if (!detailPanel) return;
  const detail = state.detail;
  detailPanel.classList.toggle("open", Boolean(detail));
  if (detail?.type === "rule") {
    detailPanel.innerHTML = renderRuleDetail(detail.payload);
    return;
  }
  if (detail?.type === "log") {
    detailPanel.innerHTML = renderLogDetail(detail.payload);
    return;
  }
  if (detail?.type === "dashboard") {
    detailPanel.innerHTML = renderDashboardDetail(detail.payload);
    return;
  }
  detailPanel.innerHTML = renderDefaultDetail();
}

function renderDefaultDetail() {
  const status = state.status || {};
  const workbench = state.workbench || {};
  const issues = Array.isArray(workbench.healthIssues) ? workbench.healthIssues : [];
  const outbox = Array.isArray(workbench.notifyOutbox) ? workbench.notifyOutbox : state.records?.outbox || [];
  const runtime = status.bot || {};
  return `
    <h3>工作台详情</h3>
    <div class="hint">选中规则、日志或异常后，这里显示可追踪信息。</div>
    <div class="detail-block">
      <strong>当前状态</strong>
      <span class="signal"><i class="dot ${runtimeTone(runtime.tone) === "ok" ? "" : runtimeTone(runtime.tone)}"></i>${escapeHtml(shortStatus(runtime.label || runtime.status || "检测中"))}</span>
      <div class="hint">${escapeHtml(runtime.detail || "等待运行状态")}</div>
    </div>
    <div class="detail-block">
      <strong>异常队列</strong>
      ${issues.length ? issues.slice(0, 4).map((item) => `<div><span class="badge fail">${escapeHtml(item.key || "异常")}</span><div class="hint">${escapeHtml(item.title || item.body || "")}</div></div>`).join("") : `<div class="hint">暂无健康异常。</div>`}
    </div>
    <div class="detail-block">
      <strong>Webhook 队列</strong>
      ${outbox.length ? outbox.slice(0, 4).map((item) => `<div><span class="badge">${escapeHtml(item.title || "通知")}</span><div class="hint">${escapeHtml(item.error || item.body || "")}</div></div>`).join("") : `<div class="hint">暂无待补发通知。</div>`}
    </div>
  `;
}

function renderRuleDetail(rule = {}) {
  const actions = Array.isArray(rule.actions) ? rule.actions : [];
  return `
    <h3>${escapeHtml(rule.name || "规则详情")}</h3>
    <div class="hint">规则仍在主工作区编辑，这里用于快速检查命中条件和动作。</div>
    <div class="detail-block">
      <strong>状态</strong>
      <span class="badge ${rule.enabled === false ? "fail" : "rule"}">${rule.enabled === false ? "已关闭" : "已启用"}</span>
    </div>
    <div class="detail-block">
      <strong>关键词</strong>
      <div class="badge-row">${splitKeywords(rule.keywords).map((item) => `<span class="badge">${escapeHtml(item)}</span>`).join("") || `<span class="hint">未填写关键词</span>`}</div>
    </div>
    <div class="detail-block">
      <strong>执行动作</strong>
      ${actions.length ? actions.map((action) => `<div class="mini-status"><span>${escapeHtml(actionTypeLabel(action.type || "text"))}</span><span>${escapeHtml(actionSummary([action]) || action.path || action.productName || "")}</span></div>`).join("") : `<div class="hint">${escapeHtml(rule.reply || rule.path || "没有动作详情")}</div>`}
    </div>
  `;
}

function renderLogDetail(item = {}) {
  const source = sourceLabels[item.sourceType] || { label: item.sourceLabel || item.sourceType || "未分类", className: "" };
  return `
    <h3>${escapeHtml(item.rule || item.stage || "日志详情")}</h3>
    <div class="hint">${escapeHtml(formatFullTime(item.at || Date.now()))}</div>
    <div class="detail-block">
      <strong>来源</strong>
      <div class="badge-row">
        <span class="badge ${item.kind === "failed" ? "fail" : item.kind === "timeout" ? "direct" : "rule"}">${escapeHtml(item.kind || "记录")}</span>
        <span class="badge ${source.className}">${escapeHtml(source.label)}</span>
      </div>
    </div>
    <div class="detail-block">
      <strong>任务链路</strong>
      <div class="mini-status"><span>任务</span><span>${escapeHtml(item.taskId || "无")}</span></div>
      <div class="mini-status"><span>客户</span><span>${escapeHtml(item.customerId || "无")}${item.isNewCustomer ? " / 新客户" : ""}</span></div>
      <div class="mini-status"><span>路径</span><span>${escapeHtml(item.route || item.sourceType || "")}</span></div>
      <div class="mini-status"><span>规则模式</span><span>${escapeHtml(item.ruleMode || "默认")}</span></div>
      <div class="mini-status"><span>承接</span><span>${item.ackSent ? "已发送" : "未发送"}</span></div>
      <div class="mini-status"><span>最终回复</span><span>${item.finalReplySent ? "已发送" : "未发送"}</span></div>
      <div class="mini-status"><span>完成度</span><span>${escapeHtml(item.completionResult || "未检查")}</span></div>
      <div class="mini-status"><span>补救次数</span><span>${Number(item.remediationCount || 0)}</span></div>
      ${item.completionReason ? `<div class="hint">原因：${escapeHtml(item.completionReason)}</div>` : ""}
    </div>
    <div class="detail-block">
      <strong>客户消息</strong>
      <div class="readonly-box">${escapeHtml(item.customer || "")}</div>
    </div>
    <div class="detail-block">
      <strong>回复和动作</strong>
      <div class="readonly-box">${escapeHtml(item.reply || actionSummary(item.actions) || item.status || "")}</div>
      ${item.actions?.length ? `<div class="badge-row">${item.actions.map((action) => `<span class="badge">${escapeHtml(action.type || "action")}</span>`).join("")}</div>` : ""}
    </div>
    <div class="detail-block">
      <strong>Trace</strong>
      ${renderLogTrace(item) || `<div class="hint">没有 Trace 记录。</div>`}
    </div>
  `;
}

function needsInitialSetup() {
  const env = state.settings?.env || {};
  const notify = state.settings?.config?.notify || {};
  const auth = currentRunyuAuth();
  return !String(env.deepseekApiKey || "").trim()
    || !String(env.wecomWebhookUrl || notify.wecomWebhookUrl || "").trim()
    || !hasRunyuCredential(env, auth)
    || !Number(auth.downloadedRecords || state.judgments?.records || 0)
    || ["unconfigured", "expired", "forbidden", "error", "timeout"].includes(auth.status);
}

function renderSetup() {
  const env = state.settings.env || {};
  const notify = state.settings.config?.notify || {};
  const missing = setupMissingItems();
  const runyuAuth = currentRunyuAuth();
  content.innerHTML = `
    ${pageHead("初始化配置", "首次运行配置 DeepSeek Key、企业微信 Webhook和外部知识同步；保存后会自动做功能安全自检。", `
      <button id="runSetupSelfCheck" class="primary">${state.setupRunning ? "自检中..." : "保存并自检"}</button>
      <button id="skipToKfPage" class="dark">去扫码登录</button>
    `)}
    <div class="grid cols-3">
      ${metricCard("DeepSeek Key", missing.apiKey ? "待配置" : "已填写", "用于 AI 精准回复和审核。", missing.apiKey ? "warn" : "ok")}
      ${metricCard("Webhook", missing.webhook ? "待配置" : "已填写", "用于扫码、异常、总结通知。", missing.webhook ? "warn" : "ok")}
      ${metricCard("外部知识同步", runyuAuthLabel(runyuAuth), runyuAuth.message || "连接后将资料下载到本机供 AI 使用。", runyuAuthTone(runyuAuth))}
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      <div class="card">
        <h3>必填配置</h3>
        <div class="form-grid">
          ${passwordField("setupDeepseekApiKey", "DeepSeek API Key", env.deepseekApiKey || "", "只保存到本机 .env，不会提交到 GitHub。", "span-2")}
          ${field("setupWebhookUrl", "企业微信 Webhook", env.wecomWebhookUrl || notify.wecomWebhookUrl || "", "用于发送扫码截图、异常告警、小时总结和每日总览。", "span-2")}
          <div class="field span-2">
            <label>外部知识同步配置</label>
            <div class="toolbar" style="justify-content:flex-start">
              <button id="setupRunyuLogin" type="button" class="primary">打开网络配置页</button>
              <button id="setupCaptureRunyuCookie" type="button">获取访问凭证</button>
              <button id="setupVerifyRunyuAuth" type="button">检查连通性</button>
              <button id="setupBootstrapRunyu" type="button">初始化本地缓存</button>
              <button id="setupRunyuRelogin" type="button">重新配置</button>
            </div>
            <div class="hint">网络调用模式需要在每台新电脑单独完成一次配置；本地导入模式可以跳过网络凭证，直接导入数据缓存。</div>
            ${runyuLoginFlowHtml(runyuAuth)}
            ${runyuNextActionHtml(runyuAuth)}
            ${runyuAuthMonitorHtml(runyuAuth, "setup")}
          </div>
          ${passwordField("setupRunyuWebCookie", "访问凭证（手工备用）", env.runyuWebCookie || "", "只有自动获取不可用时才需要手工粘贴。凭证只保存在本机。", "span-2")}
          ${field("setupDeepseekModel", "模型", env.deepseekModel || "deepseek-v4-flash", "默认不用改。")}
          ${field("setupRunyuBaseUrl", "外部资料源 Base URL", env.runyuWebBaseUrl || "https://runyuai.zhiduoke.com.cn", "只填服务域名，不要带具体接口路径。")}
        </div>
      </div>
      <div class="card">
        <h3>初始化流程</h3>
        <div class="grid">
          ${setupStep("1", "完成本机配置", "写入 Key 和 Webhook，并配置外部资料同步连接。", !missing.apiKey && !missing.webhook && !missing.cookie)}
          ${setupStep("2", "功能安全自检", "检查 AI Key、Webhook、外部同步连接、规则库和守护状态。", state.setupChecks.length > 0 && state.setupChecks.every((item) => item.ok))}
          ${setupStep("3", "扫码小店客服", "自检完成后进入客服页映射，扫码登录并选择会话。", Boolean(state.status?.page?.ready))}
        </div>
        <div id="setupCheckResult" class="download-panel" style="margin-top:12px">
          ${renderSetupChecks()}
        </div>
        <p class="hint">外部连接只负责下载和增量同步；实际回复始终检索本机资料。</p>
      </div>
    </div>
  `;
  $("#runSetupSelfCheck").disabled = state.setupRunning;
  $("#setupCaptureRunyuCookie").disabled = !runyuAuth.loginWindowOpen && !runyuAuth.cookieDetected;
  $("#runSetupSelfCheck").addEventListener("click", runSetupSelfCheck);
  $("#setupRunyuLogin").addEventListener("click", () => openRunyuLogin(false));
  $("#setupCaptureRunyuCookie").addEventListener("click", captureRunyuCookie);
  $("#setupVerifyRunyuAuth").addEventListener("click", verifyRunyuAuth);
  $("#setupBootstrapRunyu").addEventListener("click", bootstrapRunyuLibrary);
  $("#setupRunyuRelogin").addEventListener("click", () => openRunyuLogin(true));
  $("#skipToKfPage").addEventListener("click", () => switchView("page"));
  syncRunyuAuthUi();
}

function currentRunyuAuth() {
  return state.runyuAuth || state.judgments?.auth || state.status?.runyuAuth || {
    status: "unconfigured",
    message: "尚未配置外部知识同步"
  };
}

function hasRunyuCredential(env = state.settings?.env || {}, auth = currentRunyuAuth()) {
  return Boolean(String(env.runyuWebCookie || "").trim() || auth.configured || auth.cookieDetected || ["connected", "ready"].includes(auth.status));
}

function runyuLoginFlowHtml(auth = {}) {
  const pageOpened = Boolean(auth.loginWindowOpen || auth.cookieDetected || auth.configured || ["connected", "ready"].includes(auth.status));
  const loginConfirmed = Boolean(auth.cookieDetected || auth.configured || ["connected", "ready"].includes(auth.status));
  const connected = Boolean(auth.queryVerified || ["connected", "ready"].includes(auth.status));
  const downloaded = Boolean(Number(auth.downloadedRecords || state.judgments?.records || 0));
  return `
    <div class="grid" style="gap:6px;margin-top:10px">
      ${setupStep("1", "打开网络配置页", "应用使用这台电脑独立的配置窗口。", pageOpened)}
      ${setupStep("2", "确认配置完成", "看到外部知识源授权完成后，再回到控制台。", loginConfirmed)}
      ${setupStep("3", "获取并验证凭证", "点击“获取访问凭证”，通过真实查询后完成。", connected)}
      ${setupStep("4", "初始化本地缓存", "验证成功后自动下载 10 条测试数据，本地可引用后才算完成。", downloaded)}
    </div>
  `;
}

function runyuNextActionHtml(auth = {}) {
  const code = String(auth.errorCode || "");
  let title = "下一步：打开网络配置页";
  let body = "点击“打开网络配置页”，在独立窗口完成外部知识同步授权。每台新电脑都需要单独配置一次；已有本机资料不会因暂时断网失效。";
  if (["monitoring", "login_required"].includes(auth.status)) {
    title = "需要您确认网络配置";
    body = auth.cookieDetected
      ? "系统已发现访问凭证。请确认页面已经进入授权后的状态，再点击“获取访问凭证”。"
      : "请在配置窗口完成授权。确认已经进入外部资料页面后，回到这里点击“获取访问凭证”。";
  } else if (auth.status === "cookie_detected") {
    title = "下一步：获取并验证凭证";
    body = "访问凭证已检测到。请点击“获取访问凭证”，系统会强制查询网络接口，不会用本地缓存冒充成功。";
  } else if (["checking", "syncing"].includes(auth.status)) {
    title = auth.status === "checking" ? "正在验证访问凭证" : "正在初始化本地缓存";
    body = auth.status === "checking" ? "正在执行网络真实查询，请等待结果。" : "查询已通过，正在下载首次 10 条引用数据。";
  } else if (["connected", "ready"].includes(auth.status)) {
    title = auth.status === "ready" ? "外部同步资料已经可用" : "连接已通过，继续初始化缓存";
    body = auth.status === "ready"
      ? `同步接口和本机引用缓存均已通过，目前可引用 ${Number(auth.downloadedRecords || state.judgments?.records || 0)} 条。后续可按需全部下载。`
      : "点击“初始化本地缓存”，下载首次可引用数据。";
  } else if (auth.status === "expired" || code === "RUNYU_AUTH_EXPIRED") {
    title = "访问凭证已失效，需要重新配置";
    body = "点击“重新配置”，在新窗口完成授权，再点击“获取访问凭证”。旧凭证会被新凭证替换。";
  } else if (auth.status === "forbidden" || code === "RUNYU_PERMISSION_DENIED") {
    title = "账号没有查询权限";
    body = "访问凭证已获取，但当前账号没有外部资料同步权限。请换有权限的账号重新配置，或联系资料提供方开通权限。";
  } else if (code === "RUNYU_API_404") {
    title = "接口地址不可用";
    body = "确认 Base URL 只填写服务域名，不带接口路径；保存后点“检查连通性”。仍失败时复制错误信息反馈。";
  } else if (code === "RUNYU_SESSION_TOKEN_NOT_FOUND") {
    title = "没有发现访问凭证";
    body = "返回配置窗口确认已经授权成功，并等待页面加载完成；然后再次点击“获取访问凭证”。";
  } else if (code === "RUNYU_NETWORK_FAILED" || code === "RUNYU_REQUEST_TIMEOUT") {
    title = "网络暂时无法访问外部同步服务";
    body = "检查网络、代理或防火墙后点击“检查连通性”。无需重复配置，除非随后显示访问凭证已失效。";
  } else if (code === "RUNYU_BOOTSTRAP_EMPTY") {
    title = "查询通过但缓存为空";
    body = "点击“初始化本地缓存”重试；仍为空时复制错误信息和最近凭证记录反馈。";
  } else if (["error", "timeout"].includes(auth.status)) {
    title = "本次接入没有完成";
    body = "按错误码处理后重试。可以复制错误信息和最近凭证记录，便于准确追溯。";
  }
  return `
    <div style="margin-top:10px;padding:12px;border:1px solid #ead8cd;border-radius:8px;background:#fff8f3">
      <strong>${escapeHtml(title)}</strong>
      <div class="hint" style="margin-top:5px">${escapeHtml(body)}</div>
    </div>
  `;
}

function runyuAuthLabel(auth = {}) {
  return ({
    unconfigured: "待配置",
    configured: "待验证",
    monitoring: "监控配置",
    cookie_detected: "已发现凭证",
    login_required: "等待配置",
    checking: "验证中",
    connected: "已连接",
    syncing: "下载缓存",
    ready: "已就绪",
    timeout: "配置超时",
    expired: "凭证已过期",
    forbidden: "账号无权限",
    error: "连接异常"
  })[auth.status] || "未确认";
}

function runyuAuthTone(auth = {}) {
  if (["connected", "ready"].includes(auth.status)) return "ok";
  if (["error", "expired", "forbidden", "timeout"].includes(auth.status)) return "bad";
  return "warn";
}

function runyuAuthMonitorHtml(auth = {}, prefix = "runyu") {
  const remaining = runyuRemainingText(auth);
  const errorCode = String(auth.errorCode || "").trim();
  const detail = String(auth.errorDetail || auth.message || "").trim();
  return `
    <div class="download-panel runyu-monitor" style="margin-top:10px">
      <div class="download-head">
        <strong>配置监控</strong>
        <span class="badge ${["connected", "ready"].includes(auth.status) ? "rule" : ["error", "expired", "forbidden", "timeout"].includes(auth.status) ? "fail" : "direct"}">${escapeHtml(runyuAuthLabel(auth))}</span>
      </div>
      <div class="grid" style="gap:7px;margin-top:8px">
        <div class="switch-row">
          <div><strong>登录窗口</strong><div class="hint">${auth.loginWindowOpen ? "窗口已打开，正在监控网页登录" : "窗口未打开"}</div></div>
          <span class="badge ${auth.loginWindowOpen ? "rule" : ""}">${auth.loginWindowOpen ? "监控中" : "未打开"}</span>
        </div>
        <div class="switch-row">
          <div><strong>访问凭证</strong><div class="hint">只显示检测状态，不会在页面暴露凭证内容。</div></div>
          <span class="badge ${auth.cookieDetected ? "rule" : "direct"}">${auth.cookieDetected ? "已检测" : "未检测"}</span>
        </div>
        <div class="switch-row">
          <div><strong>剩余时间</strong><div class="hint">登录窗口每次打开后有 5 分钟操作时间。</div></div>
          <span class="badge" data-runyu-countdown>${escapeHtml(remaining)}</span>
        </div>
      </div>
      <div class="hint" style="margin-top:9px">${escapeHtml(auth.message || "等待开始登录")}</div>
      ${errorCode ? `
        <div style="margin-top:10px;padding:12px;border:1px solid #efc3bd;border-radius:8px;background:#fff7f5">
          <div class="download-head"><strong>错误码：${escapeHtml(errorCode)}</strong><span>${auth.httpStatus ? `HTTP ${Number(auth.httpStatus)}` : "本机错误"}</span></div>
          <div class="hint error-text" style="margin-top:6px">${escapeHtml(detail)}</div>
          <button type="button" data-copy-runyu-error="${escapeHtml(prefix)}" style="margin-top:8px;padding:0 10px">复制错误信息</button>
        </div>
      ` : ""}
      ${runyuAuthHistoryHtml(auth.history || [])}
    </div>
  `;
}

function runyuAuthHistoryHtml(history = []) {
  const items = Array.isArray(history) ? history.slice(0, 8) : [];
  if (!items.length) return `<div class="hint" style="margin-top:10px">还没有访问凭证自检记录。</div>`;
  return `
    <details style="margin-top:10px">
      <summary>最近凭证记录（${items.length}）</summary>
      <div class="grid" style="gap:6px;margin-top:8px">
        ${items.map((item) => `
          <div class="log-row" style="grid-template-columns:136px minmax(0,1fr) auto;padding:9px">
            <div class="log-time">${escapeHtml(formatFullTime(item.at))}</div>
            <div>
              <strong>${escapeHtml(runyuAuthLabel(item))}</strong>
              <div class="hint">${escapeHtml(item.message || "")}</div>
            </div>
            <span class="badge ${item.errorCode ? "fail" : ["connected", "ready"].includes(item.status) ? "rule" : "direct"}">${escapeHtml(item.errorCode || (item.httpStatus ? `HTTP ${item.httpStatus}` : item.status || "记录"))}</span>
          </div>
        `).join("")}
      </div>
    </details>
  `;
}

function runyuRemainingText(auth = {}) {
  if (["connected", "ready"].includes(auth.status)) return "已完成";
  const deadlineAt = Number(auth.deadlineAt || 0);
  if (!deadlineAt) return auth.status === "timeout" ? "00:00" : "未计时";
  const seconds = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function syncRunyuAuthUi() {
  window.clearInterval(state.runyuCountdownTimer);
  state.runyuCountdownTimer = null;
  const auth = currentRunyuAuth();
  const update = () => {
    $$('[data-runyu-countdown]').forEach((node) => {
      node.textContent = runyuRemainingText(auth);
    });
  };
  update();
  if (Number(auth.deadlineAt || 0) > Date.now() && !["connected", "ready"].includes(auth.status)) {
    state.runyuCountdownTimer = window.setInterval(update, 1000);
  }
  $$('[data-copy-runyu-error]').forEach((button) => {
    button.addEventListener("click", () => copyRunyuDiagnostic(auth));
  });
}

async function copyRunyuDiagnostic(auth = {}) {
  const diagnostic = [
    `状态: ${runyuAuthLabel(auth)}`,
    `错误码: ${auth.errorCode || "无"}`,
    auth.httpStatus ? `HTTP: ${auth.httpStatus}` : "",
    `原因: ${auth.errorDetail || auth.message || "未知"}`,
    auth.lastUrl ? `页面: ${auth.lastUrl}` : "",
    `时间: ${new Date(auth.updatedAt || Date.now()).toLocaleString("zh-CN")}`
  ].filter(Boolean).join("\n");
  try {
    await navigator.clipboard.writeText(diagnostic);
    showFlash("外部知识同步错误信息已复制", "ok");
  } catch (error) {
    showFlash(`复制失败：${String(error?.message || error)}`, "error");
  }
}

function setupMissingItems() {
  const env = state.settings?.env || {};
  const notify = state.settings?.config?.notify || {};
  const auth = currentRunyuAuth();
  return {
    apiKey: !String(env.deepseekApiKey || "").trim(),
    webhook: !String(env.wecomWebhookUrl || notify.wecomWebhookUrl || "").trim(),
    cookie: !hasRunyuCredential(env, auth)
  };
}

function setupStep(number, title, hint, done) {
  return `
    <div class="switch-row">
      <div>
        <strong>${number}. ${escapeHtml(title)}</strong>
        <div class="hint">${escapeHtml(hint)}</div>
      </div>
      <span class="badge ${done ? "rule" : "direct"}">${done ? "完成" : "待处理"}</span>
    </div>
  `;
}

function renderSetupChecks() {
  if (!state.setupChecks.length) {
    return `<div class="hint">点击“保存并自检”后，会在这里显示每一步结果。</div>`;
  }
  return `
    <div class="grid">
      ${state.setupChecks.map((item) => `
        <div class="download-head">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="badge ${item.ok ? "rule" : "fail"}">${item.ok ? "通过" : "失败"}</span>
        </div>
        <div class="hint">${escapeHtml(item.message || "")}</div>
      `).join("")}
    </div>
  `;
}

function renderDashboard() {
  const status = state.status || {};
  const records = status.records || {};
  const page = status.page || {};
  const judgments = state.judgments || {};
  const watchdog = status.watchdog || {};
  const runtime = status.bot || {};
  const replyTasks = status.replyTasks || {};
  const ruleCandidates = status.ruleCandidates || {};
  content.innerHTML = `
    ${pageHead("总览状态", "查看客服页、Bot、AI API、Webhook、悬浮窗和回复日志的真实运行状态。", `
      ${iconTextButton("refresh", "刷新", "id=\"dashRefresh\"")}
      ${iconTextButton("sparkles", "检查 AI API", "id=\"dashCheckAi\" class=\"primary\"")}
    `)}
    <div class="visual-dashboard-grid">
      ${visualStatTile("activity", "当前步骤", shortStatus(runtime.label || runtime.status || "检测中"), runtime.detail || "等待运行状态", runtimeTone(runtime.tone), "runtime")}
      ${visualStatTile("bot", "Bot接管", status.enabled ? "开启" : "暂停", `${runtime.category || "运行"} · ${formatFullTime(runtime.at || Date.now())}`, status.enabled ? "ok" : "warn", "bot")}
      ${visualStatTile("sparkles", "AI API", status.ai?.ok ? "正常" : "异常", status.ai?.message || "未检查", status.ai?.ok ? "ok" : "bad", "ai")}
      ${visualStatTile("webhook", "Webhook", status.notify?.enabled ? "推送中" : "未启用", status.notify?.configured ? `待补发 ${status.notify?.outboxCount || 0}` : "未填写 Webhook", status.notify?.enabled ? "ok" : "warn", "webhook")}
      ${visualStatTile("database", "外部资料", judgments.enabled ? (judgments.hasCookie ? "已接入" : "缺凭证") : "未启用", judgments.records ? `本机 ${judgments.records} 条` : "未下载", judgments.enabled && judgments.hasCookie ? "ok" : "warn", "judgments")}
      ${visualStatTile("messages", "客服页", page.ready ? (page.loading ? "加载中" : "已打开") : "未打开", page.url || "无地址", page.ready ? "ok" : "bad", "page")}
      ${visualStatTile("eye", "悬浮窗", status.floating?.visible ? "显示中" : "已隐藏", status.floating?.alwaysOnTop ? "置顶" : "不置顶", status.floating?.visible ? "ok" : "warn", "floating")}
      ${visualStatTile("clock", "长期运行", watchdog.enabled ? "守护中" : "已关闭", `${watchdog.autoStart ? "开机自启" : "未自启"} · ${watchdog.powerSaveBlockerActive ? "防休眠" : "未防休眠"}`, watchdog.enabled && watchdog.powerSaveBlockerActive ? "ok" : "warn", "watchdog")}
      ${visualStatTile("reply", "回复记录", records.total || 0, `成功 ${records.sent || 0} · 失败 ${records.failed || 0} · 超时 ${records.timeout || 0}`, records.failed || records.timeout ? "warn" : "ok", "records")}
      ${visualStatTile("archive", "当前任务", replyTasks.open || 0, `等待AI ${replyTasks.pendingApi || 0} · 已承接 ${replyTasks.ackSent || 0}`, replyTasks.open ? "warn" : "ok", "tasks")}
      ${visualStatTile("alert", "延迟任务", replyTasks.delayed || 0, `补救 ${replyTasks.retrying || 0} · 待人工 ${replyTasks.waitingHuman || 0}`, replyTasks.delayed || replyTasks.waitingHuman ? "bad" : replyTasks.retrying ? "warn" : "ok", "delayed")}
      ${visualStatTile("plus", "规则候选", ruleCandidates.pendingReview || 0, `总计 ${ruleCandidates.total || 0} 条`, ruleCandidates.pendingReview ? "warn" : "ok", "candidates")}
    </div>
    <div class="grid cols-2 dashboard-secondary" style="margin-top:14px">
      <section class="card">
        <div class="section-title"><div><h3>回复来源</h3><div class="hint">用比例条查看本地规则、动作、AI API 和同步资料增强占比。</div></div></div>
        ${sourceStatsBars(records.bySource || {})}
      </section>
      <section class="card">
        <div class="section-title"><div><h3>异常与补发</h3><div class="hint">正常项折叠，异常项优先显示。</div></div></div>
        ${dashboardIssueList()}
      </section>
    </div>
  `;
  $("#dashRefresh").addEventListener("click", refreshAll);
  $("#dashCheckAi").addEventListener("click", checkAi);
  $$("[data-dashboard-detail]").forEach((button) => {
    button.addEventListener("click", () => setDetail("dashboard", dashboardDetailPayload(button.dataset.dashboardDetail)));
  });
}

function renderBot() {
  const cfg = state.settings.config || {};
  const bot = cfg.bot || {};
  const watchdog = cfg.watchdog || {};
  content.innerHTML = `
    ${pageHead("Bot 接管", "控制是否自动回复、是否调用 AI、回复节奏和图片/页面动作能力。", `
      <button id="saveBot" class="primary">保存 Bot 设置</button>
    `)}
    <div class="grid cols-3">
      <div class="card">
        <h3>接管状态</h3>
        <div class="grid">
          ${toggleRow("botEnabled", "默认开启 Bot 接管", "关闭后只监控页面，不自动回复客户。", bot.enabled !== false)}
          ${toggleRow("aiFallback", "无命中规则时调用 AI API", "规则库没有匹配时，会通过本机回复中转服务请求远方 AI API。", bot.aiFallback !== false)}
          ${toggleRow("quickAckEveryMessage", "复杂问题启用 15 秒承接", "规则未命中且需要 AI API 时，先等最终答案；超过阈值仍无结果才发承接语。", bot.quickAckEveryMessage !== false)}
          ${toggleRow("imageRepliesEnabled", "允许图片回复", "动作规则和图片规则可以上传并发送本地图片。", Boolean(bot.imageRepliesEnabled))}
          ${toggleRow("autoPasteImages", "图片自动上传/粘贴发送", "优先使用页面上传控件，失败时复制到剪贴板再粘贴发送。", Boolean(bot.autoPasteImages))}
          ${toggleRow("panelAutoActionsEnabled", "允许内置自动化页面动作", "当没有命中动作规则时，可按常见购买意图自动点商品、素材库等页面入口。", Boolean(bot.panelAutoActionsEnabled))}
        </div>
      </div>
      <div class="card">
        <h3>长期运行</h3>
        <div class="grid">
          ${toggleRow("autoStart", "开机自动启动", "登录系统后自动打开小店AI客服。", cfg.autoStart !== false)}
          ${toggleRow("watchdogEnabled", "启用守护检查", "定期检查 AI API、中转服务、客服页和脚本心跳，异常时记录并通知。", watchdog.enabled !== false)}
          ${toggleRow("reloadOnBotStale", "脚本无心跳时重载", "Bot 长时间无状态时重新注入脚本，并按需刷新客服页。", watchdog.reloadOnBotStale !== false)}
          ${toggleRow("preventAppSuspension", "防后台清退/防休眠", "阻止系统把桌面程序挂起，适合值守电脑长期运行。", watchdog.preventAppSuspension !== false)}
        </div>
        <div class="form-grid" style="margin-top:14px">
          ${numberField("watchdogAiHealthMs", "AI API健康检查 ms", watchdog.aiHealthMs || 60000, "建议 60000，过低会增加本机请求。")}
          ${numberField("watchdogPageHealthMs", "页面健康检查 ms", watchdog.pageHealthMs || 60000, "检查是否仍在客服页、是否需要扫码。")}
          ${numberField("watchdogBotHeartbeatMs", "脚本心跳阈值 ms", watchdog.botHeartbeatMs || 60000, "超过阈值认为脚本可能失效。", "span-2")}
        </div>
      </div>
      <div class="card">
        <h3>运行参数</h3>
        <div class="form-grid">
          ${field("aiEndpoint", "AI API回复地址", bot.aiEndpoint || "", "本机回复中转服务默认是 http://127.0.0.1:8787/reply。", "span-2")}
          ${textareaField("quickAck", "15秒承接语列表", replyListText(bot.quickAckReplies, bot.quickAck || "我看一下"), "一条回复占一段；用空行或 | 分隔。AI API 超过 15 秒未返回最终答案时轮换发送。", "span-2")}
          ${textareaField("fallbackReply", "60秒延迟处理列表", replyListText(bot.fallbackReplies, bot.fallbackReply || ""), "保留为异常补救素材；默认 60 秒只标记延迟、写日志和通知，不直接发客户。", "span-2")}
          ${numberField("aiSlowMs", "15秒承接阈值 ms", bot.aiSlowMs || 15000, "超过这个时间仍无 AI API 最终答案，会先发承接语。")}
          ${numberField("fallbackReplyMs", "60秒延迟阈值 ms", bot.fallbackReplyMs || 60000, "超过这个时间仍无 AI API 最终答案，标记延迟并通知，不默认发客户兜底。")}
          ${numberField("noResponseAlertMs", "超时告警 ms", bot.noResponseAlertMs || 90000, "客户消息超过该时间仍未完成处理，会记录超时并通知。")}
          ${numberField("maxTextParts", "最多文本段数", bot.maxTextParts || 2, "单次回复最多拆成几段文字。")}
          ${numberField("maxReplyPartLength", "单段最长字数", bot.maxReplyPartLength || 500, "过长回复会被限制，避免客服消息异常。")}
        </div>
      </div>
    </div>
  `;
  bindToggleButtons();
  $("#saveBot").addEventListener("click", saveBotSettings);
}

function renderApi() {
  const env = state.settings.env || {};
  const apiKeyType = state.apiKeyShown ? "text" : "password";
  content.innerHTML = `
    ${pageHead("AI API 接入", "只配置远方模型接口、Thinking 和审核超时；回复人格统一在知识库的 AI 参考中管理。", `
      <button id="checkAi" class="dark">健康检查</button>
      <button id="saveApi" class="primary">保存 API 设置</button>
    `)}
    <div class="grid cols-2">
      <section class="card">
        <h3>模型接入</h3>
        <div class="badge-row" style="margin-bottom:10px">
          <span class="badge ${state.status?.ai?.hasKey ? "rule" : "fail"}">${state.status?.ai?.hasKey ? "Key 已配置" : "缺少 Key"}</span>
          <span class="badge ${state.status?.ai?.ok ? "direct" : ""}">${state.status?.ai?.ok ? "AI 健康" : "待检查"}</span>
          <span class="badge">${escapeHtml(state.status?.ai?.message || "未检查")}</span>
        </div>
        <div class="form-grid">
          <div class="field span-2">
            <label for="deepseekApiKey">API Key</label>
            <div style="display:grid;grid-template-columns:minmax(0,1fr)86px;gap:8px">
              <input id="deepseekApiKey" type="${apiKeyType}" value="${attr(env.deepseekApiKey || "")}" placeholder="不会提交到 GitHub，只写入本机 .env">
              <button id="toggleApiKey" type="button">${state.apiKeyShown ? "隐藏" : "显示"}</button>
            </div>
            <div class="hint">只保存在本机运行目录的 .env。仓库提交会通过密钥检查避免上传。</div>
          </div>
          ${field("deepseekBaseUrl", "Base URL", env.deepseekBaseUrl || "https://api.deepseek.com", "兼容 OpenAI/DeepSeek 的接口地址。")}
          ${field("deepseekModel", "模型", env.deepseekModel || "deepseek-v4-flash", "用于客服回复生成的模型名称。")}
          ${selectField("deepseekThinking", "思考模式", env.deepseekThinking || "enabled", [["enabled", "开启"], ["disabled", "关闭"]], "是否启用模型思考能力。")}
          ${selectField("deepseekReasoningEffort", "推理强度", env.deepseekReasoningEffort || "medium", [["low", "低"], ["medium", "中"], ["high", "高"]], "越高越谨慎，但可能更慢。")}
          ${selectField("deepseekReview", "回复审核", env.deepseekReview || "enabled", [["enabled", "开启"], ["disabled", "关闭"]], "开启后会二次审核回复，过滤越界内容。")}
          ${numberField("deepseekTimeoutMs", "请求超时 ms", env.deepseekTimeoutMs || 80000, "AI 生成最长等待时间。")}
          ${numberField("deepseekReviewTimeoutMs", "审核超时 ms", env.deepseekReviewTimeoutMs || 25000, "二次审核最长等待时间。")}
        </div>
      </section>
      <section class="card">
        <h3>职责说明</h3>
        <div class="knowledge-list">
          ${knowledgeStatusRow("API Key", state.status?.ai?.hasKey ? "已配置" : "缺少", Boolean(state.status?.ai?.hasKey))}
          ${knowledgeStatusRow("AI API", state.status?.ai?.ok ? "连接正常" : "等待检查", Boolean(state.status?.ai?.ok))}
          ${knowledgeStatusRow("回复人格", "在知识库 > AI 参考管理", true)}
          ${knowledgeStatusRow("本机资料", "在知识库 > AI 参考管理", true)}
          ${knowledgeStatusRow("外部资料", "只从本机同步缓存读取", true)}
        </div>
        <div class="toolbar" style="justify-content:flex-start;margin-top:12px">
          <button id="openAiReference">编辑 AI 参考</button>
          <button id="openApiTest">打开测试中心</button>
        </div>
      </section>
    </div>
  `;
  $("#toggleApiKey").addEventListener("click", () => {
    state.apiKeyShown = !state.apiKeyShown;
    renderApi();
  });
  $("#checkAi").addEventListener("click", checkAi);
  $("#saveApi").addEventListener("click", saveApiSettings);
  $("#openAiReference").addEventListener("click", () => switchView("aiReference"));
  $("#openApiTest").addEventListener("click", () => switchView("testCenter"));
}

function profileStatus(profile) {
  return `
    <div class="badge-row" style="margin:10px 0 14px">
      <span class="badge ${profile.knowledgeFilesEnabled !== false ? "rule" : ""}">本地知识库 ${profile.knowledgeFilesEnabled !== false ? "开启" : "关闭"}</span>
      <span class="badge ${profile.sidebarContextEnabled !== false ? "rule" : ""}">右侧上下文 ${profile.sidebarContextEnabled !== false ? "开启" : "关闭"}</span>
      <span class="badge ${profile.reviewEnabled !== false ? "rule" : ""}">回复审核 ${profile.reviewEnabled !== false ? "开启" : "关闭"}</span>
      <span class="badge">最近保存 ${profile.updatedAt ? formatFullTime(profile.updatedAt) : "未记录"}</span>
    </div>
  `;
}

function settingToggleRow(id, title, hint, on, iconName = "settings") {
  return `
    <div class="setting-toggle-row">
      <span class="setting-icon">${svgIcon(iconName)}</span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(hint || "")}</span>
      </div>
      <input id="${attr(id)}" type="checkbox" ${on ? "checked" : ""} hidden>
      <button type="button" class="toggle ${on ? "on" : ""}" aria-checked="${on ? "true" : "false"}" data-target="${attr(id)}" title="${on ? "关闭" : "开启"}">
        <span></span>
      </button>
    </div>
  `;
}

function aiReferenceCard(fieldName, title, hint, text, iconName = "edit") {
  const hasValue = Boolean(String(text || "").trim());
  return `
    <article class="ai-reference-card ${hasValue ? "" : "empty-card"}">
      <div class="ai-reference-head">
        <span class="setting-icon">${svgIcon(iconName)}</span>
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(hint || "")}</span>
        </div>
        ${iconButton("edit", `编辑${title}`, `data-ai-edit="${attr(fieldName)}"`)}
      </div>
      <div class="markdown-preview">${hasValue ? renderMarkdown(text) : `<p class="hint">未填写，点击编辑配置。</p>`}</div>
    </article>
  `;
}

function aiReferenceFieldMeta(fieldName) {
  return {
    stylePrompt: ["回复语气", "客服说话的语气和措辞偏好。"],
    soulPrompt: ["风格灵魂", "人设、判断方式和品牌感。"],
    guardrailsPrompt: ["边界规则", "不能说、不能承诺和不能引导的内容。"],
    reviewPrompt: ["审核补充规则", "二次审核的额外检查项。"],
    knowledgeText: ["手动知识", "直接写入本机配置，作为 AI 参考。"],
    referenceText: ["参考回复", "供 AI 学习表达方式，不会直接原样发送。"]
  }[fieldName] || ["AI 参考", "编辑 AI 参考内容。"];
}

function renderAiReferenceEditorModal() {
  if (!state.aiEditor?.field) return "";
  const profile = state.settings.assistantProfile || {};
  const [title, hint] = aiReferenceFieldMeta(state.aiEditor.field);
  const text = profile[state.aiEditor.field] || "";
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="aiEditorTitle">
      <section class="editor-modal">
        <div class="section-title">
          <div>
            <h3 id="aiEditorTitle">${escapeHtml(title)}</h3>
            <div class="hint">${escapeHtml(hint)}</div>
          </div>
          ${iconButton("close", "关闭编辑器", "id=\"aiEditorCancel\"")}
        </div>
        <div class="editor-grid">
          <div class="field">
            <label for="aiEditorText">Markdown 内容</label>
            <textarea id="aiEditorText" spellcheck="false">${escapeHtml(text)}</textarea>
            <div class="hint">支持标题、列表、加粗、引用和链接。保存后立即写入本机配置。</div>
          </div>
          <div>
            <label class="preview-label">预览</label>
            <div id="aiEditorPreview" class="markdown-preview editor-preview">${renderMarkdown(text)}</div>
          </div>
        </div>
        <div class="toolbar editor-actions">
          <button type="button" id="aiEditorCloseText">取消</button>
          ${iconTextButton("save", "保存内容", "id=\"aiEditorSave\" class=\"primary\"")}
        </div>
      </section>
    </div>
  `;
}

function openAiReferenceEditor(fieldName) {
  state.aiEditor = { field: fieldName };
  renderAiReference();
  $("#aiEditorText")?.focus();
}

function closeAiReferenceEditor() {
  state.aiEditor = null;
  renderAiReference();
}

async function saveAiReferenceEditor() {
  const fieldName = state.aiEditor?.field;
  if (!fieldName) return;
  const profile = {
    ...(state.settings.assistantProfile || {}),
    [fieldName]: value("aiEditorText"),
    updatedAt: Date.now()
  };
  await saveSettings({ assistantProfile: profile }, "AI 参考内容已保存");
  state.knowledgeOverview = await window.mainShell.getKnowledgeOverview().catch(() => state.knowledgeOverview);
  state.aiEditor = null;
  renderAiReference();
}

function renderJudgments() {
  const cfg = state.settings.config || {};
  const library = cfg.judgmentLibrary || {};
  const env = state.settings.env || {};
  const status = state.judgments || {};
  const runyuAuth = currentRunyuAuth();
  const cookieType = state.runyuCookieShown ? "text" : "password";
  const sources = splitKeywords(env.runyuJudgmentsSources || library.sources || "runyu");
  const searchTypes = splitKeywords(env.runyuJudgmentsSearchTypes || library.searchTypes || "judgments");
  content.innerHTML = `
    ${pageHead("外部知识同步", "外部连接只用于下载和增量更新。AI 回复始终检索本机缓存，不会实时查询外部服务器。", `
      <button id="testJudgments">查询本机资料</button>
      <button id="refreshJudgments" class="dark">增量同步</button>
      <button id="downloadAllJudgments" class="dark">全部下载</button>
      <button id="saveJudgments" class="primary">保存同步设置</button>
    `)}
    <div class="grid cols-4">
      ${metricCard("接入状态", library.enabled ? runyuAuthLabel(runyuAuth) : "未启用", runyuAuth.message || status.message || "等待配置", library.enabled ? runyuAuthTone(runyuAuth) : "warn")}
      ${metricCard("本地缓存", String(status.records || 0), status.cachePath || "未生成缓存", status.records ? "ok" : "warn")}
      ${metricCard("最近刷新", status.updatedAt ? formatFullTime(status.updatedAt) : "未刷新", lastRefreshSummary(status.lastRefresh), status.updatedAt ? "ok" : "warn")}
      ${metricCard("刷新周期", library.autoRefreshEnabled !== false ? `${library.refreshIntervalHours || 168} 小时` : "手动", "可改为 24 小时、3 天或 7 天", library.autoRefreshEnabled !== false ? "ok" : "warn")}
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      <div class="card">
        <h3>同步连接</h3>
        <div class="form-grid">
          <div class="field span-2">
            <label>网络配置</label>
            <div class="toolbar" style="justify-content:flex-start">
              <button id="openRunyuLogin" type="button" class="primary">打开网络配置页</button>
              <button id="captureRunyuCookie" type="button">获取访问凭证</button>
              <button id="verifyRunyuAuth" type="button">检查连通性</button>
              <button id="bootstrapRunyu" type="button">初始化本地缓存</button>
              <button id="reopenRunyuLogin" type="button">重新配置</button>
              <button id="clearRunyuLogin" type="button" class="danger">清除本机凭证</button>
            </div>
            <div class="hint">访问凭证仅供下载和更新任务使用，不会进入正常客服回复请求。</div>
            ${runyuNextActionHtml(runyuAuth)}
            ${runyuAuthMonitorHtml(runyuAuth, "judgments")}
          </div>
          ${toggleRow("judgmentEnabled", "启用外部知识同步", "允许这台电脑连接外部资料源并下载到本机。", Boolean(library.enabled))}
          ${toggleRow("judgmentUseRemote", "允许同步联网", "只允许手动或定时同步任务联网，生产回复仍只读本机。", library.syncEnabled !== false && library.useRemote !== false)}
          <input id="judgmentUseCache" type="checkbox" checked hidden>
          ${toggleRow("judgmentAutoRefresh", "自动增量同步", "按周期重新拉取资料，只合并新增和变化内容。", library.autoRefreshEnabled !== false)}
          <div class="field span-2">
            <label for="runyuWebCookie">访问凭证（手工备用）</label>
            <div style="display:grid;grid-template-columns:minmax(0,1fr)86px;gap:8px">
              <input id="runyuWebCookie" type="${cookieType}" value="${attr(env.runyuWebCookie || "")}" placeholder="session_token=...">
              <button id="toggleRunyuCookie" type="button">${state.runyuCookieShown ? "隐藏" : "显示"}</button>
            </div>
            <div class="hint">正常情况使用上面的网络配置页。只有自动获取失败时，才手工粘贴访问凭证。</div>
          </div>
          ${field("runyuWebBaseUrl", "外部资料源 Base URL", env.runyuWebBaseUrl || "https://runyuai.zhiduoke.com.cn", "只填服务域名，不要带具体接口路径。")}
          ${selectField("judgmentRefreshInterval", "自动刷新周期", String(library.refreshIntervalHours || 168), [["24", "每 24 小时"], ["72", "每 3 天"], ["168", "每 7 天"], ["336", "每 14 天"], ["720", "每 30 天"]], "到期后自动刷新缓存。")}
        </div>
      </div>
      <div class="card">
        <h3>下载范围</h3>
        <div class="field">
          <label>外部知识库来源</label>
          <div class="choice-grid">
            ${checkboxChoice("judgment-source", "runyu", "默认源", sources.includes("runyu"))}
            ${checkboxChoice("judgment-source", "liurun", "刘润", sources.includes("liurun"))}
            ${checkboxChoice("judgment-source", "xiangshui", "响水", sources.includes("xiangshui"))}
            ${checkboxChoice("judgment-source", "xingxing", "星星", sources.includes("xingxing"))}
            ${checkboxChoice("judgment-source", "book", "图书", sources.includes("book"))}
            ${checkboxChoice("judgment-source", "dedao", "得到", sources.includes("dedao"))}
          </div>
          <div class="hint">同步任务会按所选来源逐个下载，并在本机保留来源标识。</div>
        </div>
        <div class="field" style="margin-top:14px">
          <label>查询类型</label>
          <div class="choice-grid">
            ${checkboxChoice("judgment-type", "judgments", "判断", searchTypes.includes("judgments"))}
            ${checkboxChoice("judgment-type", "quotes", "引语", searchTypes.includes("quotes"))}
            ${checkboxChoice("judgment-type", "cases", "案例", searchTypes.includes("cases"))}
          </div>
        </div>
        <div class="form-grid" style="margin-top:14px">
          ${numberField("judgmentMaxResults", "本机引用上限", library.maxResults || 4, "AI 单次最多从本机同步资料参考多少条。")}
          ${numberField("judgmentLimitPerQuery", "连接检查条数", library.limitPerQuery || 8, "同步连接检查时每个来源/类型拉取多少条。")}
          ${numberField("judgmentRefreshLimit", "刷新每组上限", library.refreshLimit || 80, "批量刷新每个关键词、来源、类型最多拉多少条。")}
          ${numberField("judgmentFullPageLimit", "本地同步分页", library.fullDownloadPageLimit || 300, "同步到本地库时每页拉取数量。")}
          ${numberField("judgmentFullMaxPages", "每组最大页数", library.fullDownloadMaxPages || 20, "防止远端接口重复返回同一页导致无限循环。")}
          ${numberField("judgmentTimeoutMs", "请求超时 ms", library.timeoutMs || 12000, "单次 API 请求超时。")}
        </div>
      </div>
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      <div class="card">
        <h3>刷新关键词</h3>
        ${textareaField("judgmentRefreshKeywords", "关键词列表", keywordsText(env.runyuJudgmentsRefreshKeywords || library.refreshKeywords || ""), "按逗号、顿号或换行分隔。自动刷新会按这些关键词更新本地缓存。", "span-2")}
        <p class="hint">如果外部知识库没有全量导出游标，则按关键词增量合并。相同 id 或内容哈希不重复写入，内容变化会更新。</p>
      </div>
      <div class="card">
        <h3>本机资料验证</h3>
        ${field("judgmentTestKeyword", "本机查询关键词", "会员", "只查询已经下载到本机的同步资料。")}
        <div class="toolbar" style="justify-content:flex-start;margin-top:10px">
          <button id="testJudgmentsInline" class="primary">查询本机资料</button>
          <button id="refreshJudgmentsInline">增量同步</button>
          <button id="downloadAllJudgmentsInline">全部下载</button>
        </div>
        ${judgmentDownloadPanel()}
        <div id="judgmentResult" class="card cream" style="margin-top:12px;min-height:120px">测试和刷新结果会显示在这里。</div>
      </div>
    </div>
  `;
  bindToggleButtons();
  $("#captureRunyuCookie").disabled = !runyuAuth.loginWindowOpen && !runyuAuth.cookieDetected;
  $("#openRunyuLogin").addEventListener("click", () => openRunyuLogin(false));
  $("#captureRunyuCookie").addEventListener("click", captureRunyuCookie);
  $("#verifyRunyuAuth").addEventListener("click", verifyRunyuAuth);
  $("#bootstrapRunyu").addEventListener("click", bootstrapRunyuLibrary);
  $("#reopenRunyuLogin").addEventListener("click", () => openRunyuLogin(true));
  $("#clearRunyuLogin").addEventListener("click", clearRunyuLogin);
  $("#toggleRunyuCookie").addEventListener("click", () => {
    state.runyuCookieShown = !state.runyuCookieShown;
    renderJudgments();
  });
  $("#saveJudgments").addEventListener("click", () => saveJudgmentSettings());
  $("#testJudgments").addEventListener("click", testJudgments);
  $("#testJudgmentsInline").addEventListener("click", testJudgments);
  $("#refreshJudgments").addEventListener("click", refreshJudgments);
  $("#refreshJudgmentsInline").addEventListener("click", refreshJudgments);
  $("#downloadAllJudgments").addEventListener("click", downloadAllJudgments);
  $("#downloadAllJudgmentsInline").addEventListener("click", downloadAllJudgments);
  syncRunyuAuthUi();
  pollJudgmentDownloadIfNeeded();
}

function judgmentDownloadPanel() {
  const job = state.judgmentDownload || { status: "idle", progress: 0 };
  const statusText = {
    idle: "未开始",
    running: "下载中",
    completed: "已完成",
    completed_with_errors: "完成但有错误",
    failed: "失败"
  }[job.status] || job.status || "未开始";
  const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
  return `
    <div class="download-panel">
      <div class="download-head">
        <strong>全局下载状态：${escapeHtml(statusText)}</strong>
        <span>${progress}%</span>
      </div>
      <div class="progress"><span style="width:${progress}%"></span></div>
      <div class="hint">
        ${job.current ? `当前：${escapeHtml(job.current)} · ` : ""}
        进度 ${Number(job.completedSteps || 0)}/${Number(job.totalSteps || 0)} ·
        拉取 ${Number(job.fetched || 0)} · 新增 ${Number(job.added || 0)} · 更新 ${Number(job.updated || 0)} · 不变 ${Number(job.unchanged || 0)}
      </div>
      ${job.errors?.length ? `<div class="hint error-text">错误 ${job.errors.length} 条：${escapeHtml(job.errors.slice(-1)[0]?.message || job.errors.slice(-1)[0]?.error || "")}</div>` : ""}
    </div>
  `;
}

function renderWebhook() {
  const cfg = state.settings.config || {};
  const notify = cfg.notify || {};
  const env = state.settings.env || {};
  const rules = notify.eventRules || {};
  const outbox = state.records?.outbox || [];
  content.innerHTML = `
    ${pageHead("Webhook 通知", "配置企业微信机器人、事件推送规则、小时总结和每日总览。", `
      <button id="testWebhook">测试 Webhook</button>
      <button id="saveWebhook" class="primary">保存通知设置</button>
    `)}
    <div class="grid cols-2">
      <div class="card">
        <h3>连接设置</h3>
        <div class="form-grid">
          ${field("webhookUrl", "企业微信 Webhook 地址", notify.wecomWebhookUrl || env.wecomWebhookUrl || "", "用于推送告警、扫码截图、汇总和可选的成功回复通知。", "span-2")}
          ${toggleRow("notifyEnabled", "启用 Webhook 推送", "未填写地址时会自动关闭，只保留本机通知。", Boolean(notify.enabled && (notify.wecomWebhookUrl || env.wecomWebhookUrl)))}
          ${numberField("notifyCooldown", "同类通知冷却 ms", notify.cooldownMs || 300000, "避免同一类问题短时间重复刷屏。")}
          ${selectField("successReplyMode", "成功回复推送", notify.successReplyMode || "log_only", [
            ["log_only", "只写日志"],
            ["ai_only", "仅 AI 回复推送"],
            ["all", "全部成功回复推送"],
            ["errors_only", "只推送失败和超时"]
          ], "成功回复默认不推送，避免正常聊天刷屏。", "span-2")}
        </div>
      </div>
      <div class="card">
        <h3>总结频率</h3>
        <div class="form-grid">
          ${toggleRow("hourlySummaryEnabled", "启用小时总结", "按设定间隔总结自动回复成功、失败、超时和动作。", notify.hourlySummaryEnabled !== false)}
          ${selectField("hourlySummaryIntervalHours", "总结间隔", String(notify.hourlySummaryIntervalHours || 1), [["1", "每 1 小时"], ["2", "每 2 小时"], ["4", "每 4 小时"], ["6", "每 6 小时"], ["12", "每 12 小时"], ["24", "每 24 小时"]], "整点按间隔切片汇总。")}
          ${toggleRow("dailySummaryEnabled", "启用每日总览", "每天固定时间发送前一日自动回复总览。", notify.dailySummaryEnabled !== false)}
          ${field("dailySummaryTime", "每日总览时间", notify.dailySummaryTime || `${notify.dailySummaryHour ?? 10}:00`, "格式 10:00 或 21:30。")}
          ${numberField("summaryDetailLimit", "汇总明细条数", notify.summaryDetailLimit || 12, "每次汇总最多列出多少条明细。")}
        </div>
      </div>
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      <div class="card">
        <h3>推送事件规则</h3>
        <div class="grid">
          ${eventToggle("app", "程序启动/配置缺失", rules.app !== false)}
          ${eventToggle("health", "AI、Bot、页面健康异常", rules.health !== false)}
          ${eventToggle("page", "页面结构捕捉和页面动作", rules.page !== false)}
          ${eventToggle("login", "扫码登录和二维码截图", rules.login !== false)}
          ${eventToggle("replyFailed", "回复失败", rules.replyFailed !== false)}
          ${eventToggle("replyTimeout", "回复超时", rules.replyTimeout !== false)}
          ${eventToggle("replySuccess", "成功回复", Boolean(rules.replySuccess))}
          ${eventToggle("summaries", "小时/每日总结", rules.summaries !== false)}
        </div>
      </div>
      <div class="card">
        <h3>补发队列</h3>
        ${outbox.length ? outbox.map((item) => `
          <div class="log-row" style="grid-template-columns:110px minmax(0,1fr);margin-bottom:8px">
            <div class="log-time">${formatTime(item.createdAt)}</div>
            <div><strong>${escapeHtml(item.title || "")}</strong><div class="hint">${escapeHtml(item.error || item.body || "")}</div></div>
          </div>
        `).join("") : `<div class="empty">没有待补发通知。</div>`}
      </div>
    </div>
  `;
  bindToggleButtons();
  $("#saveWebhook").addEventListener("click", saveWebhookSettings);
  $("#testWebhook").addEventListener("click", testWebhook);
}

function renderRules() {
  const bot = state.settings.config?.bot || {};
  const entries = visibleRuleEntries(bot, state.ruleFilter);
  content.innerHTML = `
    ${pageHead("规则库", "规则默认使用紧凑摘要显示，展开单条后才加载编辑器和图片预览。", `
      ${iconTextButton("plus", "新增规则", "id=\"addRule\"")}
      ${iconTextButton("check", "检查规则", "id=\"validateRules\"")}
      ${iconTextButton("save", "保存规则库", "id=\"saveRules\" class=\"primary\"")}
    `)}
    <div class="tabs rule-category-tabs">
      ${ruleFilterButton("all", "全部")}
      ${ruleFilterButton("text", "文字")}
      ${ruleFilterButton("action", "组合动作")}
      ${ruleFilterButton("image", "图片")}
      ${ruleFilterButton("file", "文件")}
      ${ruleFilterButton("product", "商品卡")}
      ${ruleFilterButton("invite", "邀请下单")}
      ${ruleFilterButton("candidates", "候选池")}
    </div>
    <div id="ruleList" class="rule-compact-list">
      ${state.ruleFilter === "candidates"
        ? renderRuleCandidatesSummary()
        : entries.length
          ? entries.map((entry) => renderRuleCard(entry.type, entry.rule, entry.index)).join("")
          : `<div class="empty">当前分类没有规则，点击“新增规则”创建。</div>`}
    </div>
    ${state.ruleFilter !== "candidates" ? `<details class="advanced-rule-json" style="margin-top:14px"><summary>更多操作：高级 JSON</summary><p class="hint">只用于批量排查或迁移，日常请使用紧凑编辑器。</p><textarea id="advancedRulesJson" style="min-height:220px">${escapeHtml(JSON.stringify(bot[currentRuleStorageType()] || [], null, 2))}</textarea><div class="toolbar" style="justify-content:flex-start;margin-top:8px"><button id="applyAdvancedRules">应用到当前规则分类</button></div></details>` : ""}
  `;
  $$("[data-rule-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      commitExpandedRule();
      state.ruleFilter = button.dataset.ruleFilter;
      state.expandedRuleKey = "";
      renderRules();
    });
  });
  bindRuleActions();
  hydrateRulePreviews($(".rule-card.expanded") || document);
}

function renderRuleTestPanel() {
  const result = state.ruleTestResult;
  return `
    <section class="card rule-test-panel">
      <h3>手动激发测试</h3>
      <div class="form-grid">
        ${textareaField("ruleTestMessage", "客户消息", "会员专区怎么使用", "输入一条真实客户消息，先看会命中哪条规则。", "span-2")}
      </div>
      <div class="toolbar" style="justify-content:flex-start;margin-top:10px">
        <button id="testRuleMatch" type="button">只测试匹配</button>
        <button id="executeRuleMatch" type="button" class="primary">真实执行命中规则</button>
      </div>
      <div id="ruleTestResult" class="rule-test-result">
        ${result ? renderRuleTestResult(result) : `<div class="hint">建议先点“只测试匹配”。真实执行会直接对当前客服会话发送文字、图片、商品卡片或邀请下单。</div>`}
      </div>
    </section>
  `;
}

function renderRuleTestResult(result) {
  const source = sourceLabels[result.sourceType] || sourceLabels.unknown;
  const badges = [
    result.matched ? `命中 ${result.ruleName || ""}` : "未命中",
    result.execute ? "真实执行" : "仅匹配",
    result.sourceType ? source.label : ""
  ].filter(Boolean);
  return `
    <div class="badge-row" style="margin-top:10px">
      ${badges.map((text) => `<span class="badge ${source.className || ""}">${escapeHtml(text)}</span>`).join("")}
      <span class="badge ${result.ok ? "" : "fail"}">${escapeHtml(result.message || (result.ok ? "正常" : "失败"))}</span>
    </div>
    ${result.reply ? `<div class="field" style="margin-top:10px"><label>将发送文字</label><div class="readonly-box">${escapeHtml(result.reply)}</div></div>` : ""}
    ${Array.isArray(result.actions) && result.actions.length ? `<div class="badge-row" style="margin-top:10px">${result.actions.map((action) => `<span class="badge">${escapeHtml(actionSummary([action]) || action.type || "动作")}</span>`).join("")}</div>` : ""}
    ${Array.isArray(result.results) && result.results.length ? `<div class="rule-test-results">${result.results.map(renderRuleExecutionResult).join("")}</div>` : ""}
    ${Array.isArray(result.processSteps) && result.processSteps.length ? `<div class="process-chain">${result.processSteps.map((step, index) => `<span>${index + 1}. ${escapeHtml(step)}</span>`).join("")}</div>` : ""}
  `;
}

function renderRuleExecutionResult(item = {}) {
  const ok = Boolean(item.ok || item.sent || item.ignored || item.skipped);
  return `
    <div class="mini-status">
      <span class="signal"><i class="dot ${ok ? "" : "bad"}"></i>${ok ? "完成" : "失败"}</span>
      <span>${escapeHtml(item.message || (item.sent ? "已发送" : item.pasted ? "已粘贴待确认" : item.skipped ? "已跳过" : ""))}</span>
    </div>
  `;
}

function renderRuleCard(type, rule, index) {
  const enabled = rule.enabled !== false;
  const keywords = keywordsText(rule.keywords);
  const label = type === "actionRules" ? "动作规则" : type === "imageReplies" ? "图片规则" : "文字规则";
  const typeClass = type === "actionRules" ? "rule" : type === "imageReplies" ? "rule" : "direct";
  const key = `${type}:${index}`;
  const expanded = state.expandedRuleKey === key;
  const keywordSummary = splitKeywords(rule.keywords).slice(0, 3).join(" / ") || "无关键词";
  return `
    <section class="rule-card compact ${expanded ? "expanded" : ""}" data-rule-type="${type}" data-index="${index}" data-rule-key="${key}">
      <div class="rule-head">
        <div class="rule-title">
          <i class="dot ${enabled ? "" : "warn"}"></i>
          <strong>${escapeHtml(rule.name || `未命名规则 ${index + 1}`)}</strong>
          <span class="badge ${typeClass}">${label}</span>
          <span class="rule-keyword-summary">${escapeHtml(keywordSummary)}</span>
          <span class="badge">${escapeHtml(rule.mode || "final")}</span>
          <span class="rule-action-summary">${escapeHtml(ruleSummary(type, rule))}</span>
          <time>${rule.updatedAt ? formatFullTime(rule.updatedAt) : "未记录修改"}</time>
        </div>
        <div class="rule-actions">
          ${iconButton("chevron", expanded ? "收起" : "展开", "data-rule-command=\"expand\"")}
          ${iconButton("copy", "复用", "data-rule-command=\"duplicate\"")}
          ${iconButton(enabled ? "close" : "check", enabled ? "停用" : "启用", "data-rule-command=\"toggle-enabled\"")}
          ${iconButton("trash", "删除", "data-rule-command=\"delete\"", "danger")}
        </div>
      </div>
      ${expanded ? `<div class="rule-editor">
        ${toggleRow(`rule-enabled-${index}`, "启用这条规则", "关闭后不会被自动回复匹配。", enabled, "span-2", "data-rule-field=\"enabled\"")}
        ${field("", "规则名称", rule.name || "", "用于日志和规则管理。", "", "data-rule-field=\"name\"")}
        ${textareaField("", "匹配关键词", keywords, "逗号、顿号或换行分隔，客户消息包含任一关键词就会命中。", "", "data-rule-field=\"keywords\"")}
        ${selectField("", "规则模式", rule.mode || "final", [["final", "直接完成"], ["quick_then_api", "快速回复后补 AI"], ["action_only", "只执行动作"], ["ignore", "忽略消息"]], "决定规则命中后的后续流程。", "span-2", "data-rule-field=\"mode\"")}
        ${renderRuleSpecificEditor(type, rule)}
        <div class="span-2 toolbar rule-editor-footer"><button type="button" data-rule-command="cancel-edit">取消</button>${iconTextButton("save", "保存当前规则", "data-rule-command=\"save-one\" class=\"primary\"")}</div>
      </div>` : ""}
    </section>
  `;
}

function renderRuleSpecificEditor(type, rule) {
  if (type === "rules") {
    return textareaField("", "回复文本", rule.reply || "", "命中后直接发送的文字。", "span-2", "data-rule-field=\"reply\"");
  }

  if (type === "imageReplies") {
    return `
      ${pathField("", "图片路径", rule.path || rule.imagePath || "", "支持 config/reply-images/xxx.png 或绝对路径。可选择新图片或打开所在位置替换。", "", "data-rule-field=\"path\"", "image")}
      ${field("", "图片说明", rule.caption || "", "可选，用于日志和规则说明。", "", "data-rule-field=\"caption\"")}
    `;
  }

  const actions = Array.isArray(rule.actions) ? rule.actions : [];
  return `
    <div class="span-2">
      <label style="font-weight:650">执行动作</label>
      <div class="hint">动作会按顺序执行。文本、图片、文件、商品、邀请下单、素材库、快捷语和忽略都可以组合。</div>
      <div class="grid action-list" style="margin-top:8px">
        ${actions.length ? actions.map((action, actionIndex) => renderActionRow(action, actionIndex)).join("") : renderActionRow({ type: "text", text: "" }, 0)}
      </div>
      <div class="toolbar" style="justify-content:flex-start;margin-top:8px">
        ${iconTextButton("plus", "添加动作", "data-rule-command=\"add-action\"")}
      </div>
    </div>
  `;
}

function renderActionRow(action, index) {
  const type = String(action.type || "text");
  return `
    <div class="action-row action-module" data-action-index="${index}" data-action-type="${attr(type)}">
      <div class="action-module-head">
        <div>
          <span class="badge rule">动作 ${index + 1}</span>
          <strong>${escapeHtml(actionTypeLabel(type))}</strong>
        </div>
        ${iconButton("trash", "删除动作", "data-rule-command=\"remove-action\"", "danger")}
      </div>
      <div class="form-grid">
        ${selectField("", "动作类型", type, [
          ["text", "发送文字"],
          ["image", "发送图片"],
          ["file", "发送文件"],
          ["product", "商品/邀请下单"],
          ["material", "素材库"],
          ["quick_reply", "快捷语"],
          ["wait", "等待"],
          ["click", "点击页面"],
          ["capture_structure", "捕捉结构"],
          ["ignore", "忽略"]
        ], "切换后只显示这个动作需要的配置。", "", "data-action-field=\"type\"")}
        ${renderActionFields(type, action)}
      </div>
    </div>
  `;
}

function actionTypeLabel(type) {
  return ({
    text: "发送文字",
    image: "发送图片",
    file: "发送文件",
    product: "商品/邀请下单",
    material: "发送素材",
    quick_reply: "发送快捷语",
    wait: "等待",
    click: "点击页面",
    capture_structure: "捕捉结构",
    ignore: "忽略消息"
  })[type] || "执行动作";
}

function renderActionFields(type, action) {
  const text = action.text || action.reply || action.query || action.match || "";
  const path = action.path || action.filePath || action.imagePath || "";
  if (type === "text") {
    return textareaField("", "发送内容", text, "命中规则后发送给客户的文字。", "span-2", "data-action-field=\"text\"");
  }
  if (type === "image") {
    return `
      ${pathField("", "回复图片", path, "选择后可直接预览、替换或打开图片所在位置。", "span-2", "data-action-field=\"path\"", "image")}
      <div class="image-preview span-2" data-preview-path="${attr(path)}">
        <div class="image-preview-frame"><span>正在读取图片</span></div>
        <div class="hint image-preview-meta">${escapeHtml(path || "尚未选择图片")}</div>
      </div>
    `;
  }
  if (type === "file") {
    return pathField("", "回复文件", path, "选择要发送的文件，也可以打开所在位置直接替换。", "span-2", "data-action-field=\"path\"", "file");
  }
  if (type === "product") {
    return `
      ${selectField("", "发送方式", action.button || "发商品", [["发商品", "发送商品卡片"], ["邀请下单", "邀请客户下单"]], "选择微信小店页面中的实际动作。", "", "data-action-field=\"button\"")}
      ${field("", "商品码", action.productId || "", "优先使用商品 ID 精确匹配。", "", "data-action-field=\"productId\"")}
      ${field("", "商品名", action.productName || "", "商品码匹配不到时用商品名辅助匹配。", "span-2", "data-action-field=\"productName\"")}
    `;
  }
  if (type === "material" || type === "quick_reply") {
    return `
      ${field("", type === "material" ? "素材匹配词" : "快捷语匹配词", text, "用于在右侧素材库或快捷语列表中定位内容。", "span-2", "data-action-field=\"text\"")}
      <input type="hidden" value="${attr(action.button || "发送")}" data-action-field="button">
    `;
  }
  if (type === "wait") {
    return numberField("", "等待毫秒", Number(action.ms || text || 500), "执行下一动作前等待的时间。", "span-2", "min=\"0\" step=\"100\" data-action-field=\"text\"");
  }
  if (type === "click") {
    return field("", "按钮文字或选择器", text, "填写要点击的页面按钮文字或 CSS 选择器。", "span-2", "data-action-field=\"text\"");
  }
  return `<div class="action-note span-2">${type === "ignore" ? "命中后不发送任何内容，并结束本次处理。" : "命中后保存当前页面结构，供页面动作排查使用。"}</div>`;
}

function renderLogs() {
  const records = state.records?.items || [];
  const stats = state.records?.stats || {};
  content.innerHTML = `
    ${pageHead("回复日志库", "每次回复都会记录来源、命中规则、客户消息、回复内容、动作和失败原因。", `
      <select id="logKind" style="width:130px">
        <option value="all">全部状态</option>
        <option value="sent">成功</option>
        <option value="failed">失败</option>
        <option value="timeout">超时</option>
      </select>
      <select id="logSource" style="width:150px">
        <option value="all">全部来源</option>
        <option value="action_rule">本地动作规则</option>
        <option value="text_rule">本地规则回复</option>
        <option value="image_rule">图片回复</option>
        <option value="quick_ack">15秒承接语</option>
        <option value="waiting_reply">等待补偿</option>
        <option value="fallback_reply">60秒延迟处理</option>
        <option value="ai_followup">AI API回复</option>
        <option value="api_remediation">AI补救回复</option>
        <option value="judgment_ai">同步资料增强回复</option>
      </select>
      <button id="refreshLogs" class="primary">刷新日志</button>
    `)}
    <div class="grid cols-3">
      ${metricCard("成功", String(stats.sent || 0), "已发送记录", "ok")}
      ${metricCard("失败", String(stats.failed || 0), "需要排查的发送失败", stats.failed ? "bad" : "ok")}
      ${metricCard("超时", String(stats.timeout || 0), "超过等待阈值", stats.timeout ? "warn" : "ok")}
    </div>
    <div class="grid" style="margin-top:14px">
      ${records.length ? records.map((item, index) => renderLogRow(item, index)).join("") : `<div class="empty">还没有回复日志。</div>`}
    </div>
  `;
  $("#refreshLogs").addEventListener("click", loadLogsFromFilters);
  $("#logKind").addEventListener("change", loadLogsFromFilters);
  $("#logSource").addEventListener("change", loadLogsFromFilters);
  $$(".log-row").forEach((row) => {
    row.addEventListener("click", () => setDetail("log", records[Number(row.dataset.logIndex || 0)] || {}));
  });
}

function renderLogRow(item, index = 0) {
  const source = sourceLabels[item.sourceType] || { label: item.sourceLabel || item.sourceType || "未分类", className: "" };
  const kindClass = item.kind === "sent" ? "" : item.kind === "timeout" ? "direct" : "fail";
  return `
    <article class="log-row" data-log-index="${index}" tabindex="0" role="button" aria-label="查看日志详情">
      <div>
        <div class="log-time">${formatTime(item.at)}</div>
        <div class="badge-row" style="margin-top:6px">
          <span class="badge ${kindClass}">${item.kind === "sent" ? "成功" : item.kind === "timeout" ? "超时" : "失败"}</span>
          <span class="badge ${source.className}">${escapeHtml(source.label)}</span>
        </div>
      </div>
      <div>
        <strong>${escapeHtml(item.rule || item.stage || "未命名记录")}</strong>
        <div class="hint">客户：${escapeHtml(item.customer || "")}</div>
        ${item.status && item.kind !== "sent" ? `<div class="hint">原因：${escapeHtml(item.status)}</div>` : ""}
      </div>
      <div>
        <div>${escapeHtml(item.reply || actionSummary(item.actions) || "")}</div>
        ${item.actions?.length ? `<div class="badge-row" style="margin-top:8px">${item.actions.map((action) => `<span class="badge">${escapeHtml(action.type || "action")}</span>`).join("")}</div>` : ""}
        ${renderLogTrace(item)}
      </div>
    </article>
  `;
}

function renderLogTrace(item) {
  const trace = item.aiTrace || null;
  const steps = Array.isArray(item.processSteps) ? item.processSteps : [];
  if (!trace && !steps.length) return "";
  const badges = [];
  if (trace?.model) badges.push(`模型 ${trace.model}`);
  if (trace) badges.push(trace.thinking === "disabled" ? "Thinking 关闭" : "Thinking 开启");
  if (trace?.judgmentQueried) {
    badges.push(trace.judgmentUsed ? `同步资料 ${trace.judgmentCount || 0} 条` : "同步资料未命中");
    if (trace.judgmentFromCache) badges.push(`本地 ${trace.judgmentFromCache}`);
    if (trace.judgmentFromRemote) badges.push(`远端 ${trace.judgmentFromRemote}`);
  } else if (trace) {
    badges.push("未用同步资料");
  }
  if (trace?.reviewEnabled) badges.push(trace.reviewApplied ? "审核改写" : "审核通过");
  const latency = Number(item.latencyMs || trace?.latencyMs || 0);
  if (latency) badges.push(`耗时 ${(latency / 1000).toFixed(1)} 秒`);
  return `
    ${badges.length ? `<div class="badge-row log-trace-badges">${badges.map((text) => `<span class="badge ai">${escapeHtml(text)}</span>`).join("")}</div>` : ""}
    ${steps.length ? `<div class="process-chain">${steps.map((step, index) => `<span>${index + 1}. ${escapeHtml(step)}</span>`).join("")}</div>` : ""}
    ${trace?.judgmentError ? `<div class="hint fail-text">同步资料错误：${escapeHtml(trace.judgmentError)}</div>` : ""}
  `;
}

function renderFloating() {
  const floatWindow = state.settings.config?.floatWindow || {};
  const status = state.status || {};
  content.innerHTML = `
    ${pageHead("悬浮窗设置", "悬浮窗只显示 AI API、中转服务、脚本和登录状态。隐藏不会关闭程序，可从这里或托盘重新打开。", `
      <button id="showFloat" class="primary">打开悬浮窗</button>
      <button id="hideFloat">隐藏悬浮窗</button>
      <button id="saveFloat" class="dark">保存悬浮窗设置</button>
      <button id="quitApp" class="danger">彻底退出程序</button>
    `)}
    <div class="grid cols-2">
      <div class="card">
        <h3>显示行为</h3>
        <div class="grid">
          ${toggleRow("floatEnabled", "启用悬浮窗功能", "关闭后不自动创建悬浮窗，但主控制台仍可重新启用。", floatWindow.enabled !== false)}
          ${toggleRow("alwaysOnTop", "保持置顶", "适合客服值守时防止窗口被遮挡。", Boolean(floatWindow.alwaysOnTop))}
        </div>
        <p class="hint">当前状态：${status.floating?.visible ? "正在显示" : "已隐藏"}，${status.floating?.alwaysOnTop ? "置顶" : "不置顶"}，${status.floating?.mode === "mini" ? "最小化条" : "展开状态窗"}。</p>
      </div>
      <div class="card">
        <h3>固定版式</h3>
        <p>展开态固定为 <code>344 × 256</code>，最小化态固定为 <code>244 × 52</code>，不开放无级缩放，避免文字遮挡和状态灯错位。</p>
        <p class="hint">最小化条保留三个按钮：打开控制台、展开、关闭/隐藏。关闭只是隐藏；主控台、Dock 或托盘都可以重新打开。</p>
      </div>
    </div>
  `;
  bindToggleButtons();
  $("#showFloat").addEventListener("click", () => window.mainShell.openFloating("compact"));
  $("#hideFloat").addEventListener("click", () => window.mainShell.hideFloating());
  $("#saveFloat").addEventListener("click", saveFloatingSettings);
  $("#quitApp").addEventListener("click", requestFullQuitFromUi);
}

async function requestFullQuitFromUi() {
  const first = await window.mainShell.requestQuit({ source: "main" });
  if (!first?.requireConfirm) return;
  const confirmed = window.confirm(`${first.message}\n\n再次点击确认后，程序会完全退出。`);
  if (!confirmed) return;
  await window.mainShell.requestQuit({ source: "main", confirm: first.confirmText });
}

function renderHelp() {
  content.innerHTML = `
    ${pageHead("说明页", "这页解释后台运行逻辑、规则优先级、Webhook 规则和 API 接入方式。")}
    <div class="grid cols-2">
      <div class="card">
        <h3>后台运行逻辑</h3>
        <p>桌面程序启动后会打开本地控制台、客服页 BrowserView、本机回复中转服务、悬浮窗和守护检查。主窗口关闭只会隐藏，托盘和悬浮窗可重新打开。</p>
        <p>客服页映射仍是微信小店原网页，自动化动作通过注入脚本和桌面端页面接口执行。</p>
      </div>
      <div class="card">
        <h3>回复优先级</h3>
        <p><code>动作规则</code> 优先，可组合文字、图片、商品、邀请下单、文件和忽略。</p>
        <p><code>图片规则</code> 和 <code>文字规则</code> 随后匹配。都未命中时，如果启用 AI，就调用本地 AI 回复。</p>
      </div>
      <div class="card">
        <h3>Webhook 通知规则</h3>
        <p>企业微信机器人用于推送扫码截图、失败/超时、健康异常、小时总结和每日总览。成功回复默认只写日志，可以在 Webhook 页改成 AI 回复或全部成功回复推送。</p>
      </div>
      <div class="card">
        <h3>API 接入规则</h3>
        <p>API Key、模型和 Base URL 只写入本机 <code>.env</code>。仓库不会提交 Key。保存后点击“真实回复测试”验证完整链路。</p>
      </div>
      <div class="card">
        <h3>页面结构接口</h3>
        <p>“捕捉页面结构”会读取当前客服页可见节点、右侧商品/素材/快捷语面板、上传入口和弹窗按钮，保存 JSON 并复制路径。</p>
      </div>
      <div class="card">
        <h3>功能测试建议</h3>
        <p>规则修改后先选中一个测试会话，分别测试文字、图片、商品卡片、邀请下单和文件动作，再看日志库确认来源和状态。</p>
      </div>
    </div>
  `;
}

async function runSetupSelfCheck() {
  const deepseekApiKey = value("setupDeepseekApiKey");
  const webhookUrl = value("setupWebhookUrl");
  const env = state.settings.env || {};
  const runyuWebCookie = value("setupRunyuWebCookie") || env.runyuWebCookie || "";
  if (!deepseekApiKey || !webhookUrl) {
    showFlash("请先填写 DeepSeek Key 和 Webhook", "error");
    return;
  }
  if (!runyuWebCookie && !hasRunyuCredential(env, currentRunyuAuth())) {
    showFlash("请先完成外部知识同步配置并点击“获取访问凭证”", "error");
    return;
  }

  state.setupRunning = true;
  state.setupChecks = [{ name: "保存本机配置", ok: false, message: "正在保存..." }];
  renderSetup();
  try {
    const library = state.settings.config?.judgmentLibrary || {};
    await saveSettings({
      config: {
        autoStart: true,
        bot: {
          enabled: true,
          aiFallback: true,
          imageRepliesEnabled: true,
          autoPasteImages: true
        },
        notify: {
          ...(state.settings.config?.notify || {}),
          enabled: true,
          wecomWebhookUrl: webhookUrl
        },
        judgmentLibrary: {
          ...library,
          enabled: true,
          useCache: true,
          useRemote: true,
          autoRefreshEnabled: library.autoRefreshEnabled !== false
        },
        watchdog: {
          ...(state.settings.config?.watchdog || {}),
          enabled: true,
          reloadOnBotStale: true,
          preventAppSuspension: true
        }
      },
      env: {
        ...env,
        deepseekApiKey,
        deepseekModel: value("setupDeepseekModel") || env.deepseekModel || "deepseek-v4-flash",
        deepseekBaseUrl: env.deepseekBaseUrl || "https://api.deepseek.com",
        deepseekThinking: env.deepseekThinking || "enabled",
        deepseekReasoningEffort: env.deepseekReasoningEffort || "medium",
        deepseekReview: env.deepseekReview || "enabled",
        deepseekTimeoutMs: env.deepseekTimeoutMs || "80000",
        deepseekReviewTimeoutMs: env.deepseekReviewTimeoutMs || "25000",
        wecomWebhookUrl: webhookUrl,
        runyuWebCookie: runyuWebCookie || undefined,
        runyuWebBaseUrl: value("setupRunyuBaseUrl") || env.runyuWebBaseUrl || "https://runyuai.zhiduoke.com.cn",
        runyuJudgmentsEnabled: "enabled",
        runyuJudgmentsUseCache: "enabled",
        runyuJudgmentsUseRemote: "enabled",
        runyuJudgmentsSources: env.runyuJudgmentsSources || "runyu,liurun,xiangshui,xingxing,book,dedao",
        runyuJudgmentsSearchTypes: env.runyuJudgmentsSearchTypes || "judgments,quotes,cases",
        runyuJudgmentsMaxResults: env.runyuJudgmentsMaxResults || "4",
        runyuJudgmentsLimitPerQuery: env.runyuJudgmentsLimitPerQuery || "8",
        runyuJudgmentsRefreshLimit: env.runyuJudgmentsRefreshLimit || "80",
        runyuJudgmentsTimeoutMs: env.runyuJudgmentsTimeoutMs || "12000",
        runyuJudgmentsRefreshKeywords: env.runyuJudgmentsRefreshKeywords || "会员,退款,课程,订单,发票,社群,视频号,直播,线下课,小店"
      }
    }, "初始化配置已保存");

    const checks = [
      { name: "保存本机配置", ok: true, message: "已写入本机 .env 和桌面配置。" }
    ];

    const ai = await window.mainShell.checkAi().catch((error) => ({ ok: false, message: String(error?.message || error) }));
    checks.push({
      name: "AI Key 健康检查",
      ok: Boolean(ai.ok && ai.hasKey),
      message: ai.hasKey ? (ai.message || "AI API可用") : (ai.message || "DeepSeek Key 未生效")
    });

    const webhook = await window.mainShell.testWebhook(webhookUrl).catch((error) => ({ ok: false, message: String(error?.message || error) }));
    checks.push({
      name: "Webhook 测试",
      ok: Boolean(webhook.ok),
      message: webhook.message || (webhook.ok ? "Webhook 可用" : "Webhook 不可用")
    });

    const judgments = await window.mainShell.testJudgments({ query: "会员", limit: 10, remoteOnly: true }).catch((error) => ({ ok: false, message: String(error?.message || error), results: [] }));
    checks.push({
      name: "外部同步权限测试",
      ok: Boolean(judgments.ok),
      message: judgments.ok ? `远端同步接口可用，返回 ${judgments.results?.length || 0} 条。` : (judgments.message || "外部同步接口不可用")
    });

    try {
      validateRuleLibrary(state.settings.config?.bot || {});
      checks.push({ name: "规则库校验", ok: true, message: "默认文字、图片、商品和邀请下单规则结构正常。" });
    } catch (error) {
      checks.push({ name: "规则库校验", ok: false, message: String(error?.message || error) });
    }

    state.status = await window.mainShell.getStatus();
    checks.push({
      name: "长期运行检查",
      ok: Boolean(state.status.watchdog?.enabled && state.status.watchdog?.powerSaveBlockerActive),
      message: state.status.watchdog?.enabled
        ? `守护定时器 ${state.status.watchdog.timerCount || 0} 个，防休眠${state.status.watchdog.powerSaveBlockerActive ? "已开启" : "未开启"}。`
        : "守护检查未开启"
    });

    state.setupChecks = checks;
    state.judgments = await window.mainShell.getJudgmentsStatus();
    showFlash(checks.every((item) => item.ok) ? "初始化自检通过，可以扫码登录" : "初始化自检有未通过项，请查看结果", checks.every((item) => item.ok) ? "ok" : "error");
  } finally {
    state.setupRunning = false;
    renderChrome();
    renderSetup();
  }
}

async function saveBotSettings() {
  const payload = {
    config: {
      autoStart: checked("autoStart"),
      watchdog: {
        enabled: checked("watchdogEnabled"),
        reloadOnBotStale: checked("reloadOnBotStale"),
        preventAppSuspension: checked("preventAppSuspension"),
        aiHealthMs: numberValue("watchdogAiHealthMs", 60000),
        pageHealthMs: numberValue("watchdogPageHealthMs", 60000),
        botHeartbeatMs: numberValue("watchdogBotHeartbeatMs", 60000)
      },
      bot: {
        enabled: checked("botEnabled"),
        aiFallback: checked("aiFallback"),
        quickAckEveryMessage: checked("quickAckEveryMessage"),
        aiEndpoint: value("aiEndpoint"),
        quickAck: splitReplyList(value("quickAck"))[0] || value("quickAck"),
        quickAckReplies: splitReplyList(value("quickAck")),
        fallbackReply: splitReplyList(value("fallbackReply"))[0] || value("fallbackReply"),
        fallbackReplies: splitReplyList(value("fallbackReply")),
        aiSlowMs: numberValue("aiSlowMs", 15000),
        fallbackReplyMs: numberValue("fallbackReplyMs", 60000),
        noResponseAlertMs: numberValue("noResponseAlertMs", 90000),
        maxTextParts: numberValue("maxTextParts", 2),
        maxReplyPartLength: numberValue("maxReplyPartLength", 500),
        imageRepliesEnabled: checked("imageRepliesEnabled"),
        autoPasteImages: checked("autoPasteImages"),
        panelAutoActionsEnabled: checked("panelAutoActionsEnabled")
      }
    }
  };
  await saveSettings(payload, "Bot 设置已保存");
}

async function saveApiSettings() {
  const payload = {
    env: {
      deepseekApiKey: value("deepseekApiKey"),
      deepseekModel: value("deepseekModel"),
      deepseekBaseUrl: value("deepseekBaseUrl"),
      deepseekThinking: value("deepseekThinking"),
      deepseekReasoningEffort: value("deepseekReasoningEffort"),
      deepseekReview: value("deepseekReview"),
      deepseekTimeoutMs: String(numberValue("deepseekTimeoutMs", 80000)),
      deepseekReviewTimeoutMs: String(numberValue("deepseekReviewTimeoutMs", 25000)),
      wecomWebhookUrl: state.settings.env?.wecomWebhookUrl || "",
      port: state.settings.env?.port || ""
    }
  };
  await saveSettings(payload, "AI API 设置已保存");
}

async function saveAiReferenceSettings() {
  const profile = state.settings.assistantProfile || {};
  const payload = {
    assistantProfile: {
      ...profile,
      knowledgeFilesEnabled: checked("knowledgeFilesEnabled"),
      sidebarContextEnabled: checked("sidebarContextEnabled"),
      reviewEnabled: checked("reviewEnabled"),
      updatedAt: Date.now()
    }
  };
  await saveSettings(payload, "AI 参考已保存");
  state.knowledgeOverview = await window.mainShell.getKnowledgeOverview().catch(() => state.knowledgeOverview);
  renderAiReference();
}

function collectJudgmentSettings() {
  const sources = collectCheckedChoices("judgment-source");
  const searchTypes = collectCheckedChoices("judgment-type");
  const refreshKeywords = splitKeywords(value("judgmentRefreshKeywords"));
  return {
    config: {
      judgmentLibrary: {
        enabled: checked("judgmentEnabled"),
        useRemote: checked("judgmentUseRemote"),
        syncEnabled: checked("judgmentUseRemote"),
        useCache: checked("judgmentUseCache"),
        autoRefreshEnabled: checked("judgmentAutoRefresh"),
        refreshIntervalHours: numberValue("judgmentRefreshInterval", 168),
        sources,
        searchTypes,
        maxResults: numberValue("judgmentMaxResults", 4),
        limitPerQuery: numberValue("judgmentLimitPerQuery", 8),
        refreshLimit: numberValue("judgmentRefreshLimit", 80),
        fullDownloadPageLimit: numberValue("judgmentFullPageLimit", 300),
        fullDownloadMaxPages: numberValue("judgmentFullMaxPages", 20),
        timeoutMs: numberValue("judgmentTimeoutMs", 12000),
        refreshKeywords
      }
    },
    env: {
      runyuWebCookie: value("runyuWebCookie"),
      runyuWebBaseUrl: value("runyuWebBaseUrl"),
      runyuJudgmentsEnabled: checked("judgmentEnabled") ? "enabled" : "disabled",
      runyuJudgmentsSources: sources.join(","),
      runyuJudgmentsSearchTypes: searchTypes.join(","),
      runyuJudgmentsUseCache: checked("judgmentUseCache") ? "enabled" : "disabled",
      runyuJudgmentsUseRemote: checked("judgmentUseRemote") ? "enabled" : "disabled",
      runyuJudgmentsMaxResults: String(numberValue("judgmentMaxResults", 4)),
      runyuJudgmentsLimitPerQuery: String(numberValue("judgmentLimitPerQuery", 8)),
      runyuJudgmentsRefreshLimit: String(numberValue("judgmentRefreshLimit", 80)),
      runyuJudgmentsTimeoutMs: String(numberValue("judgmentTimeoutMs", 12000)),
      runyuJudgmentsRefreshKeywords: refreshKeywords.join(",")
    }
  };
}

async function saveJudgmentSettings(options = {}) {
  const payload = collectJudgmentSettings();
  if (!payload.config.judgmentLibrary.sources.length) throw new Error("至少选择一个外部资料来源");
  if (!payload.config.judgmentLibrary.searchTypes.length) throw new Error("至少选择一个查询类型");
  if (!payload.config.judgmentLibrary.refreshKeywords.length) throw new Error("至少填写一个刷新关键词");
  await saveSettings(payload, options.message || "外部同步设置已保存");
  state.judgments = await window.mainShell.getJudgmentsStatus();
  state.judgmentDownload = await window.mainShell.getJudgmentsDownloadStatus();
  if (state.view === "judgments" && options.render !== false) renderJudgments();
  return payload;
}

async function testJudgments() {
  const box = $("#judgmentResult");
  if (box) box.textContent = "正在保存配置并查询本机同步资料...";
  try {
    await saveJudgmentSettings({ message: "外部同步设置已保存，开始查询本机资料", render: false });
    const result = await window.mainShell.testJudgments({ query: value("judgmentTestKeyword") || "会员", limit: 10 });
    state.judgments = await window.mainShell.getJudgmentsStatus();
    if (box) box.innerHTML = judgmentResultHtml(result);
    showFlash(result.ok ? `本机同步资料命中：${result.results?.length || 0} 条` : result.message, result.ok ? "ok" : "error");
  } catch (error) {
    if (box) box.innerHTML = `<strong>失败：</strong><div class="hint">${escapeHtml(String(error?.message || error))}</div>`;
    showFlash(String(error?.message || error), "error");
  }
}

async function openRunyuLogin(reset = false) {
  showFlash(reset ? "正在清理旧会话并打开外部知识同步配置..." : "正在打开外部知识同步配置...");
  try {
    state.runyuAuth = await window.mainShell.openRunyuLogin({ reset });
    state.judgments = await window.mainShell.getJudgmentsStatus();
    if (["setup", "judgments"].includes(state.view)) renderView();
    showFlash("请在 5 分钟内完成配置，然后点击“获取访问凭证”", "ok");
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  }
}

async function captureRunyuCookie() {
  showFlash("正在获取访问凭证并验证同步权限...");
  try {
    state.runyuAuth = await window.mainShell.captureRunyuCookie();
    const [settings, judgments] = await Promise.all([
      window.mainShell.getSettings(),
      window.mainShell.getJudgmentsStatus()
    ]);
    state.settings = settings;
    state.judgments = judgments;
    renderView();
    showFlash(
      ["connected", "ready"].includes(state.runyuAuth.status) ? state.runyuAuth.message : state.runyuAuth.message,
      ["connected", "ready"].includes(state.runyuAuth.status) ? "ok" : "error"
    );
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  }
}

async function verifyRunyuAuth() {
  showFlash("正在访问远端同步接口，检查访问凭证...");
  try {
    state.runyuAuth = await window.mainShell.verifyRunyuAuth();
    state.judgments = await window.mainShell.getJudgmentsStatus();
    if (["setup", "judgments", "dashboard"].includes(state.view)) renderView();
    showFlash(
      ["connected", "ready"].includes(state.runyuAuth.status) ? state.runyuAuth.message : `${state.runyuAuth.errorCode || "自检失败"}：${state.runyuAuth.message}`,
      ["connected", "ready"].includes(state.runyuAuth.status) ? "ok" : "error"
    );
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  }
}

async function bootstrapRunyuLibrary() {
  showFlash("正在验证远端同步接口并初始化本机缓存...");
  try {
    state.runyuAuth = await window.mainShell.bootstrapRunyuLibrary();
    state.judgments = await window.mainShell.getJudgmentsStatus();
    if (["setup", "judgments", "dashboard"].includes(state.view)) renderView();
    showFlash(
      state.runyuAuth.status === "ready" ? state.runyuAuth.message : `${state.runyuAuth.errorCode || "初始化失败"}：${state.runyuAuth.message}`,
      state.runyuAuth.status === "ready" ? "ok" : "error"
    );
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  }
}

async function clearRunyuLogin() {
  const confirmed = window.confirm("确定清除这台电脑保存的外部知识同步访问凭证吗？清除后需要重新配置。");
  if (!confirmed) return;
  showFlash("正在清除本机外部知识同步访问凭证...");
  try {
    state.runyuAuth = await window.mainShell.clearRunyuLogin();
    const [settings, judgments] = await Promise.all([
      window.mainShell.getSettings(),
      window.mainShell.getJudgmentsStatus()
    ]);
    state.settings = settings;
    state.judgments = judgments;
    renderView();
    showFlash("本机外部知识同步访问凭证已清除", "ok");
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  }
}

async function refreshJudgments() {
  const box = $("#judgmentResult");
  if (box) box.textContent = "正在保存配置并刷新本地缓存...";
  try {
    const payload = await saveJudgmentSettings({ message: "外部同步设置已保存，开始增量同步", render: false });
    const library = payload.config.judgmentLibrary;
    const result = await window.mainShell.refreshJudgments({
      keywords: library.refreshKeywords,
      sources: library.sources,
      searchTypes: library.searchTypes,
      limit: library.refreshLimit
    });
    state.judgments = await window.mainShell.getJudgmentsStatus();
    state.knowledgeOverview = await window.mainShell.getKnowledgeOverview().catch(() => state.knowledgeOverview);
    if (box) box.innerHTML = judgmentRefreshHtml(result);
    showFlash(result.ok ? `同步完成：新增 ${result.added || 0}，更新 ${result.updated || 0}` : result.message, result.ok ? "ok" : "error");
  } catch (error) {
    if (box) box.innerHTML = `<strong>失败：</strong><div class="hint">${escapeHtml(String(error?.message || error))}</div>`;
    showFlash(String(error?.message || error), "error");
  }
}

async function downloadAllJudgments() {
  const box = $("#judgmentResult");
  if (box) box.textContent = "正在保存配置并启动全局下载...";
  try {
    const payload = await saveJudgmentSettings({ message: "外部同步设置已保存，开始全部下载", render: false });
    const library = payload.config.judgmentLibrary;
    state.judgmentDownload = await window.mainShell.startJudgmentsFullDownload({
      keywords: library.refreshKeywords,
      sources: library.sources,
      searchTypes: library.searchTypes,
      fullDownloadPageLimit: library.fullDownloadPageLimit,
      fullDownloadMaxPages: library.fullDownloadMaxPages
    });
    if (box) box.innerHTML = judgmentRefreshHtml(state.judgmentDownload);
    renderJudgments();
    showFlash(state.judgmentDownload.ok ? "全局下载已开始" : state.judgmentDownload.message, state.judgmentDownload.ok ? "ok" : "error");
  } catch (error) {
    if (box) box.innerHTML = `<strong>失败：</strong><div class="hint">${escapeHtml(String(error?.message || error))}</div>`;
    showFlash(String(error?.message || error), "error");
  }
}

function pollJudgmentDownloadIfNeeded() {
  if (state.judgmentPollTimer) clearTimeout(state.judgmentPollTimer);
  if (state.view !== "judgments") return;
  const job = state.judgmentDownload || {};
  if (job.status !== "running") return;
  state.judgmentPollTimer = setTimeout(async () => {
    state.judgmentDownload = await window.mainShell.getJudgmentsDownloadStatus();
    state.judgments = await window.mainShell.getJudgmentsStatus();
    if (state.judgmentDownload.status !== "running") {
      state.knowledgeOverview = await window.mainShell.getKnowledgeOverview().catch(() => state.knowledgeOverview);
    }
    if (state.view === "judgments") renderJudgments();
  }, 1500);
}

function judgmentResultHtml(result) {
  const items = Array.isArray(result.results) ? result.results.slice(0, 10) : [];
  if (!result.ok && !items.length) {
    return `<strong>失败：</strong><div class="hint">${escapeHtml(result.message || result.error || "本机同步资料查询失败")}</div>`;
  }
  return `
    <strong>查询结果：${items.length} 条</strong>
    <div class="hint">本机命中 ${Number(result.fromCache || items.length || 0)}，生产远端查询 0${result.error ? `，错误：${escapeHtml(result.error)}` : ""}</div>
    <div class="judgment-results">
      ${items.map((item) => `
        <div class="judgment-item">
          <span class="badge judgment">${escapeHtml(item.source || "")}/${escapeHtml(item.type || "")}</span>
          <strong>${escapeHtml(item.title || "判断记录")}</strong>
          <div>${escapeHtml(item.text || item.searchText || "")}</div>
        </div>
      `).join("") || `<div class="empty">没有匹配结果，请换更宽泛的关键词。</div>`}
    </div>
  `;
}

function judgmentRefreshHtml(result) {
  return `
    <strong>${escapeHtml(result.status ? "下载状态" : "同步结果")}</strong>
    <div class="hint">拉取 ${Number(result.fetched || 0)} · 新增 ${Number(result.added || 0)} · 更新 ${Number(result.updated || 0)} · 不变 ${Number(result.unchanged || 0)} · 总计 ${Number(result.total || 0)}</div>
    ${result.cachePath ? `<div class="hint">缓存：${escapeHtml(result.cachePath)}</div>` : ""}
    ${result.current ? `<div class="hint">当前：${escapeHtml(result.current)}</div>` : ""}
    ${result.errors?.length ? `<div class="hint error-text">错误 ${result.errors.length} 条：${escapeHtml(result.errors.slice(-1)[0]?.message || result.errors.slice(-1)[0]?.error || "")}</div>` : ""}
  `;
}

async function saveWebhookSettings() {
  const webhookUrl = value("webhookUrl");
  const payload = {
    config: {
      notify: {
        enabled: checked("notifyEnabled") && Boolean(webhookUrl),
        wecomWebhookUrl: webhookUrl,
        cooldownMs: numberValue("notifyCooldown", 300000),
        successReplyMode: value("successReplyMode"),
        hourlySummaryEnabled: checked("hourlySummaryEnabled"),
        hourlySummaryIntervalHours: numberValue("hourlySummaryIntervalHours", 1),
        dailySummaryEnabled: checked("dailySummaryEnabled"),
        dailySummaryTime: value("dailySummaryTime") || "10:00",
        dailySummaryHour: parseInt(String(value("dailySummaryTime") || "10:00").split(":")[0], 10) || 10,
        summaryDetailLimit: numberValue("summaryDetailLimit", 12),
        eventRules: collectEventRules()
      }
    },
    env: {
      ...state.settings.env,
      wecomWebhookUrl: webhookUrl
    }
  };
  await saveSettings(payload, "Webhook 设置已保存");
  state.records = await window.mainShell.getReplyRecords({ limit: 300 });
}

async function saveFloatingSettings() {
  const payload = {
    config: {
      floatWindow: {
        enabled: checked("floatEnabled"),
        visible: state.status?.floating?.visible || false,
        alwaysOnTop: checked("alwaysOnTop"),
        mode: state.status?.floating?.mode === "mini" ? "mini" : "compact",
        compactSize: { width: 344, height: 256 },
        miniSize: { width: 244, height: 52 }
      }
    }
  };
  await saveSettings(payload, "悬浮窗设置已保存");
}

async function saveRules() {
  const bot = state.settings.config?.bot || {};
  commitExpandedRule();
  const nextBot = {
    rules: bot.rules || [],
    actionRules: bot.actionRules || [],
    imageReplies: bot.imageReplies || []
  };
  validateRuleLibrary(nextBot);
  await saveSettings({ config: { bot: nextBot } }, "规则库已保存");
  state.expandedRuleKey = "";
  renderRules();
}

async function saveSettings(payload, okMessage) {
  showFlash("正在保存...");
  try {
    state.settings = await window.mainShell.saveSettings(payload);
    state.status = state.settings.status || await window.mainShell.getStatus();
    state.workbench = window.mainShell.getWorkbenchSnapshot ? await window.mainShell.getWorkbenchSnapshot() : state.workbench;
    renderChrome();
    showFlash(okMessage || "设置已保存", "ok");
  } catch (error) {
    showFlash(String(error?.message || error), "error");
    throw error;
  }
}

async function refreshAll() {
  const [settings, status, records, judgments, judgmentDownload, workbench, menuModel, customerMemories] = await Promise.all([
    window.mainShell.getSettings(),
    window.mainShell.getStatus(),
    window.mainShell.getReplyRecords({ limit: 300 }),
    window.mainShell.getJudgmentsStatus(),
    window.mainShell.getJudgmentsDownloadStatus(),
    window.mainShell.getWorkbenchSnapshot ? window.mainShell.getWorkbenchSnapshot() : Promise.resolve(state.workbench),
    window.mainShell.getMenuModel ? window.mainShell.getMenuModel() : Promise.resolve(state.menuModel),
    window.mainShell.getCustomerMemories ? window.mainShell.getCustomerMemories({ limit: 200, query: state.memoryFilter || "" }) : Promise.resolve(state.customerMemories)
  ]);
  state.settings = settings;
  state.status = status;
  state.records = records;
  state.judgments = judgments;
  state.judgmentDownload = judgmentDownload;
  state.workbench = workbench;
  state.menuModel = menuModel;
  state.customerMemories = customerMemories;
  renderChrome();
  renderDesktopMenu();
  renderView();
  showFlash("已刷新", "ok");
}

async function captureStructureFromUi() {
  showFlash("正在捕捉页面结构...");
  const result = await window.mainShell.capturePageStructure();
  showFlash(result.ok ? `页面结构已保存：${result.count || 0} 个节点` : result.message, result.ok ? "ok" : "error");
}

async function checkAi() {
  showFlash("正在检查 AI...");
  const result = await window.mainShell.checkAi();
  state.status = await window.mainShell.getStatus();
  renderChrome();
  showFlash(result.ok ? `AI 正常：${result.message}` : `AI 异常：${result.message}`, result.ok ? "ok" : "error");
}

async function testAiReply() {
  const box = $("#aiTestResult");
  box.textContent = "正在请求 AI...";
  const result = await window.mainShell.testAiReply({ message: value("aiTestMessage"), mode: "deep" });
  box.innerHTML = result.ok
    ? `<strong>回复：</strong><div style="white-space:pre-wrap;margin-top:8px">${escapeHtml(result.reply || "")}</div>${renderAiTestTrace(result)}`
    : `<strong>失败：</strong><div class="hint">${escapeHtml(result.message || "")}</div>`;
  showFlash(result.ok ? "AI 测试成功" : result.message, result.ok ? "ok" : "error");
}

function renderAiTestTrace(result = {}) {
  const trace = result.trace || {};
  const badges = [];
  if (trace.model) badges.push(`模型 ${trace.model}`);
  if (trace.thinking) badges.push(trace.thinking === "disabled" ? "Thinking 关闭" : "Thinking 开启");
  if (trace.judgmentQueried) {
    badges.push(trace.judgmentUsed ? `同步资料 ${trace.judgmentCount || 0} 条` : "同步资料未命中");
    if (trace.judgmentFromCache) badges.push(`本地 ${trace.judgmentFromCache}`);
    if (trace.judgmentFromRemote) badges.push(`远端 ${trace.judgmentFromRemote}`);
  } else {
    badges.push("未用同步资料");
  }
  if (trace.reviewEnabled) badges.push(trace.reviewApplied ? "审核改写" : "审核通过");
  const latency = Number(result.latencyMs || trace.latencyMs || 0);
  if (latency) badges.push(`耗时 ${(latency / 1000).toFixed(1)} 秒`);
  const steps = [
    "发送测试",
    "收集上下文",
    trace.judgmentQueried ? (trace.judgmentUsed ? `同步资料命中${Number(trace.judgmentCount || 0)}条` : "同步资料未命中") : "未用同步资料",
    "调用远方AI API",
    trace.thinking === "disabled" ? "Thinking关闭" : "Thinking开启",
    trace.reviewEnabled ? (trace.reviewApplied ? "审核改写" : "审核通过") : "",
    "返回结果"
  ].filter(Boolean);
  return `
    <div class="badge-row log-trace-badges" style="margin-top:10px">
      ${badges.map((text) => `<span class="badge ai">${escapeHtml(text)}</span>`).join("")}
    </div>
    <div class="process-chain">${steps.map((step, index) => `<span>${index + 1}. ${escapeHtml(step)}</span>`).join("")}</div>
    ${trace.judgmentError ? `<div class="hint fail-text">同步资料错误：${escapeHtml(trace.judgmentError)}</div>` : ""}
  `;
}

async function testWebhook() {
  showFlash("正在测试 Webhook...");
  const result = await window.mainShell.testWebhook(value("webhookUrl"));
  showFlash(result.message || (result.ok ? "Webhook 正常" : "Webhook 失败"), result.ok ? "ok" : "error");
}

async function loadLogsFromFilters() {
  state.records = await window.mainShell.getReplyRecords({
    limit: 500,
    kind: value("logKind") || "all",
    sourceType: value("logSource") || "all"
  });
  renderLogs();
}

function bindRuleActions() {
  $("#saveRules").addEventListener("click", () => {
    try {
      saveRules();
    } catch (error) {
      showFlash(String(error?.message || error), "error");
    }
  });
  $("#validateRules").addEventListener("click", () => {
    try {
      validateRuleLibrary({
        ...state.settings.config.bot
      });
      showFlash("规则检查通过", "ok");
    } catch (error) {
      showFlash(String(error?.message || error), "error");
    }
  });
  $("#addRule").addEventListener("click", () => {
    const bot = state.settings.config.bot;
    const type = newRuleStorageType();
    const list = Array.isArray(bot[type]) ? bot[type] : [];
    const rule = defaultRule(type, state.ruleFilter);
    list.push(rule);
    bot[type] = list;
    state.expandedRuleKey = `${type}:${list.length - 1}`;
    renderRules();
  });
  $("#applyAdvancedRules")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse($("#advancedRulesJson").value || "[]");
      if (!Array.isArray(parsed)) throw new Error("当前分类 JSON 必须是数组");
      state.settings.config.bot[currentRuleStorageType()] = parsed;
      state.expandedRuleKey = "";
      renderRules();
      showFlash("JSON 已应用到当前分类，请点击保存规则库", "ok");
    } catch (error) {
      showFlash(String(error?.message || error), "error");
    }
  });
  $("#ruleList").addEventListener("click", async (event) => {
    const commandNode = event.target?.closest?.("[data-rule-command]");
    const command = commandNode?.dataset?.ruleCommand || "";
    if (!command) {
      const card = event.target.closest(".rule-card");
      if (card && !event.target.closest("input, textarea, select, button")) {
        commitExpandedRule();
        state.expandedRuleKey = card.dataset.ruleKey || "";
        renderRules();
      }
      return;
    }
    if (command === "choose-path") {
      event.preventDefault();
      const fieldNode = commandNode.closest(".path-field");
      const input = $("input", fieldNode);
      const row = commandNode.closest(".action-row");
      const actionType = row ? inputValue($("[data-action-field='type']", row)) : "";
      const configuredKind = fieldNode?.dataset.pathKind || "file";
      const kind = configuredKind === "auto" && actionType === "image" ? "image" : configuredKind === "image" ? "image" : "file";
      const picked = await window.mainShell.chooseFile({ kind });
      if (picked && input) {
        input.value = picked;
        await hydrateRulePreviews(commandNode.closest(".action-row") || commandNode.closest(".rule-card"));
        showFlash(kind === "image" ? "图片路径已更新，记得保存规则库" : "文件路径已更新，记得保存规则库", "ok");
      }
      return;
    }
    if (command === "reveal-path") {
      event.preventDefault();
      const fieldNode = commandNode.closest(".path-field");
      const input = $("input", fieldNode);
      const targetPath = inputValue(input);
      if (!targetPath) {
        showFlash("路径为空，先选择或填写文件路径", "error");
        return;
      }
      const result = await window.mainShell.revealPath(targetPath);
      showFlash(result.ok ? (result.missing ? "文件不存在，已打开所在目录" : "已打开文件所在位置") : result.message, result.ok ? "ok" : "error");
      return;
    }
    const card = commandNode.closest(".rule-card");
    const index = Number(card?.dataset.index || -1);
    const type = card?.dataset.ruleType || currentRuleStorageType();
    const list = state.settings.config.bot[type] || [];
    if (command === "expand" && index >= 0) {
      const nextKey = card.dataset.ruleKey || `${type}:${index}`;
      if (state.expandedRuleKey === nextKey) {
        commitExpandedRule();
        state.expandedRuleKey = "";
      } else {
        commitExpandedRule();
        state.expandedRuleKey = nextKey;
      }
      renderRules();
      return;
    }
    if (command === "cancel-edit") {
      state.expandedRuleKey = "";
      renderRules();
      return;
    }
    if (command === "save-one" && index >= 0) {
      commitRuleCard(card);
      try {
        validateRuleLibrary(state.settings.config.bot);
        saveSettings({ config: { bot: { rules: state.settings.config.bot.rules, actionRules: state.settings.config.bot.actionRules, imageReplies: state.settings.config.bot.imageReplies } } }, "当前规则已保存")
          .then(() => {
            state.expandedRuleKey = "";
            renderRules();
          })
          .catch(() => {});
      } catch (error) {
        showFlash(String(error?.message || error), "error");
      }
      return;
    }
    if (command === "delete" && index >= 0) {
      if (!window.confirm(`确定删除规则“${list[index]?.name || "未命名规则"}”吗？`)) return;
      list.splice(index, 1);
      state.expandedRuleKey = "";
      renderRules();
      return;
    }
    if (command === "duplicate" && index >= 0) {
      const copy = cloneJson(list[index]);
      copy.name = uniqueRuleName(`${copy.name || "未命名规则"} - 复用`, list);
      copy.updatedAt = Date.now();
      list.splice(index + 1, 0, copy);
      state.expandedRuleKey = `${type}:${index + 1}`;
      renderRules();
      return;
    }
    if (command === "toggle-enabled" && index >= 0) {
      list[index].enabled = list[index].enabled === false;
      list[index].updatedAt = Date.now();
      renderRules();
      return;
    }
    if (command === "add-action") {
      $(".action-list", card).insertAdjacentHTML("beforeend", renderActionRow({ type: "text", text: "" }, $$(".action-row", card).length));
    }
    if (command === "remove-action") {
      const row = commandNode.closest(".action-row");
      row?.remove();
    }
  });
  $("#ruleList").addEventListener("change", (event) => {
    if (!event.target?.matches?.("[data-action-field='type']")) return;
    commitRuleCard(event.target.closest(".rule-card"));
    renderRules();
  });
}

async function runRuleTriggerTest(execute) {
  const message = value("ruleTestMessage");
  if (!message) {
    showFlash("请先输入客户消息", "error");
    return;
  }
  showFlash(execute ? "正在真实执行命中规则..." : "正在测试规则匹配...");
  try {
    state.ruleTestResult = await window.mainShell.testRuleTrigger({ message, execute });
    $("#ruleTestResult").innerHTML = renderRuleTestResult(state.ruleTestResult);
    showFlash(state.ruleTestResult.ok ? (execute ? "规则已执行" : "匹配测试完成") : state.ruleTestResult.message, state.ruleTestResult.ok ? "ok" : "error");
  } catch (error) {
    state.ruleTestResult = { ok: false, matched: false, message: String(error?.message || error), processSteps: ["输入消息", "测试失败"] };
    $("#ruleTestResult").innerHTML = renderRuleTestResult(state.ruleTestResult);
    showFlash(String(error?.message || error), "error");
  }
}

async function hydrateRulePreviews(scope = document) {
  const previews = Array.from(scope.querySelectorAll?.(".image-preview") || []);
  await Promise.all(previews.map(async (preview) => {
    const row = preview.closest(".action-row, .rule-card");
    const path = inputValue($("[data-action-field='path']", row));
    const frame = $(".image-preview-frame", preview);
    const meta = $(".image-preview-meta", preview);
    if (!path) {
      frame.innerHTML = "<span>尚未选择图片</span>";
      meta.textContent = "选择图片后会在这里显示缩略图";
      return;
    }
    frame.innerHTML = "<span>正在读取图片</span>";
    meta.textContent = path;
    const result = await window.mainShell.getFilePreview(path).catch((error) => ({ ok: false, message: String(error?.message || error) }));
    if (!result?.ok) {
      frame.innerHTML = `<span>${escapeHtml(result?.message || "图片无法预览")}</span>`;
      return;
    }
    frame.innerHTML = `<img src="${attr(result.dataUrl)}" alt="规则回复图片预览">`;
    meta.textContent = result.path || path;
  }));
}

function collectRulesFromDom(type) {
  commitExpandedRule();
  return cloneJson(state.settings.config.bot[type] || []);
}

function commitExpandedRule() {
  const card = $(".rule-card.expanded");
  if (card) commitRuleCard(card);
}

function commitRuleCard(card) {
  if (!card || !$(".rule-editor", card)) return null;
  const type = card.dataset.ruleType;
  const index = Number(card.dataset.index || 0);
  const list = state.settings.config.bot[type] || [];
  const base = cloneJson(list[index] || {});
  const enabledInput = $("[data-rule-field='enabled']", card);
  base.enabled = enabledInput ? enabledInput.checked : true;
  base.name = inputValue($("[data-rule-field='name']", card));
  base.keywords = splitKeywords(inputValue($("[data-rule-field='keywords']", card)));
  base.mode = inputValue($("[data-rule-field='mode']", card)) || "final";
  base.updatedAt = Date.now();

  if (type === "rules") {
    base.reply = inputValue($("[data-rule-field='reply']", card));
  } else if (type === "imageReplies") {
    base.path = inputValue($("[data-rule-field='path']", card));
    base.caption = inputValue($("[data-rule-field='caption']", card));
  } else {
    base.actions = $$(".action-row", card).map((row, actionIndex) => collectActionRow(row, base.actions?.[actionIndex] || {})).filter(Boolean);
  }
  list[index] = base;
  state.settings.config.bot[type] = list;
  return base;
}

function collectActionRow(row, original) {
  const type = inputValue($("[data-action-field='type']", row)) || "text";
  const text = inputValue($("[data-action-field='text']", row));
  const path = inputValue($("[data-action-field='path']", row));
  const productId = inputValue($("[data-action-field='productId']", row));
  const productName = inputValue($("[data-action-field='productName']", row));
  const button = inputValue($("[data-action-field='button']", row));
  const action = { ...original, type };

  delete action.text;
  delete action.reply;
  delete action.path;
  delete action.filePath;
  delete action.imagePath;
  delete action.productId;
  delete action.productName;
  delete action.button;
  delete action.label;
  delete action.tab;

  if (["text"].includes(type)) action.text = text;
  if (["image", "file"].includes(type)) action.path = path;
  if (["product"].includes(type)) {
    if (productId) action.productId = productId;
    if (productName) action.productName = productName;
    action.button = button || "发商品";
  }
  if (["material", "quick_reply"].includes(type)) {
    if (text) action.query = text;
    action.button = button || "发送";
  }
  if (type === "click") {
    if (text) action.text = text;
  }
  if (type === "wait") {
    action.ms = Number(text || original.ms || 500);
  }
  return action;
}

function validateRuleLibrary(bot) {
  const textRules = Array.isArray(bot.rules) ? bot.rules : [];
  const actionRules = Array.isArray(bot.actionRules) ? bot.actionRules : [];
  const imageReplies = Array.isArray(bot.imageReplies) ? bot.imageReplies : [];

  for (const [label, list] of [["文字规则", textRules], ["动作规则", actionRules], ["图片规则", imageReplies]]) {
    list.forEach((rule, index) => {
      if (!rule.name) throw new Error(`${label}第 ${index + 1} 条缺少规则名称`);
      if (!splitKeywords(rule.keywords).length) throw new Error(`${label}「${rule.name}」缺少关键词`);
      if (label === "文字规则" && !String(rule.reply || "").trim()) throw new Error(`文字规则「${rule.name}」缺少回复文本`);
      if (label === "图片规则" && !String(rule.path || rule.imagePath || "").trim()) throw new Error(`图片规则「${rule.name}」缺少图片路径`);
      if (label === "动作规则" && (!Array.isArray(rule.actions) || !rule.actions.length)) throw new Error(`动作规则「${rule.name}」缺少动作`);
    });
  }
}

function defaultRule(type, filter = "") {
  if (type === "rules") {
    return { enabled: true, name: "新文字规则", keywords: ["关键词"], reply: "这里写回复", mode: "final", updatedAt: Date.now() };
  }
  if (type === "imageReplies") {
    return { enabled: true, name: "新图片规则", keywords: ["关键词"], path: "config/reply-images/image1.png", caption: "", mode: "final", updatedAt: Date.now() };
  }
  const action = filter === "file"
    ? { type: "file", path: "" }
    : filter === "product"
      ? { type: "product", button: "发商品", productId: "", productName: "" }
      : filter === "invite"
        ? { type: "product", button: "邀请下单", productId: "", productName: "" }
        : { type: "text", text: "这里写回复" };
  return {
    enabled: true,
    name: "新动作规则",
    keywords: ["关键词"],
    mode: filter === "file" || filter === "product" || filter === "invite" ? "action_only" : "final",
    updatedAt: Date.now(),
    actions: [action]
  };
}

function ruleFilterButton(id, label) {
  return `<button type="button" data-rule-filter="${id}" class="${state.ruleFilter === id ? "active" : ""}">${escapeHtml(label)}</button>`;
}

function visibleRuleEntries(bot = {}, filter = "all") {
  const entries = [
    ...(bot.rules || []).map((rule, index) => ({ type: "rules", rule, index })),
    ...(bot.actionRules || []).map((rule, index) => ({ type: "actionRules", rule, index })),
    ...(bot.imageReplies || []).map((rule, index) => ({ type: "imageReplies", rule, index }))
  ];
  if (filter === "all") return entries;
  if (filter === "text") return entries.filter((item) => item.type === "rules");
  if (filter === "image") return entries.filter((item) => item.type === "imageReplies" || ruleHasAction(item.rule, "image"));
  if (filter === "action") return entries.filter((item) => item.type === "actionRules");
  if (filter === "file") return entries.filter((item) => ruleHasAction(item.rule, "file"));
  if (filter === "product") return entries.filter((item) => ruleHasProductAction(item.rule, false));
  if (filter === "invite") return entries.filter((item) => ruleHasProductAction(item.rule, true));
  return entries;
}

function currentRuleStorageType() {
  if (state.ruleFilter === "text") return "rules";
  if (state.ruleFilter === "image") return "imageReplies";
  return "actionRules";
}

function newRuleStorageType() {
  return currentRuleStorageType();
}

function ruleHasAction(rule = {}, type = "") {
  return Array.isArray(rule.actions) && rule.actions.some((action) => String(action?.type || "") === type);
}

function ruleHasProductAction(rule = {}, invite = false) {
  return Array.isArray(rule.actions) && rule.actions.some((action) => {
    if (String(action?.type || "") !== "product") return false;
    return /邀请下单/.test(String(action.button || "")) === invite;
  });
}

function ruleSummary(type, rule = {}) {
  if (type === "rules") return "发送文字";
  if (type === "imageReplies") return "发送图片";
  return actionSummary(rule.actions || []) || "未配置动作";
}

function uniqueRuleName(base, list = []) {
  const names = new Set(list.map((item) => String(item?.name || "")));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function renderRuleCandidatesSummary() {
  const candidates = state.status?.ruleCandidates || {};
  return `<section class="card"><div class="section-title"><div><h3>规则候选池</h3><div class="hint">AI 成功回复形成的候选必须人工审核后才能进入正式规则库。</div></div></div><div class="knowledge-list">${knowledgeStatusRow("待审核", String(candidates.pendingReview || 0), Number(candidates.pendingReview || 0) === 0)}${knowledgeStatusRow("候选总数", String(candidates.total || 0), true)}</div></section>`;
}

function knowledgeRuleStats(bot = {}) {
  const textRules = Array.isArray(bot.rules) ? bot.rules : [];
  const actionRules = Array.isArray(bot.actionRules) ? bot.actionRules : [];
  const imageRules = Array.isArray(bot.imageReplies) ? bot.imageReplies : [];
  const all = [...textRules, ...actionRules, ...imageRules];
  return {
    total: all.length,
    enabled: all.filter((item) => item?.enabled !== false).length,
    disabled: all.filter((item) => item?.enabled === false).length,
    text: textRules.length,
    action: actionRules.length,
    image: imageRules.length + actionRules.filter((item) => ruleHasAction(item, "image")).length,
    file: actionRules.filter((item) => ruleHasAction(item, "file")).length,
    product: actionRules.filter((item) => ruleHasProductAction(item, false)).length,
    invite: actionRules.filter((item) => ruleHasProductAction(item, true)).length
  };
}

function overviewButton(title, value, hint, view, filter = "") {
  return `<button type="button" class="card metric overview-button" data-overview-view="${view}" ${filter ? `data-rule-filter="${filter}"` : ""}><span>${escapeHtml(title)}</span><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(hint || "")}</span></button>`;
}

function knowledgeSummaryRow(label, count, view, filter) {
  return `<button type="button" class="knowledge-row" data-overview-view="${view}" data-rule-filter="${filter}"><span>${escapeHtml(label)}</span><strong>${Number(count || 0)}</strong><span>查看</span></button>`;
}

function knowledgeStatusRow(label, value, ok = true) {
  return `<div class="knowledge-row status"><span class="signal"><i class="dot ${ok ? "" : "warn"}"></i>${escapeHtml(label)}</span><strong>${escapeHtml(String(value || ""))}</strong></div>`;
}

async function runInlineKnowledgeSearch(includeExternal) {
  const host = $("#externalKnowledgeBrowser");
  if (!host) return;
  const query = window.prompt("输入要查询的资料关键词", "会员");
  if (!query) return;
  host.innerHTML = `<div class="hint">正在查询本机索引...</div>`;
  const result = await window.mainShell.searchLocalKnowledge({ query, includeExternal, limit: 12 });
  const items = includeExternal ? result.externalSynced || [] : result.local || [];
  host.innerHTML = items.length
    ? items.map(renderKnowledgeHit).join("")
    : `<div class="empty">${escapeHtml(result.message || "本机索引没有匹配资料")}</div>`;
}

async function runPipelineTest(execute) {
  const mode = value("pipelineTestMode") || "smart_route";
  const message = value("pipelineTestMessage");
  if (!message) {
    showFlash("请先输入客户测试消息", "error");
    return;
  }
  if (execute && mode !== "rule_action") {
    showFlash("真实执行只适用于规则动作模式", "error");
    return;
  }
  if (execute && !window.confirm("真实执行会向当前选中的客服会话发送规则动作。请确认已经选中测试会话，继续执行吗？")) return;
  const host = $("#pipelineTestResult");
  host.innerHTML = `<div class="hint">正在运行${execute ? "真实动作" : "模拟"}测试...</div>`;
  try {
    state.pipelineTestResult = await window.mainShell.testReplyPipeline({ mode, message, execute });
    host.innerHTML = renderPipelineTestResult(state.pipelineTestResult);
    showFlash(state.pipelineTestResult.ok ? "测试完成" : (state.pipelineTestResult.warnings?.[0] || "测试失败"), state.pipelineTestResult.ok ? "ok" : "error");
  } catch (error) {
    state.pipelineTestResult = { ok: false, mode, warnings: [String(error?.message || error)], trace: { remoteRequestMade: false } };
    host.innerHTML = renderPipelineTestResult(state.pipelineTestResult);
    showFlash(String(error?.message || error), "error");
  }
}

function renderPipelineTestResult(result = {}) {
  const local = result.knowledgeHits?.local || [];
  const external = result.knowledgeHits?.externalSynced || [];
  const trace = result.trace || {};
  return `
    <div class="section-title"><div><h3>${result.ok ? "测试完成" : "测试失败"}</h3><div class="hint">${escapeHtml(result.mode || "")}</div></div><span class="badge ${result.ok ? "rule" : "fail"}">${result.ok ? "通过" : "失败"}</span></div>
    <div class="badge-row">
      <span class="badge">路径 ${escapeHtml(result.route || "未确定")}</span>
      <span class="badge ${trace.remoteRequestMade ? "fail" : "rule"}">远端生产查询 ${trace.remoteRequestMade ? "发生" : "未发生"}</span>
      ${result.matchedRule ? `<span class="badge rule">规则 ${escapeHtml(result.matchedRule.name || "")}</span>` : ""}
      ${trace.model ? `<span class="badge ai">模型 ${escapeHtml(trace.model)}</span>` : ""}
      ${trace.latencyMs ? `<span class="badge">耗时 ${(Number(trace.latencyMs) / 1000).toFixed(1)} 秒</span>` : ""}
    </div>
    ${result.reply ? `<div class="field" style="margin-top:12px"><label>预计回复</label><div class="readonly-box">${escapeHtml(result.reply)}</div></div>` : ""}
    ${Array.isArray(result.actions) && result.actions.length ? `<div class="field" style="margin-top:12px"><label>预计动作</label><div class="badge-row">${result.actions.map((action) => `<span class="badge">${escapeHtml(actionSummary([action]) || action.type || "动作")}</span>`).join("")}</div></div>` : ""}
    <div class="grid cols-2" style="margin-top:12px">
      <div><h3>本机自建资料 ${local.length}</h3>${local.length ? local.map(renderKnowledgeHit).join("") : `<div class="hint">没有命中</div>`}</div>
      <div><h3>外部同步资料 ${external.length}</h3>${external.length ? external.map(renderKnowledgeHit).join("") : `<div class="hint">没有命中或此模式未启用</div>`}</div>
    </div>
    ${result.warnings?.length ? `<div class="fail-text">${result.warnings.map(escapeHtml).join("；")}</div>` : ""}
  `;
}

function renderKnowledgeHit(item = {}) {
  return `<article class="knowledge-hit"><div class="badge-row"><span class="badge">${escapeHtml(item.origin === "external_sync" ? "外部同步" : item.origin === "manual" ? "手动资料" : "本机文件")}</span><span class="badge">${escapeHtml(item.source || "")}</span><span class="badge">${escapeHtml(item.type || "")}</span></div><strong>${escapeHtml(item.title || "参考资料")}</strong><p>${escapeHtml(String(item.text || "").slice(0, 260))}</p></article>`;
}

function bindToggleButtons() {
  $$(".toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const on = button.getAttribute("aria-checked") !== "true";
      button.setAttribute("aria-checked", String(on));
      button.classList.toggle("on", on);
      const input = $(`#${button.dataset.target}`);
      if (input) input.checked = on;
    });
  });
}

function collectEventRules() {
  return Object.fromEntries($$("[data-event-rule]").map((input) => [input.dataset.eventRule, input.checked]));
}

function pageHead(title, description, actions = "") {
  return `
    <div class="page-head">
      <div>
        <h2>${escapeHtml(title)}</h2>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>
      ${actions ? `<div class="toolbar">${actions}</div>` : ""}
    </div>
  `;
}

function svgIcon(name) {
  return icons[name] || icons.edit || "";
}

function iconButton(name, label, attrs = "", className = "") {
  return `<button type="button" class="icon-button ${className}" title="${attr(label)}" aria-label="${attr(label)}" ${attrs}>${svgIcon(name)}</button>`;
}

function iconTextButton(name, label, attrs = "") {
  const classMatch = String(attrs || "").match(/\sclass="([^"]*)"/);
  const extraClass = classMatch ? classMatch[1] : "";
  const safeAttrs = classMatch ? String(attrs || "").replace(classMatch[0], "") : String(attrs || "");
  return `<button type="button" class="icon-text-button ${attr(extraClass)}" title="${attr(label)}" ${safeAttrs}>${svgIcon(name)}<span>${escapeHtml(label)}</span></button>`;
}

function visualStatTile(iconName, title, value, hint, tone = "ok", detailKey = "") {
  const percent = Math.max(6, Math.min(100, Number(value || 0) ? 72 : 16));
  return `
    <button type="button" class="visual-tile ${tone || "ok"}" ${detailKey ? `data-dashboard-detail="${attr(detailKey)}"` : ""}>
      <span class="tile-icon">${svgIcon(iconName)}</span>
      <span class="tile-copy">
        <span>${escapeHtml(title)}</span>
        <strong>${escapeHtml(String(value))}</strong>
        <small>${escapeHtml(hint || "")}</small>
      </span>
      <span class="tile-meter"><i style="width:${percent}%"></i></span>
    </button>
  `;
}

function renderMarkdown(markdown = "") {
  const source = String(markdown || "").trim();
  if (!source) return `<p class="hint">未填写</p>`;
  const inline = (text) => escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  const blocks = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      blocks.push("</ul>");
      inList = false;
    }
  };
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      blocks.push(`<h4>${inline(line.slice(4))}</h4>`);
    } else if (line.startsWith("## ")) {
      closeList();
      blocks.push(`<h3>${inline(line.slice(3))}</h3>`);
    } else if (line.startsWith("# ")) {
      closeList();
      blocks.push(`<h3>${inline(line.slice(2))}</h3>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        blocks.push("<ul>");
        inList = true;
      }
      blocks.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (line.startsWith("> ")) {
      closeList();
      blocks.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    } else {
      closeList();
      blocks.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return blocks.join("");
}

function metricCard(title, value, hint, level = "ok") {
  const dotClass = runtimeTone(level) === "ok" ? "" : runtimeTone(level);
  return `
    <div class="card metric">
      <span class="signal"><i class="dot ${dotClass}"></i>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(hint || "")}</span>
    </div>
  `;
}

function runtimeTone(value) {
  const tone = String(value || "").trim();
  return ["ok", "warn", "bad", "active"].includes(tone) ? tone : "warn";
}

function shortStatus(value) {
  return Array.from(String(value || "检测中").replace(/\s+/g, "")).slice(0, 6).join("");
}

function shortText(value) {
  const text = String(value || "").trim();
  return text.length > 14 ? `${text.slice(0, 14)}...` : text || "等待状态";
}

function runtimeTrailHtml(history) {
  const items = (Array.isArray(history) ? history : []).slice(-6).reverse();
  if (!items.length) return `<div class="empty">暂无步骤</div>`;
  return items.map((item) => `
    <div class="runtime-step" title="${escapeHtml(item.detail || "")}">
      <i class="dot ${runtimeTone(item.tone) === "ok" ? "" : runtimeTone(item.tone)}"></i>
      <div>
        <strong>${escapeHtml(shortStatus(item.label || item.status || "检测中"))}</strong>
        <span>${escapeHtml(formatFullTime(item.at || Date.now()))}</span>
      </div>
    </div>
  `).join("");
}

function sourceStatsBadges(bySource) {
  const entries = Object.entries(bySource || {}).filter(([, count]) => count);
  if (!entries.length) return `<span class="badge">暂无来源数据</span>`;
  return entries.map(([source, count]) => {
    const meta = sourceLabels[source] || sourceLabels.unknown;
    return `<span class="badge ${meta.className}">${escapeHtml(meta.label)} ${count}</span>`;
  }).join("");
}

function sourceStatsBars(bySource) {
  const entries = Object.entries(bySource || {}).filter(([, count]) => Number(count || 0) > 0);
  const total = entries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
  if (!entries.length) return `<div class="empty">暂无来源数据。</div>`;
  return `
    <div class="source-bars">
      ${entries.map(([source, count]) => {
        const meta = sourceLabels[source] || sourceLabels.unknown;
        const percent = total ? Math.max(4, Math.round(Number(count || 0) / total * 100)) : 0;
        return `<div class="source-bar"><div><span>${escapeHtml(meta.label)}</span><strong>${Number(count || 0)}</strong></div><i><b class="${meta.className || ""}" style="width:${percent}%"></b></i></div>`;
      }).join("")}
    </div>
  `;
}

function dashboardIssueList() {
  const workbench = state.workbench || {};
  const issues = Array.isArray(workbench.healthIssues) ? workbench.healthIssues : [];
  const outbox = Array.isArray(workbench.notifyOutbox) ? workbench.notifyOutbox : [];
  const items = [
    ...issues.map((item) => ({ kind: "异常", title: item.title || item.key, body: item.body || "", tone: "fail" })),
    ...outbox.slice(0, 6).map((item) => ({ kind: "补发", title: item.title || "通知待补发", body: item.error || item.body || "", tone: "direct" }))
  ];
  if (!items.length) return `<div class="empty">暂无健康异常和待补发通知。</div>`;
  return `<div class="knowledge-list">${items.slice(0, 8).map((item) => `<div class="knowledge-row status"><span class="badge ${item.tone}">${escapeHtml(item.kind)}</span><strong>${escapeHtml(item.title || "")}</strong><span>${escapeHtml(item.body || "")}</span></div>`).join("")}</div>`;
}

function dashboardDetailPayload(key = "") {
  const status = state.status || {};
  const workbench = state.workbench || {};
  const map = {
    runtime: { title: "当前步骤", data: status.bot || {} },
    bot: { title: "Bot接管", data: { enabled: status.enabled, bot: status.bot, tasks: status.replyTasks } },
    ai: { title: "AI API", data: status.ai || {} },
    webhook: { title: "Webhook", data: { notify: status.notify, outbox: workbench.notifyOutbox || [] } },
    judgments: { title: "外部同步资料", data: state.judgments || {} },
    page: { title: "客服页", data: status.page || {} },
    floating: { title: "悬浮窗", data: status.floating || {} },
    watchdog: { title: "长期运行", data: status.watchdog || {} },
    records: { title: "回复记录", data: status.records || {} },
    tasks: { title: "当前任务", data: { summary: status.replyTasks || {}, recent: workbench.replyTasks?.recent || [] } },
    delayed: { title: "延迟任务", data: { summary: status.replyTasks || {}, recent: workbench.replyTasks?.recent || [] } },
    candidates: { title: "规则候选", data: { summary: status.ruleCandidates || {}, recent: workbench.ruleCandidates?.recent || [] } },
    "memory-total": { title: "客户记忆", data: state.customerMemories || workbench.customerMemories || {} },
    "memory-compress": { title: "待压缩记忆", data: state.customerMemories || workbench.customerMemories || {} },
    "memory-open": { title: "未完成客户任务", data: state.customerMemories || workbench.customerMemories || {} },
    "memory-errors": { title: "客户记忆错误", data: state.customerMemories || workbench.customerMemories || {} }
  };
  return map[key] || { title: key || "状态详情", data: {} };
}

function renderDashboardDetail(payload = {}) {
  return `
    <h3>${escapeHtml(payload.title || "状态详情")}</h3>
    <div class="hint">这里展示后台快照中的原始字段，便于定位问题。</div>
    <div class="detail-block">
      <strong>数据快照</strong>
      <pre class="json-preview">${escapeHtml(JSON.stringify(payload.data || {}, null, 2))}</pre>
    </div>
  `;
}

function toggleRow(id, title, hint, on, extraClass = "", extraAttrs = "") {
  return `
    <div class="switch-row ${extraClass}">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <div class="hint">${escapeHtml(hint || "")}</div>
      </div>
      <input id="${id}" type="checkbox" ${on ? "checked" : ""} ${extraAttrs}>
    </div>
  `;
}

function eventToggle(key, title, on) {
  return `
    <div class="switch-row">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <div class="hint">控制该类事件是否推送到企业微信。</div>
      </div>
      <input type="checkbox" data-event-rule="${key}" ${on ? "checked" : ""}>
    </div>
  `;
}

function checkboxChoice(name, value, label, on) {
  const id = `${name}-${value}`;
  return `
    <label class="choice" for="${id}">
      <input id="${id}" type="checkbox" name="${name}" value="${attr(value)}" ${on ? "checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function field(id, label, currentValue, hint, extraClass = "", extraAttrs = "") {
  const idAttr = id ? `id="${id}"` : "";
  return `
    <div class="field ${extraClass}">
      <label ${id ? `for="${id}"` : ""}>${escapeHtml(label)}</label>
      <input ${idAttr} value="${attr(currentValue)}" ${extraAttrs}>
      ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
}

function passwordField(id, label, currentValue, hint, extraClass = "", extraAttrs = "") {
  const idAttr = id ? `id="${id}"` : "";
  return `
    <div class="field ${extraClass}">
      <label ${id ? `for="${id}"` : ""}>${escapeHtml(label)}</label>
      <input ${idAttr} type="password" value="${attr(currentValue)}" ${extraAttrs}>
      ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
}

function pathField(id, label, currentValue, hint, extraClass = "", extraAttrs = "", kind = "file") {
  const idAttr = id ? `id="${id}"` : "";
  return `
    <div class="field path-field ${extraClass}" data-path-kind="${attr(kind)}">
      <label ${id ? `for="${id}"` : ""}>${escapeHtml(label)}</label>
      <div class="path-control">
        <input ${idAttr} value="${attr(currentValue)}" ${extraAttrs}>
        <button type="button" data-rule-command="choose-path">选择/替换</button>
        <button type="button" data-rule-command="reveal-path">打开位置</button>
      </div>
      ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
}

function numberField(id, label, currentValue, hint, extraClass = "", extraAttrs = "") {
  const idAttr = id ? `id="${id}"` : "";
  return `
    <div class="field ${extraClass}">
      <label ${id ? `for="${id}"` : ""}>${escapeHtml(label)}</label>
      <input ${idAttr} type="number" value="${attr(currentValue)}" ${extraAttrs}>
      ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
}

function textareaField(id, label, currentValue, hint, extraClass = "", extraAttrs = "") {
  const idAttr = id ? `id="${id}"` : "";
  return `
    <div class="field ${extraClass}">
      <label ${id ? `for="${id}"` : ""}>${escapeHtml(label)}</label>
      <textarea ${idAttr} ${extraAttrs}>${escapeHtml(currentValue)}</textarea>
      ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
}

function selectField(id, label, currentValue, options, hint, extraClass = "", extraAttrs = "") {
  const idAttr = id ? `id="${id}"` : "";
  return `
    <div class="field ${extraClass}">
      <label ${id ? `for="${id}"` : ""}>${escapeHtml(label)}</label>
      <select ${idAttr} ${extraAttrs}>
        ${options.map(([value, text]) => `<option value="${attr(value)}" ${String(value) === String(currentValue) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
      </select>
      ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
}

function checked(id) {
  return Boolean($(`#${id}`)?.checked);
}

function collectCheckedChoices(name) {
  return $$(`input[name="${name}"]:checked`).map((input) => input.value).filter(Boolean);
}

function value(id) {
  return String($(`#${id}`)?.value || "").trim();
}

function inputValue(input) {
  return String(input?.value || "").trim();
}

function numberValue(id, fallback) {
  const number = Number(value(id));
  return Number.isFinite(number) ? number : fallback;
}

function splitKeywords(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function keywordsText(value) {
  return splitKeywords(value).join("\n");
}

function splitReplyList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/\n{2,}|[|｜]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function replyListText(value, fallback = "") {
  const items = splitReplyList(value);
  if (items.length) return items.join("\n\n");
  return String(fallback || "");
}

function actionSummary(actions) {
  if (!Array.isArray(actions) || !actions.length) return "";
  return actions.map((action) => {
    if (action.type === "product") return `${action.button || "发商品"} ${action.productId || action.productName || ""}`.trim();
    if (action.type === "image") return `图片 ${action.path || action.imagePath || ""}`.trim();
    if (action.type === "file") return `文件 ${action.path || action.filePath || ""}`.trim();
    if (action.type === "text") return action.text || action.reply || "文字";
    return action.type || "动作";
  }).join(" / ");
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatFullTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function lastRefreshSummary(refresh) {
  if (!refresh) return "还没有刷新记录";
  return [
    refresh.reason ? `方式 ${refresh.reason}` : "",
    `新增 ${Number(refresh.added || 0)}`,
    `更新 ${Number(refresh.updated || 0)}`,
    refresh.errors?.length ? `错误 ${refresh.errors.length}` : ""
  ].filter(Boolean).join(" / ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function attr(value) {
  return escapeHtml(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function showFlash(message, type = "") {
  flash.textContent = message || "";
  flash.className = `flash show ${type}`;
  clearTimeout(showFlash.timer);
  showFlash.timer = setTimeout(() => {
    flash.className = "flash";
  }, 3000);
}
