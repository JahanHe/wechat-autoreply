const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const dot = $("#dot");
const enabled = $("#enabled");
const takeover = $("#takeover");
const status = $("#status");
const ai = $("#ai");
const notify = $("#notify");
const open = $("#open");
const toggle = $("#toggle");
const reload = $("#reload");
const settingsToggle = $("#settingsToggle");
const openSettings = $("#openSettings");
const hideFloat = $("#hideFloat");
const hideFloat2 = $("#hideFloat2");
const compactMode = $("#compactMode");
const quitApp = $("#quitApp");
const saveSettings = $("#saveSettings");
const flash = $("#flash");
const quitExplain = $("#quitExplain");

let settings = null;
let settingsOpen = false;
let currentTab = "run";
let quitConfirmUntil = 0;
let quitConfirmTimer = null;

open.addEventListener("click", () => window.desktopFloat.openMain());
toggle.addEventListener("click", () => window.desktopFloat.toggleEnabled());
reload.addEventListener("click", () => window.desktopFloat.reload());
settingsToggle.addEventListener("click", toggleSettings);
openSettings.addEventListener("click", openSettingsPanel);
hideFloat.addEventListener("click", confirmQuit);
hideFloat2.addEventListener("click", confirmQuit);
compactMode.addEventListener("click", closeSettingsPanel);
quitApp.addEventListener("click", confirmQuit);
saveSettings.addEventListener("click", saveAllSettings);
$("#checkAi").addEventListener("click", checkAi);
$("#captureStructure").addEventListener("click", captureStructure);
$("#testWebhook").addEventListener("click", testWebhook);
$("#toggleApiKey").addEventListener("click", toggleApiKey);
$("#chooseImage").addEventListener("click", chooseImage);
$("#validateRules").addEventListener("click", validateRulesClick);
$("#insertImageTemplate").addEventListener("click", insertImageTemplate);
$("#insertActionRuleTemplate").addEventListener("click", insertActionRuleTemplate);
$("#insertDealRuleTemplate").addEventListener("click", insertDealRuleTemplate);
$("#insertComboRuleTemplate").addEventListener("click", insertComboRuleTemplate);
$("#insertFileRuleTemplate").addEventListener("click", insertFileRuleTemplate);
$("#insertRuleTemplate").addEventListener("click", insertRuleTemplate);
$("#alwaysOnTop").addEventListener("change", (event) => window.desktopFloat.setAlwaysOnTop(event.target.checked));

for (const button of $$(".tabs button")) {
  button.addEventListener("click", () => setTab(button.dataset.tab));
}

for (const button of $$("[data-preset]")) {
  button.addEventListener("click", () => window.desktopFloat.setPreset(button.dataset.preset));
}

window.desktopFloat.onStatus(render);
window.desktopFloat.getStatus().then(render);
loadSettings();

async function loadSettings() {
  settings = await window.desktopFloat.getSettings();
  fillSettings(settings);
}

