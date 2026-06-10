const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const navItems = [
  { id: "page", title: "客服页映射", hint: "聊天" },
  { id: "dashboard", title: "总览状态", hint: "监控" },
  { id: "bot", title: "Bot 接管", hint: "开关" },
  { id: "api", title: "API 接入", hint: "模型" },
  { id: "webhook", title: "Webhook", hint: "通知" },
  { id: "rules", title: "规则库", hint: "回复" },
  { id: "logs", title: "日志库", hint: "追踪" },
  { id: "floating", title: "悬浮窗", hint: "桌面" },
  { id: "help", title: "说明页", hint: "文档" }
];

const sourceLabels = {
  action_rule: { label: "动作规则库", className: "rule" },
  text_rule: { label: "文本规则库", className: "rule" },
  image_rule: { label: "图片规则库", className: "rule" },
  panel_action: { label: "页面动作", className: "rule" },
  quick_ack: { label: "直接承接", className: "direct" },
  waiting_reply: { label: "等待补偿", className: "direct" },
  ai_followup: { label: "AI 接管", className: "ai" },
  ignore: { label: "忽略", className: "direct" },
  unknown: { label: "未分类", className: "" }
};

const state = {
  view: "page",
  ruleTab: "actionRules",
  status: null,
  settings: null,
  records: null,
  apiKeyShown: false,
  loading: false
};

const content = $("#content");
const flash = $("#flash");

init().catch((error) => {
  console.error(error);
  showFlash(String(error?.message || error), "error");
});

async function init() {
  renderNav();
  bindGlobalActions();
  window.mainShell.onStatus((payload) => {
    state.status = payload || {};
    renderChrome();
    if (["dashboard", "logs"].includes(state.view)) renderView();
  });
  const [settings, status, records] = await Promise.all([
    window.mainShell.getSettings(),
    window.mainShell.getStatus(),
    window.mainShell.getReplyRecords({ limit: 300 })
  ]);
  state.settings = settings;
  state.status = status;
  state.records = records;
  renderChrome();
  await switchView("page");
}