function fillSettings(payload) {
  const config = payload.config || {};
  const bot = config.bot || {};
  const notifyConfig = config.notify || {};
  const floatWindow = config.floatWindow || {};
  const env = payload.env || {};
  const profile = payload.assistantProfile || {};

  $("#botEnabled").checked = Boolean(bot.enabled);
  $("#aiFallback").checked = Boolean(bot.aiFallback);
  $("#autoStart").checked = Boolean(config.autoStart);
  $("#aiEndpoint").value = bot.aiEndpoint || "";
  $("#notifyEnabled").checked = Boolean(notifyConfig.enabled && notifyConfig.wecomWebhookUrl);
  $("#notifyCooldown").value = Number(notifyConfig.cooldownMs || 300000);
  $("#hourlySummaryEnabled").checked = notifyConfig.hourlySummaryEnabled !== false;
  $("#dailySummaryEnabled").checked = notifyConfig.dailySummaryEnabled !== false;
  $("#dailySummaryHour").value = Number(notifyConfig.dailySummaryHour ?? 10);
  $("#webhookUrl").value = notifyConfig.wecomWebhookUrl || env.wecomWebhookUrl || "";

  $("#deepseekApiKey").value = env.deepseekApiKey || "";
  $("#deepseekModel").value = env.deepseekModel || "deepseek-v4-flash";
  $("#deepseekBaseUrl").value = env.deepseekBaseUrl || "https://api.deepseek.com";
  $("#deepseekThinking").value = env.deepseekThinking || "enabled";
  $("#deepseekReasoningEffort").value = env.deepseekReasoningEffort || "medium";
  $("#deepseekReview").value = env.deepseekReview || "enabled";

  $("#knowledgeFilesEnabled").checked = profile.knowledgeFilesEnabled !== false;
  $("#sidebarContextEnabled").checked = profile.sidebarContextEnabled !== false;
  $("#reviewEnabled").checked = profile.reviewEnabled !== false;
  $("#stylePrompt").value = profile.stylePrompt || "";
  $("#soulPrompt").value = profile.soulPrompt || "";
  $("#guardrailsPrompt").value = profile.guardrailsPrompt || "";
  $("#knowledgeText").value = profile.knowledgeText || "";
  $("#referenceText").value = profile.referenceText || "";
  $("#reviewPrompt").value = profile.reviewPrompt || "";

  $("#quickAck").value = bot.quickAck || "我看到了";
  $("#fallbackReply").value = bot.fallbackReply || "";
  $("#aiSlowMs").value = Number(bot.aiSlowMs || 50000);
  $("#noResponseAlertMs").value = Number(bot.noResponseAlertMs || 90000);
  $("#maxTextParts").value = Number(bot.maxTextParts || 2);
  $("#maxReplyPartLength").value = Number(bot.maxReplyPartLength || 500);
  $("#imageRepliesEnabled").checked = Boolean(bot.imageRepliesEnabled);
  $("#autoPasteImages").checked = Boolean(bot.autoPasteImages);
  $("#rulesJson").value = JSON.stringify(Array.isArray(bot.rules) ? bot.rules : [], null, 2);
  $("#actionRulesJson").value = JSON.stringify(Array.isArray(bot.actionRules) ? bot.actionRules : [], null, 2);
  $("#imagesJson").value = JSON.stringify(bot.imageReplies || [], null, 2);

  $("#alwaysOnTop").checked = Boolean(floatWindow.alwaysOnTop);
  $("#compactWidth").value = Number(floatWindow.compactSize?.width || 320);
  $("#compactHeight").value = Number(floatWindow.compactSize?.height || 182);
  $("#settingsWidth").value = Number(floatWindow.settingsSize?.width || 760);
  $("#settingsHeight").value = Number(floatWindow.settingsSize?.height || 680);
}

async function saveAllSettings() {
  let rules;
  let imageReplies;
  let actionRules;
  try {
    rules = parseJsonArray($("#rulesJson").value, "文字规则 JSON");
    actionRules = parseJsonArray($("#actionRulesJson").value, "页面动作规则 JSON");
    imageReplies = parseJsonArray($("#imagesJson").value, "图片规则 JSON");
    validateRuleLibrary({ rules, actionRules, imageReplies });
  } catch (error) {
    showFlash(error.message, "error");
    return;
  }

  const webhookUrl = $("#webhookUrl").value.trim();
  const payload = {
    config: {
      autoStart: $("#autoStart").checked,
      bot: {
        enabled: $("#botEnabled").checked,
        aiFallback: $("#aiFallback").checked,
        aiEndpoint: $("#aiEndpoint").value.trim(),
        quickAck: $("#quickAck").value.trim(),
        fallbackReply: $("#fallbackReply").value.trim(),
        aiSlowMs: toNumber($("#aiSlowMs").value, 50000),
        noResponseAlertMs: toNumber($("#noResponseAlertMs").value, 90000),
        maxTextParts: toNumber($("#maxTextParts").value, 2),
        maxReplyPartLength: toNumber($("#maxReplyPartLength").value, 500),
        imageRepliesEnabled: $("#imageRepliesEnabled").checked,
        autoPasteImages: $("#autoPasteImages").checked,
        rules,
        actionRules,
        imageReplies
      },
      notify: {
        enabled: $("#notifyEnabled").checked && Boolean(webhookUrl),
        wecomWebhookUrl: webhookUrl,
        cooldownMs: toNumber($("#notifyCooldown").value, 300000),
        hourlySummaryEnabled: $("#hourlySummaryEnabled").checked,
        dailySummaryEnabled: $("#dailySummaryEnabled").checked,
        dailySummaryHour: toNumber($("#dailySummaryHour").value, 10)
      },
      floatWindow: {
        alwaysOnTop: $("#alwaysOnTop").checked,
        compactSize: {
          width: toNumber($("#compactWidth").value, 320),
          height: toNumber($("#compactHeight").value, 182)
        },
        settingsSize: {
          width: toNumber($("#settingsWidth").value, 760),
          height: toNumber($("#settingsHeight").value, 680)
        }
      }
    },
    env: {
      deepseekApiKey: $("#deepseekApiKey").value.trim(),
      deepseekModel: $("#deepseekModel").value.trim(),
      deepseekBaseUrl: $("#deepseekBaseUrl").value.trim(),
      deepseekThinking: $("#deepseekThinking").value.trim(),
      deepseekReasoningEffort: $("#deepseekReasoningEffort").value.trim(),
      deepseekReview: $("#deepseekReview").value.trim(),
      wecomWebhookUrl: webhookUrl,
      port: settings?.env?.port || ""
    },
    assistantProfile: {
      knowledgeFilesEnabled: $("#knowledgeFilesEnabled").checked,
      sidebarContextEnabled: $("#sidebarContextEnabled").checked,
      reviewEnabled: $("#reviewEnabled").checked,
      stylePrompt: $("#stylePrompt").value.trim(),
      soulPrompt: $("#soulPrompt").value.trim(),
      guardrailsPrompt: $("#guardrailsPrompt").value.trim(),
      knowledgeText: $("#knowledgeText").value.trim(),
      referenceText: $("#referenceText").value.trim(),
      reviewPrompt: $("#reviewPrompt").value.trim()
    }
  };

  saveSettings.disabled = true;
  showFlash("正在保存...");
  try {
    settings = await window.desktopFloat.saveSettings(payload);
    fillSettings(settings);
    showFlash("设置已保存", "ok");
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  } finally {
    saveSettings.disabled = false;
  }
}