function renderNav() {
  $("#nav").innerHTML = navItems.map((item) => `
    <button type="button" data-view="${item.id}">
      <span>${escapeHtml(item.title)}</span>
      <small>${escapeHtml(item.hint)}</small>
    </button>
  `).join("");
  $$("#nav button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
}

function bindGlobalActions() {
  $("#openFloat").addEventListener("click", async () => {
    await window.mainShell.openFloating("compact");
    showFlash("悬浮窗已打开", "ok");
  });
  $("#toggleBot").addEventListener("click", async () => {
    state.status = await window.mainShell.toggleEnabled();
    state.settings = await window.mainShell.getSettings();
    renderChrome();
    renderView();
  });
  $("#reloadPage").addEventListener("click", async () => {
    await window.mainShell.reload();
    showFlash("客服页正在重载");
  });
  $("#captureStructure").addEventListener("click", async () => {
    showFlash("正在捕捉页面结构...");
    const result = await window.mainShell.capturePageStructure();
    showFlash(result.ok ? `页面结构已保存：${result.count || 0} 个节点` : result.message, result.ok ? "ok" : "error");
  });
}

async function switchView(view) {
  state.view = view || "page";
  renderChrome();
  renderView();
  try {
    state.status = await window.mainShell.setMode(state.view === "page" ? "page" : state.view);
    renderChrome();
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  }
}

function renderChrome() {
  const status = state.status || {};
  const botEnabled = Boolean(status.enabled);
  const aiOk = Boolean(status.ai?.ok && status.ai?.hasKey);
  const aiHasKey = Boolean(status.ai?.hasKey);
  const notifyConfigured = Boolean(status.notify?.configured || status.notifyEnabled);
  const page = status.page || {};

  $("#botDot").className = `dot ${botEnabled ? "" : "warn"}`;
  $("#aiDot").className = `dot ${aiOk ? "" : aiHasKey ? "warn" : "bad"}`;
  $("#botMini").textContent = status.bot?.status || "Bot";
  $("#botModeMini").textContent = botEnabled ? "开启" : "暂停";
  $("#aiMini").textContent = aiOk ? "AI 正常" : aiHasKey ? "AI 待测" : "缺 Key";
  $("#notifyMini").textContent = notifyConfigured ? `通知 ${status.notify?.outboxCount || 0}` : "未配置";
  $("#pageMini").textContent = page.loading ? "客服页加载中" : page.title || "客服页映射";
  $("#toggleBot").textContent = botEnabled ? "暂停 Bot" : "开启 Bot";

  $$("#nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function renderView() {
  if (!state.settings) {
    content.innerHTML = `<div class="empty">正在读取配置...</div>`;
    return;
  }

  if (state.view === "page") return renderPageView();
  if (state.view === "dashboard") return renderDashboard();
  if (state.view === "bot") return renderBot();
  if (state.view === "api") return renderApi();
  if (state.view === "webhook") return renderWebhook();
  if (state.view === "rules") return renderRules();
  if (state.view === "logs") return renderLogs();
  if (state.view === "floating") return renderFloating();
  return renderHelp();
}

function renderPageView() {
  content.innerHTML = `
    <div class="page-placeholder">
      <div class="card">
        <h3>客服页映射已打开</h3>
        <p class="muted">右侧区域由微信小店客服页接管。左侧按钮仍可随时打开悬浮窗、暂停 Bot、重载页面或捕捉页面结构。</p>
      </div>
    </div>
  `;
}

function renderDashboard() {
  const status = state.status || {};
  const records = status.records || {};
  const page = status.page || {};
  content.innerHTML = `
    ${pageHead("总览状态", "查看客服页、Bot、AI、Webhook、悬浮窗和回复日志的真实运行状态。", `
      <button id="dashRefresh">刷新</button>
      <button id="dashCheckAi" class="primary">检查 AI</button>
    `)}
    <div class="grid cols-3">
      ${metricCard("Bot 接管", status.enabled ? "开启" : "暂停", status.bot?.status || "等待状态", status.enabled ? "ok" : "warn")}
      ${metricCard("AI 服务", status.ai?.ok ? "正常" : "异常", status.ai?.message || "未检查", status.ai?.ok ? "ok" : "bad")}
      ${metricCard("Webhook", status.notify?.enabled ? "推送中" : "未启用", status.notify?.configured ? `待补发 ${status.notify?.outboxCount || 0}` : "未填写 Webhook", status.notify?.enabled ? "ok" : "warn")}
      ${metricCard("客服页", page.ready ? (page.loading ? "加载中" : "已打开") : "未打开", page.url || "无地址", page.ready ? "ok" : "bad")}
      ${metricCard("悬浮窗", status.floating?.visible ? "显示中" : "已隐藏", status.floating?.alwaysOnTop ? "置顶" : "不置顶", status.floating?.visible ? "ok" : "warn")}
      ${metricCard("回复记录", String(records.total || 0), `成功 ${records.sent || 0} / 失败 ${records.failed || 0} / 超时 ${records.timeout || 0}`, records.failed || records.timeout ? "warn" : "ok")}
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      <div class="card cream">
        <h3>快捷操作</h3>
        <div class="toolbar" style="justify-content:flex-start">
          <button id="dashOpenPage" class="dark">打开客服页映射</button>
          <button id="dashOpenFloat">打开悬浮窗</button>
          <button id="dashReload">重载客服页</button>
          <button id="dashCapture">捕捉页面结构</button>
        </div>
      </div>
      <div class="card">
        <h3>当前回复来源</h3>
        <div class="badge-row">
          ${sourceStatsBadges(records.bySource || {})}
        </div>
        <p class="hint">规则库、直接承接和 AI 接管会在日志库中分开显示，便于排查每次回复的来源。</p>
      </div>
    </div>
  `;
  $("#dashRefresh").addEventListener("click", refreshAll);
  $("#dashCheckAi").addEventListener("click", checkAi);
  $("#dashOpenPage").addEventListener("click", () => switchView("page"));
  $("#dashOpenFloat").addEventListener("click", () => window.mainShell.openFloating("compact"));
  $("#dashReload").addEventListener("click", () => window.mainShell.reload());
  $("#dashCapture").addEventListener("click", () => $("#captureStructure").click());
}

function renderBot() {
  const cfg = state.settings.config || {};
  const bot = cfg.bot || {};
  content.innerHTML = `
    ${pageHead("Bot 接管", "控制是否自动回复、是否调用 AI、回复节奏和图片/页面动作能力。", `
      <button id="saveBot" class="primary">保存 Bot 设置</button>
    `)}
    <div class="grid cols-2">
      <div class="card">
        <h3>接管状态</h3>
        <div class="grid">
          ${toggleRow("botEnabled", "默认开启 Bot 接管", "关闭后只监控页面，不自动回复客户。", bot.enabled !== false)}
          ${toggleRow("aiFallback", "无命中规则时调用 AI", "规则库没有匹配时，会请求本地 AI 服务生成补充回复。", bot.aiFallback !== false)}
          ${toggleRow("autoStart", "开机自动启动桌面程序", "启动后会自动运行本地 AI 服务、客服页监控和悬浮窗。", cfg.autoStart !== false)}
          ${toggleRow("imageRepliesEnabled", "允许图片回复", "动作规则和图片规则可以上传并发送本地图片。", Boolean(bot.imageRepliesEnabled))}
          ${toggleRow("autoPasteImages", "图片自动上传/粘贴发送", "优先使用页面上传控件，失败时复制到剪贴板再粘贴发送。", Boolean(bot.autoPasteImages))}
          ${toggleRow("panelAutoActionsEnabled", "允许内置页面动作兜底", "当没有命中动作规则时，可按常见购买意图自动点商品、素材库等页面入口。", Boolean(bot.panelAutoActionsEnabled))}
        </div>
      </div>
      <div class="card">
        <h3>运行参数</h3>
        <div class="form-grid">
          ${field("aiEndpoint", "AI 回复地址", bot.aiEndpoint || "", "本地默认是 http://127.0.0.1:8787/reply。", "span-2")}
          ${textareaField("quickAck", "AI 慢回复承接语", bot.quickAck || "在", "AI 需要时间时先发出的短回复。")}
          ${textareaField("fallbackReply", "兜底回复", bot.fallbackReply || "", "规则和 AI 都不可用时的保底文本。")}
          ${numberField("aiSlowMs", "AI 慢回复阈值 ms", bot.aiSlowMs || 50000, "超过这个时间仍无 AI 结果，会先发承接语。")}
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
  const profile = state.settings.assistantProfile || {};
  const apiKeyType = state.apiKeyShown ? "text" : "password";
  content.innerHTML = `
    ${pageHead("API 接入", "配置 DeepSeek 兼容接口、模型、思考模式、审核和客服回复风格。", `
      <button id="checkAi" class="dark">健康检查</button>
      <button id="saveApi" class="primary">保存 API 与风格</button>
    `)}
    <div class="grid cols-2">
      <div class="card">
        <h3>模型接入</h3>
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
      </div>
      <div class="card">
        <h3>真实回复测试</h3>
        <div class="field">
          <label for="aiTestMessage">客户测试消息</label>
          <textarea id="aiTestMessage">客户问：年度会员怎么买？</textarea>
          <div class="hint">点击测试会调用本地 /reply，验证 Key、模型、风格和知识库是否真实可用。</div>
        </div>
        <div class="toolbar" style="justify-content:flex-start;margin-top:10px">
          <button id="testAiReply" class="primary">生成测试回复</button>
        </div>
        <div id="aiTestResult" class="card cream" style="margin-top:12px;min-height:76px">测试结果会显示在这里。</div>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <h3>知识库、参考库、风格灵魂</h3>
      <div class="form-grid">
        ${toggleRow("knowledgeFilesEnabled", "读取本地 knowledge-base", "开启后 AI 会结合仓库内知识文件。", profile.knowledgeFilesEnabled !== false)}
        ${toggleRow("sidebarContextEnabled", "读取客服页右侧上下文", "开启后 AI 会参考客服页可见的商品和用户信息。", profile.sidebarContextEnabled !== false)}
        ${toggleRow("reviewEnabled", "启用回复审核", "审核会过滤昵称、联系方式、承诺代查等风险回复。", profile.reviewEnabled !== false)}
        <div></div>
        ${textareaField("stylePrompt", "回复语气", profile.stylePrompt || "", "客服说话的语气和措辞偏好。")}
        ${textareaField("soulPrompt", "风格灵魂", profile.soulPrompt || "", "更底层的人设、判断方式和品牌感。")}
        ${textareaField("guardrailsPrompt", "边界规则", profile.guardrailsPrompt || "", "不能说、不能承诺、不能引导的内容。")}
        ${textareaField("reviewPrompt", "审核补充规则", profile.reviewPrompt || "", "二次审核额外检查项。")}
        ${textareaField("knowledgeText", "手动知识库", profile.knowledgeText || "", "不用改文件，直接写在这里的知识。", "span-2")}
        ${textareaField("referenceText", "参考回复库", profile.referenceText || "", "可供 AI 模仿的回复样例。", "span-2")}
      </div>
    </div>
  `;
  bindToggleButtons();
  $("#toggleApiKey").addEventListener("click", () => {
    state.apiKeyShown = !state.apiKeyShown;
    renderApi();
  });
  $("#checkAi").addEventListener("click", checkAi);
  $("#saveApi").addEventListener("click", saveApiSettings);
  $("#testAiReply").addEventListener("click", testAiReply);
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
  const list = Array.isArray(bot[state.ruleTab]) ? bot[state.ruleTab] : [];
  content.innerHTML = `
    ${pageHead("可视化规则库", "用卡片编辑何时发文字、图片、商品卡片、邀请下单、文件或忽略。高级 JSON 只作为兜底。", `
      <button id="addRule">新增规则</button>
      <button id="validateRules">检查规则</button>
      <button id="saveRules" class="primary">保存规则库</button>
    `)}
    <div class="tabs">
      <button data-rule-tab="actionRules" class="${state.ruleTab === "actionRules" ? "active" : ""}">动作规则</button>
      <button data-rule-tab="rules" class="${state.ruleTab === "rules" ? "active" : ""}">文字规则</button>
      <button data-rule-tab="imageReplies" class="${state.ruleTab === "imageReplies" ? "active" : ""}">图片规则</button>
    </div>
    <div id="ruleList" class="grid">
      ${list.length ? list.map((rule, index) => renderRuleCard(state.ruleTab, rule, index)).join("") : `<div class="empty">当前没有规则，点击“新增规则”创建。</div>`}
    </div>
    <details style="margin-top:14px">
      <summary>高级 JSON 视图</summary>
      <p class="hint">用于批量排查或迁移。默认请使用上面的卡片表单。</p>
      <textarea id="advancedRulesJson" style="min-height:260px">${escapeHtml(JSON.stringify(list, null, 2))}</textarea>
      <div class="toolbar" style="justify-content:flex-start;margin-top:8px">
        <button id="applyAdvancedRules">从 JSON 应用到当前分类</button>
      </div>
    </details>
  `;
  $$(".tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      state.ruleTab = button.dataset.ruleTab;
      renderRules();
    });
  });
  bindRuleActions();
}

function renderRuleCard(type, rule, index) {
  const enabled = rule.enabled !== false;
  const keywords = keywordsText(rule.keywords);
  const label = type === "actionRules" ? "动作规则" : type === "imageReplies" ? "图片规则" : "文字规则";
  const typeClass = type === "actionRules" ? "rule" : type === "imageReplies" ? "rule" : "direct";
  return `
    <section class="rule-card" data-rule-type="${type}" data-index="${index}">
      <div class="rule-head">
        <div class="rule-title">
          <span class="badge ${typeClass}">${label}</span>
          <strong>${escapeHtml(rule.name || `未命名规则 ${index + 1}`)}</strong>
          <span class="badge">${enabled ? "已启用" : "已关闭"}</span>
        </div>
        <div class="rule-actions">
          <button type="button" data-rule-command="duplicate">复制</button>
          <button type="button" data-rule-command="delete" class="danger">删除</button>
        </div>
      </div>
      <div class="rule-editor">
        ${toggleRow(`rule-enabled-${index}`, "启用这条规则", "关闭后不会被自动回复匹配。", enabled, "span-2", "data-rule-field=\"enabled\"")}
        ${field("", "规则名称", rule.name || "", "用于日志和规则管理。", "", "data-rule-field=\"name\"")}
        ${textareaField("", "匹配关键词", keywords, "逗号、顿号或换行分隔，客户消息包含任一关键词就会命中。", "", "data-rule-field=\"keywords\"")}
        ${renderRuleSpecificEditor(type, rule)}
      </div>
    </section>
  `;
}

function renderRuleSpecificEditor(type, rule) {
  if (type === "rules") {
    return textareaField("", "回复文本", rule.reply || "", "命中后直接发送的文字。", "span-2", "data-rule-field=\"reply\"");
  }

  if (type === "imageReplies") {
    return `
      ${field("", "图片路径", rule.path || rule.imagePath || "", "支持 config/reply-images/xxx.png 或绝对路径。", "", "data-rule-field=\"path\"")}
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
        <button type="button" data-rule-command="add-action">添加动作</button>
      </div>
    </div>
  `;
}

function renderActionRow(action, index) {
  const type = String(action.type || "text");
  return `
    <div class="card cream action-row" data-action-index="${index}">
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
        ], "动作执行类型。", "", "data-action-field=\"type\"")}
        ${field("", "按钮/标签", action.button || action.label || action.tab || "", "商品动作可填“发商品”或“邀请下单”；素材和快捷语一般填“发送”。", "", "data-action-field=\"button\"")}
        ${textareaField("", "文本/匹配内容", action.text || action.reply || action.query || action.match || "", "文字动作填回复；商品/素材/快捷语可填匹配词。", "", "data-action-field=\"text\"")}
        ${field("", "文件/图片路径", action.path || action.filePath || action.imagePath || "", "图片或文件动作的本地路径。", "", "data-action-field=\"path\"")}
        ${field("", "商品码", action.productId || "", "微信小店商品卡片匹配用的商品 ID。", "", "data-action-field=\"productId\"")}
        ${field("", "商品名", action.productName || "", "商品卡片匹配用的名称，可与商品码配合。", "", "data-action-field=\"productName\"")}
      </div>
      <div class="toolbar" style="justify-content:flex-start;margin-top:8px">
        <button type="button" data-rule-command="remove-action" class="danger">删除动作</button>
      </div>
    </div>
  `;
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
        <option value="action_rule">动作规则库</option>
        <option value="text_rule">文本规则库</option>
        <option value="image_rule">图片规则库</option>
        <option value="quick_ack">直接承接</option>
        <option value="waiting_reply">等待补偿</option>
        <option value="ai_followup">AI 接管</option>
      </select>
      <button id="refreshLogs" class="primary">刷新日志</button>
    `)}
    <div class="grid cols-3">
      ${metricCard("成功", String(stats.sent || 0), "已发送记录", "ok")}
      ${metricCard("失败", String(stats.failed || 0), "需要排查的发送失败", stats.failed ? "bad" : "ok")}
      ${metricCard("超时", String(stats.timeout || 0), "超过等待阈值", stats.timeout ? "warn" : "ok")}
    </div>
    <div class="grid" style="margin-top:14px">
      ${records.length ? records.map(renderLogRow).join("") : `<div class="empty">还没有回复日志。</div>`}
    </div>
  `;
  $("#refreshLogs").addEventListener("click", loadLogsFromFilters);
  $("#logKind").addEventListener("change", loadLogsFromFilters);
  $("#logSource").addEventListener("change", loadLogsFromFilters);
}

function renderLogRow(item) {
  const source = sourceLabels[item.sourceType] || { label: item.sourceLabel || item.sourceType || "未分类", className: "" };
  const kindClass = item.kind === "sent" ? "" : item.kind === "timeout" ? "direct" : "fail";
  return `
    <article class="log-row">
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
      </div>
    </article>
  `;
}

function renderFloating() {
  const floatWindow = state.settings.config?.floatWindow || {};
  const status = state.status || {};
  content.innerHTML = `
    ${pageHead("悬浮窗设置", "悬浮窗只是桌面辅助入口，隐藏不会关闭程序，可从主控制台或托盘重新打开。", `
      <button id="showFloat" class="primary">打开悬浮窗</button>
      <button id="hideFloat">隐藏悬浮窗</button>
      <button id="saveFloat" class="dark">保存悬浮窗设置</button>
    `)}
    <div class="grid cols-2">
      <div class="card">
        <h3>显示行为</h3>
        <div class="grid">
          ${toggleRow("floatEnabled", "启用悬浮窗功能", "关闭后不自动创建悬浮窗，但主控制台仍可重新启用。", floatWindow.enabled !== false)}
          ${toggleRow("alwaysOnTop", "保持置顶", "适合客服值守时防止窗口被遮挡。", Boolean(floatWindow.alwaysOnTop))}
        </div>
        <p class="hint">当前状态：${status.floating?.visible ? "正在显示" : "已隐藏"}，${status.floating?.alwaysOnTop ? "置顶" : "不置顶"}</p>
      </div>
      <div class="card">
        <h3>尺寸</h3>
        <div class="form-grid">
          ${numberField("compactWidth", "小窗宽度", floatWindow.compactSize?.width || 320, "悬浮窗运行态宽度。")}
          ${numberField("compactHeight", "小窗高度", floatWindow.compactSize?.height || 182, "悬浮窗运行态高度。")}
          ${numberField("settingsWidth", "设置窗宽度", floatWindow.settingsSize?.width || 760, "悬浮窗设置态宽度。")}
          ${numberField("settingsHeight", "设置窗高度", floatWindow.settingsSize?.height || 680, "悬浮窗设置态高度。")}
        </div>
      </div>
    </div>
  `;
  bindToggleButtons();
  $("#showFloat").addEventListener("click", () => window.mainShell.openFloating("compact"));
  $("#hideFloat").addEventListener("click", () => window.mainShell.hideFloating());
  $("#saveFloat").addEventListener("click", saveFloatingSettings);
}

function renderHelp() {
  content.innerHTML = `
    ${pageHead("说明页", "这页解释后台运行逻辑、规则优先级、Webhook 规则和 API 接入方式。")}
    <div class="grid cols-2">
      <div class="card">
        <h3>后台运行逻辑</h3>
        <p>桌面程序启动后会打开本地控制台、客服页 BrowserView、本地 AI 服务、悬浮窗和守护检查。主窗口关闭只会隐藏，托盘和悬浮窗可重新打开。</p>
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