async function checkAi() {
  showFlash("正在检查 AI...");
  try {
    const result = await window.desktopFloat.checkAi();
    showFlash(result.ok ? `AI 正常：${result.message}` : `AI 异常：${result.message}`, result.ok ? "ok" : "error");
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  }
}

async function testWebhook() {
  const webhookUrl = $("#webhookUrl").value.trim();
  showFlash("正在测试 Webhook...");
  try {
    const result = await window.desktopFloat.testWebhook(webhookUrl);
    showFlash(result.message, result.ok ? "ok" : "error");
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  }
}

async function captureStructure() {
  showFlash("正在捕捉页面结构...");
  try {
    const result = await window.desktopFloat.capturePageStructure();
    showFlash(result.ok ? `结构已保存：${result.count} 个节点，路径已复制` : result.message, result.ok ? "ok" : "error");
  } catch (error) {
    showFlash(String(error?.message || error), "error");
  }
}

function toggleApiKey() {
  const input = $("#deepseekApiKey");
  const button = $("#toggleApiKey");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  button.textContent = showing ? "显示 API Key" : "隐藏 API Key";
}

async function chooseImage() {
  const path = await window.desktopFloat.chooseImage();
  if (!path) return;
  const items = readJsonArray($("#imagesJson").value);
  items.push({
    enabled: true,
    name: "图片回复",
    keywords: ["关键词"],
    path,
    caption: "我发您图片看下"
  });
  $("#imagesJson").value = JSON.stringify(items, null, 2);
  showFlash("已追加图片规则，记得改关键词并保存", "ok");
}

function insertImageTemplate() {
  const items = readJsonArray($("#imagesJson").value);
  items.push({
    enabled: true,
    name: "尺码图",
    keywords: ["尺码", "尺寸", "大小"],
    path: "/Users/你的用户名/Pictures/size-guide.png",
    caption: "我发您图片看下"
  });
  $("#imagesJson").value = JSON.stringify(items, null, 2);
}

function insertActionRuleTemplate() {
  const rules = readJsonArray($("#actionRulesJson").value);
  rules.push({
    enabled: true,
    name: "商品链接：按商品码发商品卡片",
    keywords: ["链接", "商品链接", "详情", "多少钱"],
    actions: [
      { type: "text", text: "我发您商品入口\n您可以先看详情" },
      {
        type: "product",
        productId: "10000275472384",
        button: "发商品",
        fallbackButton: "邀请下单"
      }
    ]
  });
  $("#actionRulesJson").value = JSON.stringify(rules, null, 2);
}

function insertDealRuleTemplate() {
  const rules = readJsonArray($("#actionRulesJson").value);
  rules.push({
    enabled: true,
    name: "成交：按商品码邀请下单",
    keywords: ["下单", "怎么买", "想买", "拍一下", "付款"],
    actions: [
      { type: "text", text: "我给您把商品选好\n您可以直接点进去下单" },
      {
        type: "product",
        productId: "10000275472384",
        button: "邀请下单"
      }
    ]
  });
  $("#actionRulesJson").value = JSON.stringify(rules, null, 2);
}

function insertComboRuleTemplate() {
  const rules = readJsonArray($("#actionRulesJson").value);
  rules.push({
    enabled: true,
    name: "组合：文字加图片加商品",
    keywords: ["介绍", "看看", "适合我吗"],
    actions: [
      { type: "text", text: "我先发您一张说明图\n再把商品入口发您" },
      {
        type: "image",
        name: "说明图",
        path: "/Users/你的用户名/Pictures/product-intro.png"
      },
      {
        type: "product",
        productId: "10000275472384",
        button: "发商品"
      }
    ]
  });
  $("#actionRulesJson").value = JSON.stringify(rules, null, 2);
}

function insertFileRuleTemplate() {
  const rules = readJsonArray($("#actionRulesJson").value);
  rules.push({
    enabled: true,
    name: "资料：发送本地文件",
    keywords: ["资料", "文件", "文档", "方案"],
    actions: [
      { type: "text", text: "我把资料文件发您" },
      {
        type: "file",
        path: "/Users/你的用户名/Documents/资料.pdf"
      }
    ]
  });
  $("#actionRulesJson").value = JSON.stringify(rules, null, 2);
}

function insertRuleTemplate() {
  const rules = readJsonArray($("#rulesJson").value);
  rules.push({
    name: "售后",
    keywords: ["退款", "售后", "退货"],
    reply: "订单里可以申请售后\n写下具体原因即可"
  });
  $("#rulesJson").value = JSON.stringify(rules, null, 2);
}

function validateRulesClick() {
  try {
    const rules = parseJsonArray($("#rulesJson").value, "文字规则 JSON");
    const actionRules = parseJsonArray($("#actionRulesJson").value, "动作规则 JSON");
    const imageReplies = parseJsonArray($("#imagesJson").value, "图片规则 JSON");
    const report = validateRuleLibrary({ rules, actionRules, imageReplies });
    showFlash(`规则库校验通过：文字 ${rules.length} 条，动作 ${actionRules.length} 条，图片 ${imageReplies.length} 条，动作项 ${report.actionCount} 个`, "ok");
  } catch (error) {
    showFlash(error.message, "error");
  }
}

function toggleSettings() {
  if (settingsOpen) {
    closeSettingsPanel();
  } else {
    openSettingsPanel();
  }
}

async function openSettingsPanel() {
  settingsOpen = true;
  document.body.classList.add("settings-open");
  settingsToggle.textContent = "收起";
  await window.desktopFloat.setMode("settings");
  if (!settings) await loadSettings();
}

async function closeSettingsPanel() {
  settingsOpen = false;
  document.body.classList.remove("settings-open");
  settingsToggle.textContent = "设置";
  await window.desktopFloat.setMode("compact");
}

function setTab(tab) {
  currentTab = tab;
  for (const button of $$(".tabs button")) {
    button.classList.toggle("active", button.dataset.tab === currentTab);
  }
  for (const pane of $$(".pane")) {
    pane.classList.toggle("active", pane.id === `pane-${currentTab}`);
  }
}

function render(payload) {
  if (!payload) return;

  const botStatus = payload.bot?.status || "启动中";
  const aiOk = Boolean(payload.ai?.ok);
  const enabledValue = Boolean(payload.enabled);
  const takeoverValue = Boolean(payload.bot?.takeover || payload.bot?.busy);
  const notifyEnabled = Boolean(payload.notifyEnabled);
  const outboxCount = Number(payload.notifyOutboxCount || 0);
  const bad = /失败|异常|未能|需要登录|无状态/.test(botStatus) || !aiOk;
  const warn = takeoverValue || /暂停|等待|重载|检查/.test(botStatus) || !notifyEnabled || outboxCount > 0;

  dot.className = bad ? "dot bad" : warn ? "dot warn" : "dot";
  enabled.className = enabledValue ? "pill" : "pill off";
  enabled.textContent = enabledValue ? "接管开启" : "已暂停";
  takeover.hidden = !takeoverValue;
  status.textContent = takeoverValue ? `客服：Bot 正在接管回复（${botStatus}）` : `客服：${botStatus}`;
  ai.textContent = aiOk ? "AI：正常" : "AI：异常";
  notify.textContent = notifyEnabled
    ? outboxCount > 0 ? `通知：待补发${outboxCount}` : "通知：企业微信"
    : "通知：未配置";
  toggle.textContent = enabledValue ? "暂停接管" : "开启接管";
}