async function saveBotSettings() {
  const payload = {
    config: {
      autoStart: checked("autoStart"),
      bot: {
        enabled: checked("botEnabled"),
        aiFallback: checked("aiFallback"),
        aiEndpoint: value("aiEndpoint"),
        quickAck: value("quickAck"),
        fallbackReply: value("fallbackReply"),
        aiSlowMs: numberValue("aiSlowMs", 50000),
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
    },
    assistantProfile: {
      knowledgeFilesEnabled: checked("knowledgeFilesEnabled"),
      sidebarContextEnabled: checked("sidebarContextEnabled"),
      reviewEnabled: checked("reviewEnabled"),
      stylePrompt: value("stylePrompt"),
      soulPrompt: value("soulPrompt"),
      guardrailsPrompt: value("guardrailsPrompt"),
      knowledgeText: value("knowledgeText"),
      referenceText: value("referenceText"),
      reviewPrompt: value("reviewPrompt")
    }
  };
  await saveSettings(payload, "API 与风格设置已保存");
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
        compactSize: {
          width: numberValue("compactWidth", 320),
          height: numberValue("compactHeight", 182)
        },
        settingsSize: {
          width: numberValue("settingsWidth", 760),
          height: numberValue("settingsHeight", 680)
        }
      }
    }
  };
  await saveSettings(payload, "悬浮窗设置已保存");
}

async function saveRules() {
  const bot = state.settings.config?.bot || {};
  const nextBot = {
    rules: bot.rules || [],
    actionRules: bot.actionRules || [],
    imageReplies: bot.imageReplies || []
  };
  nextBot[state.ruleTab] = collectRulesFromDom(state.ruleTab);
  validateRuleLibrary(nextBot);
  await saveSettings({ config: { bot: nextBot } }, "规则库已保存");
  renderRules();
}

async function saveSettings(payload, okMessage) {
  showFlash("正在保存...");
  try {
    state.settings = await window.mainShell.saveSettings(payload);
    state.status = state.settings.status || await window.mainShell.getStatus();
    renderChrome();
    showFlash(okMessage || "设置已保存", "ok");
  } catch (error) {
    showFlash(String(error?.message || error), "error");
    throw error;
  }
}

async function refreshAll() {
  const [settings, status, records] = await Promise.all([
    window.mainShell.getSettings(),
    window.mainShell.getStatus(),
    window.mainShell.getReplyRecords({ limit: 300 })
  ]);
  state.settings = settings;
  state.status = status;
  state.records = records;
  renderChrome();
  renderView();
  showFlash("已刷新", "ok");
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
  const result = await window.mainShell.testAiReply({ message: value("aiTestMessage") });
  box.innerHTML = result.ok
    ? `<strong>回复：</strong><div style="white-space:pre-wrap;margin-top:8px">${escapeHtml(result.reply || "")}</div>`
    : `<strong>失败：</strong><div class="hint">${escapeHtml(result.message || "")}</div>`;
  showFlash(result.ok ? "AI 测试成功" : result.message, result.ok ? "ok" : "error");
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
        ...state.settings.config.bot,
        [state.ruleTab]: collectRulesFromDom(state.ruleTab)
      });
      showFlash("规则检查通过", "ok");
    } catch (error) {
      showFlash(String(error?.message || error), "error");
    }
  });
  $("#addRule").addEventListener("click", () => {
    const bot = state.settings.config.bot;
    const list = Array.isArray(bot[state.ruleTab]) ? bot[state.ruleTab] : [];
    list.push(defaultRule(state.ruleTab));
    bot[state.ruleTab] = list;
    renderRules();
  });
  $("#applyAdvancedRules").addEventListener("click", () => {
    try {
      const parsed = JSON.parse($("#advancedRulesJson").value || "[]");
      if (!Array.isArray(parsed)) throw new Error("当前分类 JSON 必须是数组");
      state.settings.config.bot[state.ruleTab] = parsed;
      renderRules();
      showFlash("JSON 已应用到当前分类，请点击保存规则库", "ok");
    } catch (error) {
      showFlash(String(error?.message || error), "error");
    }
  });
  $("#ruleList").addEventListener("click", (event) => {
    const command = event.target?.dataset?.ruleCommand;
    if (!command) return;
    const card = event.target.closest(".rule-card");
    const index = Number(card?.dataset.index || -1);
    const list = state.settings.config.bot[state.ruleTab] || [];
    if (command === "delete" && index >= 0) {
      list.splice(index, 1);
      renderRules();
    }
    if (command === "duplicate" && index >= 0) {
      list.splice(index + 1, 0, cloneJson(list[index]));
      renderRules();
    }
    if (command === "add-action") {
      $(".action-list", card).insertAdjacentHTML("beforeend", renderActionRow({ type: "text", text: "" }, $$(".action-row", card).length));
    }
    if (command === "remove-action") {
      const row = event.target.closest(".action-row");
      row?.remove();
    }
  });
}