function confirmQuit() {
  const now = Date.now();
  if (now < quitConfirmUntil) {
    window.desktopFloat.quit();
    return;
  }

  quitConfirmUntil = now + 8000;
  quitApp.textContent = "再次点击确认关闭";
  quitExplain.textContent = "彻底关闭会停止自动回复、悬浮窗、Webhook 通知和本地 AI 服务；8 秒内再次点击才会退出。";
  showFlash("再次点击“确认关闭”才会退出程序", "error");
  clearTimeout(quitConfirmTimer);
  quitConfirmTimer = setTimeout(resetQuitConfirm, 8000);
}

function resetQuitConfirm() {
  quitConfirmUntil = 0;
  quitApp.textContent = "彻底关闭";
  quitExplain.textContent = "彻底关闭会停止自动回复、悬浮窗、Webhook 通知和本地 AI 守护；需要重新启动程序才会恢复。";
}

function showFlash(message, type = "") {
  flash.className = `flash ${type}`.trim();
  flash.textContent = message;
}

function parseJsonArray(value, label) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) throw new Error("not array");
    return parsed;
  } catch {
    throw new Error(`${label} 必须是数组 JSON`);
  }
}

function readJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validateRuleLibrary({ rules, actionRules, imageReplies }) {
  const report = { actionCount: 0 };
  for (const [index, rule] of rules.entries()) {
    validateKeywords(rule, `文字规则第 ${index + 1} 条`);
    if (!String(rule.reply || "").trim()) throw new Error(`文字规则第 ${index + 1} 条缺少 reply`);
  }

  for (const [index, rule] of imageReplies.entries()) {
    validateKeywords(rule, `图片规则第 ${index + 1} 条`);
    if (!String(rule.path || rule.imagePath || "").trim()) throw new Error(`图片规则第 ${index + 1} 条缺少 path`);
  }

  for (const [index, rule] of actionRules.entries()) {
    validateKeywords(rule, `动作规则第 ${index + 1} 条`);
    if (!Array.isArray(rule.actions) || rule.actions.length === 0) throw new Error(`动作规则第 ${index + 1} 条缺少 actions`);
    for (const [actionIndex, action] of rule.actions.entries()) {
      validateAction(action, `动作规则第 ${index + 1} 条第 ${actionIndex + 1} 个动作`);
      report.actionCount += 1;
    }
  }
  return report;
}

function validateKeywords(rule, label) {
  if (rule.enabled === false) return;
  const keywords = Array.isArray(rule.keywords) ? rule.keywords : String(rule.keywords || "").split(/[,，、\n]/);
  if (!keywords.map((item) => String(item || "").trim()).filter(Boolean).length) {
    throw new Error(`${label} 缺少 keywords`);
  }
}

function validateAction(action, label) {
  const type = String(action?.type || "").trim();
  if (!type) throw new Error(`${label} 缺少 type`);
  if (type === "ignore" || type === "noop") return;
  if (type === "text" && !String(action.text || action.reply || "").trim()) throw new Error(`${label} 缺少 text`);
  if (type === "image" && !String(action.path || action.imagePath || "").trim()) throw new Error(`${label} 缺少 path`);
  if (type === "file" && !String(action.path || action.filePath || "").trim()) throw new Error(`${label} 缺少 path`);
  if (type === "product") {
    const hasProductMatch = ["productId", "productName", "query", "match", "name"].some((key) => String(action[key] || "").trim());
    if (!hasProductMatch) throw new Error(`${label} 是商品动作，必须填写 productId，或至少填写 productName/query/match/name`);
    if (!String(action.button || "").trim()) throw new Error(`${label} 缺少 button，可填“发商品”或“邀请下单”`);
  }
  if (type === "material" && !String(action.materialName || action.query || action.match || action.name || "").trim()) {
    throw new Error(`${label} 是素材动作，必须填写 materialName/query/match/name`);
  }
  if (type === "quick_reply" && !String(action.quickReply || action.query || action.match || action.name || "").trim()) {
    throw new Error(`${label} 是快捷语动作，必须填写 quickReply/query/match/name`);
  }
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