function collectRulesFromDom(type) {
  return $$(".rule-card[data-rule-type]").map((card) => {
    const base = cloneJson((state.settings.config.bot[type] || [])[Number(card.dataset.index)] || {});
    const enabledInput = $("[data-rule-field='enabled']", card);
    base.enabled = enabledInput ? enabledInput.checked : true;
    base.name = inputValue($("[data-rule-field='name']", card));
    base.keywords = splitKeywords(inputValue($("[data-rule-field='keywords']", card)));

    if (type === "rules") {
      base.reply = inputValue($("[data-rule-field='reply']", card));
    } else if (type === "imageReplies") {
      base.path = inputValue($("[data-rule-field='path']", card));
      base.caption = inputValue($("[data-rule-field='caption']", card));
    } else {
      base.actions = $$(".action-row", card).map((row, actionIndex) => collectActionRow(row, base.actions?.[actionIndex] || {})).filter(Boolean);
    }

    return base;
  });
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

function defaultRule(type) {
  if (type === "rules") {
    return { enabled: true, name: "新文字规则", keywords: ["关键词"], reply: "这里写回复" };
  }
  if (type === "imageReplies") {
    return { enabled: true, name: "新图片规则", keywords: ["关键词"], path: "config/reply-images/image1.png", caption: "" };
  }
  return {
    enabled: true,
    name: "新动作规则",
    keywords: ["关键词"],
    actions: [{ type: "text", text: "这里写回复" }]
  };
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

function metricCard(title, value, hint, level = "ok") {
  const dotClass = level === "bad" ? "bad" : level === "warn" ? "warn" : "";
  return `
    <div class="card metric">
      <span class="signal"><i class="dot ${dotClass}"></i>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(hint || "")}</span>
    </div>
  `;
}

function sourceStatsBadges(bySource) {
  const entries = Object.entries(bySource || {}).filter(([, count]) => count);
  if (!entries.length) return `<span class="badge">暂无来源数据</span>`;
  return entries.map(([source, count]) => {
    const meta = sourceLabels[source] || sourceLabels.unknown;
    return `<span class="badge ${meta.className}">${escapeHtml(meta.label)} ${count}</span>`;
  }).join("");
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
