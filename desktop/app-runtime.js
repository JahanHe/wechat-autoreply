import { app, BrowserView, BrowserWindow, Menu, Notification, Tray, clipboard, dialog, ipcMain, nativeImage, powerSaveBlocker, screen, session, shell } from "electron";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRunyuBaseUrl, normalizeRunyuCookie } from "../src/runyu-judgments.js";
import { safeErrorMessage } from "../src/redact.js";
import { createAppContext, snapshotAppContext } from "./app-context.js";
import { DESKTOP_CONFIG_SCHEMA_VERSION, repairDesktopConfig, validateDesktopConfig } from "./config-validator.js";
import {
  BOT_RUNTIME_STATUSES,
  BOT_STATUS_HISTORY_LIMIT,
  clipStatusLabel,
  createUiStatusSnapshot,
  inferBotStatusCode
} from "./status-center.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const CONTENT_SCRIPT_PATH = resolve(APP_ROOT, "extension/content.js");
const FLOATING_HTML_PATH = resolve(__dirname, "floating.html");
const MAIN_SHELL_HTML_PATH = resolve(__dirname, "main-shell.html");
const APP_ICON_PATH = resolve(__dirname, "assets/logo.png");
const BUNDLED_ASSISTANT_PROFILE_PATH = resolve(APP_ROOT, "config/assistant-profile.json");
const BUNDLED_REPLIES_PATH = resolve(APP_ROOT, "config/replies.json");
const BUNDLED_REPLY_IMAGES_DIR = resolve(APP_ROOT, "config/reply-images");
const APP_DISPLAY_NAME = "小店AI客服";
const APP_USER_DATA_DIR_NAME = "小店AI客服";
const LEGACY_USER_DATA_DIR_NAME = "wechat-shop-kf-bot";
const BOT_CONFIG_VERSION = "desktop-0.3.0";
const MAIN_SHELL_SIDEBAR_WIDTH = 236;
const RUNYU_BASE_URL = "https://runyuai.zhiduoke.com.cn";
const RUNYU_AUTH_PARTITION = "persist:runyu-auth";
const RUNYU_LOGIN_TIMEOUT_MS = 5 * 60_000;
const RUNYU_AUTH_HISTORY_LIMIT = 100;
const AI_SERVICE_NAME = "xiaodian-ai-service";
const AI_SERVICE_PROTOCOL = 2;
const AI_REQUIRED_ROUTES = ["/reply", "/judgments/status", "/judgments/search", "/judgments/refresh"];

app.setName(APP_DISPLAY_NAME);

process.env.WECHAT_KF_ROOT = APP_ROOT;
process.env.WECHAT_KF_CONFIG_ROOT = APP_ROOT;
loadDotEnv(APP_ROOT);

const PORT = Number(process.env.PORT || 8787);
const CONTROL_PORT = Number(process.env.DESKTOP_CONTROL_PORT || 8797);
let activeAiPort = PORT;
let controlToken = process.env.DESKTOP_CONTROL_TOKEN || "";
const appContext = createAppContext();

let config = null;
let mainWindow = null;
let kfView = null;
let kfViewAttached = false;
let mainMode = "page";
let floatWindow = null;
let tray = null;
let aiServer = null;
let controlServer = null;
let aiRestarting = false;
let isQuitting = false;
let blockerId = null;
let lastBotHeartbeatAt = 0;
let lastBotStatus = {
  code: "starting",
  label: "启动中",
  status: "启动中",
  detail: "正在启动客服自动回复服务",
  tone: "active",
  category: "系统",
  enabled: true,
  href: "",
  title: "",
  at: Date.now()
};
let botStatusHistory = [{ ...lastBotStatus }];
let lastAiHealth = {
  ok: false,
  hasKey: false,
  at: 0,
  message: "未检查"
};
const notifyCooldowns = new Map();
const healthIssues = new Map();
const NOTIFY_OUTBOX_LIMIT = 200;
const REPLY_RECORD_LIMIT = 5000;
let notifyOutbox = [];
let notifyOutboxTimer = null;
let notifyOutboxFlushing = false;
let replyRecords = [];
let replySummaryState = {
  lastHourlySlot: "",
  lastDailyDate: ""
};
let floatingBoundsTimer = null;
let loginScreenshotInProgress = false;
let loginNotificationTimer = null;
let judgmentRefreshTimer = null;
let judgmentDownloadJob = null;
let runyuLoginWindow = null;
let runyuCookieCaptureTimer = null;
let runyuCookieCaptureInProgress = false;
let runyuLoginDeadlineAt = 0;
let runyuLoginTimeoutTimer = null;
let runyuAuthVerificationPromise = null;
let runyuAuthHistory = [];
let runyuAuthState = {
  status: "unconfigured",
  message: "尚未登录润宇判断库",
  source: "",
  errorCode: "",
  httpStatus: 0,
  errorDetail: "",
  cookieDetected: false,
  updatedAt: 0,
  verifiedAt: 0
};
let watchdogTimers = [];
let configValidationState = { valid: true, version: DESKTOP_CONFIG_SCHEMA_VERSION, errors: [], backupPath: "" };

const gotLock = process.env.WECHAT_KF_ALLOW_MULTIPLE === "1" || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());
  app.whenReady().then(startDesktopApp).catch((error) => {
    console.error("[desktop]", error);
    app.quit();
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  appContext.runtime.isQuitting = true;
  stopWatchdogs();
  stopPowerBlocker();
  flushKfSession().catch((error) => console.error("[desktop] flush session before quit failed", error));
});

app.on("window-all-closed", () => {});
app.on("activate", () => showMainWindow());

async function startDesktopApp() {
  if (process.platform === "darwin") app.dock?.show();
  applyUserDataOverride();
  await migrateLegacyUserData();
  await ensureRuntimeConfigFiles();
  process.env.WECHAT_KF_CONFIG_ROOT = runtimeConfigRoot();
  loadDotEnv(runtimeConfigRoot(), { override: true });
  await ensureDesktopControlToken();
  config = await loadConfig();
  appContext.config = config;
  applyEnvBackedConfig();
  await loadRunyuAuthHistory();
  initializeRunyuAuthState();
  await saveConfig();
  await loadNotifyOutbox();
  await loadReplyRecords();
  await loadReplySummaryState();
  applyLoginItemSetting();
  syncPowerBlocker();
  registerIpc();
  await startAiServerWithNotify();
  await startDesktopControlServer();
  createMainWindow();
  createFloatingWindow();
  createTray();
  if (process.argv.includes("--runyu-login")) {
    setTimeout(() => {
      openRunyuLoginWindow().catch((error) => console.error("[runyu] open login on start failed", error));
    }, 800);
  }
  validateRunyuAuthOnStartup().catch((error) => console.error("[runyu] startup validation failed", error));
  startWatchdogs();
  startJudgmentRefreshScheduler();
  startNotifyOutboxPump();
  startReplySummaryScheduler();
  await sendNotification("app_started", `${APP_DISPLAY_NAME}已启动`, "程序、悬浮窗和本地 AI 服务已开始运行", {
    cooldownMs: 60_000
  });
  await notifyMissingWebhookIfNeeded();
}

function applyEnvBackedConfig() {
  if (!config) return;
  if (process.env.RUNYU_JUDGMENTS_ENABLED) {
    config.judgmentLibrary = normalizeJudgmentLibraryConfig({
      ...config.judgmentLibrary,
      enabled: /^(1|true|yes|enabled|on)$/i.test(process.env.RUNYU_JUDGMENTS_ENABLED),
      useCache: process.env.RUNYU_JUDGMENTS_USE_CACHE ? /^(1|true|yes|enabled|on)$/i.test(process.env.RUNYU_JUDGMENTS_USE_CACHE) : config.judgmentLibrary?.useCache,
      useRemote: process.env.RUNYU_JUDGMENTS_USE_REMOTE ? /^(1|true|yes|enabled|on)$/i.test(process.env.RUNYU_JUDGMENTS_USE_REMOTE) : config.judgmentLibrary?.useRemote,
      sources: process.env.RUNYU_JUDGMENTS_SOURCES || config.judgmentLibrary?.sources,
      searchTypes: process.env.RUNYU_JUDGMENTS_SEARCH_TYPES || config.judgmentLibrary?.searchTypes,
      maxResults: process.env.RUNYU_JUDGMENTS_MAX_RESULTS || config.judgmentLibrary?.maxResults,
      limitPerQuery: process.env.RUNYU_JUDGMENTS_LIMIT_PER_QUERY || config.judgmentLibrary?.limitPerQuery,
      refreshLimit: process.env.RUNYU_JUDGMENTS_REFRESH_LIMIT || config.judgmentLibrary?.refreshLimit,
      timeoutMs: process.env.RUNYU_JUDGMENTS_TIMEOUT_MS || config.judgmentLibrary?.timeoutMs,
      refreshKeywords: process.env.RUNYU_JUDGMENTS_REFRESH_KEYWORDS || config.judgmentLibrary?.refreshKeywords
    });
  }
}

function applyUserDataOverride() {
  if (process.env.WECHAT_KF_DESKTOP_USER_DATA) {
    app.setPath("userData", resolve(process.env.WECHAT_KF_DESKTOP_USER_DATA));
    return;
  }
  if (!app.isPackaged) return;
  app.setPath("userData", resolve(app.getPath("appData"), APP_USER_DATA_DIR_NAME));
}

async function migrateLegacyUserData() {
  if (process.env.WECHAT_KF_DESKTOP_USER_DATA || !app.isPackaged) return;
  const currentDir = app.getPath("userData");
  const legacyDir = resolve(app.getPath("appData"), LEGACY_USER_DATA_DIR_NAME);
  if (currentDir === legacyDir || !existsSync(legacyDir)) return;
  if (existsSync(resolve(currentDir, "desktop-config.json"))) return;
  try {
    await mkdir(currentDir, { recursive: true });
    await cp(legacyDir, currentDir, {
      recursive: true,
      force: false,
      errorOnExist: false
    });
    console.log(`[desktop] migrated legacy user data from ${legacyDir} to ${currentDir}`);
  } catch (error) {
    console.error("[desktop] migrate legacy user data failed", error);
  }
}

function defaultConfig() {
  const replyDefaults = loadBundledReplyDefaults();
  return {
    kfUrl: "https://store.weixin.qq.com/shop/kf",
    lastKfUrl: "",
    autoStart: true,
    bot: {
      configVersion: BOT_CONFIG_VERSION,
      enabled: true,
      aiFallback: true,
      aiEndpoint: `http://127.0.0.1:${PORT}/reply`,
      quickAck: replyDefaults.quickAck || "我看一下",
      quickAckReplies: normalizeReplyTextList(replyDefaults.quickAckReplies || replyDefaults.quickAck || [
        "我看一下",
        "稍等，我看下说明",
        "这个问题我看一下"
      ]),
      quickAckEveryMessage: replyDefaults.quickAckEveryMessage !== false,
      fallbackReply: replyDefaults.fallbackReply || "这个问题我先看到了\n系统还在处理，您稍等一下",
      fallbackReplies: normalizeReplyTextList(replyDefaults.fallbackReplies || replyDefaults.fallbackReply || [
        "这个问题我先看到了\n系统还在处理，您稍等一下",
        "我这边还没拿到准确答案\n您稍等一下",
        "稍等，我尽量给您准确回复"
      ]),
      aiSlowMs: Number(replyDefaults.aiSlowMs || 15000),
      fallbackReplyMs: Number(replyDefaults.fallbackReplyMs || 60000),
      noResponseAlertMs: 90000,
      maxTextParts: Number(replyDefaults.maxTextParts || 2),
      maxReplyPartLength: Number(replyDefaults.maxReplyPartLength || 500),
      imageRepliesEnabled: replyDefaults.imageRepliesEnabled !== false,
      autoPasteImages: true,
      panelAutoActionsEnabled: false,
      rules: replyDefaults.rules || [],
      imageReplies: replyDefaults.imageReplies || [],
      actionRules: replyDefaults.actionRules || []
    },
    floatWindow: {
      uiVersion: 7,
      enabled: true,
      visible: true,
      alwaysOnTop: true,
      mode: "compact",
      bounds: null,
      compactSize: { width: 344, height: 256 },
      miniSize: { width: 244, height: 52 },
      settingsSize: { width: 344, height: 256 }
    },
    notify: {
      enabled: Boolean(process.env.WECOM_BOT_WEBHOOK_URL),
      type: "wecom_bot",
      wecomWebhookUrl: process.env.WECOM_BOT_WEBHOOK_URL || "",
      cooldownMs: 300_000,
      hourlySummaryEnabled: true,
      hourlySummaryIntervalHours: 1,
      dailySummaryEnabled: true,
      dailySummaryHour: 10,
      dailySummaryTime: "10:00",
      summaryDetailLimit: 12,
      successReplyMode: "log_only",
      eventRules: {
        app: true,
        health: true,
        page: true,
        login: true,
        replyFailed: true,
        replyTimeout: true,
        replySuccess: false,
        summaries: true
      }
    },
    judgmentLibrary: {
      enabled: false,
      useCache: true,
      useRemote: true,
      autoRefreshEnabled: true,
      refreshIntervalHours: 168,
      sources: ["runyu", "liurun", "xiangshui", "xingxing", "book", "dedao"],
      searchTypes: ["judgments", "quotes", "cases"],
      maxResults: 4,
      limitPerQuery: 8,
      refreshLimit: 80,
      fullDownloadPageLimit: 300,
      fullDownloadMaxPages: 20,
      timeoutMs: 12000,
      refreshKeywords: ["会员", "退款", "课程", "订单", "发票", "社群", "视频号", "直播", "线下课", "小店"],
      lastAutoRefreshAt: 0
    },
    watchdog: {
      enabled: true,
      aiHealthMs: 60_000,
      pageHealthMs: 60_000,
      botHeartbeatMs: 60_000,
      runyuAuthHealthMs: 10 * 60_000,
      reloadOnBotStale: true,
      preventAppSuspension: true
    }
  };
}

function loadBundledReplyDefaults() {
  try {
    if (!existsSync(BUNDLED_REPLIES_PATH)) return {};
    const parsed = JSON.parse(readFileSync(BUNDLED_REPLIES_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[desktop] bundled replies load failed", error);
    return {};
  }
}

async function loadConfig() {
  const base = defaultConfig();
  base.configSchemaVersion = DESKTOP_CONFIG_SCHEMA_VERSION;
  const path = configPath();
  if (!existsSync(path)) {
    configValidationState = { valid: true, version: DESKTOP_CONFIG_SCHEMA_VERSION, errors: [], backupPath: "" };
    return base;
  }

  let raw = "";
  try {
    raw = await readFile(path, "utf8");
    const saved = JSON.parse(raw);
    const initial = validateDesktopConfig(saved);
    const repaired = initial.valid ? saved : repairDesktopConfig(saved, base);
    const merged = mergeConfig(base, repaired);
    merged.configSchemaVersion = DESKTOP_CONFIG_SCHEMA_VERSION;
    const final = validateDesktopConfig(merged);
    const backupPath = initial.valid ? "" : await backupInvalidConfig(raw, initial.errors);
    configValidationState = { ...final, repaired: !initial.valid, sourceErrors: initial.errors, backupPath };
    return merged;
  } catch (error) {
    const errors = [{ path: "$", code: "INVALID_JSON", message: safeErrorMessage(error) }];
    const backupPath = raw ? await backupInvalidConfig(raw, errors) : "";
    configValidationState = { valid: false, version: DESKTOP_CONFIG_SCHEMA_VERSION, errors, backupPath };
    console.error("[desktop] config load failed", safeErrorMessage(error));
    return base;
  }
}

async function saveConfig() {
  config.configSchemaVersion = DESKTOP_CONFIG_SCHEMA_VERSION;
  configValidationState = {
    ...configValidationState,
    ...validateDesktopConfig(config),
    repaired: Boolean(configValidationState.repaired),
    sourceErrors: configValidationState.sourceErrors || [],
    backupPath: configValidationState.backupPath || ""
  };
  await mkdir(dirname(configPath()), { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
}

async function backupInvalidConfig(raw, errors) {
  const path = `${configPath()}.invalid-${Date.now()}.bak`;
  await writeFile(path, `${raw}\n`, "utf8").catch(() => {});
  console.warn("[desktop] invalid config repaired", errors.map((item) => item.path).join(", "));
  return path;
}

function runtimeConfigRoot() {
  if (process.env.WECHAT_KF_DESKTOP_USER_DATA) return app.getPath("userData");
  return app.isPackaged ? app.getPath("userData") : APP_ROOT;
}

function envPath() {
  return resolve(runtimeConfigRoot(), ".env");
}

function assistantProfilePath() {
  return resolve(runtimeConfigRoot(), "assistant-profile.json");
}

async function ensureRuntimeConfigFiles() {
  if (!app.isPackaged) return;
  await mkdir(runtimeConfigRoot(), { recursive: true });
  if (!existsSync(assistantProfilePath()) && existsSync(BUNDLED_ASSISTANT_PROFILE_PATH)) {
    await writeFile(assistantProfilePath(), readFileSync(BUNDLED_ASSISTANT_PROFILE_PATH, "utf8"), "utf8");
  }
  const bundledReplyImagesDir = preferUnpackedPath(BUNDLED_REPLY_IMAGES_DIR);
  if (existsSync(bundledReplyImagesDir)) {
    await cp(bundledReplyImagesDir, resolve(runtimeConfigRoot(), "config/reply-images"), {
      recursive: true,
      force: false,
      errorOnExist: false
    }).catch((error) => console.error("[desktop] copy reply images failed", error));
  }
}

function configPath() {
  return resolve(app.getPath("userData"), "desktop-config.json");
}

function notifyOutboxPath() {
  return resolve(app.getPath("userData"), "notify-outbox.json");
}

function replyRecordsPath() {
  return resolve(app.getPath("userData"), "reply-records.json");
}

function replySummaryStatePath() {
  return resolve(app.getPath("userData"), "reply-summary-state.json");
}

function runyuAuthHistoryPath() {
  return resolve(app.getPath("userData"), "runyu-auth-history.json");
}

function mergeConfig(base, saved) {
  const savedFloatWindow = saved?.floatWindow || {};
  const resetFloatingSizes = Number(savedFloatWindow.uiVersion || 0) !== Number(base.floatWindow.uiVersion);
  const migratedCompactSize = resetFloatingSizes ? base.floatWindow.compactSize : savedFloatWindow.compactSize || {};
  const migratedMiniSize = resetFloatingSizes ? base.floatWindow.miniSize : savedFloatWindow.miniSize || {};
  return {
    ...base,
    ...saved,
    bot: mergeBotConfig(base.bot, saved?.bot || {}),
    floatWindow: {
      ...base.floatWindow,
      ...savedFloatWindow,
      uiVersion: base.floatWindow.uiVersion,
      mode: normalizeFloatingMode(savedFloatWindow.mode || base.floatWindow.mode),
      compactSize: {
        ...base.floatWindow.compactSize,
        ...normalizeFloatingSize("compact", migratedCompactSize)
      },
      miniSize: {
        ...base.floatWindow.miniSize,
        ...normalizeFloatingSize("mini", migratedMiniSize)
      },
      settingsSize: {
        ...base.floatWindow.settingsSize,
        ...(savedFloatWindow.settingsSize || {})
      }
    },
    notify: {
      ...base.notify,
      ...(saved?.notify || {}),
      eventRules: {
        ...base.notify.eventRules,
        ...(saved?.notify?.eventRules || {})
      }
    },
    judgmentLibrary: normalizeJudgmentLibraryConfig({
      ...base.judgmentLibrary,
      ...(saved?.judgmentLibrary || {})
    }),
    watchdog: normalizeWatchdogConfig({ ...base.watchdog, ...(saved?.watchdog || {}) })
  };
}

function normalizeWatchdogConfig(value = {}) {
  return {
    enabled: value.enabled !== false,
    aiHealthMs: clampInt(value.aiHealthMs ?? 60_000, 15_000, 3_600_000),
    pageHealthMs: clampInt(value.pageHealthMs ?? 60_000, 15_000, 3_600_000),
    botHeartbeatMs: clampInt(value.botHeartbeatMs ?? 60_000, 15_000, 3_600_000),
    runyuAuthHealthMs: clampInt(value.runyuAuthHealthMs ?? 10 * 60_000, 60_000, 24 * 60 * 60_000),
    reloadOnBotStale: value.reloadOnBotStale !== false,
    preventAppSuspension: value.preventAppSuspension !== false
  };
}

function mergeBotConfig(baseBot, savedBot) {
  const bot = { ...baseBot, ...savedBot };
  const oldVersion = savedBot?.configVersion !== BOT_CONFIG_VERSION;
  bot.quickAckReplies = normalizeReplyTextList(savedBot.quickAckReplies || savedBot.quickAck || baseBot.quickAckReplies);
  bot.fallbackReplies = normalizeReplyTextList(savedBot.fallbackReplies || savedBot.fallbackReply || baseBot.fallbackReplies);
  if (oldVersion && Number(savedBot.aiSlowMs || 0) >= 50000) bot.aiSlowMs = baseBot.aiSlowMs;
  if (!Number.isFinite(Number(bot.aiSlowMs)) || Number(bot.aiSlowMs) <= 0) bot.aiSlowMs = baseBot.aiSlowMs;
  if (!Number.isFinite(Number(bot.fallbackReplyMs)) || Number(bot.fallbackReplyMs) <= 0) bot.fallbackReplyMs = baseBot.fallbackReplyMs;
  bot.configVersion = BOT_CONFIG_VERSION;
  bot.rules = mergeRuleList(baseBot.rules, savedBot.rules);
  bot.actionRules = mergeRuleList(baseBot.actionRules, savedBot.actionRules);
  bot.imageReplies = mergeRuleList(baseBot.imageReplies, savedBot.imageReplies);
  return bot;
}

function normalizeReplyTextList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/\n{2,}|[|｜]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeRuleList(defaultRules, savedRules) {
  const defaults = cloneJson(Array.isArray(defaultRules) ? defaultRules : []);
  const saved = cloneJson(Array.isArray(savedRules) ? savedRules : []);
  if (!saved.length) return defaults;
  if (!defaults.length) return saved;

  const defaultsByKey = new Map(defaults.map((rule) => [ruleKey(rule), rule]).filter(([key]) => key));
  const usedDefaultKeys = new Set();
  const merged = saved.map((rule) => {
    const key = ruleKey(rule);
    const defaultRule = key ? defaultsByKey.get(key) : null;
    if (!defaultRule) return rule;
    usedDefaultKeys.add(key);
    return mergeRule(defaultRule, rule);
  });

  for (const rule of defaults) {
    const key = ruleKey(rule);
    if (!key || !usedDefaultKeys.has(key)) merged.push(rule);
  }

  return merged;
}

function mergeRule(defaultRule, savedRule) {
  const rule = { ...defaultRule, ...savedRule };
  if (Array.isArray(defaultRule.keywords)) {
    if (Array.isArray(savedRule.keywords) && savedRule.keywords.length > 0) {
      rule.keywords = mergeTextList(defaultRule.keywords, savedRule.keywords);
    } else {
      rule.keywords = defaultRule.keywords;
    }
  }
  if (Array.isArray(defaultRule.actions) && (!Array.isArray(savedRule.actions) || savedRule.actions.length === 0)) {
    rule.actions = defaultRule.actions;
  }
  if (typeof defaultRule.reply === "string" && !String(savedRule.reply || "").trim()) {
    rule.reply = defaultRule.reply;
  }
  if (defaultRule.path && !savedRule.path) rule.path = defaultRule.path;
  return cloneJson(rule);
}

function mergeTextList(defaultItems, savedItems) {
  const output = [];
  for (const item of [...(defaultItems || []), ...(savedItems || [])]) {
    const text = String(item || "").trim();
    if (text && !output.includes(text)) output.push(text);
  }
  return output;
}

function ruleKey(rule) {
  const name = String(rule?.name || "").trim();
  if (name) return `name:${name}`;
  const pathKey = String(rule?.path || rule?.imagePath || "").trim();
  if (pathKey) return `path:${pathKey}`;
  const keywords = Array.isArray(rule?.keywords) ? rule.keywords.join("|") : String(rule?.keywords || "");
  return keywords.trim() ? `keywords:${keywords.trim()}` : "";
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

async function startAiServerWithNotify() {
  try {
    const { startAiServer } = await import("../server.js");
    try {
      aiServer = await startAiServer({ port: PORT, host: "127.0.0.1" });
      activeAiPort = PORT;
    } catch (error) {
      if (!String(error?.message || "").includes("EADDRINUSE")) throw error;
      const existing = await fetchJson(`http://127.0.0.1:${PORT}/health`, 2000).catch(() => null);
      if (isCompatibleAiService(existing)) {
        activeAiPort = PORT;
        aiServer = null;
      } else {
        aiServer = await startAiServerOnFallbackPort(startAiServer);
      }
    }
    await syncLocalAiEndpoint();
    await checkAiHealth({ notifyOk: false });
  } catch (error) {
    lastAiHealth = {
      ok: false,
      hasKey: false,
      at: Date.now(),
      message: String(error?.message || error)
    };
    await sendNotification("ai_start_failed", "本地 AI 服务启动失败", lastAiHealth.message, {
      severity: "critical",
      recoveryKey: "ai",
      cooldownMs: 60_000
    });
  }
}

async function startAiServerOnFallbackPort(startAiServer) {
  let lastError = null;
  for (let port = PORT + 1; port <= PORT + 20; port += 1) {
    try {
      const server = await startAiServer({ port, host: "127.0.0.1" });
      activeAiPort = port;
      return server;
    } catch (error) {
      lastError = error;
      if (!String(error?.message || "").includes("EADDRINUSE")) throw error;
    }
  }
  throw new Error(`LOCAL_AI_NO_AVAILABLE_PORT: ${String(lastError?.message || "8787-8807 均被占用")}`);
}

function localAiUrl(pathname = "/health") {
  const path = String(pathname || "/health").startsWith("/") ? pathname : `/${pathname}`;
  return `http://127.0.0.1:${activeAiPort}${path}`;
}

function isCompatibleAiService(data) {
  const routes = Array.isArray(data?.routes) ? data.routes : [];
  return data?.serviceName === AI_SERVICE_NAME &&
    Number(data?.protocolVersion || 0) >= AI_SERVICE_PROTOCOL &&
    AI_REQUIRED_ROUTES.every((route) => routes.includes(route));
}

async function syncLocalAiEndpoint() {
  if (!config?.bot) return;
  const endpoint = localAiUrl("/reply");
  const oldValue = config.bot.aiEndpoint;
  config.bot.aiEndpoint = endpoint;
  await saveConfig();
  if (oldValue !== endpoint) sendConfigChanges({ aiEndpoint: { oldValue, newValue: endpoint } });
}

async function restartAiServer() {
  if (aiRestarting) return;
  aiRestarting = true;
  try {
    if (aiServer) {
      await new Promise((resolveClose) => aiServer.close(resolveClose));
      aiServer = null;
    }
    await startAiServerWithNotify();
  } finally {
    aiRestarting = false;
  }
}

async function startDesktopControlServer() {
  if (controlServer) return;

  controlServer = createHttpServer(async (req, res) => {
    try {
      setControlCors(req, res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://127.0.0.1:${CONTROL_PORT}`);
      if (!isControlRequestAuthorized(req, url)) {
        controlJson(res, 401, { ok: false, code: "CONTROL_UNAUTHORIZED", message: "缺少或错误的本机控制 Token" });
        return;
      }
      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/status")) {
        controlJson(res, 200, {
          ok: true,
          port: CONTROL_PORT,
          app: APP_DISPLAY_NAME,
          authRequired: true,
          tokenConfigured: Boolean(controlToken),
          page: pageInfoPayload(),
          status: statusPayload()
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/inspect") {
        controlJson(res, 200, await inspectLivePage());
        return;
      }

      if (req.method === "GET" && url.pathname === "/capture") {
        controlJson(res, 200, await capturePageStructure());
        return;
      }

      if (req.method === "GET" && url.pathname === "/judgments/status") {
        controlJson(res, 200, await getJudgmentLibraryStatus());
        return;
      }

      if (req.method === "POST" && url.pathname === "/judgments/search") {
        const body = await readControlJson(req);
        controlJson(res, 200, await testJudgmentLibrary(body || {}));
        return;
      }

      if (req.method === "POST" && url.pathname === "/judgments/refresh") {
        const body = await readControlJson(req);
        controlJson(res, 200, await refreshJudgmentLibrary(body || {}));
        return;
      }

      if (req.method === "POST" && url.pathname === "/judgments/full-download") {
        const body = await readControlJson(req);
        controlJson(res, 200, await startJudgmentFullDownload(body || {}));
        return;
      }

      if (req.method === "GET" && url.pathname === "/judgments/download-status") {
        controlJson(res, 200, getJudgmentDownloadStatus());
        return;
      }

      if (req.method === "POST" && url.pathname === "/action") {
        const body = await readControlJson(req);
        controlJson(res, 200, await runPageAction(body || {}));
        return;
      }

      controlJson(res, 404, { ok: false, message: "not found" });
    } catch (error) {
      controlJson(res, 500, { ok: false, message: safeErrorMessage(error) });
    }
  });

  await new Promise((resolveStart, rejectStart) => {
    const onError = (error) => {
      controlServer.off("listening", onListening);
      if (error?.code === "EADDRINUSE") {
        console.warn(`[desktop-control] port ${CONTROL_PORT} already in use`);
        resolveStart();
        return;
      }
      rejectStart(error);
    };
    const onListening = () => {
      controlServer.off("error", onError);
      console.log(`[desktop-control] listening on http://127.0.0.1:${CONTROL_PORT}`);
      resolveStart();
    };
    controlServer.once("error", onError);
    controlServer.once("listening", onListening);
    controlServer.listen(CONTROL_PORT, "127.0.0.1");
  });
}

function setControlCors(req, res) {
  const origin = allowedCorsOrigin(req.headers.origin);
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-control-token,authorization");
  res.setHeader("Vary", "Origin");
}

async function ensureDesktopControlToken() {
  controlToken = process.env.DESKTOP_CONTROL_TOKEN || readEnvValues().DESKTOP_CONTROL_TOKEN || "";
  if (!controlToken) {
    controlToken = randomBytes(24).toString("hex");
    await writeEnvValues({ DESKTOP_CONTROL_TOKEN: controlToken });
  }
  process.env.DESKTOP_CONTROL_TOKEN = controlToken;
  return controlToken;
}

function isControlRequestAuthorized(req, url) {
  if (req.method === "GET" && ["/health", "/status"].includes(url.pathname)) return true;
  const authorization = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const header = String(req.headers["x-control-token"] || "").trim();
  return Boolean(controlToken && [authorization, header].includes(controlToken));
}

function allowedCorsOrigin(origin) {
  const value = String(origin || "").trim();
  if (!value) return "";
  if (["https://store.weixin.qq.com", "http://127.0.0.1", "http://localhost"].includes(value)) return value;
  if (/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(value)) return value;
  return "";
}

function controlJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readControlJson(req) {
  return new Promise((resolveRead, rejectRead) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy(new Error("request body too large"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolveRead({});
        return;
      }
      try {
        resolveRead(JSON.parse(body));
      } catch (error) {
        rejectRead(error);
      }
    });
    req.on("error", rejectRead);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: APP_DISPLAY_NAME,
    icon: APP_ICON_PATH,
    show: true,
    webPreferences: {
      preload: resolve(__dirname, "main-shell-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    updateFloatingStatus("后台运行", { code: "background", detail: "主窗口已隐藏，程序继续在后台运行" });
  });

  mainWindow.on("unresponsive", () => {
    sendNotification("shell_unresponsive", "控制台窗口无响应", "桌面程序将尝试重载控制台", {
      severity: "critical",
      recoveryKey: "shell",
      cooldownMs: 60_000
    });
    mainWindow.webContents.reload();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    sendNotification("shell_crashed", "控制台进程异常", `原因：${details.reason || "unknown"}，已尝试重开`, {
      severity: "critical",
      recoveryKey: "shell",
      cooldownMs: 60_000
    });
    mainWindow.loadFile(MAIN_SHELL_HTML_PATH);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    notifyHealthRecovered("shell", "控制台已恢复", "主控制台页面已重新加载。").catch((error) => console.error("[notify] shell recovery failed", error));
    broadcastStatus();
  });

  mainWindow.on("resize", layoutKfView);
  mainWindow.on("maximize", layoutKfView);
  mainWindow.on("unmaximize", layoutKfView);

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    sendNotification("shell_load_failed", "控制台加载失败", `${description || code}\n${url || ""}`, {
      severity: "critical",
      recoveryKey: "shell",
      cooldownMs: 60_000
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    getKfWebContents()?.loadURL(url);
    setMainMode("page").catch((error) => console.error("[desktop] set page mode failed", error));
    return { action: "deny" };
  });

  mainWindow.loadFile(MAIN_SHELL_HTML_PATH);
  createKfView();
  showKfView();
}

function createKfView() {
  if (kfView && !kfView.webContents.isDestroyed()) return kfView;

  kfViewAttached = false;
  kfView = new BrowserView({
    webPreferences: {
      preload: resolve(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      partition: "persist:wechat-kf-desktop"
    }
  });

  const wc = kfView.webContents;
  wc.on("unresponsive", () => {
    sendNotification("page_unresponsive", "客服页面无响应", "桌面程序将尝试重载客服页面", {
      severity: "critical",
      recoveryKey: "page",
      cooldownMs: 60_000
    });
    wc.reload();
  });

  wc.on("render-process-gone", (_event, details) => {
    sendNotification("page_crashed", "客服页面进程异常", `原因：${details.reason || "unknown"}，已尝试重开`, {
      severity: "critical",
      recoveryKey: "page",
      cooldownMs: 60_000
    });
    wc.loadURL(config.kfUrl);
  });

  wc.on("did-finish-load", () => {
    notifyHealthRecovered("page", "客服页面已恢复", "微信小店客服页已重新加载。").catch((error) => console.error("[notify] page recovery failed", error));
    inspectLoginState();
    injectBotScript();
    persistAuthenticatedKfUrlSoon();
    flushKfSessionSoon();
    broadcastStatus();
  });

  wc.on("did-navigate", () => {
    notifyHealthRecovered("page", "客服页面已恢复", "微信小店客服页导航已恢复。").catch((error) => console.error("[notify] page recovery failed", error));
    inspectLoginState();
    injectBotScript();
    persistAuthenticatedKfUrlSoon();
    flushKfSessionSoon();
    broadcastStatus();
  });

  wc.on("did-fail-load", (_event, code, description, url) => {
    sendNotification("page_load_failed", "客服页面加载失败", `${description || code}\n${url || ""}`, {
      severity: "critical",
      recoveryKey: "page",
      cooldownMs: 60_000
    });
    broadcastStatus();
  });

  wc.setWindowOpenHandler(({ url }) => {
    wc.loadURL(url);
    return { action: "deny" };
  });

  wc.loadURL(initialKfUrl());
  return kfView;
}

function initialKfUrl() {
  const lastUrl = String(config?.lastKfUrl || "").trim();
  return isAuthenticatedKfUrl(lastUrl) ? lastUrl : config.kfUrl;
}

let authenticatedUrlTimer = null;

function persistAuthenticatedKfUrlSoon() {
  clearTimeout(authenticatedUrlTimer);
  authenticatedUrlTimer = setTimeout(async () => {
    const wc = getKfWebContents();
    if (!wc || wc.isDestroyed()) return;
    const url = wc.getURL();
    if (!isAuthenticatedKfUrl(url)) return;
    if (config.lastKfUrl === url) return;
    config.lastKfUrl = url;
    await saveConfig();
  }, 1000);
}

function isAuthenticatedKfUrl(url) {
  return /^https:\/\/store\.weixin\.qq\.com\/shop\/kf(?:[?#].*)?$/.test(String(url || ""));
}

function getKfWebContents() {
  if (!kfView || kfView.webContents.isDestroyed()) return null;
  return kfView.webContents;
}

let sessionFlushTimer = null;

function flushKfSessionSoon() {
  clearTimeout(sessionFlushTimer);
  sessionFlushTimer = setTimeout(() => {
    flushKfSession().catch((error) => console.error("[desktop] flush kf session failed", error));
  }, 1200);
}

async function flushKfSession() {
  const wc = getKfWebContents();
  if (!wc || wc.isDestroyed()) return;
  const ses = wc.session;
  if (ses?.cookies?.flushStore) await ses.cookies.flushStore();
  if (ses?.flushStorageData) await ses.flushStorageData();
}

function ensureKfView() {
  return createKfView();
}

function pageInfoPayload() {
  const wc = getKfWebContents();
  if (!wc) {
    return {
      ready: false,
      visible: false,
      url: "",
      title: "",
      loading: false,
      authenticated: false,
      scriptHealthy: false,
      scriptUpdatedAt: lastBotHeartbeatAt
    };
  }

  const url = wc.getURL();
  const heartbeatLimit = Number(config?.watchdog?.botHeartbeatMs || 60_000);

  return {
    ready: true,
    visible: Boolean(kfViewAttached && mainMode === "page"),
    url,
    title: wc.getTitle(),
    loading: wc.isLoading(),
    authenticated: isAuthenticatedKfUrl(url),
    scriptHealthy: Boolean(lastBotHeartbeatAt && Date.now() - lastBotHeartbeatAt < heartbeatLimit),
    scriptUpdatedAt: lastBotHeartbeatAt
  };
}

function showKfView() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  ensureKfView();
  if (!kfViewAttached) {
    mainWindow.addBrowserView(kfView);
    kfViewAttached = true;
  }
  mainWindow.setTopBrowserView(kfView);
  layoutKfView();
}

function hideKfView() {
  if (!mainWindow || mainWindow.isDestroyed() || !kfView || !kfViewAttached) return;
  mainWindow.removeBrowserView(kfView);
  kfViewAttached = false;
}

function layoutKfView() {
  if (!mainWindow || mainWindow.isDestroyed() || !kfView || !kfViewAttached) return;
  const [width, height] = mainWindow.getContentSize();
  kfView.setBounds({
    x: MAIN_SHELL_SIDEBAR_WIDTH,
    y: 0,
    width: Math.max(0, width - MAIN_SHELL_SIDEBAR_WIDTH),
    height: Math.max(0, height)
  });
  kfView.setAutoResize({ width: true, height: true });
}

async function setMainMode(mode) {
  const normalized = String(mode || "page").trim() || "page";
  mainMode = normalized;
  if (normalized === "page") {
    showKfView();
    getKfWebContents()?.focus();
  } else {
    hideKfView();
  }
  broadcastStatus();
  return statusPayload();
}

function createFloatingWindow() {
  if (!config.floatWindow.enabled || config.floatWindow.visible === false) return;

  const mode = normalizeFloatingMode(config.floatWindow.mode);
  const modeSize = floatingSizeForMode(mode);
  const savedBounds = normalizeBounds(config.floatWindow.bounds);
  const initialBounds = {
    width: modeSize.width,
    height: modeSize.height,
    ...(Number.isFinite(Number(savedBounds?.x)) && Number.isFinite(Number(savedBounds?.y))
      ? { x: savedBounds.x, y: savedBounds.y }
      : {})
  };

  floatWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    frame: false,
    resizable: false,
    movable: true,
    icon: APP_ICON_PATH,
    alwaysOnTop: Boolean(config.floatWindow.alwaysOnTop),
    skipTaskbar: true,
    title: `${APP_DISPLAY_NAME}状态`,
    webPreferences: {
      preload: resolve(__dirname, "floating-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  floatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatWindow.loadFile(FLOATING_HTML_PATH);
  floatWindow.once("ready-to-show", () => broadcastStatus());
  floatWindow.on("move", persistFloatingBoundsSoon);
  floatWindow.on("resize", persistFloatingBoundsSoon);
  floatWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    floatWindow.hide();
    config.floatWindow.visible = false;
    saveConfig().catch((error) => console.error("[desktop] save floating visible failed", error));
    broadcastStatus();
  });
}

function createTray() {
  tray = new Tray(createTrayImage());
  tray.setToolTip(APP_DISPLAY_NAME);
  tray.on("click", () => showMainWindow());
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const enabled = Boolean(config.bot.enabled);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `打开${APP_DISPLAY_NAME}`, click: showMainWindow },
    { label: "显示悬浮窗", click: showFloatingWindow },
    { label: enabled ? "暂停 Bot 接管" : "开启 Bot 接管", click: () => setBotEnabled(!enabled) },
    { label: "重载客服页", click: reloadKfPage },
    { label: "检查 AI 服务", click: () => checkAiHealth({ notifyOk: true }) },
    { type: "separator" },
    {
      label: "退出程序",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
}

function createTrayImage() {
  const image = existsSync(APP_ICON_PATH)
    ? nativeImage.createFromPath(APP_ICON_PATH)
    : nativeImage.createEmpty();
  if (image.isEmpty()) {
    return nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAI0lEQVR4AWNkYGD4z0ABYBw1gGE0DBqG////GQkE0KQBAEOjAhHhXi8YAAAAAElFTkSuQmCC");
  }
  return image;
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== "object") return null;
  const width = clampInt(bounds.width, 160, 1200);
  const height = clampInt(bounds.height, 44, 1000);
  const normalized = { width, height };
  if (Number.isFinite(Number(bounds.x)) && Number.isFinite(Number(bounds.y))) {
    const display = screen.getDisplayMatching({
      x: Math.round(Number(bounds.x)),
      y: Math.round(Number(bounds.y)),
      width,
      height
    });
    const area = display.workArea;
    normalized.x = clampInt(Number(bounds.x), area.x, area.x + area.width - width);
    normalized.y = clampInt(Number(bounds.y), area.y, area.y + area.height - height);
  }
  return normalized;
}

function clampInt(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function persistFloatingBoundsSoon() {
  if (!floatWindow || floatWindow.isDestroyed()) return;
  clearTimeout(floatingBoundsTimer);
  floatingBoundsTimer = setTimeout(async () => {
    if (!floatWindow || floatWindow.isDestroyed()) return;
    config.floatWindow.bounds = normalizeBounds(floatWindow.getBounds());
    const mode = normalizeFloatingMode(config.floatWindow.mode);
    if (mode === "mini") {
      config.floatWindow.miniSize = {
        width: config.floatWindow.bounds.width,
        height: config.floatWindow.bounds.height
      };
    } else {
      config.floatWindow.compactSize = {
        width: config.floatWindow.bounds.width,
        height: config.floatWindow.bounds.height
      };
    }
    await saveConfig();
    broadcastStatus();
  }, 500);
}

function showFloatingWindow() {
  if (floatWindow && !floatWindow.isDestroyed()) {
    config.floatWindow.enabled = true;
    config.floatWindow.visible = true;
    saveConfig().catch((error) => console.error("[desktop] save floating visible failed", error));
    floatWindow.show();
    floatWindow.focus();
    broadcastStatus();
    return;
  }

  config.floatWindow.enabled = true;
  config.floatWindow.visible = true;
  saveConfig().catch((error) => console.error("[desktop] save floating enabled failed", error));
  createFloatingWindow();
}

async function setFloatingMode(mode) {
  if (!floatWindow || floatWindow.isDestroyed()) return false;
  const normalized = normalizeFloatingMode(mode);
  const size = floatingSizeForMode(normalized);
  const width = size.width;
  const height = size.height;
  config.floatWindow.mode = normalized;
  floatWindow.setSize(width, height, true);
  config.floatWindow.bounds = normalizeBounds(floatWindow.getBounds());
  await saveConfig();
  broadcastStatus();
  return true;
}

function normalizeFloatingMode(mode) {
  return String(mode || "").trim() === "mini" ? "mini" : "compact";
}

function floatingSizeForMode(mode) {
  const normalized = normalizeFloatingMode(mode);
  const size = normalized === "mini" ? config.floatWindow.miniSize : config.floatWindow.compactSize;
  return normalizeFloatingSize(normalized, size);
}

function normalizeFloatingSize(mode, size = {}) {
  const normalized = normalizeFloatingMode(mode);
  const defaults = normalized === "mini"
    ? { width: 244, height: 52 }
    : { width: 344, height: 256 };
  return {
    width: clampInt(size?.width || defaults.width, defaults.width, defaults.width),
    height: clampInt(size?.height || defaults.height, defaults.height, defaults.height)
  };
}

async function setFloatingAlwaysOnTop(value) {
  config.floatWindow.alwaysOnTop = Boolean(value);
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.setAlwaysOnTop(Boolean(value));
  }
  await saveConfig();
  broadcastStatus();
  return true;
}

async function injectBotScript() {
  const wc = getKfWebContents();
  if (!wc) return;
  const url = wc.getURL();
  if (!url.includes("store.weixin.qq.com")) return;

  try {
    const pageState = await readLoginPageState(wc).catch(() => null);
    if (!isAuthenticatedKfUrl(url) && pageState?.hasLoginText && !pageState?.hasInput) {
      if (!pageState.hasQr) updateFloatingStatus("等待二维码");
      scheduleLoginScreenshotNotification();
      updateFloatingStatus(pageState.hasQr ? "等待扫码确认" : "等待二维码");
      return;
    }

    const content = await readFile(CONTENT_SCRIPT_PATH, "utf8");
    await wc.executeJavaScript(content, true);
    lastBotHeartbeatAt = Date.now();
    updateFloatingStatus("脚本已注入", {
      code: "script_ready",
      detail: "自动回复脚本已注入，正在监听客户消息",
      href: url,
      title: wc.getTitle()
    });
    await notifyHealthRecovered("bot", "自动回复脚本已恢复", "客服页自动回复脚本已重新注入。");
  } catch (error) {
    await sendNotification("bot_inject_failed", "自动回复脚本注入失败", String(error?.message || error), {
      severity: "critical",
      recoveryKey: "bot",
      cooldownMs: 60_000
    });
  }
}

function registerIpc() {
  ipcMain.handle("desktop-storage-get", (_event, defaults = {}) => ({
    ...defaults,
    ...config.bot
  }));

  ipcMain.handle("desktop-storage-set", async (_event, items = {}) => {
    const changes = {};
    for (const [key, value] of Object.entries(items)) {
      changes[key] = { oldValue: config.bot[key], newValue: value };
      config.bot[key] = value;
    }
    await saveConfig();
    sendConfigChanges(changes);
    updateTrayMenu();
    broadcastStatus();
    return true;
  });

  ipcMain.on("bot-status", (_event, status) => {
    lastBotHeartbeatAt = Date.now();
    updateFloatingStatus(status?.status || status?.label || "检测中", status || {});
  });

  ipcMain.on("bot-event", (_event, event) => {
    handleBotEvent(event);
  });

  ipcMain.handle("float-open-main", () => showMainWindow());
  ipcMain.handle("float-open-page", async () => {
    showMainWindow();
    await setMainMode("page");
    return statusPayload();
  });
  ipcMain.handle("float-toggle-enabled", () => setBotEnabled(!config.bot.enabled));
  ipcMain.handle("float-reload", () => reloadKfPage());
  ipcMain.handle("float-get-status", () => statusPayload());
  ipcMain.handle("float-get-settings", () => settingsPayload());
  ipcMain.handle("float-save-settings", (_event, payload) => saveDesktopSettings(payload || {}));
  ipcMain.handle("float-check-ai", async () => {
    await checkAiHealth({ notifyOk: false });
    return lastAiHealth;
  });
  ipcMain.handle("float-test-webhook", (_event, webhookUrl) => testWebhookUrl(webhookUrl));
  ipcMain.handle("float-set-mode", (_event, mode) => setFloatingMode(mode));
  ipcMain.handle("float-set-always-on-top", (_event, value) => setFloatingAlwaysOnTop(value));
  ipcMain.handle("float-set-preset", (_event, preset) => setFloatingPreset(preset));
  ipcMain.handle("float-hide", async () => {
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.hide();
    }
    config.floatWindow.visible = false;
    await saveConfig();
    broadcastStatus();
    return true;
  });
  ipcMain.handle("float-quit", () => requestFullQuit({ confirm: APP_DISPLAY_NAME, source: "floating" }));
  ipcMain.handle("float-choose-image", () => chooseImagePath());
  ipcMain.handle("bot-image-reply", (_event, payload) => handleImageReply(payload || {}));
  ipcMain.handle("page-open-floating", async (_event, mode = "compact") => {
    showFloatingWindow();
    if (mode === "settings") await setFloatingMode("settings");
    return true;
  });
  ipcMain.handle("page-capture-structure", () => capturePageStructure());
  ipcMain.handle("page-save-structure", (_event, snapshot) => savePageStructureSnapshot(snapshot || {}));
  ipcMain.handle("page-run-action", (_event, action) => runPageAction(action || {}));

  ipcMain.handle("main-get-status", () => statusPayload());
  ipcMain.handle("main-get-settings", () => settingsPayload());
  ipcMain.handle("main-save-settings", (_event, payload) => saveDesktopSettings(payload || {}));
  ipcMain.handle("main-set-mode", (_event, mode) => setMainMode(mode));
  ipcMain.handle("main-open-floating", async (_event, mode = "compact") => {
    showFloatingWindow();
    if (mode === "settings") await setFloatingMode("settings");
    return statusPayload();
  });
  ipcMain.handle("main-hide-floating", async () => {
    if (floatWindow && !floatWindow.isDestroyed()) floatWindow.hide();
    config.floatWindow.visible = false;
    await saveConfig();
    broadcastStatus();
    return statusPayload();
  });
  ipcMain.handle("main-toggle-enabled", () => setBotEnabled(!config.bot.enabled));
  ipcMain.handle("main-request-quit", (_event, payload = {}) => requestFullQuit(payload || {}));
  ipcMain.handle("main-reload", () => reloadKfPage());
  ipcMain.handle("main-check-ai", async () => {
    await checkAiHealth({ notifyOk: false });
    return lastAiHealth;
  });
  ipcMain.handle("main-test-webhook", (_event, webhookUrl) => testWebhookUrl(webhookUrl));
  ipcMain.handle("main-capture-structure", () => capturePageStructure());
  ipcMain.handle("main-run-action", (_event, action) => runPageAction(action || {}));
  ipcMain.handle("main-choose-image", () => chooseImagePath());
  ipcMain.handle("main-choose-file", (_event, options = {}) => chooseFilePath(options || {}));
  ipcMain.handle("main-reveal-path", (_event, targetPath = "") => revealPath(targetPath));
  ipcMain.handle("main-get-file-preview", (_event, targetPath = "") => getFilePreview(targetPath));
  ipcMain.handle("main-get-reply-records", (_event, options = {}) => replyRecordsPayload(options || {}));
  ipcMain.handle("main-test-ai-reply", (_event, payload = {}) => testAiReply(payload || {}));
  ipcMain.handle("main-test-rule-trigger", (_event, payload = {}) => testRuleTrigger(payload || {}));
  ipcMain.handle("main-get-judgments-status", () => getJudgmentLibraryStatus());
  ipcMain.handle("main-open-runyu-login", (_event, options = {}) => openRunyuLoginWindow(options || {}));
  ipcMain.handle("main-capture-runyu-cookie", () => captureAndVerifyRunyuCookie("manual_capture"));
  ipcMain.handle("main-verify-runyu-auth", () => selfCheckRunyuAuth({ notify: true, source: "manual_check" }));
  ipcMain.handle("main-bootstrap-runyu-library", () => bootstrapRunyuJudgmentLibrary({ notify: true, source: "manual_bootstrap" }));
  ipcMain.handle("main-clear-runyu-login", () => clearRunyuLogin());
  ipcMain.handle("main-test-judgments", (_event, payload = {}) => testJudgmentLibrary(payload || {}));
  ipcMain.handle("main-refresh-judgments", (_event, payload = {}) => refreshJudgmentLibrary(payload || {}));
  ipcMain.handle("main-start-judgments-full-download", (_event, payload = {}) => startJudgmentFullDownload(payload || {}));
  ipcMain.handle("main-get-judgments-download-status", () => getJudgmentDownloadStatus());
}

async function requestFullQuit(payload = {}) {
  const confirmed = String(payload.confirm || "") === APP_DISPLAY_NAME || payload.confirm === true;
  if (!confirmed) {
    return {
      ok: false,
      requireConfirm: true,
      confirmText: APP_DISPLAY_NAME,
      message: `再次确认将彻底退出${APP_DISPLAY_NAME}，Bot、AI、本机控制服务、Webhook调度和悬浮窗都会停止。`
    };
  }
  await shutdownAndQuit(String(payload.source || "main"));
  return { ok: true };
}

async function shutdownAndQuit(source = "main") {
  if (isQuitting) return;
  isQuitting = true;
  appContext.runtime.isQuitting = true;
  updateFloatingStatus("彻底退出", { code: "background", detail: `收到${source}退出指令，正在停止后台服务` });
  stopWatchdogs();
  clearTimeout(floatingBoundsTimer);
  clearTimeout(loginNotificationTimer);
  clearTimeout(runyuCookieCaptureTimer);
  clearTimeout(runyuLoginTimeoutTimer);
  clearTimeout(judgmentRefreshTimer);
  clearTimeout(notifyOutboxTimer);
  await Promise.allSettled([
    flushKfSession(),
    saveConfig(),
    saveNotifyOutbox(),
    saveReplyRecords(),
    saveReplySummaryState(),
    closeServer(controlServer),
    closeServer(aiServer)
  ]);
  controlServer = null;
  aiServer = null;
  stopPowerBlocker();
  for (const win of [runyuLoginWindow, floatWindow, mainWindow]) {
    if (win && !win.isDestroyed()) win.destroy();
  }
  app.quit();
}

function closeServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolveClose) => server.close(resolveClose));
}

function sendConfigChanges(changes) {
  const wc = getKfWebContents();
  if (!wc) return;
  wc.send("desktop-config-changed", changes);
}

async function setBotEnabled(enabled) {
  const oldValue = config.bot.enabled;
  config.bot.enabled = enabled;
  await saveConfig();
  sendConfigChanges({ enabled: { oldValue, newValue: enabled } });
  updateTrayMenu();
  updateFloatingStatus(enabled ? "检测中" : "暂停中", {
    code: enabled ? "monitoring" : "paused",
    detail: enabled ? "Bot已开启，正在检测客户消息" : "Bot已暂停，不会自动发送回复"
  });
  return statusPayload();
}

function reloadKfPage() {
  const wc = getKfWebContents() || ensureKfView().webContents;
  showKfView();
  mainMode = "page";
  wc.loadURL(config.kfUrl);
  updateFloatingStatus("页面加载", { code: "page_loading", detail: "正在重新加载微信小店客服页" });
}

function showMainWindow() {
  if (process.platform === "darwin") app.dock?.show();
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateFloatingStatus(status, extra = {}) {
  const raw = String(status || extra.status || "检测中").trim() || "检测中";
  const code = String(extra.code || inferBotStatusCode(raw, extra, { enabled: config?.bot?.enabled !== false })).trim() || "monitoring";
  const definition = BOT_RUNTIME_STATUSES[code] || BOT_RUNTIME_STATUSES.monitoring;
  const label = clipStatusLabel(extra.label || definition.label || raw);
  const next = {
    ...lastBotStatus,
    ...extra,
    code,
    label,
    status: label,
    detail: String(extra.detail || raw || definition.label).trim(),
    tone: String(extra.tone || definition.tone || "active"),
    category: String(extra.category || definition.category || "运行"),
    customer: clip(String(extra.customer || lastBotStatus.customer || ""), 80),
    actionType: String(extra.actionType || ""),
    at: Date.now()
  };
  lastBotStatus = next;
  const previous = botStatusHistory.at(-1);
  if (!previous || previous.code !== next.code || previous.detail !== next.detail || previous.customer !== next.customer) {
    botStatusHistory.push({
      code: next.code,
      label: next.label,
      status: next.status,
      detail: next.detail,
      tone: next.tone,
      category: next.category,
      customer: next.customer,
      actionType: next.actionType,
      at: next.at
    });
    botStatusHistory = botStatusHistory.slice(-BOT_STATUS_HISTORY_LIMIT);
  }
  broadcastStatus();
}

function broadcastStatus() {
  const payload = statusPayload();
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send("float-status", payload);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("main-status", payload);
  }
}

function statusPayload() {
  syncAppContext();
  const records = replyRecordStats(replyRecords);
  const payload = {
    appName: APP_DISPLAY_NAME,
    bot: lastBotStatus,
    botHistory: botStatusHistory,
    ai: lastAiHealth,
    enabled: Boolean(config?.bot?.enabled),
    notifyEnabled: Boolean(config?.notify?.enabled && config?.notify?.wecomWebhookUrl),
    notifyOutboxCount: notifyOutbox.length,
    kfUrl: config?.kfUrl || "",
    mode: mainMode,
    page: pageInfoPayload(),
    floating: {
      enabled: Boolean(config?.floatWindow?.enabled),
      visible: Boolean(floatWindow && !floatWindow.isDestroyed() && floatWindow.isVisible()),
      alwaysOnTop: Boolean(config?.floatWindow?.alwaysOnTop),
      mode: normalizeFloatingMode(config?.floatWindow?.mode),
      bounds: floatWindow && !floatWindow.isDestroyed() ? floatWindow.getBounds() : config?.floatWindow?.bounds || null
    },
    watchdog: {
      ...normalizeWatchdogConfig(config?.watchdog || {}),
      autoStart: Boolean(config?.autoStart),
      powerSaveBlockerActive: Boolean(blockerId != null && powerSaveBlocker.isStarted(blockerId)),
      timerCount: watchdogTimers.length
    },
    notify: {
      enabled: Boolean(config?.notify?.enabled && config?.notify?.wecomWebhookUrl),
      configured: Boolean(config?.notify?.wecomWebhookUrl),
      outboxCount: notifyOutbox.length,
      cooldownMs: Number(config?.notify?.cooldownMs || 0),
      hourlySummaryEnabled: Boolean(config?.notify?.hourlySummaryEnabled),
      hourlySummaryIntervalHours: Number(config?.notify?.hourlySummaryIntervalHours || 1),
      dailySummaryEnabled: Boolean(config?.notify?.dailySummaryEnabled),
      dailySummaryTime: String(config?.notify?.dailySummaryTime || `${config?.notify?.dailySummaryHour ?? 10}:00`)
    },
    runyuAuth: runyuAuthStatusPayload(),
    judgmentLibrary: config?.judgmentLibrary || {},
    judgmentDownload: getJudgmentDownloadStatus(),
    records,
    now: Date.now(),
    runtimeContext: snapshotAppContext(appContext)
  };
  payload.uiStatus = createUiStatusSnapshot({
    ...payload,
    localServiceOk: Boolean(aiServer && controlServer)
  });
  return payload;
}

function syncAppContext() {
  appContext.config = config;
  Object.assign(appContext.windows, {
    main: mainWindow,
    floating: floatWindow,
    runyuLogin: runyuLoginWindow,
    kfView,
    kfViewAttached,
    mainMode
  });
  Object.assign(appContext.services, {
    aiServer,
    controlServer,
    tray,
    powerSaveBlockerId: blockerId
  });
  Object.assign(appContext.runtime, {
    isQuitting,
    aiRestarting,
    lastBotHeartbeatAt,
    watchdogTimers
  });
  Object.assign(appContext.status, {
    bot: lastBotStatus,
    botHistory: botStatusHistory,
    ai: lastAiHealth,
    runyuAuth: runyuAuthState
  });
}

function replyRecordStats(records) {
  const items = Array.isArray(records) ? records : [];
  return {
    total: items.length,
    sent: items.filter((item) => item.kind === "sent").length,
    failed: items.filter((item) => item.kind === "failed").length,
    timeout: items.filter((item) => item.kind === "timeout").length,
    bySource: countBy(items.map((item) => item.sourceType || classifyReplySource(item.stage, item).sourceType))
  };
}

function replyRecordsPayload(options = {}) {
  const limit = clampInt(options.limit || 300, 1, 1000);
  const kind = String(options.kind || "all");
  const sourceType = String(options.sourceType || "all");
  const items = replyRecords
    .filter((item) => kind === "all" || item.kind === kind)
    .filter((item) => sourceType === "all" || (item.sourceType || classifyReplySource(item.stage, item).sourceType) === sourceType)
    .slice(-limit)
    .reverse();
  return {
    items,
    stats: replyRecordStats(replyRecords),
    total: replyRecords.length,
    outbox: notifyOutbox.slice(-50).reverse()
  };
}

function settingsPayload() {
  const env = readEnvValues();
  return {
    config: {
      autoStart: Boolean(config.autoStart),
      kfUrl: config.kfUrl,
      bot: config.bot,
      notify: config.notify,
      judgmentLibrary: config.judgmentLibrary,
      floatWindow: config.floatWindow,
      watchdog: config.watchdog
    },
    assistantProfile: loadAssistantProfile(),
    configValidation: configValidationState,
    env: {
      deepseekApiKey: env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || "",
      deepseekModel: env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      deepseekBaseUrl: env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      deepseekThinking: env.DEEPSEEK_THINKING || process.env.DEEPSEEK_THINKING || "enabled",
      deepseekReasoningEffort: env.DEEPSEEK_REASONING_EFFORT || process.env.DEEPSEEK_REASONING_EFFORT || "medium",
      deepseekReview: env.DEEPSEEK_REVIEW || process.env.DEEPSEEK_REVIEW || "enabled",
      deepseekTimeoutMs: env.DEEPSEEK_TIMEOUT_MS || process.env.DEEPSEEK_TIMEOUT_MS || "80000",
      deepseekReviewTimeoutMs: env.DEEPSEEK_REVIEW_TIMEOUT_MS || process.env.DEEPSEEK_REVIEW_TIMEOUT_MS || "25000",
      wecomWebhookUrl: env.WECOM_BOT_WEBHOOK_URL || process.env.WECOM_BOT_WEBHOOK_URL || "",
      runyuWebCookie: env.RUNYU_WEB_COOKIE || process.env.RUNYU_WEB_COOKIE || "",
      runyuWebBaseUrl: env.RUNYU_WEB_BASE_URL || process.env.RUNYU_WEB_BASE_URL || "https://runyuai.zhiduoke.com.cn",
      runyuJudgmentsEnabled: env.RUNYU_JUDGMENTS_ENABLED || process.env.RUNYU_JUDGMENTS_ENABLED || "disabled",
      runyuJudgmentsSources: env.RUNYU_JUDGMENTS_SOURCES || process.env.RUNYU_JUDGMENTS_SOURCES || "runyu,liurun,xiangshui,xingxing,book,dedao",
      runyuJudgmentsSearchTypes: env.RUNYU_JUDGMENTS_SEARCH_TYPES || process.env.RUNYU_JUDGMENTS_SEARCH_TYPES || "judgments,quotes,cases",
      runyuJudgmentsUseCache: env.RUNYU_JUDGMENTS_USE_CACHE || process.env.RUNYU_JUDGMENTS_USE_CACHE || "enabled",
      runyuJudgmentsUseRemote: env.RUNYU_JUDGMENTS_USE_REMOTE || process.env.RUNYU_JUDGMENTS_USE_REMOTE || "enabled",
      runyuJudgmentsMaxResults: env.RUNYU_JUDGMENTS_MAX_RESULTS || process.env.RUNYU_JUDGMENTS_MAX_RESULTS || "4",
      runyuJudgmentsLimitPerQuery: env.RUNYU_JUDGMENTS_LIMIT_PER_QUERY || process.env.RUNYU_JUDGMENTS_LIMIT_PER_QUERY || "8",
      runyuJudgmentsRefreshLimit: env.RUNYU_JUDGMENTS_REFRESH_LIMIT || process.env.RUNYU_JUDGMENTS_REFRESH_LIMIT || "80",
      runyuJudgmentsTimeoutMs: env.RUNYU_JUDGMENTS_TIMEOUT_MS || process.env.RUNYU_JUDGMENTS_TIMEOUT_MS || "12000",
      runyuJudgmentsRefreshKeywords: env.RUNYU_JUDGMENTS_REFRESH_KEYWORDS || process.env.RUNYU_JUDGMENTS_REFRESH_KEYWORDS || "会员,退款,课程,订单,发票,社群,视频号,直播,线下课,小店",
      port: env.PORT || process.env.PORT || String(PORT)
    },
    paths: {
      envPath: envPath(),
      assistantProfilePath: assistantProfilePath(),
      appRoot: APP_ROOT
    },
    status: statusPayload()
  };
}

async function saveDesktopSettings(payload) {
  const botChanges = {};

  if (payload.config && typeof payload.config === "object") {
    if ("autoStart" in payload.config) {
      config.autoStart = Boolean(payload.config.autoStart);
      applyLoginItemSetting();
    }

    if ("kfUrl" in payload.config) {
      const nextUrl = String(payload.config.kfUrl || "").trim() || defaultConfig().kfUrl;
      const oldUrl = config.kfUrl;
      config.kfUrl = nextUrl;
      if (nextUrl !== oldUrl) {
        getKfWebContents()?.loadURL(nextUrl);
      }
    }

    if (payload.config.bot && typeof payload.config.bot === "object") {
      for (const [key, value] of Object.entries(payload.config.bot)) {
        if (value === undefined) continue;
        const oldValue = config.bot[key];
        config.bot[key] = value;
        botChanges[key] = { oldValue, newValue: value };
      }
    }

    if (payload.config.notify && typeof payload.config.notify === "object") {
      config.notify = {
        ...config.notify,
        ...payload.config.notify,
        eventRules: {
          ...config.notify.eventRules,
          ...(payload.config.notify.eventRules || {})
        }
      };
      config.notify.wecomWebhookUrl = String(config.notify.wecomWebhookUrl || "").trim();
      config.notify.enabled = Boolean(config.notify.enabled && config.notify.wecomWebhookUrl);
    }

    if (payload.config.judgmentLibrary && typeof payload.config.judgmentLibrary === "object") {
      config.judgmentLibrary = normalizeJudgmentLibraryConfig({
        ...config.judgmentLibrary,
        ...payload.config.judgmentLibrary
      });
    }

    if (payload.config.floatWindow && typeof payload.config.floatWindow === "object") {
      config.floatWindow = {
        ...config.floatWindow,
        ...payload.config.floatWindow,
        compactSize: {
          ...config.floatWindow.compactSize,
          ...normalizeFloatingSize("compact", payload.config.floatWindow.compactSize || {})
        },
        miniSize: {
          ...config.floatWindow.miniSize,
          ...normalizeFloatingSize("mini", payload.config.floatWindow.miniSize || {})
        },
        settingsSize: {
          ...config.floatWindow.settingsSize,
          ...(payload.config.floatWindow.settingsSize || {})
        }
      };
      config.floatWindow.mode = normalizeFloatingMode(config.floatWindow.mode);
      config.floatWindow.bounds = normalizeBounds(config.floatWindow.bounds);
      if (floatWindow && !floatWindow.isDestroyed()) {
        floatWindow.setAlwaysOnTop(Boolean(config.floatWindow.alwaysOnTop));
        const mode = normalizeFloatingMode(config.floatWindow.mode);
        const size = floatingSizeForMode(mode);
        floatWindow.setSize(
          size.width,
          size.height,
          true
        );
        config.floatWindow.bounds = normalizeBounds(floatWindow.getBounds());
      }
    }

    if (payload.config.watchdog && typeof payload.config.watchdog === "object") {
      config.watchdog = normalizeWatchdogConfig({
        ...config.watchdog,
        ...payload.config.watchdog
      });
      syncPowerBlocker();
      startWatchdogs();
    }
  }

  if (payload.assistantProfile && typeof payload.assistantProfile === "object") {
    await saveAssistantProfile(payload.assistantProfile);
  }

  if (payload.env && typeof payload.env === "object") {
    const envUpdates = {
      DEEPSEEK_API_KEY: payload.env.deepseekApiKey,
      DEEPSEEK_MODEL: payload.env.deepseekModel,
      DEEPSEEK_BASE_URL: payload.env.deepseekBaseUrl,
      DEEPSEEK_THINKING: payload.env.deepseekThinking,
      DEEPSEEK_REASONING_EFFORT: payload.env.deepseekReasoningEffort,
      DEEPSEEK_REVIEW: payload.env.deepseekReview,
      DEEPSEEK_TIMEOUT_MS: payload.env.deepseekTimeoutMs,
      DEEPSEEK_REVIEW_TIMEOUT_MS: payload.env.deepseekReviewTimeoutMs,
      WECOM_BOT_WEBHOOK_URL: payload.env.wecomWebhookUrl,
      RUNYU_WEB_COOKIE: payload.env.runyuWebCookie == null ? undefined : normalizeRunyuCookie(payload.env.runyuWebCookie),
      RUNYU_WEB_BASE_URL: payload.env.runyuWebBaseUrl == null ? undefined : normalizeRunyuBaseUrl(payload.env.runyuWebBaseUrl),
      RUNYU_JUDGMENTS_ENABLED: payload.env.runyuJudgmentsEnabled,
      RUNYU_JUDGMENTS_SOURCES: payload.env.runyuJudgmentsSources,
      RUNYU_JUDGMENTS_SEARCH_TYPES: payload.env.runyuJudgmentsSearchTypes,
      RUNYU_JUDGMENTS_USE_CACHE: payload.env.runyuJudgmentsUseCache,
      RUNYU_JUDGMENTS_USE_REMOTE: payload.env.runyuJudgmentsUseRemote,
      RUNYU_JUDGMENTS_MAX_RESULTS: payload.env.runyuJudgmentsMaxResults,
      RUNYU_JUDGMENTS_LIMIT_PER_QUERY: payload.env.runyuJudgmentsLimitPerQuery,
      RUNYU_JUDGMENTS_REFRESH_LIMIT: payload.env.runyuJudgmentsRefreshLimit,
      RUNYU_JUDGMENTS_TIMEOUT_MS: payload.env.runyuJudgmentsTimeoutMs,
      RUNYU_JUDGMENTS_REFRESH_KEYWORDS: payload.env.runyuJudgmentsRefreshKeywords,
      PORT: payload.env.port
    };
    await writeEnvValues(envUpdates);
    config.notify.wecomWebhookUrl = String(envUpdates.WECOM_BOT_WEBHOOK_URL || "").trim();
    config.notify.enabled = Boolean(config.notify.enabled && config.notify.wecomWebhookUrl);
  }

  await saveConfig();
  if (Object.keys(botChanges).length > 0) sendConfigChanges(botChanges);
  if (botChanges.enabled) {
    updateFloatingStatus(config.bot.enabled ? "检测中" : "暂停中", {
      code: config.bot.enabled ? "monitoring" : "paused",
      detail: config.bot.enabled ? "Bot已开启，正在检测客户消息" : "Bot已暂停，不会自动发送回复"
    });
  }
  updateTrayMenu();
  broadcastStatus();
  flushNotifyOutbox().catch((error) => console.error("[notify] flush after settings failed", error));
  return settingsPayload();
}

function normalizeJudgmentLibraryConfig(value = {}) {
  return {
    ...defaultConfig().judgmentLibrary,
    ...value,
    enabled: Boolean(value.enabled),
    useCache: value.useCache !== false,
    useRemote: value.useRemote !== false,
    autoRefreshEnabled: value.autoRefreshEnabled !== false,
    refreshIntervalHours: clampInt(value.refreshIntervalHours || 168, 24, 720),
    sources: normalizeList(value.sources || defaultConfig().judgmentLibrary.sources),
    searchTypes: normalizeList(value.searchTypes || defaultConfig().judgmentLibrary.searchTypes).filter((type) => ["judgments", "quotes", "cases"].includes(type)),
    maxResults: clampInt(value.maxResults || 4, 1, 20),
    limitPerQuery: clampInt(value.limitPerQuery || 8, 1, 50),
    refreshLimit: clampInt(value.refreshLimit || 80, 1, 3000),
    fullDownloadPageLimit: clampInt(value.fullDownloadPageLimit || 300, 10, 3000),
    fullDownloadMaxPages: clampInt(value.fullDownloadMaxPages || 20, 1, 200),
    timeoutMs: clampInt(value.timeoutMs || 12000, 1000, 60000),
    refreshKeywords: normalizeList(value.refreshKeywords || defaultConfig().judgmentLibrary.refreshKeywords)
  };
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadAssistantProfile() {
  const base = defaultAssistantProfile();
  try {
    const path = assistantProfilePath();
    if (!existsSync(path)) return base;
    const saved = JSON.parse(readFileSync(path, "utf8"));
    return { ...base, ...(saved && typeof saved === "object" ? saved : {}) };
  } catch (error) {
    console.error("[desktop] assistant profile load failed", error);
    return base;
  }
}

async function saveAssistantProfile(profile) {
  const path = assistantProfilePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    ...defaultAssistantProfile(),
    ...profile,
    updatedAt: new Date().toISOString()
  }, null, 2), "utf8");
}

function defaultAssistantProfile() {
  return {
    systemPrompt: "",
    salesPrompt: "",
    stylePrompt: "",
    soulPrompt: "",
    guardrailsPrompt: "",
    knowledgeText: "",
    referenceText: "",
    reviewPrompt: "",
    knowledgeFilesEnabled: true,
    sidebarContextEnabled: true,
    reviewEnabled: true,
    updatedAt: ""
  };
}

function readEnvValues() {
  const path = envPath();
  if (!existsSync(path)) return {};
  return parseEnvText(readFileSync(path, "utf8"));
}

function parseEnvText(text) {
  const values = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = unwrapEnvValue(match[2]);
  }
  return values;
}

function unwrapEnvValue(value) {
  const text = String(value || "");
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

async function writeEnvValues(updates) {
  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
  if (keys.length === 0) return;

  const path = envPath();
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  const seen = new Set();
  const lines = existing.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !keys.includes(match[1])) return line;
    seen.add(match[1]);
    return `${match[1]}=${formatEnvValue(updates[match[1]])}`;
  });

  for (const key of keys) {
    if (!seen.has(key)) lines.push(`${key}=${formatEnvValue(updates[key])}`);
  }

  const next = lines.join("\n").replace(/\n{3,}$/g, "\n\n").replace(/\s*$/, "\n");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next, "utf8");

  for (const key of keys) {
    process.env[key] = String(updates[key] || "");
  }
}

function formatEnvValue(value) {
  const text = String(value || "").trim();
  if (!/[#\s"'`$\\]/.test(text)) return text;
  return `"${text.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("$", "\\$")}"`;
}

async function testWebhookUrl(webhookUrl) {
  const oldNotify = config.notify;
  const url = String(webhookUrl || oldNotify.wecomWebhookUrl || "").trim();
  if (!url) return { ok: false, message: "Webhook 为空" };

  try {
    config.notify = {
      ...oldNotify,
      enabled: true,
      wecomWebhookUrl: url
    };
    await postWecomWithRetry(`${APP_DISPLAY_NAME}通知测试`, "控制台配置里的 Webhook 测试消息", "info");
    await notifyWebhookRecovered("企业微信 Webhook 测试成功，通知通道已恢复。");
    return { ok: true, message: "Webhook 测试成功" };
  } catch (error) {
    markHealthIssue("webhook", "企业微信 Webhook 测试失败", String(error?.message || error));
    return { ok: false, message: String(error?.message || error) };
  } finally {
    config.notify = oldNotify;
  }
}

async function chooseImagePath() {
  return chooseFilePath({ kind: "image", title: "选择回复图片" });
}

async function chooseFilePath(options = {}) {
  const kind = String(options.kind || "file");
  const title = String(options.title || (kind === "image" ? "选择回复图片" : "选择回复文件"));
  const filters = kind === "image"
    ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
    : [
        { name: "常用文件", extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip"] },
        { name: "All Files", extensions: ["*"] }
      ];
  const result = await dialog.showOpenDialog(mainWindow || floatWindow, {
    title,
    properties: ["openFile"],
    filters
  });
  if (result.canceled || !result.filePaths[0]) return "";
  return result.filePaths[0];
}

async function revealPath(targetPath) {
  const normalized = String(targetPath || "").trim();
  if (!normalized) return { ok: false, message: "路径为空" };
  const absolute = resolveConfiguredFilePath(normalized);
  if (existsSync(absolute)) {
    shell.showItemInFolder(absolute);
    return { ok: true, path: absolute };
  }
  const parent = dirname(absolute);
  if (existsSync(parent)) {
    await shell.openPath(parent);
    return { ok: true, path: parent, missing: true, message: "文件不存在，已打开所在目录" };
  }
  return { ok: false, path: absolute, message: "路径不存在" };
}

async function getFilePreview(targetPath) {
  const absolute = resolveConfiguredFilePath(targetPath);
  if (!absolute || !existsSync(absolute)) {
    return { ok: false, path: absolute || "", message: "图片文件不存在" };
  }
  const extension = extname(absolute).toLowerCase();
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif"
  };
  const mimeType = mimeTypes[extension];
  if (!mimeType) return { ok: false, path: absolute, message: "当前文件不是可预览图片" };
  const bytes = await readFile(absolute);
  return {
    ok: true,
    path: absolute,
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`
  };
}

async function setFloatingPreset(preset) {
  if (!floatWindow || floatWindow.isDestroyed()) return false;
  const display = screen.getDisplayNearestPoint(floatWindow.getBounds());
  const workArea = display.workArea;
  const bounds = floatWindow.getBounds();
  const margin = 16;
  const next = { width: bounds.width, height: bounds.height };

  if (preset === "top-left") {
    next.x = workArea.x + margin;
    next.y = workArea.y + margin;
  } else if (preset === "top-right") {
    next.x = workArea.x + workArea.width - bounds.width - margin;
    next.y = workArea.y + margin;
  } else if (preset === "bottom-left") {
    next.x = workArea.x + margin;
    next.y = workArea.y + workArea.height - bounds.height - margin;
  } else {
    next.x = workArea.x + workArea.width - bounds.width - margin;
    next.y = workArea.y + workArea.height - bounds.height - margin;
  }

  floatWindow.setBounds(next, true);
  config.floatWindow.bounds = normalizeBounds(floatWindow.getBounds());
  await saveConfig();
  broadcastStatus();
  return true;
}

async function capturePageStructure() {
  const wc = getKfWebContents();
  if (!wc) {
    return { ok: false, message: "客服窗口未打开" };
  }

  const snapshot = await wc.executeJavaScript(`(${pageStructureScript.toString()})()`, true);
  return savePageStructureSnapshot(snapshot);
}

async function inspectLivePage() {
  const wc = getKfWebContents();
  if (!wc) {
    return { ok: false, message: "客服窗口未打开" };
  }
  const snapshot = await wc.executeJavaScript(`(${pageStructureScript.toString()})()`, true);
  return {
    ok: true,
    url: snapshot.href,
    title: snapshot.title,
    hasInput: snapshot.hasInput,
    bodyText: snapshot.bodyText,
    panels: snapshot.panels,
    counts: {
      nodes: snapshot.nodes?.length || 0,
      productCards: snapshot.panels?.productCards?.length || 0,
      quickReplyItems: snapshot.panels?.quickReplyItems?.length || 0,
      materialItems: snapshot.panels?.materialItems?.length || 0,
      sendDialogs: snapshot.panels?.sendDialogs?.length || 0
    }
  };
}

async function savePageStructureSnapshot(snapshot) {
  const dir = resolve(app.getPath("userData"), "page-structures");
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, `page-structure-${Date.now()}.json`);
  const wc = getKfWebContents();
  await writeFile(path, JSON.stringify({
    capturedAt: new Date().toISOString(),
    url: snapshot?.href || wc?.getURL?.() || "",
    title: snapshot?.title || wc?.getTitle?.() || "",
    snapshot
  }, null, 2), "utf8");
  clipboard.writeText(path);
  await sendNotification("page_structure_captured", "客服页结构已捕捉", `结构文件已保存并复制路径：${path}`, {
    cooldownMs: 10_000
  });
  return { ok: true, path, count: snapshot?.nodes?.length || 0 };
}

function pageStructureScript() {
  const nodeTypes = "button,a,input,textarea,select,[role],img,canvas,svg,[contenteditable='true'],[class],[id]";
  const nodes = Array.from(document.querySelectorAll(nodeTypes)).slice(0, 1800).map((node, index) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    const text = String(node.innerText || node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    return {
      index,
      tag: node.tagName.toLowerCase(),
      id: node.id || "",
      className: String(node.className || "").slice(0, 220),
      role: node.getAttribute("role") || "",
      type: node.getAttribute("type") || "",
      name: node.getAttribute("name") || "",
      accept: node.getAttribute("accept") || "",
      ariaLabel: node.getAttribute("aria-label") || "",
      title: node.getAttribute("title") || "",
      alt: node.getAttribute("alt") || "",
      href: node.getAttribute("href") || "",
      src: node.getAttribute("src") || "",
      text,
      visible: Boolean(rect.width && rect.height && style.visibility !== "hidden" && style.display !== "none"),
      disabled: Boolean(node.disabled || node.getAttribute("aria-disabled") === "true"),
      selector: buildSelector(node),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  });

  return {
    href: location.href,
    title: document.title,
    bodyText: document.body ? document.body.innerText.slice(0, 5000) : "",
    hasInput: Boolean(document.querySelector("#input-textarea")),
    hasQrLikeNode: hasQrLikeNode(),
    panels: inferPanels(nodes),
    nodes
  };

  function inferPanels(allNodes) {
    const right = (node) => node.visible && node.rect.x > window.innerWidth * 0.45;
    return {
      sessions: allNodes
        .filter((node) => node.visible && /session-(list-card|item-container)|session-list-card/.test(node.className || ""))
        .slice(0, 40),
      chatInputs: allNodes
        .filter((node) => (/textarea|input/.test(node.tag) || node.id === "input-textarea") && (node.id === "input-textarea" || node.visible))
        .slice(0, 30),
      fileInputs: allNodes
        .filter((node) => node.type === "file")
        .slice(0, 20),
      rightTabs: allNodes
        .filter((node) => right(node) && node.tag === "li" && /tab-list-item/.test(node.className || ""))
        .slice(0, 40),
      rightPanelButtons: allNodes
        .filter((node) => right(node) && /button|div|span|li/.test(node.tag) && /发送|发商品|邀请下单|发订单|售后|去管理|商品|快捷语|素材库|用户信息|图片|视频|文件|直播/.test(node.text || node.title || ""))
        .slice(0, 160),
      productCards: allNodes
        .filter((node) => right(node) && /product-card/.test(node.className || ""))
        .slice(0, 80),
      quickReplyItems: allNodes
        .filter((node) => right(node) && /quick|reply|resp|wrap|content|item/i.test(node.className || "") && (node.text || "").length > 0)
        .slice(0, 120),
      materialTabs: allNodes
        .filter((node) => right(node) && node.tag === "li" && /直播|短视频|图片|视频|文件/.test(node.text || ""))
        .slice(0, 20),
      materialItems: allNodes
        .filter((node) => right(node) && /quick-resp|qr-panel|panel-wrap|wrap|content|item|card/i.test(node.className || "") && (node.text || "").length > 0)
        .slice(0, 120),
      sendDialogs: allNodes
        .filter((node) => /dialog|drawer|transfer/i.test(node.className || "") && /发送|取消|邀请下单|发送给微信用户/.test(node.text || ""))
        .slice(0, 60)
    };
  }

  function hasQrLikeNode() {
    return Array.from(document.querySelectorAll("img,canvas,svg")).some((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) return false;
      const label = `${node.id || ""} ${node.className || ""} ${node.alt || ""} ${node.getAttribute("aria-label") || ""}`;
      return /qr|qrcode|二维码|code|login/i.test(label) || /扫码|二维码|微信扫一扫/.test(document.body?.innerText || "");
    });
  }

  function buildSelector(node) {
    const escape = (value) => {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };
    if (node.id) return `#${escape(node.id)}`;
    const parts = [];
    let current = node;
    while (current && current.nodeType === 1 && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      const className = String(current.className || "").split(/\s+/).filter(Boolean)[0];
      if (className) part += `.${escape(className)}`;
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(" > ");
  }
}

async function runPageAction(action = {}) {
  const type = String(action.type || "").trim();
  if (!type) return { ok: false, message: "缺少 action.type" };
  if (type === "capture_structure") return capturePageStructure();
  if (type === "capture_login_screenshot") {
    const path = await captureLoginScreenshot();
    return { ok: true, path };
  }
  if (type === "open_float") {
    showFloatingWindow();
    if (action.mode) await setFloatingMode(action.mode);
    return { ok: true };
  }
  if (type === "hide_float") {
    if (floatWindow && !floatWindow.isDestroyed()) floatWindow.hide();
    config.floatWindow.visible = false;
    await saveConfig();
    broadcastStatus();
    return { ok: true };
  }
  if (type === "image") {
    const result = await handleImageReply(action);
    await maybeRecordManualAction(action, result);
    return result;
  }
  if (type === "file") {
    const result = await handleFileReply(action);
    await maybeRecordManualAction(action, result);
    return result;
  }
  const wc = getKfWebContents();
  if (!wc) return { ok: false, message: "客服窗口未打开" };
  if (type === "native_click") return nativeClickPageTarget(action);

  if (
    type === "click" ||
    type === "set_text" ||
    type === "send_text" ||
    type === "open_session" ||
    type === "product" ||
    type === "material" ||
    type === "quick_reply"
  ) {
    const runtime = runtimeStatusForPageAction(action);
    updateFloatingStatus(runtime.label, runtime);
    const result = await wc.executeJavaScript(`(${pageActionScript.toString()})(${JSON.stringify(action)})`, true)
      .catch((error) => ({ ok: false, message: String(error?.message || error) }));
    if (
      (type === "product" || type === "material" || type === "quick_reply") &&
      !result?.ok &&
      result?.pendingSelector &&
      action.nativeFallback !== false
    ) {
      const nativeResult = await nativeClickPageTarget({
        selector: result.pendingSelector,
        waitMs: Number(action.nativeWaitMs || action.afterConfirmMs || 1600)
      });
      const stillPending = await wc.executeJavaScript(`(${visibleTargetScript.toString()})(${JSON.stringify(result.pendingSelector)})`, true)
        .catch(() => true);
      const fallbackResult = {
        ...result,
        nativeFallback: nativeResult,
        pendingDialog: Boolean(stillPending),
        ok: Boolean(nativeResult.ok && !stillPending),
        sent: Boolean(nativeResult.ok && !stillPending),
        message: nativeResult.ok && !stillPending ? "panel action sent by native fallback" : result.message
      };
      updateFloatingStatusForPageActionResult(action, fallbackResult);
      await maybeRecordManualAction(action, fallbackResult);
      return fallbackResult;
    }
    updateFloatingStatusForPageActionResult(action, result);
    await maybeRecordManualAction(action, result);
    return result;
  }

  return { ok: false, message: `未知 action.type: ${type}` };
}

async function maybeRecordManualAction(action = {}, result = {}) {
  if (action.audit !== true && action.manual !== true && action.sourceType !== "manual_action") return;
  const type = String(action.type || "action").trim() || "action";
  const sent = Boolean(result?.sent || result?.ok);
  await recordReplyEvent(sent ? "sent" : "failed", {
    stage: "panel_action",
    sourceType: "panel_action",
    rule: action.name || action.rule || "手动动作",
    customer: action.customer || action.message || "",
    reply: result?.message || action.text || action.reply || "",
    status: sent ? "" : result?.message || "动作未完成",
    actions: [{ ...action, type }]
  });
}

function runtimeStatusForPageAction(action = {}) {
  const type = String(action.type || "").trim();
  const button = String(action.button || action.confirmButton || "").trim();
  const customer = clip(String(action.customer || action.message || ""), 80);
  if (type === "product" && /邀请下单/.test(button)) {
    return { code: "sending_order", label: "邀请下单", detail: "正在选择商品并邀请客户下单", customer, actionType: type };
  }
  if (type === "product") {
    return { code: "sending_product", label: "发送商品", detail: "正在匹配并发送商品卡片", customer, actionType: type };
  }
  if (type === "material") {
    return { code: "sending_material", label: "发送素材", detail: "正在从素材库选择并发送内容", customer, actionType: type };
  }
  if (type === "quick_reply" || type === "send_text" || type === "set_text") {
    return { code: "sending_text", label: "发送文字", detail: "正在填写并发送文字回复", customer, actionType: type };
  }
  return { code: "sending_reply", label: "正在回复", detail: "正在执行客服页面回复动作", customer, actionType: type };
}

function updateFloatingStatusForPageActionResult(action = {}, result = {}) {
  const type = String(action.type || "").trim();
  const button = String(action.button || action.confirmButton || "").trim();
  const customer = clip(String(action.customer || action.message || ""), 80);
  const ok = Boolean(result?.ok || result?.sent);
  if (!ok) {
    updateFloatingStatus("回复失败", {
      code: "reply_failed",
      detail: String(result?.message || "页面回复动作未完成"),
      customer,
      actionType: type
    });
    return;
  }
  if (type === "product" && /邀请下单/.test(button)) {
    updateFloatingStatus("已邀下单", { code: "order_sent", detail: "邀请下单已发送给当前客户", customer, actionType: type });
  } else if (type === "product") {
    updateFloatingStatus("商品已发", { code: "product_sent", detail: "商品卡片已发送给当前客户", customer, actionType: type });
  } else if (type === "material") {
    updateFloatingStatus("素材已发", { code: "material_sent", detail: "素材内容已发送给当前客户", customer, actionType: type });
  } else if (type === "quick_reply" || type === "send_text") {
    updateFloatingStatus("文字已发", { code: "text_sent", detail: "文字回复已发送给当前客户", customer, actionType: type });
  }
}

function pageActionScript(action) {
  const type = String(action.type || "").trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const textOf = (node) => String(node?.innerText || node?.textContent || "").trim();
  const labelMatches = (actual, expected) => {
    const left = String(actual || "").trim();
    const right = String(expected || "").trim();
    if (!left || !right) return false;
    if (left === right) return true;
    if (right === "发送" && /^发送(?:\(\d+\))?$/.test(left)) return true;
    return false;
  };

  return (async () => {
    if (type === "click") {
      const node = findTarget(action);
      if (!visible(node)) return { ok: false, message: "click target not found" };
      node.click();
      await sleep(Number(action.waitMs || 300));
      return { ok: true };
    }

    if (type === "open_session") {
      const session = findSession(action.query || action.name || "");
      if (!session) return { ok: false, message: "session not found" };
      session.click();
      await sleep(Number(action.waitMs || 700));
      return { ok: true, text: textOf(session) };
    }

    if (type === "set_text" || type === "send_text") {
      const input = findInput(action.selector);
      if (!visible(input)) return { ok: false, message: "input not found" };
      const value = String(action.text || action.value || "");
      input.focus();
      setNativeValue(input, value);
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (type === "send_text") {
        const before = latestKfText();
        await sleep(100);
        pressEnter(input);
        await sleep(700);
        if (latestKfText() === value && before !== value) return { ok: true, sent: true, method: "enter" };
        const button = findButton(action.button || "发送");
        if (button) {
          button.click();
          await sleep(700);
        }
        return {
          ok: latestKfText() === value,
          sent: latestKfText() === value,
          method: button ? "button" : "none",
          message: latestKfText() === value ? "text sent" : "text not confirmed"
        };
      }
      return { ok: true };
    }

    if (type === "product") {
      return panelAction("商品", action.button || "发商品", action.fallbackButton || "邀请下单");
    }

    if (type === "material") {
      return panelAction("素材库", action.button || "发送", action.fallbackButton || "");
    }

    if (type === "quick_reply") {
      return panelAction("快捷语", action.button || "发送", action.fallbackButton || "");
    }

    return { ok: false, message: "unsupported action" };
  })();

  async function panelAction(tabLabel, buttonLabel, fallbackButton) {
    const tab = findRightPanelLabel(action.tab || tabLabel);
    if (!tab) return { ok: false, message: "panel tab not found" };
    tab.click();
    await sleep(Number(action.waitMs || defaultPanelWaitMs(tabLabel)));

    const subtab = String(action.subtab || action.category || action.mediaTab || "").trim();
    if (subtab) {
      const node = findRightPanelLabel(subtab);
      if (!node) return { ok: false, message: "panel subtab not found" };
      node.click();
      await sleep(Number(action.subtabWaitMs || 260));
    }

    const button = findPanelScopedButton(action, tabLabel, buttonLabel, fallbackButton) ||
      findRightPanelButton(buttonLabel) ||
      (fallbackButton ? findRightPanelButton(fallbackButton) : null);
    if (!button) return { ok: false, message: "panel button not found" };
    const clickedText = targetText(button) || buttonLabel || fallbackButton;
    const clickedDrawerAction = Boolean(button.__productDrawerTarget);
    clickTarget(button);
    await sleep(Number(action.afterClickMs || 700));

    if ((action.tab || tabLabel) === "快捷语") {
      const sentQuickReply = await sendComposerIfFilled(clickedText);
      return {
        ok: sentQuickReply.ok,
        sent: sentQuickReply.ok,
        button: clickedText,
        confirmed: false,
        pendingDialog: false,
        pendingSelector: "",
        message: sentQuickReply.message
      };
    }

    const defaultConfirmButton = buttonLabel === "邀请下单" ? "邀请下单" : "发送";
    const shouldConfirm = action.confirm !== false && !clickedDrawerAction;
    const confirmed = shouldConfirm ? await confirmSendDialog(action.confirmButton || defaultConfirmButton) : false;
    await sleep(Number(action.afterConfirmMs || defaultAfterConfirmMs(tabLabel)));
    const pendingButton = shouldConfirm ? findDialogButton(action.confirmButton || defaultConfirmButton) : null;
    const pendingDialog = Boolean(pendingButton);
    const sent = action.confirm === false || clickedDrawerAction || !pendingDialog;
    return {
      ok: sent,
      sent,
      button: clickedText,
      confirmed,
      pendingDialog,
      pendingSelector: targetSelector(pendingButton),
      message: sent ? "panel action sent" : "panel action needs confirmation"
    };
  }

  function defaultPanelWaitMs(tabLabel) {
    return tabLabel === "商品" ? 1200 : 500;
  }

  function defaultAfterConfirmMs(tabLabel) {
    return tabLabel === "商品" ? 1200 : 600;
  }

  function findTarget(item) {
    if (item.selector) return document.querySelector(item.selector);
    if (item.text) {
      const interactive = Array.from(document.querySelectorAll("button,[role='button'],a,.weui-desktop-btn"));
      const passive = Array.from(document.querySelectorAll("div,span,li"));
      return interactive.concat(passive)
        .filter((node, index, list) => list.indexOf(node) === index)
        .find((node) => visible(node) && labelMatches(textOf(node), item.text));
    }
    return null;
  }

  function findSession(query) {
    const text = String(query || "").trim();
    const sessions = Array.from(document.querySelectorAll(".session-list-card, .session-item-container"))
      .filter(visible)
      .filter((node) => node.getBoundingClientRect().left < window.innerWidth * 0.42)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (!sessions.length) return null;
    if (!text) return sessions[0];
    return sessions.find((node) => textOf(node).includes(text)) || null;
  }

  function findInput(selector) {
    return selector ? document.querySelector(selector) : document.querySelector("#input-textarea") ||
      Array.from(document.querySelectorAll("textarea,[contenteditable='true']")).find(visible);
  }

  function findButton(label) {
    return Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .filter((node) => labelMatches(textOf(node), label))
      .sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y)[0];
  }

  function latestKfText() {
    return textOf(Array.from(document.querySelectorAll(".text-msg.bg-kf")).filter(visible).at(-1));
  }

  async function sendComposerIfFilled(expectedText) {
    const input = findInput();
    if (!visible(input)) return { ok: false, message: "quick reply input not found" };
    const value = String(input.value || input.textContent || "").trim();
    const expected = String(expectedText || "").trim();
    if (!value) return { ok: false, message: "quick reply did not fill input" };
    const before = latestKfText();
    pressEnter(input);
    await sleep(800);
    const latest = latestKfText();
    const sent = latest === value || (expected && latest === expected) || (expected && latest.includes(expected.slice(0, 20)));
    return {
      ok: sent && latest !== before,
      message: sent ? "quick reply sent" : "quick reply not confirmed"
    };
  }

  function pressEnter(target) {
    for (const eventType of ["keydown", "keypress", "keyup"]) {
      target.dispatchEvent(new KeyboardEvent(eventType, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
    }
  }

  function findPanelScopedButton(item, tabLabel, buttonLabel, fallbackButton) {
    if ((item.tab || tabLabel) === "商品") {
      return findProductButton(item, buttonLabel, fallbackButton);
    }
    if ((item.tab || tabLabel) === "素材库") {
      return findMaterialButton(item, buttonLabel, fallbackButton);
    }
    if ((item.tab || tabLabel) === "快捷语") {
      return findQuickReplyButton(item, buttonLabel, fallbackButton);
    }
    return null;
  }

  function findProductButton(item, buttonLabel, fallbackButton) {
    const labels = [buttonLabel, fallbackButton].map((label) => String(label || "").trim()).filter(Boolean);
    const terms = matchTerms(item, ["productId", "productName", "query", "match", "name"]);
    const drawerButton = findProductDrawerButton(item, terms, buttonLabel, fallbackButton);
    if (drawerButton) return drawerButton;

    const cards = Array.from(document.querySelectorAll(".product-panel .product-card, .product-card"))
      .filter(visible)
      .filter(isRightPanelNode)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (!cards.length) return null;

    const card = findMatchedNode(cards, terms) || cards[0];
    return findButtonInside(card, labels);
  }

  function findProductDrawerButton(item, terms, buttonLabel, fallbackButton) {
    const drawer = findProductDrawer();
    if (!drawer) return null;
    if (!productDrawerMatches(drawer, terms)) return null;
    const target = findLabelTargetInside(drawer, productDrawerLabels(buttonLabel, fallbackButton));
    if (target) target.__productDrawerTarget = true;
    return target;
  }

  function findProductDrawer() {
    return Array.from(document.querySelectorAll(".product-detail-drawer, .t-drawer, [class*='product-detail'], [class*='drawer']"))
      .filter(visible)
      .filter((node) => /商品预览|邀请下单|发送/.test(textOf(node)))
      .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] || null;
  }

  function productDrawerMatches(drawer, terms) {
    if (!terms.length) return true;
    const text = textOf(drawer).toLowerCase();
    return terms.every((term) => text.includes(term)) || terms.some((term) => text.includes(term));
  }

  function productDrawerLabels(buttonLabel, fallbackButton) {
    const output = [];
    for (const label of [buttonLabel, fallbackButton]) {
      const value = String(label || "").trim();
      if (!value) continue;
      if (value === "发商品") output.push("发送", "发商品");
      else output.push(value);
    }
    return output.filter((label, index, list) => label && list.indexOf(label) === index);
  }

  function findMaterialButton(item, buttonLabel, fallbackButton) {
    const labels = [buttonLabel, fallbackButton].map((label) => String(label || "").trim()).filter(Boolean);
    const panel = document.querySelector(".quick-resp-panel") || document.querySelector(".extension-panel") || document;
    const terms = matchTerms(item, ["materialName", "query", "match", "name"]);
    const candidates = Array.from(document.querySelectorAll(".quick-resp-panel .wrap, .quick-resp-panel [class*='item'], .quick-resp-panel [class*='card'], .quick-resp-panel [class*='content']"))
      .filter(visible)
      .filter(isRightPanelNode)
      .filter((node) => textOf(node))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const scope = findMatchedNode(candidates, terms) || panel;
    return findButtonInside(scope, labels);
  }

  function findQuickReplyButton(item, buttonLabel, fallbackButton) {
    const labels = [buttonLabel, fallbackButton].map((label) => String(label || "").trim()).filter(Boolean);
    const panel = document.querySelector(".quick-reply-panel") ||
      document.querySelector(".quick-resp-panel") ||
      document.querySelector(".extension-panel") ||
      document;
    const terms = matchTerms(item, ["quickReply", "query", "match", "name"]);
    const candidates = Array.from(document.querySelectorAll(".quick-reply-panel [class*='item'], .quick-reply-panel [class*='wrap'], .quick-resp-panel [class*='item'], .quick-resp-panel [class*='wrap'], .extension-panel [class*='item'], .extension-panel [class*='wrap']"))
      .filter(visible)
      .filter(isRightPanelNode)
      .filter((node) => textOf(node))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const scope = findMatchedNode(candidates, terms) || panel;
    return findButtonInside(scope, labels) || findClickableText(scope, terms);
  }

  function matchTerms(item, keys) {
    return keys
      .map((key) => String(item[key] || "").trim())
      .filter(Boolean)
      .map((value) => value.toLowerCase());
  }

  function findMatchedNode(nodes, terms) {
    if (!terms.length) return null;
    return nodes.find((node) => {
      const text = textOf(node).toLowerCase();
      return terms.every((term) => text.includes(term));
    }) || nodes.find((node) => {
      const text = textOf(node).toLowerCase();
      return terms.some((term) => text.includes(term));
    }) || null;
  }

  function findButtonInside(scope, labels) {
    if (!scope || !labels.length) return null;
    const buttons = Array.from(scope.querySelectorAll("button,[role='button'],.weui-desktop-btn"))
      .filter(visible)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    for (const label of labels) {
      const matched = buttons.find((node) => labelMatches(textOf(node), label));
      if (matched) return matched;
    }
    return null;
  }

  function findLabelTargetInside(scope, labels) {
    if (!scope || !labels.length) return null;
    const selectors = "button,[role='button'],a,.weui-desktop-btn,[class*='btn'],div,span,li";
    const nodes = Array.from(scope.querySelectorAll(selectors))
      .filter(visible)
      .filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true")
      .sort((a, b) => targetScore(a) - targetScore(b));
    for (const label of labels) {
      const exact = nodes.find((node) => labelMatches(textOf(node), label));
      if (exact) return exact;
      const pointTarget = findTextRangeTarget(scope, label);
      if (pointTarget) return pointTarget;
    }
    return null;
  }

  function targetScore(node) {
    const rect = node.getBoundingClientRect();
    const tag = String(node.tagName || "").toLowerCase();
    const role = node.getAttribute("role") || "";
    const interactivePenalty = tag === "button" || tag === "a" || role === "button" ? -100000 : 0;
    return rect.width * rect.height + interactivePenalty;
  }

  function findTextRangeTarget(scope, label) {
    const expected = String(label || "").trim();
    if (!expected) return null;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!String(node.nodeValue || "").includes(expected)) return NodeFilter.FILTER_REJECT;
        if (!visible(node.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node = walker.nextNode();
    while (node) {
      const value = String(node.nodeValue || "");
      const start = value.indexOf(expected);
      if (start >= 0) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + expected.length);
        const rect = Array.from(range.getClientRects())
          .filter((item) => item.width > 0 && item.height > 0)
          .sort((a, b) => b.bottom - a.bottom)[0];
        range.detach();
        if (rect) {
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          const target = nearestClickable(hit, scope) || hit || node.parentElement;
          return {
            __pointTarget: true,
            node: target,
            x,
            y,
            label: expected,
            selector: target ? buildSelector(target) : ""
          };
        }
      }
      node = walker.nextNode();
    }
    return null;
  }

  function nearestClickable(node, scope) {
    let current = node;
    while (current && current !== scope.parentElement) {
      if (!visible(current)) return null;
      const tag = String(current.tagName || "").toLowerCase();
      const role = current.getAttribute?.("role") || "";
      const style = window.getComputedStyle(current);
      if (tag === "button" || tag === "a" || role === "button" || style.cursor === "pointer" || typeof current.onclick === "function") {
        return current;
      }
      if (current === scope) break;
      current = current.parentElement;
    }
    return null;
  }

  function findClickableText(scope, terms) {
    if (!scope || !terms.length) return null;
    return Array.from(scope.querySelectorAll("button,[role='button'],a,div,span,li"))
      .filter(visible)
      .filter(isRightPanelNode)
      .find((node) => {
        const text = textOf(node).toLowerCase();
        return terms.some((term) => text.includes(term));
      }) || null;
  }

  async function confirmSendDialog(label) {
    const started = Date.now();
    while (Date.now() - started < 5000) {
      const button = findDialogButton(label);
      if (button) {
        clickTarget(button);
        await sleep(600);
        return true;
      }
      await sleep(200);
    }
    return false;
  }

  function findDialogButton(label) {
    const candidates = Array.from(document.querySelectorAll(".weui-desktop-dialog, .order-transfer-dialog, .product-detail-drawer, .t-drawer, .t-dialog__ctx, .t-dialog, .file-upload-dialog, [role='dialog']"))
      .filter(visible)
      .filter((node) => /发送|取消|邀请下单|发送给微信用户|商品预览|确认|确定/.test(textOf(node)));
    for (const scope of candidates) {
      const button = Array.from(scope.querySelectorAll("button,[role='button'],.weui-desktop-btn"))
        .filter(visible)
        .filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true")
        .filter((node) => labelMatches(textOf(node), label))
        .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
      if (button) return button;
      const textTarget = findLabelTargetInside(scope, [label]);
      if (textTarget) return textTarget;
    }
    return null;
  }

  function hasActionDialog() {
    return Array.from(document.querySelectorAll(".weui-desktop-dialog, .order-transfer-dialog, .product-detail-drawer, .t-drawer, .t-dialog__ctx, .t-dialog, .file-upload-dialog, [role='dialog']"))
      .filter(visible)
      .some((scope) => {
        return Array.from(scope.querySelectorAll("button,[role='button'],.weui-desktop-btn"))
          .filter(visible)
          .filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true")
          .some((node) => ["发送", "邀请下单", "确定", "确认"].some((label) => labelMatches(textOf(node), label)));
      });
  }

  function findRightPanelLabel(label) {
    return Array.from(document.querySelectorAll("button,[role='tab'],li,div,span"))
      .filter(visible)
      .filter((node) => textOf(node) === label)
      .filter(isRightPanelNode)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
  }

  function findRightPanelButton(label) {
    return Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .filter((node) => textOf(node) === label)
      .filter(isRightPanelNode)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
  }

  function isRightPanelNode(node) {
    return node.getBoundingClientRect().left > window.innerWidth * 0.45;
  }

  function buildSelector(node) {
    if (!node || node.nodeType !== 1) return "";
    const escape = (value) => {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };
    if (node.id) return `#${escape(node.id)}`;
    const parts = [];
    let current = node;
    while (current && current.nodeType === 1 && parts.length < 7) {
      let part = current.tagName.toLowerCase();
      const firstClass = String(current.className || "").split(/\s+/).filter(Boolean)[0];
      if (firstClass) part += `.${escape(firstClass)}`;
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(" > ");
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(element, value);
    else element.textContent = value;
  }

  function targetNode(target) {
    if (!target) return null;
    return target.__pointTarget ? target.node : target;
  }

  function targetText(target) {
    if (!target) return "";
    return target.__pointTarget ? String(target.label || textOf(target.node) || "") : textOf(target);
  }

  function targetSelector(target) {
    if (!target) return "";
    if (target.__pointTarget) return target.selector || "";
    return buildSelector(target);
  }

  function clickTarget(target) {
    if (!target) return false;
    if (target.__pointTarget) return clickAtPoint(target.x, target.y);
    if (typeof target.click === "function") {
      target.click();
      return true;
    }
    return false;
  }

  function clickAtPoint(x, y) {
    const target = document.elementFromPoint(x, y);
    if (!target) return false;
    for (const eventType of ["mouseover", "mousemove", "mousedown", "mouseup", "click"]) {
      target.dispatchEvent(new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0
      }));
    }
    return true;
  }
}

async function nativeClickPageTarget(action = {}) {
  const wc = getKfWebContents();
  if (!wc) return { ok: false, message: "客服窗口未打开" };
  showMainWindow();
  await setMainMode("page");
  const point = await wc.executeJavaScript(`(${nativeClickTargetScript.toString()})(${JSON.stringify(action)})`, true)
    .catch((error) => ({ ok: false, message: String(error?.message || error) }));
  if (!point?.ok) return { ok: false, message: point?.message || "native click target not found" };

  const x = Math.round(point.x);
  const y = Math.round(point.y);
  wc.sendInputEvent({ type: "mouseMove", x, y });
  await sleep(60);
  wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
  await sleep(80);
  wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
  await sleep(Number(action.waitMs || 500));
  return { ok: true, x, y, selector: point.selector || "", text: point.text || "" };
}

function nativeClickTargetScript(action) {
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const textOf = (node) => String(node?.innerText || node?.textContent || "").trim();
  const labelMatches = (actual, expected) => {
    const left = String(actual || "").trim();
    const right = String(expected || "").trim();
    if (!left || !right) return false;
    if (left === right) return true;
    if (right === "发送" && /^发送(?:\(\d+\))?$/.test(left)) return true;
    return false;
  };
  const buildSelector = (node) => {
    const escape = (value) => {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };
    if (node.id) return `#${escape(node.id)}`;
    const parts = [];
    let current = node;
    while (current && current.nodeType === 1 && parts.length < 7) {
      let part = current.tagName.toLowerCase();
      const firstClass = String(current.className || "").split(/\s+/).filter(Boolean)[0];
      if (firstClass) part += `.${escape(firstClass)}`;
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(" > ");
  };

  let node = action.selector ? document.querySelector(action.selector) : null;
  if (!node && action.text) {
    node = Array.from(document.querySelectorAll("button,[role='button'],a,.weui-desktop-btn"))
      .filter(visible)
      .find((item) => labelMatches(textOf(item), action.text));
  }
  if (!visible(node)) return { ok: false, message: "target not visible" };
  const rect = node.getBoundingClientRect();
  return {
    ok: true,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    selector: buildSelector(node),
    text: textOf(node)
  };
}

function visibleTargetScript(selector) {
  const node = document.querySelector(selector);
  if (!node) return false;
  const rect = node.getBoundingClientRect();
  const style = window.getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

async function handleImageReply(payload = {}) {
  const imagePath = String(payload.path || payload.imagePath || "").trim();
  const customer = clip(String(payload.customer || ""), 100);
  updateFloatingStatus("发送图片", {
    code: "sending_image",
    detail: payload.name ? `正在按规则“${payload.name}”发送图片` : "正在上传并发送图片",
    customer,
    actionType: "image"
  });
  if (!config.bot.imageRepliesEnabled && !payload.fromAction) {
    return { ok: false, copied: false, pasted: false, message: "图片回复未开启" };
  }
  if (!imagePath) {
    return { ok: false, copied: false, pasted: false, message: "图片路径为空" };
  }

  const resolvedPath = resolveConfiguredFilePath(imagePath);
  if (!existsSync(resolvedPath)) {
    await sendNotification("image_reply_missing", "图片回复文件不存在", `路径：${resolvedPath}`, {
      severity: "critical",
      cooldownMs: 30_000
    });
    return { ok: false, copied: false, pasted: false, message: "图片文件不存在" };
  }

  const image = nativeImage.createFromPath(resolvedPath);
  if (image.isEmpty()) {
    await sendNotification("image_reply_invalid", "图片回复文件无法读取", `路径：${resolvedPath}`, {
      severity: "critical",
      cooldownMs: 30_000
    });
    return { ok: false, copied: false, pasted: false, message: "图片无法读取" };
  }

  let uploaded = false;
  let pasted = false;
  let sent = false;
  let fallbackMessage = "";

  const shouldAutoSend = Boolean(payload.fromAction || config.bot.autoPasteImages);
  if (shouldAutoSend && getKfWebContents()) {
    const uploadResult = await uploadAndSendImageFile(resolvedPath);
    uploaded = Boolean(uploadResult.uploaded);
    sent = Boolean(uploadResult.sent);
    fallbackMessage = uploadResult.message || "";
  }

  let copied = false;
  if (!sent) {
    clipboard.writeImage(image);
    copied = true;
    if (shouldAutoSend && getKfWebContents()) {
      const result = await pasteAndSendClipboardImage();
      pasted = Boolean(result.pasted);
      sent = Boolean(result.sent);
      fallbackMessage = result.message || fallbackMessage;
    }
  }

  if (!sent) {
    await sendNotification(
      `image_reply:${resolvedPath}:${customer}`,
      pasted ? "图片回复已粘贴待确认" : "图片回复已复制到剪贴板",
      [
        payload.name ? `规则：${payload.name}` : "",
        customer ? `客户：${customer}` : "",
        `图片：${resolvedPath}`,
        fallbackMessage ? `状态：${fallbackMessage}` : "",
        pasted ? "请确认客服页图片是否已发送" : "请打开客服窗口粘贴发送"
      ].filter(Boolean).join("\n"),
      { severity: "warning", cooldownMs: 30_000 }
    );
  }

  const output = {
    ok: Boolean(sent),
    copied,
    uploaded,
    pasted,
    sent,
    path: resolvedPath,
    message: sent ? (uploaded ? "图片已通过上传控件发送" : "图片已自动发送") : pasted ? "图片已粘贴待确认" : fallbackMessage || "图片未能自动发送，已复制到剪贴板"
  };
  updateFloatingStatus(sent ? "图片已发" : pasted ? "待确认" : "回复失败", {
    code: sent ? "image_sent" : pasted ? "monitoring" : "reply_failed",
    detail: output.message,
    customer,
    actionType: "image"
  });
  return output;
}

async function handleFileReply(payload = {}) {
  const filePath = String(payload.path || payload.filePath || "").trim();
  const customer = clip(String(payload.customer || ""), 100);
  updateFloatingStatus("发送文件", {
    code: "sending_file",
    detail: payload.name ? `正在按规则“${payload.name}”发送文件` : "正在上传并发送文件",
    customer,
    actionType: "file"
  });
  if (!filePath) {
    return { ok: false, uploaded: false, sent: false, message: "文件路径为空" };
  }

  const resolvedPath = resolveConfiguredFilePath(filePath);
  if (!existsSync(resolvedPath)) {
    await sendNotification("file_reply_missing", "文件回复不存在", `路径：${resolvedPath}`, {
      severity: "critical",
      cooldownMs: 30_000
    });
    return { ok: false, uploaded: false, sent: false, message: "文件不存在" };
  }

  const result = await uploadAndSendLocalFile(resolvedPath, {
    selector: payload.selector || "#file2",
    kind: "文件"
  });

  if (!result.sent) {
    await sendNotification(
      `file_reply:${resolvedPath}:${customer}`,
      result.uploaded ? "文件已上传待确认" : "文件回复失败",
      [
        payload.name ? `规则：${payload.name}` : "",
        customer ? `客户：${customer}` : "",
        `文件：${resolvedPath}`,
        result.message ? `状态：${result.message}` : ""
      ].filter(Boolean).join("\n"),
      { severity: "warning", cooldownMs: 30_000 }
    );
  }

  const output = {
    ok: Boolean(result.sent),
    uploaded: Boolean(result.uploaded),
    sent: Boolean(result.sent),
    path: resolvedPath,
    message: result.message || (result.sent ? "文件已发送" : "文件未发送")
  };
  updateFloatingStatus(result.sent ? "文件已发" : "回复失败", {
    code: result.sent ? "file_sent" : "reply_failed",
    detail: output.message,
    customer,
    actionType: "file"
  });
  return output;
}

function resolveConfiguredFilePath(inputPath) {
  const raw = String(inputPath || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("/")) return preferUnpackedPath(raw);

  const runtimePath = preferUnpackedPath(resolve(runtimeConfigRoot(), raw));
  if (existsSync(runtimePath)) return runtimePath;

  return preferUnpackedPath(resolve(APP_ROOT, raw));
}

function preferUnpackedPath(filePath) {
  const text = String(filePath || "");
  if (!text.includes("app.asar")) return text;
  const unpacked = text.replace("app.asar", "app.asar.unpacked");
  return existsSync(unpacked) ? unpacked : text;
}

async function uploadAndSendImageFile(imagePath) {
  const wc = getKfWebContents();
  if (!wc) return { uploaded: false, sent: false, message: "客服窗口未打开" };
  showMainWindow();
  await setMainMode("page");

  const inputInfo = await wc.executeJavaScript(`(${findImageUploadInputScript.toString()})()`, true)
    .catch((error) => ({ ok: false, message: String(error?.message || error) }));
  if (!inputInfo?.ok || !inputInfo.selector) {
    return { uploaded: false, sent: false, message: inputInfo?.message || "未找到图片上传入口" };
  }

  return uploadAndSendLocalFile(imagePath, {
    selector: inputInfo.selector,
    kind: "图片"
  });
}

async function uploadAndSendLocalFile(filePath, options = {}) {
  const wc = getKfWebContents();
  if (!wc) return { uploaded: false, sent: false, message: "客服窗口未打开" };
  showMainWindow();
  await setMainMode("page");

  const selector = String(options.selector || "").trim();
  const inputInfo = selector
    ? { ok: true, selector }
    : await wc.executeJavaScript(`(${findFileUploadInputScript.toString()})()`, true)
      .catch((error) => ({ ok: false, message: String(error?.message || error) }));
  if (!inputInfo?.ok || !inputInfo.selector) {
    return { uploaded: false, sent: false, message: inputInfo?.message || "未找到文件上传入口" };
  }

  const debuggerApi = wc.debugger;
  const wasAttached = debuggerApi.isAttached();
  let attachedHere = false;
  try {
    if (!wasAttached) {
      debuggerApi.attach("1.3");
      attachedHere = true;
    }
    const { root } = await debuggerApi.sendCommand("DOM.getDocument", { depth: -1, pierce: true });
    const { nodeId } = await debuggerApi.sendCommand("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: inputInfo.selector
    });
    if (!nodeId) return { uploaded: false, sent: false, message: "上传入口定位失败" };

    const before = await wc.executeJavaScript(`(${uploadStateScript.toString()})()`, true)
      .catch(() => ({ previewCount: 0, sendButtonVisible: false }));
    await debuggerApi.sendCommand("DOM.setFileInputFiles", {
      nodeId,
      files: [filePath]
    });
    await wc.executeJavaScript(`(${dispatchFileInputChangeScript.toString()})(${JSON.stringify(inputInfo.selector)})`, true)
      .catch(() => false);

    const ready = await waitForUploadReady(before);
    if (!ready.ready) {
      return { uploaded: true, sent: false, message: ready.message || `${options.kind || "文件"}上传后未检测到待发送状态` };
    }

    const clicked = await wc.executeJavaScript(`(${clickSendButtonScript.toString()})()`, true).catch(() => false);
    if (!clicked) return { uploaded: true, sent: false, message: "已上传，但未找到发送按钮" };
    const confirmed = await waitForUploadSent(before, ready);
    if (!confirmed.sent) {
      return { uploaded: true, sent: false, message: confirmed.message || "已点击发送，但没有检测到发送完成" };
    }
    return { uploaded: true, sent: true, message: `已通过${options.kind || "文件"}上传入口发送` };
  } catch (error) {
    return { uploaded: false, sent: false, message: `上传入口失败：${String(error?.message || error)}` };
  } finally {
    if (attachedHere && debuggerApi.isAttached()) {
      try {
        debuggerApi.detach();
      } catch {
        // Ignore debugger detach failures; fallback paths still work.
      }
    }
  }
}

async function waitForUploadReady(before = {}) {
  const wc = getKfWebContents();
  if (!wc) return { ready: false, message: "客服窗口未打开" };
  const started = Date.now();
  let last = null;
  while (Date.now() - started < 8000) {
    last = await wc.executeJavaScript(`(${uploadStateScript.toString()})()`, true)
      .catch((error) => ({ ready: false, message: String(error?.message || error) }));
    const hasNewPreview = Number(last?.previewCount || 0) > Number(before?.previewCount || 0);
    const hasNewDialog = Boolean(last?.dialogSendButtonVisible && !before?.dialogSendButtonVisible);
    const hasNewSendButton = Boolean(last?.sendButtonVisible && !before?.sendButtonVisible);
    if (hasNewDialog || hasNewPreview || hasNewSendButton) {
      return { ...last, ready: true };
    }
    await sleep(300);
  }
  return { ...(last || {}), ready: false, message: "等待图片预览超时" };
}

async function waitForUploadSent(before = {}, ready = {}) {
  const wc = getKfWebContents();
  if (!wc) return { sent: false, message: "客服窗口未打开" };
  const started = Date.now();
  let last = ready;
  while (Date.now() - started < 6000) {
    last = await wc.executeJavaScript(`(${uploadStateScript.toString()})()`, true)
      .catch((error) => ({ message: String(error?.message || error) }));
    const newMessageMedia = Number(last?.messageMediaCount || 0) > Number(before?.messageMediaCount || 0);
    const dialogClosed = Boolean(ready?.dialogSendButtonVisible && !last?.dialogSendButtonVisible);
    const previewConsumed = Number(ready?.previewCount || 0) > Number(last?.previewCount || 0);
    if (newMessageMedia || (dialogClosed && previewConsumed)) return { ...last, sent: true };
    await sleep(300);
  }
  return { ...(last || {}), sent: false, message: "发送后未检测到图片消息或上传弹窗关闭" };
}

function findFileUploadInputScript() {
  const inputs = Array.from(document.querySelectorAll("input[type='file']"));
  const input = document.querySelector("#file2") ||
    inputs.find((node) => /(?:^|[-_])file2(?:$|[-_])/i.test(node.id || "")) ||
    inputs.find((node) => !/(?:^|[-_])file1(?:$|[-_])/i.test(node.id || ""));
  if (!input) return { ok: false, message: "未找到文件 input[type=file]" };
  return {
    ok: true,
    selector: input.id ? `#${input.id}` : buildSelector(input),
    accept: input.getAttribute("accept") || ""
  };

  function buildSelector(node) {
    const escape = (value) => {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };
    const parts = [];
    let current = node;
    while (current && current.nodeType === 1 && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      const cls = String(current.className || "").split(/\s+/).filter(Boolean)[0];
      if (cls) part += `.${escape(cls)}`;
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(" > ");
  }
}

function findImageUploadInputScript() {
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const titleNear = (node) => {
    let current = node;
    for (let depth = 0; current && depth < 4; depth += 1) {
      const title = current.getAttribute?.("title") || "";
      const text = String(current.innerText || current.textContent || "");
      if (title || text) return `${title} ${text}`.trim();
      current = current.parentElement;
    }
    return "";
  };
  const inputs = Array.from(document.querySelectorAll("input[type='file']"));
  const score = (node) => {
    const id = String(node.id || "");
    const accept = String(node.getAttribute("accept") || "");
    const nearby = titleNear(node);
    const context = String(node.closest("[role='dialog'],form,.chat-input,.chat-page")?.innerText || "");
    let value = 0;
    if (id === "file1") value += 120;
    if (/(?:^|[-_])file1(?:$|[-_])/i.test(id)) value += 90;
    if (/image|jpg|jpeg|png|gif|bmp|webp/i.test(accept)) value += 70;
    if (/图片/.test(nearby)) value += 55;
    if (node.closest(".chat-input,.chat-page")) value += 45;
    if (visible(node)) value += 20;
    if (/投诉|图片凭证/.test(`${nearby} ${context}`)) value -= 150;
    return value;
  };
  const input = inputs
    .map((node) => ({ node, score: score(node) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.node || null;
  if (!input) return { ok: false, message: "未找到图片 input[type=file]" };
  return {
    ok: true,
    selector: buildSelector(input),
    accept: input.getAttribute("accept") || "",
    title: titleNear(input)
  };

  function buildSelector(node) {
    const escape = (value) => {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };
    if (node.id) return `#${escape(node.id)}`;
    const parts = [];
    let current = node;
    while (current && current.nodeType === 1 && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      const cls = String(current.className || "").split(/\s+/).filter(Boolean)[0];
      if (cls) part += `.${escape(cls)}`;
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(" > ");
  }
}

function dispatchFileInputChangeScript(selector) {
  const input = document.querySelector(selector);
  if (!input) return false;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function uploadStateScript() {
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const textOf = (node) => String(node?.innerText || node?.textContent || "").trim();
  const isSendButton = (node) => /^发送(?:\(\d+\))?$/.test(textOf(node)) &&
    !node.disabled &&
    node.getAttribute("aria-disabled") !== "true";
  const composer = document.querySelector(".chat-input") || document.querySelector("#input-textarea")?.closest(".chat-page") || document;
  const previewCount = Array.from(composer.querySelectorAll("img,canvas,video,[class*='preview'],[class*='upload'],[class*='image'],[class*='pic'],[class*='file'],[class*='attachment']"))
    .filter(visible)
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      const title = `${node.getAttribute?.("title") || ""} ${node.getAttribute?.("aria-label") || ""}`;
      return rect.width >= 20 && rect.height >= 20 && !/表情|图片|文件|优惠券|直播/.test(title);
    }).length;
  const sendButtonVisible = Array.from(composer.querySelectorAll("button,[role='button']"))
    .filter(visible)
    .some(isSendButton);
  const dialogSendButtonVisible = Array.from(document.querySelectorAll(".file-upload-dialog button, .t-dialog__ctx button, .t-dialog button, [role='dialog'] button"))
    .filter(visible)
    .some(isSendButton);
  const messageMediaCount = Array.from(document.querySelectorAll(".msg img, .msg canvas, .msg video, .message img, [class*='message'] img"))
    .filter(visible)
    .length;
  return {
    previewCount,
    sendButtonVisible: sendButtonVisible || dialogSendButtonVisible,
    composerSendButtonVisible: sendButtonVisible,
    dialogSendButtonVisible,
    messageMediaCount
  };
}

async function pasteAndSendClipboardImage() {
  const wc = getKfWebContents();
  if (!wc) return { pasted: false, sent: false, message: "客服窗口未打开" };
  showMainWindow();
  await setMainMode("page");
  const focused = await wc.executeJavaScript(`(${focusComposerScript.toString()})()`, true).catch(() => false);
  if (!focused) return { pasted: false, sent: false, message: "客服输入框不可见" };

  const before = await wc.executeJavaScript(`(${uploadStateScript.toString()})()`, true)
    .catch(() => ({ previewCount: 0, sendButtonVisible: false, messageMediaCount: 0 }));
  wc.paste();
  const ready = await waitForUploadReady(before);
  if (!ready.ready) {
    return { pasted: true, sent: false, message: ready.message || "图片已粘贴，但未检测到待发送预览" };
  }

  const clicked = await wc.executeJavaScript(`(${clickSendButtonScript.toString()})()`, true).catch(() => false);
  if (!clicked) return { pasted: true, sent: false, message: "未找到发送按钮" };
  const confirmed = await waitForUploadSent(before, ready);
  if (!confirmed.sent) {
    return { pasted: true, sent: false, message: confirmed.message || "已点击发送，但没有检测到发送完成" };
  }
  return { pasted: true, sent: true, message: "已粘贴并点击发送按钮" };
}

function focusComposerScript() {
  const input = document.querySelector("#input-textarea") ||
    Array.from(document.querySelectorAll("textarea, [contenteditable='true']")).find((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 80 && rect.height > 20 && style.display !== "none" && style.visibility !== "hidden";
    });
  if (!input) return false;
  input.focus();
  return true;
}

function clickSendButtonScript() {
  const visible = (node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const textOf = (node) => String(node.innerText || node.textContent || "").trim();
  const isSendButton = (node) => /^发送(?:\(\d+\))?$/.test(textOf(node)) &&
    !node.disabled &&
    node.getAttribute("aria-disabled") !== "true";
  const dialogButtons = Array.from(document.querySelectorAll(".file-upload-dialog button, .t-dialog__ctx button, .t-dialog button, [role='dialog'] button"))
    .filter(visible)
    .filter(isSendButton)
    .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
  if (dialogButtons[0]) {
    dialogButtons[0].click();
    return true;
  }
  const composer = document.querySelector(".chat-input") || document.querySelector("#input-textarea")?.closest(".chat-page");
  const composerButtons = Array.from((composer || document).querySelectorAll("button, [role='button']"))
    .filter(visible)
    .filter(isSendButton)
    .sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y);
  const fallbackButtons = composer ? [] : Array.from(document.querySelectorAll("button, [role='button']"))
    .filter(visible)
    .filter(isSendButton)
    .sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y);
  const button = composerButtons[0] || fallbackButtons[0];
  if (!button) return false;
  button.click();
  return true;
}

async function handleBotEvent(event = {}) {
  const type = String(event.type || "");
  const payload = event.payload || {};
  const customer = clip(String(payload.customer || payload.message || ""), 100);
  const stage = payload.stage ? `阶段：${payload.stage}` : "";

  if (type === "reply_sent") {
    const runtime = runtimeStatusForReplyEvent(payload);
    updateFloatingStatus(runtime.label, runtime);
    const record = await recordReplyEvent("sent", payload);
    await maybeSendReplySuccessNotification(record);
    return;
  }

  if (type === "reply_failed") {
    updateFloatingStatus("回复失败", {
      code: "reply_failed",
      detail: payload.error || payload.status || "自动回复未能成功发送",
      customer,
      actionType: payload.stage || ""
    });
    await recordReplyEvent("failed", payload);
    await sendNotification(
      `reply_failed:${payload.stage || "unknown"}:${customer}`,
      "客服消息未成功回复",
      [stage, customer ? `客户：${customer}` : "", payload.reply ? `拟回复：${clip(payload.reply, 80)}` : ""].filter(Boolean).join("\n"),
      { severity: "critical", cooldownMs: 60_000 }
    );
    return;
  }

  if (type === "reply_timeout") {
    updateFloatingStatus("回复超时", {
      code: "reply_timeout",
      detail: payload.busy ? "自动回复仍在处理，但已超过提醒时间" : "客户消息尚未完成处理",
      customer,
      actionType: payload.stage || ""
    });
    await recordReplyEvent("timeout", payload);
    await sendNotification(
      `reply_timeout:${payload.stage || "unknown"}:${customer}`,
      "客户消息超时未回复",
      [
        stage,
        payload.ageMs ? `已等待：${Math.round(Number(payload.ageMs) / 1000)} 秒` : "",
        customer ? `客户：${customer}` : "",
        payload.busy ? "状态：自动回复仍在处理" : "状态：自动回复未完成处理"
      ].filter(Boolean).join("\n"),
      { severity: "critical", cooldownMs: 60_000 }
    );
    return;
  }

  if (type === "ai_failed") {
    updateFloatingStatus("回复失败", {
      code: "reply_failed",
      detail: payload.error || "AI没有返回可用回复",
      customer,
      actionType: "ai"
    });
    await recordReplyEvent("failed", { ...payload, stage: "ai_failed" });
    await sendNotification("ai_failed", "AI 回复请求失败", payload.error || "本地 AI 服务没有返回可用回复", {
      severity: "warning"
    });
    return;
  }

  if (type === "ai_followup_failed") {
    await recordReplyEvent("failed", { ...payload, stage: "ai_followup_failed" });
    await sendNotification("ai_followup_failed", "AI 补充回复发送失败", customer ? `客户：${customer}` : "客户已收到承接语，但 AI 补充发送失败", {
      severity: "warning"
    });
  }
}

function runtimeStatusForReplyEvent(payload = {}) {
  const stage = String(payload.stage || "").trim();
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const customer = clip(String(payload.customer || payload.message || ""), 80);
  const productAction = actions.find((action) => String(action?.type || "") === "product");
  if (productAction && /邀请下单/.test(String(productAction.button || ""))) {
    return { code: "order_sent", label: "已邀下单", detail: "邀请下单已发送给当前客户", customer, actionType: "product" };
  }
  if (productAction) {
    return { code: "product_sent", label: "商品已发", detail: "商品卡片已发送给当前客户", customer, actionType: "product" };
  }
  if (actions.some((action) => String(action?.type || "") === "image") || stage === "image_reply") {
    return { code: "image_sent", label: "图片已发", detail: "图片回复已发送给当前客户", customer, actionType: "image" };
  }
  if (actions.some((action) => String(action?.type || "") === "file")) {
    return { code: "file_sent", label: "文件已发", detail: "文件已发送给当前客户", customer, actionType: "file" };
  }
  if (actions.some((action) => String(action?.type || "") === "material")) {
    return { code: "material_sent", label: "素材已发", detail: "素材已发送给当前客户", customer, actionType: "material" };
  }
  if (actions.some((action) => String(action?.type || "") === "quick_reply")) {
    return { code: "quick_sent", label: "快捷已发", detail: "快捷语已发送给当前客户", customer, actionType: "quick_reply" };
  }
  if (stage === "quick_ack") {
    return { code: "waiting_ai", label: "等待AI", detail: "承接语已发送，继续等待AI详细回复", customer, actionType: stage };
  }
  if (stage === "fallback_reply") {
    return { code: "text_sent", label: "文字已发", detail: "兜底回复已发送给当前客户", customer, actionType: stage };
  }
  if (stage === "judgment_ai") {
    return { code: "text_sent", label: "文字已发", detail: "判断库和AI生成的回复已发送", customer, actionType: stage };
  }
  return { code: "text_sent", label: "文字已发", detail: "文字回复已发送给当前客户", customer, actionType: stage || "text" };
}

async function loadReplyRecords() {
  const path = replyRecordsPath();
  if (!existsSync(path)) return;
  try {
    const items = JSON.parse(await readFile(path, "utf8"));
    replyRecords = Array.isArray(items) ? items.slice(-REPLY_RECORD_LIMIT) : [];
  } catch (error) {
    console.error("[summary] load reply records failed", error);
    replyRecords = [];
  }
}

async function saveReplyRecords() {
  await mkdir(dirname(replyRecordsPath()), { recursive: true });
  await writeFile(replyRecordsPath(), JSON.stringify(replyRecords.slice(-REPLY_RECORD_LIMIT), null, 2), "utf8");
}

async function loadReplySummaryState() {
  const path = replySummaryStatePath();
  if (!existsSync(path)) return;
  try {
    const saved = JSON.parse(await readFile(path, "utf8"));
    if (saved && typeof saved === "object") {
      replySummaryState = {
        ...replySummaryState,
        ...saved
      };
    }
  } catch (error) {
    console.error("[summary] load summary state failed", error);
  }
}

async function saveReplySummaryState() {
  await mkdir(dirname(replySummaryStatePath()), { recursive: true });
  await writeFile(replySummaryStatePath(), JSON.stringify(replySummaryState, null, 2), "utf8");
}

async function maybeSendReplySuccessNotification(record) {
  const mode = String(config?.notify?.successReplyMode || "log_only");
  if (mode === "log_only" || mode === "errors_only") return;
  if (mode === "ai_only" && !record?.usedAi) return;
  await sendNotification(
    `reply_success:${record?.sourceType || "unknown"}:${record?.customer || ""}:${record?.at || Date.now()}`,
    "客服消息已自动回复",
    summaryRecordLine(record || {}),
    { severity: "info", cooldownMs: 0, eventType: "reply_success" }
  );
}

async function recordReplyEvent(kind, payload = {}) {
  const source = classifyReplySource(payload.sourceType || payload.stage, payload);
  const record = {
    id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    at: Date.now(),
    kind,
    stage: String(payload.stage || ""),
    sourceType: source.sourceType,
    sourceLabel: source.sourceLabel,
    usedRuleLibrary: source.usedRuleLibrary,
    usedDirectReply: source.usedDirectReply,
    usedAi: source.usedAi,
    usedJudgmentLibrary: Boolean(payload.usedJudgmentLibrary || source.sourceType === "judgment_ai"),
    rule: String(payload.rule || payload.ruleName || ""),
    status: String(payload.status || payload.error || payload.reason || ""),
    customer: clip(String(payload.customer || payload.message || ""), 180),
    reply: clip(String(payload.reply || ""), 240),
    actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 8) : [],
    latencyMs: Number.isFinite(Number(payload.latencyMs)) ? Number(payload.latencyMs) : null,
    aiTrace: normalizeAiTrace(payload.aiTrace),
    processSteps: normalizeProcessSteps(payload.processSteps, source, payload)
  };
  replyRecords.push(record);
  replyRecords = replyRecords.slice(-REPLY_RECORD_LIMIT);
  await saveReplyRecords().catch((error) => console.error("[summary] save reply record failed", error));
  broadcastStatus();
  return record;
}

function normalizeAiTrace(value) {
  if (!value || typeof value !== "object") return null;
  return {
    model: clip(String(value.model || ""), 80),
    thinking: String(value.thinking || ""),
    reasoningEffort: String(value.reasoningEffort || ""),
    reviewEnabled: Boolean(value.reviewEnabled),
    reviewApplied: Boolean(value.reviewApplied),
    knowledgeCount: Number(value.knowledgeCount || 0),
    judgmentQueried: Boolean(value.judgmentQueried),
    judgmentUsed: Boolean(value.judgmentUsed),
    judgmentCount: Number(value.judgmentCount || 0),
    judgmentFromCache: Number(value.judgmentFromCache || 0),
    judgmentFromRemote: Number(value.judgmentFromRemote || 0),
    judgmentError: clip(String(value.judgmentError || ""), 180),
    latencyMs: Number(value.latencyMs || 0)
  };
}

function normalizeProcessSteps(value, source, payload) {
  if (Array.isArray(value) && value.length) {
    return value.map((item) => clip(String(item || ""), 60)).filter(Boolean).slice(0, 12);
  }
  const steps = ["检测消息"];
  if (source.usedRuleLibrary) steps.push("匹配规则库");
  if (source.usedDirectReply) steps.push("选择直接回复");
  if (source.usedAi) steps.push("调用AI接口");
  for (const action of Array.isArray(payload.actions) ? payload.actions : []) {
    const labels = {
      text: "发送文字",
      image: "发送图片",
      file: "发送文件",
      product: /邀请下单/.test(String(action?.button || "")) ? "邀请下单" : "发送商品",
      material: "发送素材",
      quick_reply: "发送快捷语",
      ignore: "忽略消息"
    };
    steps.push(labels[String(action?.type || "")] || "执行页面动作");
  }
  if (!payload.actions?.length) steps.push(payload.status || payload.reply ? "发送文字" : "完成处理");
  return steps.slice(0, 12);
}

function classifyReplySource(stageValue, payload = {}) {
  const stage = String(stageValue || payload.stage || "").trim();
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const hasProductAction = actions.some((action) => ["product", "material", "quick_reply", "file", "image"].includes(String(action?.type || "")));

  if (payload.usedJudgmentLibrary === true || stage === "judgment_ai") {
    return {
      sourceType: "judgment_ai",
      sourceLabel: "判断库补充",
      usedRuleLibrary: false,
      usedDirectReply: false,
      usedAi: true
    };
  }

  if (payload.usedAi === true || /^ai/.test(stage)) {
    return {
      sourceType: "ai_followup",
      sourceLabel: "AI 接管",
      usedRuleLibrary: false,
      usedDirectReply: false,
      usedAi: true
    };
  }

  if (stage === "panel_action") {
    return {
      sourceType: "panel_action",
      sourceLabel: "页面动作",
      usedRuleLibrary: true,
      usedDirectReply: false,
      usedAi: false
    };
  }

  if (stage === "action_rule" || hasProductAction) {
    return {
      sourceType: "action_rule",
      sourceLabel: "动作规则库",
      usedRuleLibrary: true,
      usedDirectReply: false,
      usedAi: false
    };
  }

  if (stage === "image_reply") {
    return {
      sourceType: "image_rule",
      sourceLabel: "图片规则库",
      usedRuleLibrary: true,
      usedDirectReply: false,
      usedAi: false
    };
  }

  if (stage === "rule") {
    return {
      sourceType: "text_rule",
      sourceLabel: "文本规则库",
      usedRuleLibrary: true,
      usedDirectReply: false,
      usedAi: false
    };
  }

  if (stage === "quick_ack") {
    return {
      sourceType: "quick_ack",
      sourceLabel: "直接承接",
      usedRuleLibrary: false,
      usedDirectReply: true,
      usedAi: false
    };
  }

  if (stage === "waiting_reply") {
    return {
      sourceType: "waiting_reply",
      sourceLabel: "等待补偿",
      usedRuleLibrary: false,
      usedDirectReply: true,
      usedAi: false
    };
  }

  if (stage === "fallback_reply") {
    return {
      sourceType: "fallback_reply",
      sourceLabel: "60秒兜底",
      usedRuleLibrary: false,
      usedDirectReply: true,
      usedAi: false
    };
  }

  if (stage === "ignore") {
    return {
      sourceType: "ignore",
      sourceLabel: "忽略",
      usedRuleLibrary: false,
      usedDirectReply: false,
      usedAi: false
    };
  }

  return {
    sourceType: stage || "unknown",
    sourceLabel: stage ? "其他来源" : "未分类",
    usedRuleLibrary: false,
    usedDirectReply: false,
    usedAi: false
  };
}

function startReplySummaryScheduler() {
  setInterval(() => {
    runReplySummaryScheduler().catch((error) => console.error("[summary] scheduler failed", error));
  }, 60_000);
  runReplySummaryScheduler().catch((error) => console.error("[summary] initial scheduler failed", error));
}

async function runReplySummaryScheduler() {
  await maybeSendHourlyReplySummary();
  await maybeSendDailyReplySummary();
}

async function maybeSendHourlyReplySummary() {
  if (!config?.notify?.hourlySummaryEnabled) return;
  const intervalHours = clampInt(config?.notify?.hourlySummaryIntervalHours || 1, 1, 24);
  const now = new Date();
  const slotStart = new Date(now);
  slotStart.setMinutes(0, 0, 0);
  slotStart.setHours(Math.floor(slotStart.getHours() / intervalHours) * intervalHours);
  const currentSlot = `${localDateHour(slotStart)}/${intervalHours}h`;
  if (replySummaryState.lastHourlySlot === currentSlot) return;

  const previousStart = new Date(slotStart.getTime() - intervalHours * 60 * 60_000);
  const previousSlot = `${localDateHour(previousStart)}/${intervalHours}h`;
  if (replySummaryState.lastHourlySlot === previousSlot) {
    replySummaryState.lastHourlySlot = currentSlot;
    await saveReplySummaryState();
    return;
  }

  const records = recordsBetween(previousStart.getTime(), slotStart.getTime());
  replySummaryState.lastHourlySlot = currentSlot;
  await saveReplySummaryState();
  if (!records.length) return;

  await sendNotification(
    `reply_hourly_summary:${previousSlot}`,
    intervalHours === 1 ? `${APP_DISPLAY_NAME}小时总结` : `${APP_DISPLAY_NAME} ${intervalHours} 小时总结`,
    buildReplySummaryBody(records, `${formatLocalTime(previousStart)} - ${formatLocalTime(slotStart)}`),
    { severity: "info", cooldownMs: 0 }
  );
}

async function maybeSendDailyReplySummary() {
  if (!config?.notify?.dailySummaryEnabled) return;
  const now = new Date();
  const daily = parseDailySummaryTime(config.notify.dailySummaryTime, config.notify.dailySummaryHour);
  if (now.getHours() !== daily.hour || now.getMinutes() < daily.minute) return;
  const today = localDate(now);
  if (replySummaryState.lastDailyDate === today) return;

  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const records = recordsBetween(yesterdayStart.getTime(), todayStart.getTime());

  replySummaryState.lastDailyDate = today;
  await saveReplySummaryState();
  if (!records.length) return;

  await sendNotification(
    `reply_daily_summary:${localDate(yesterdayStart)}`,
    `${APP_DISPLAY_NAME}昨日总览`,
    buildReplySummaryBody(records, `${localDate(yesterdayStart)} 00:00 - 24:00`),
    { severity: "info", cooldownMs: 0 }
  );
}

function parseDailySummaryTime(timeValue, fallbackHour = 10) {
  const text = String(timeValue || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{1,2})$/);
  if (match) {
    return {
      hour: clampInt(match[1], 0, 23),
      minute: clampInt(match[2], 0, 59)
    };
  }
  return {
    hour: clampInt(fallbackHour, 0, 23),
    minute: 0
  };
}

function recordsBetween(startAt, endAt) {
  return replyRecords.filter((item) => Number(item.at || 0) >= startAt && Number(item.at || 0) < endAt);
}

function buildReplySummaryBody(records, label) {
  const sent = records.filter((item) => item.kind === "sent");
  const failed = records.filter((item) => item.kind === "failed");
  const timeout = records.filter((item) => item.kind === "timeout");
  const customers = new Set(records.map((item) => item.customer).filter(Boolean));
  const actionCounts = countBy(records.flatMap((item) => item.actions || []).map((item) => item.type || "action"));
  const lines = [
    `时间：${label}`,
    `客户问题：${customers.size} 条`,
    `成功记录：${sent.length} 条`,
    `失败记录：${failed.length} 条`,
    `超时记录：${timeout.length} 条`
  ];
  const actionLine = Object.entries(actionCounts)
    .map(([name, count]) => `${name} ${count}`)
    .join("，");
  if (actionLine) lines.push(`动作：${actionLine}`);
  lines.push("");
  lines.push("明细：");
  const detailLimit = clampInt(config?.notify?.summaryDetailLimit || 12, 3, 80);
  for (const item of records.slice(-detailLimit)) {
    lines.push(`- ${formatLocalTime(new Date(item.at))} ${summaryRecordLine(item)}`);
  }
  if (records.length > detailLimit) lines.push(`其余 ${records.length - detailLimit} 条已省略`);
  return lines.join("\n");
}

function summaryRecordLine(item) {
  const status = item.kind === "sent" ? "已发送" : item.kind === "timeout" ? "超时" : "失败";
  const actionText = (item.actions || []).map((action) => {
    if (action.type === "product") return `${action.type}:${action.button || ""}:${action.productId || ""}`.replace(/:+$/g, "");
    if (action.type === "image") return "image";
    return action.type || "action";
  }).filter(Boolean).join(",");
  return [
    status,
    item.sourceLabel ? `来源:${item.sourceLabel}` : "",
    item.stage ? `阶段:${item.stage}` : "",
    item.rule ? `规则:${clip(item.rule, 30)}` : "",
    actionText ? `动作:${actionText}` : "",
    item.customer ? `客户:${clip(item.customer, 42)}` : "",
    item.reply ? `回复:${clip(item.reply, 42)}` : "",
    item.status && item.kind !== "sent" ? `原因:${clip(item.status, 42)}` : ""
  ].filter(Boolean).join(" ");
}

function countBy(items) {
  return items.reduce((acc, item) => {
    if (!item) return acc;
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});
}

function localDate(date) {
  const value = new Date(date);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localDateHour(date) {
  return `${localDate(date)} ${String(new Date(date).getHours()).padStart(2, "0")}:00`;
}

function formatLocalTime(date) {
  const value = new Date(date);
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

async function notifyMissingWebhookIfNeeded() {
  if (config?.notify?.enabled && config.notify.wecomWebhookUrl) return;
  await sendNotification(
    "webhook_missing",
    "企业微信 Webhook 未配置",
    "请在 .env 填入 WECOM_BOT_WEBHOOK_URL，否则只能看到本机通知，无法通知到人",
    { severity: "critical", cooldownMs: 60_000 }
  );
}

function startWatchdogs() {
  stopWatchdogs();
  const watchdog = normalizeWatchdogConfig(config?.watchdog || {});
  config.watchdog = watchdog;
  if (!watchdog.enabled) {
    broadcastStatus();
    return;
  }

  watchdogTimers = [
    setInterval(() => checkAiHealth({ notifyOk: false }), watchdog.aiHealthMs),
    setInterval(() => inspectLoginState(), watchdog.pageHealthMs),
    setInterval(() => inspectBotHeartbeat(), Math.min(watchdog.botHeartbeatMs, 60_000)),
    setInterval(() => selfCheckRunyuAuth({ notify: true, source: "scheduled_check" }), watchdog.runyuAuthHealthMs)
  ];
  broadcastStatus();
}

function stopWatchdogs() {
  for (const timer of watchdogTimers) clearInterval(timer);
  watchdogTimers = [];
}

async function checkAiHealth({ notifyOk = false } = {}) {
  try {
    const data = await fetchJson(localAiUrl("/health"), 5000);
    if (!isCompatibleAiService(data)) throw new Error("LOCAL_AI_SERVICE_INCOMPATIBLE: 本地服务版本或路由不匹配");
    lastAiHealth = {
      ok: Boolean(data.ok),
      hasKey: Boolean(data.hasKey),
      at: Date.now(),
      message: data.hasKey ? `${data.model || "model"} ${data.review || ""}`.trim() : "缺少 DeepSeek API Key"
    };

    if (!data.hasKey) {
      await sendNotification("ai_missing_key", "本地 AI 服务缺少 API Key", "请检查项目 .env 里的 DEEPSEEK_API_KEY", {
        severity: "critical",
        recoveryKey: "ai"
      });
    } else if (notifyOk) {
      await sendNotification("ai_health_ok", "AI 服务正常", lastAiHealth.message, {
        cooldownMs: 30_000
      });
    }
    if (data.hasKey) await notifyHealthRecovered("ai", "AI 服务已恢复", lastAiHealth.message);
  } catch (error) {
    lastAiHealth = {
      ok: false,
      hasKey: false,
      at: Date.now(),
      message: String(error?.message || error)
    };
    await sendNotification("ai_down", "本地 AI 服务异常", `${lastAiHealth.message}\n程序将尝试重启 AI 服务`, {
      severity: "critical",
      recoveryKey: "ai",
      cooldownMs: 60_000
    });
    restartAiServer();
  } finally {
    broadcastStatus();
  }
}

async function testAiReply(payload = {}) {
  const message = String(payload.message || "客户问：这个会员怎么买？").trim();
  const context = Array.isArray(payload.context) ? payload.context.slice(-8) : [];
  const sideContext = String(payload.sideContext || "").trim();
  if (!message) return { ok: false, message: "测试消息不能为空" };

  try {
    const response = await fetch(localAiUrl("/reply"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        context,
        sideContext,
        mode: payload.mode || "test"
      }),
      signal: AbortSignal.timeout(clampInt(payload.timeoutMs || 60_000, 5_000, 120_000))
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        message: data.message || data.error || `HTTP ${response.status}`
      };
    }
    return {
      ok: true,
      reply: String(data.reply || ""),
      judgments: data.judgments || null,
      trace: data.trace || null,
      latencyMs: Number(data.trace?.latencyMs || 0) || null,
      message: "AI 测试回复成功"
    };
  } catch (error) {
    return { ok: false, message: String(error?.message || error) };
  }
}

async function testRuleTrigger(payload = {}) {
  const message = String(payload.message || "").trim();
  const execute = payload.execute === true;
  if (!message) return { ok: false, matched: false, message: "测试消息不能为空" };

  const match = findRuleTrigger(message, config.bot || {});
  if (!match) {
    return {
      ok: true,
      matched: false,
      execute,
      message: "没有命中规则，将进入 AI/兜底链路",
      processSteps: ["输入消息", "匹配规则库", "未命中"]
    };
  }

  const processSteps = [
    "输入消息",
    match.sourceType === "action_rule" ? "命中动作规则" : match.sourceType === "image_rule" ? "命中图片规则" : "命中文字规则"
  ];
  if (!execute) {
    return {
      ok: true,
      matched: true,
      execute: false,
      sourceType: match.sourceType,
      sourceLabel: match.sourceLabel,
      ruleName: match.ruleName,
      reply: match.reply || "",
      actions: match.actions || [],
      message: `已命中：${match.ruleName}`,
      processSteps
    };
  }

  updateFloatingStatus("匹配规则", {
    code: "matching_rule",
    detail: `手动测试命中：${match.ruleName}`,
    customer: message
  });

  const results = [];
  if (match.sourceType === "text_rule") {
    processSteps.push("发送文字");
    results.push(await runPageAction({
      type: "send_text",
      text: match.reply,
      customer: message,
      manual: true,
      audit: true,
      name: match.ruleName,
      rule: match.ruleName
    }));
  } else if (match.sourceType === "image_rule") {
    if (match.reply) {
      processSteps.push("发送说明");
      results.push(await runPageAction({
        type: "send_text",
        text: match.reply,
        customer: message,
        manual: true,
        audit: true,
        name: match.ruleName,
        rule: match.ruleName
      }));
    }
    processSteps.push("发送图片");
    results.push(await runPageAction({
      type: "image",
      path: match.actions[0]?.path || "",
      customer: message,
      fromAction: true,
      manual: true,
      audit: true,
      name: match.ruleName,
      rule: match.ruleName
    }));
  } else {
    for (const action of match.rawActions || match.actions || []) {
      const result = await executeManualRuleAction(action, message, match.ruleName, processSteps);
      results.push(result);
      if (!result?.ok && !result?.sent && !result?.ignored && !result?.skipped) break;
    }
  }

  const ok = results.length > 0 && results.every((item) => Boolean(item?.ok || item?.sent || item?.ignored || item?.skipped));
  processSteps.push(ok ? "执行完成" : "执行失败");
  await recordReplyEvent(ok ? "sent" : "failed", {
    stage: "manual_rule_test",
    sourceType: match.sourceType,
    usedRuleLibrary: true,
    customer: message,
    rule: match.ruleName,
    status: ok ? "手动规则测试执行完成" : results.find((item) => item?.message)?.message || "手动规则测试执行失败",
    reply: match.reply || "",
    actions: match.actions || [],
    processSteps
  });
  return {
    ok,
    matched: true,
    execute: true,
    sourceType: match.sourceType,
    sourceLabel: match.sourceLabel,
    ruleName: match.ruleName,
    reply: match.reply || "",
    actions: match.actions || [],
    results,
    message: ok ? "命中规则已真实执行" : "命中规则执行失败",
    processSteps
  };
}

async function executeManualRuleAction(action = {}, customer = "", ruleName = "", processSteps = []) {
  if (!action || action.enabled === false) return { ok: true, skipped: true, message: "动作已关闭" };
  const type = String(action.type || "").trim();
  if (type === "wait") {
    processSteps.push("等待");
    await sleep(clampInt(action.ms || 500, 0, 60_000));
    return { ok: true, waited: true };
  }
  if (type === "ignore" || type === "noop") {
    processSteps.push("忽略消息");
    return { ok: true, ignored: true, message: "规则要求忽略" };
  }

  const actionPayload = {
    ...action,
    customer,
    manual: true,
    audit: true,
    name: action.name || ruleName,
    rule: ruleName
  };
  if (type === "text") {
    processSteps.push("发送文字");
    return runPageAction({
      ...actionPayload,
      type: "send_text",
      text: action.text || action.reply || ""
    });
  }
  if (type === "image") {
    processSteps.push("发送图片");
    return runPageAction({
      ...actionPayload,
      type: "image",
      path: action.path || action.imagePath || "",
      fromAction: true
    });
  }
  if (type === "file") processSteps.push("发送文件");
  else if (type === "product" && /邀请下单/.test(String(action.button || ""))) processSteps.push("邀请下单");
  else if (type === "product") processSteps.push("发送商品");
  else if (type === "material") processSteps.push("发送素材");
  else if (type === "quick_reply") processSteps.push("发送快捷语");
  else if (type === "capture_structure") processSteps.push("捕捉结构");
  else processSteps.push("执行动作");
  return runPageAction(actionPayload);
}

function findRuleTrigger(message, bot = {}) {
  const searchText = ruleSearchText(message);
  const actionRule = (Array.isArray(bot.actionRules) ? bot.actionRules : []).find((rule) => {
    if (!rule || rule.enabled === false || !Array.isArray(rule.actions) || !rule.actions.length) return false;
    return ruleMatchesSearchText(rule, searchText);
  });
  if (actionRule) {
    return {
      sourceType: "action_rule",
      sourceLabel: "动作规则库",
      ruleName: String(actionRule.name || "未命名动作规则"),
      actions: summarizeRuleActions(actionRule.actions),
      rawActions: cloneJson(actionRule.actions || []),
      reply: summarizeRuleReply(actionRule.actions)
    };
  }

  const imageRule = (Array.isArray(bot.imageReplies) ? bot.imageReplies : []).find((rule) => {
    if (!rule || rule.enabled === false) return false;
    if (!String(rule.path || rule.imagePath || "").trim()) return false;
    return ruleMatchesSearchText(rule, searchText);
  });
  if (imageRule) {
    return {
      sourceType: "image_rule",
      sourceLabel: "图片规则库",
      ruleName: String(imageRule.name || "未命名图片规则"),
      reply: String(imageRule.caption || "").trim(),
      actions: [{ type: "image", path: String(imageRule.path || imageRule.imagePath || "") }],
      rawActions: [{ type: "image", path: String(imageRule.path || imageRule.imagePath || ""), caption: String(imageRule.caption || "") }]
    };
  }

  const textRule = (Array.isArray(bot.rules) ? bot.rules : []).find((rule) => {
    if (!rule || rule.enabled === false) return false;
    return ruleMatchesSearchText(rule, searchText);
  });
  if (textRule) {
    return {
      sourceType: "text_rule",
      sourceLabel: "文本规则库",
      ruleName: String(textRule.name || "未命名文字规则"),
      reply: String(textRule.reply || "").trim(),
      actions: [{ type: "text", text: String(textRule.reply || "").trim() }]
    };
  }

  return null;
}

function ruleMatchesSearchText(rule = {}, searchText = "") {
  return normalizeList(rule.keywords).some((keyword) => keyword && searchText.includes(normalizeRuleText(keyword)));
}

function ruleSearchText(message) {
  const text = String(message || "");
  const type = inferRuleMessageType(text);
  const aliases = {
    image: "图片 照片 截图 非文本 客户发图片 收到图片",
    emoji: "表情 图片表情 非文本 客户发表情 收到表情",
    product: "商品 商品卡 商品链接 链接 非文本 客户发商品 收到商品",
    file: "文件 附件 非文本 客户发文件 收到文件",
    video: "视频 非文本 客户发视频 收到视频"
  };
  return normalizeRuleText([text, aliases[type] || "", type !== "text" ? "非文本 媒体消息" : ""].filter(Boolean).join(" "));
}

function inferRuleMessageType(text) {
  const value = String(text || "").trim();
  if (/^\[图片\]/.test(value)) return "image";
  if (/^\[表情\]/.test(value)) return "emoji";
  if (/^\[商品卡\]/.test(value)) return "product";
  if (/^\[文件\]/.test(value)) return "file";
  if (/^\[视频\]/.test(value)) return "video";
  return "text";
}

function normalizeRuleText(value) {
  return String(value || "").trim().toLowerCase();
}

function summarizeRuleActions(actions = []) {
  return (Array.isArray(actions) ? actions : []).map((action) => ({
    type: String(action?.type || "action"),
    text: clip(String(action?.text || action?.reply || ""), 120),
    path: String(action?.path || action?.imagePath || action?.filePath || ""),
    productId: String(action?.productId || ""),
    productName: String(action?.productName || ""),
    button: String(action?.button || "")
  }));
}

function summarizeRuleReply(actions = []) {
  return (Array.isArray(actions) ? actions : [])
    .map((action) => String(action?.text || action?.reply || "").trim())
    .filter(Boolean)
    .join("\n");
}

async function getJudgmentLibraryStatus() {
  const env = readEnvValues();
  try {
    const data = await fetchJson(localAiUrl("/judgments/status"), 5000);
    return {
      ok: true,
      ...data,
      auth: runyuAuthStatusPayload(),
      autoRefreshEnabled: Boolean(config?.judgmentLibrary?.autoRefreshEnabled),
      refreshIntervalHours: Number(config?.judgmentLibrary?.refreshIntervalHours || 168),
      configured: Boolean(env.RUNYU_WEB_COOKIE || process.env.RUNYU_WEB_COOKIE)
    };
  } catch (error) {
    return {
      ok: false,
      enabled: Boolean(config?.judgmentLibrary?.enabled),
      configured: Boolean(env.RUNYU_WEB_COOKIE || process.env.RUNYU_WEB_COOKIE),
      records: 0,
      auth: runyuAuthStatusPayload(),
      message: String(error?.message || error)
    };
  }
}

function initializeRunyuAuthState() {
  const env = readEnvValues();
  const hasCookie = Boolean(env.RUNYU_WEB_COOKIE || process.env.RUNYU_WEB_COOKIE);
  runyuAuthState = hasCookie
    ? {
        status: "configured",
        message: "已保存登录凭证，等待真实查询验证",
        source: "saved",
        errorCode: "",
        httpStatus: 0,
        errorDetail: "",
        cookieDetected: true,
        updatedAt: Date.now(),
        verifiedAt: 0
      }
    : {
        status: "unconfigured",
        message: "尚未登录润宇判断库",
        source: "",
        errorCode: "",
        httpStatus: 0,
        errorDetail: "",
        cookieDetected: false,
        updatedAt: Date.now(),
        verifiedAt: 0
      };
}

function runyuAuthStatusPayload() {
  const remainingMs = runyuLoginDeadlineAt ? Math.max(0, runyuLoginDeadlineAt - Date.now()) : 0;
  return {
    ...runyuAuthState,
    loginWindowOpen: Boolean(runyuLoginWindow && !runyuLoginWindow.isDestroyed()),
    configured: Boolean(readEnvValues().RUNYU_WEB_COOKIE || process.env.RUNYU_WEB_COOKIE),
    deadlineAt: runyuLoginDeadlineAt,
    remainingMs,
    history: runyuAuthHistory.slice(-30).reverse()
  };
}

function setRunyuAuthState(status, message, extra = {}) {
  const clearError = !["error", "expired", "forbidden", "timeout"].includes(status);
  const clearVerification = ["unconfigured", "login_required", "monitoring", "expired", "forbidden", "error", "timeout"].includes(status);
  runyuAuthState = {
    ...runyuAuthState,
    ...(clearError ? { errorCode: "", httpStatus: 0, errorDetail: "" } : {}),
    ...(clearVerification ? { queryVerified: false } : {}),
    ...extra,
    status,
    message: String(message || ""),
    updatedAt: Date.now()
  };
  recordRunyuAuthHistory(runyuAuthState);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("main-runyu-auth", runyuAuthStatusPayload());
  }
  broadcastStatus();
  return runyuAuthStatusPayload();
}

async function loadRunyuAuthHistory() {
  const path = runyuAuthHistoryPath();
  if (!existsSync(path)) return;
  try {
    const items = JSON.parse(await readFile(path, "utf8"));
    runyuAuthHistory = Array.isArray(items) ? items.slice(-RUNYU_AUTH_HISTORY_LIMIT) : [];
  } catch (error) {
    console.error("[runyu] load auth history failed", error);
    runyuAuthHistory = [];
  }
}

function recordRunyuAuthHistory(state = {}) {
  const item = {
    status: String(state.status || "unknown"),
    message: String(state.message || ""),
    source: String(state.source || ""),
    errorCode: String(state.errorCode || ""),
    httpStatus: Number(state.httpStatus || 0),
    cookieDetected: Boolean(state.cookieDetected),
    queryVerified: Boolean(state.queryVerified),
    downloadedRecords: Number(state.downloadedRecords || 0),
    at: Number(state.updatedAt || Date.now())
  };
  const previous = runyuAuthHistory.at(-1);
  if (
    previous &&
    previous.status === item.status &&
    previous.message === item.message &&
    previous.errorCode === item.errorCode &&
    previous.httpStatus === item.httpStatus &&
    previous.cookieDetected === item.cookieDetected &&
    previous.queryVerified === item.queryVerified &&
    previous.downloadedRecords === item.downloadedRecords &&
    previous.source === item.source
  ) return;
  runyuAuthHistory.push(item);
  runyuAuthHistory = runyuAuthHistory.slice(-RUNYU_AUTH_HISTORY_LIMIT);
  saveRunyuAuthHistory().catch((error) => console.error("[runyu] save auth history failed", error));
}

async function saveRunyuAuthHistory() {
  await mkdir(dirname(runyuAuthHistoryPath()), { recursive: true });
  await writeFile(runyuAuthHistoryPath(), JSON.stringify(runyuAuthHistory, null, 2), "utf8");
}

async function validateRunyuAuthOnStartup() {
  const persisted = await readRunyuSessionCookie();
  if (persisted) {
    await saveRunyuCookie(persisted, "browser_session");
  }
  const configured = Boolean(readEnvValues().RUNYU_WEB_COOKIE || process.env.RUNYU_WEB_COOKIE);
  if (!configured) return setRunyuAuthState("unconfigured", "尚未登录润宇判断库");
  setRunyuAuthState("checking", "正在验证已保存的润宇登录状态");
  const result = await verifyRunyuConnection({ notify: false, source: persisted ? "browser_session" : "saved" });
  if (["connected", "ready"].includes(result.status) && !Number(result.downloadedRecords || 0)) {
    return bootstrapRunyuJudgmentLibrary({ notify: false, source: "startup_bootstrap" });
  }
  return result;
}

async function selfCheckRunyuAuth(options = {}) {
  const configured = Boolean(readEnvValues().RUNYU_WEB_COOKIE || process.env.RUNYU_WEB_COOKIE);
  if (!configured) {
    return setRunyuAuthState("unconfigured", "这台电脑没有判断库 Cookie Token，请重新登录获取", {
      source: options.source || "auth_check",
      cookieDetected: false,
      errorCode: "RUNYU_COOKIE_NOT_CONFIGURED",
      errorDetail: "本机配置中没有 RUNYU_WEB_COOKIE"
    });
  }
  setRunyuAuthState("checking", "正在强制查询远端判断库，自检 Cookie Token", {
    source: options.source || "auth_check",
    cookieDetected: true
  });
  return verifyRunyuConnection({
    notify: options.notify !== false,
    source: options.source || "auth_check"
  });
}

async function openRunyuLoginWindow(options = {}) {
  if (options.reset === true) await clearRunyuBrowserSession({ clearSavedCookie: false });
  if (runyuLoginWindow && !runyuLoginWindow.isDestroyed()) {
    runyuLoginWindow.show();
    runyuLoginWindow.focus();
    startRunyuLoginDeadline();
    scheduleRunyuCookieInspection("existing_window");
    return runyuAuthStatusPayload();
  }

  startRunyuLoginDeadline();
  setRunyuAuthState("monitoring", "登录窗口已打开，5分钟内完成登录后点击“捕捉 Cookie Token”", {
    source: "browser_login",
    cookieDetected: false
  });
  runyuLoginWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    title: "登录润宇判断库",
    icon: APP_ICON_PATH,
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: RUNYU_AUTH_PARTITION
    }
  });

  const wc = runyuLoginWindow.webContents;
  const authSession = wc.session;
  const onCookieChanged = (_event, cookie, cause, removed) => {
    if (removed || cookie?.name !== "session_token") return;
    if (!String(cookie?.domain || "").includes("zhiduoke.com.cn")) return;
    scheduleRunyuCookieInspection(`cookie_${cause || "changed"}`);
  };
  authSession.cookies.on("changed", onCookieChanged);

  runyuLoginWindow.once("ready-to-show", () => runyuLoginWindow?.show());
  wc.on("did-finish-load", () => scheduleRunyuCookieInspection("page_loaded"));
  wc.on("did-navigate", (_event, url) => {
    setRunyuAuthState(runyuAuthState.status === "cookie_detected" ? "cookie_detected" : "monitoring", runyuAuthState.message, {
      source: "browser_login",
      lastUrl: String(url || "")
    });
    scheduleRunyuCookieInspection("navigated");
  });
  wc.on("did-navigate-in-page", () => scheduleRunyuCookieInspection("in_page"));
  wc.on("did-fail-load", (_event, code, description, validatedUrl) => {
    setRunyuAuthState("error", `润宇登录页加载失败：${description || code}`, {
      source: "browser_login",
      errorCode: "RUNYU_LOGIN_PAGE_LOAD_FAILED",
      httpStatus: Number(code || 0),
      errorDetail: String(validatedUrl || description || code || "")
    });
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(RUNYU_BASE_URL)) {
      wc.loadURL(url);
      return { action: "deny" };
    }
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  runyuLoginWindow.on("closed", () => {
    authSession.cookies.removeListener("changed", onCookieChanged);
    runyuLoginWindow = null;
    clearRunyuLoginDeadline();
    if (["login_required", "monitoring", "cookie_detected", "timeout"].includes(runyuAuthState.status)) {
      setRunyuAuthState("unconfigured", "登录窗口已关闭，尚未完成凭证验证", {
        source: "browser_login",
        cookieDetected: Boolean(runyuAuthState.cookieDetected)
      });
    } else {
      broadcastStatus();
    }
  });

  await wc.loadURL(`${RUNYU_BASE_URL}/`);
  return runyuAuthStatusPayload();
}

function startRunyuLoginDeadline() {
  clearRunyuLoginDeadline();
  runyuLoginDeadlineAt = Date.now() + RUNYU_LOGIN_TIMEOUT_MS;
  runyuLoginTimeoutTimer = setTimeout(() => {
    setRunyuAuthState("timeout", "5分钟登录时间已到，请点击“重新登录”后再试", {
      source: "browser_login",
      errorCode: "RUNYU_LOGIN_TIMEOUT",
      errorDetail: "登录窗口打开后 5 分钟内未完成 Cookie Token 验证"
    });
  }, RUNYU_LOGIN_TIMEOUT_MS);
}

function clearRunyuLoginDeadline() {
  clearTimeout(runyuLoginTimeoutTimer);
  runyuLoginTimeoutTimer = null;
  runyuLoginDeadlineAt = 0;
}

function scheduleRunyuCookieInspection(source = "browser_login") {
  clearTimeout(runyuCookieCaptureTimer);
  runyuCookieCaptureTimer = setTimeout(() => {
    inspectRunyuLoginCookie(source).catch((error) => {
      console.error("[runyu] cookie inspection failed", error);
      setRunyuAuthState("error", String(error?.message || error), {
        source,
        errorCode: "RUNYU_COOKIE_INSPECTION_FAILED",
        errorDetail: String(error?.stack || error?.message || error)
      });
    });
  }, 700);
}

async function inspectRunyuLoginCookie(source = "browser_login") {
  const cookie = await readRunyuSessionCookie();
  if (!cookie) {
    if (!["connected", "checking", "timeout"].includes(runyuAuthState.status)) {
      setRunyuAuthState("monitoring", "正在监控登录状态，登录成功后点击“捕捉 Cookie Token”", {
        source,
        cookieDetected: false
      });
    }
    return runyuAuthStatusPayload();
  }
  return setRunyuAuthState("cookie_detected", "已检测到登录 Cookie，请点击“捕捉 Cookie Token”完成验证", {
    source,
    cookieDetected: true
  });
}

async function captureAndVerifyRunyuCookie(source = "browser_login") {
  if (runyuCookieCaptureInProgress) return runyuAuthStatusPayload();
  runyuCookieCaptureInProgress = true;
  try {
    const cookie = await readRunyuSessionCookie();
    if (!cookie) {
      setRunyuAuthState("login_required", "没有检测到 session_token，请先在登录窗口完成登录", {
        source,
        cookieDetected: false,
        errorCode: "RUNYU_SESSION_TOKEN_NOT_FOUND",
        errorDetail: "Cookie 存储中没有找到 runyuai.zhiduoke.com.cn 的 session_token"
      });
      return runyuAuthStatusPayload();
    }
    const normalized = normalizeRunyuCookie(cookie);
    const current = normalizeRunyuCookie(readEnvValues().RUNYU_WEB_COOKIE || process.env.RUNYU_WEB_COOKIE || "");
    if (normalized !== current) await saveRunyuCookie(normalized, source);
    setRunyuAuthState("checking", "已捕捉 Cookie Token，正在执行真实查询验证", {
      source,
      cookieDetected: true
    });
    const result = await verifyRunyuConnection({ notify: true, source });
    if (["connected", "ready"].includes(result.status)) {
      clearRunyuLoginDeadline();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("main-runyu-auth", runyuAuthStatusPayload());
      }
      broadcastStatus();
    }
    if (["connected", "ready"].includes(result.status)) {
      return bootstrapRunyuJudgmentLibrary({ notify: true, source: "first_login_bootstrap" });
    }
    return result;
  } catch (error) {
    const diagnosis = diagnoseRunyuError(String(error?.message || error));
    return setRunyuAuthState("error", diagnosis.message, {
      source,
      cookieDetected: Boolean(runyuAuthState.cookieDetected),
      ...diagnosis
    });
  } finally {
    runyuCookieCaptureInProgress = false;
  }
}

async function readRunyuSessionCookie() {
  const authSession = session.fromPartition(RUNYU_AUTH_PARTITION);
  const cookies = await authSession.cookies.get({ url: `${RUNYU_BASE_URL}/`, name: "session_token" });
  const cookie = cookies
    .filter((item) => String(item.domain || "").includes("zhiduoke.com.cn") && item.value)
    .sort((a, b) => Number(b.expirationDate || 0) - Number(a.expirationDate || 0))[0];
  return cookie?.value ? `session_token=${cookie.value}` : "";
}

async function saveRunyuCookie(cookie, source = "browser_login") {
  const normalized = normalizeRunyuCookie(cookie);
  if (!normalized) throw new Error("没有读取到有效的 session_token");
  await writeEnvValues({
    RUNYU_WEB_COOKIE: normalized,
    RUNYU_WEB_BASE_URL: RUNYU_BASE_URL,
    RUNYU_JUDGMENTS_ENABLED: "enabled"
  });
  config.judgmentLibrary = normalizeJudgmentLibraryConfig({
    ...config.judgmentLibrary,
    enabled: true,
    useRemote: true,
    useCache: true
  });
  await saveConfig();
  await session.fromPartition(RUNYU_AUTH_PARTITION).flushStorageData();
  setRunyuAuthState("configured", "登录凭证已保存到这台电脑，等待验证", { source });
}

async function verifyRunyuConnection(options = {}) {
  while (runyuAuthVerificationPromise) {
    await runyuAuthVerificationPromise.catch(() => {});
  }
  const task = performRunyuConnectionVerification(options);
  runyuAuthVerificationPromise = task;
  try {
    return await task;
  } finally {
    if (runyuAuthVerificationPromise === task) runyuAuthVerificationPromise = null;
  }
}

async function performRunyuConnectionVerification(options = {}) {
  const result = await testJudgmentLibrary({
    query: "会员",
    limit: 1,
    remoteOnly: true,
    notify: false
  });
  if (result.ok) {
    const cacheStatus = await fetchJson(localAiUrl("/judgments/status"), 5000).catch(() => ({ records: 0 }));
    const records = Number(cacheStatus.records || 0);
    const state = setRunyuAuthState(records > 0 ? "ready" : "connected", `Cookie 自检通过，远端返回 ${result.results?.length || 0} 条，本地缓存 ${records} 条`, {
      source: options.source || runyuAuthState.source || "saved",
      cookieDetected: true,
      queryVerified: true,
      downloadedRecords: records,
      lastCheckedAt: Date.now(),
      verifiedAt: Date.now()
    });
    if (options.notify !== false) {
      await notifyHealthRecovered("runyu_auth", "判断库 Cookie 已恢复", `远端查询成功，本地缓存 ${records} 条。`, { eventType: "health" });
    }
    return state;
  }
  const message = String(result.message || result.error || "判断库验证失败");
  const diagnosis = diagnoseRunyuError(message);
  if (/没有.*权限|403|FORBIDDEN/i.test(message)) {
    const state = setRunyuAuthState("forbidden", diagnosis.message, { source: options.source || runyuAuthState.source, cookieDetected: true, ...diagnosis });
    if (options.notify !== false) await notifyRunyuAuthFailure(state);
    return state;
  }
  if (/未登录|过期|401|UNAUTHORIZED/i.test(message)) {
    const state = setRunyuAuthState("expired", diagnosis.message, { source: options.source || runyuAuthState.source, cookieDetected: true, ...diagnosis });
    if (options.notify !== false) await notifyRunyuAuthFailure(state);
    return state;
  }
  const state = setRunyuAuthState("error", diagnosis.message, { source: options.source || runyuAuthState.source, cookieDetected: true, ...diagnosis });
  if (options.notify !== false) await notifyRunyuAuthFailure(state);
  return state;
}

async function notifyRunyuAuthFailure(state = {}) {
  const action = state.status === "expired"
    ? "请打开控制台，在判断库页面点击“重新登录”，登录后点击“我已登录，获取凭证”。"
    : state.status === "forbidden"
      ? "请改用有判断库权限的账号重新登录。"
      : "请打开控制台查看错误码，按页面引导重试。";
  await sendNotification(
    `runyu_auth:${state.errorCode || state.status}`,
    "判断库 Cookie 自检失败",
    [`错误码：${state.errorCode || "RUNYU_VERIFY_FAILED"}`, state.httpStatus ? `HTTP：${state.httpStatus}` : "", state.message || "", action].filter(Boolean).join("\n"),
    {
      severity: "warning",
      recoveryKey: "runyu_auth",
      cooldownMs: 10 * 60_000,
      eventType: "health"
    }
  );
}

async function bootstrapRunyuJudgmentLibrary(options = {}) {
  const configured = Boolean(readEnvValues().RUNYU_WEB_COOKIE || process.env.RUNYU_WEB_COOKIE);
  if (!configured) {
    return setRunyuAuthState("unconfigured", "缺少 Cookie Token，无法初始化判断库缓存", {
      source: options.source || "bootstrap",
      cookieDetected: false,
      errorCode: "RUNYU_COOKIE_NOT_CONFIGURED",
      errorDetail: "请先打开登录网页，完成登录后获取凭证"
    });
  }
  setRunyuAuthState("syncing", "远端查询已通过，正在下载首次引用缓存", {
    source: options.source || "bootstrap",
    cookieDetected: true,
    queryVerified: true
  });
  const result = await testJudgmentLibrary({
    query: "会员",
    limit: 10,
    remoteOnly: true,
    notify: false
  });
  if (!result.ok) {
    const diagnosis = diagnoseRunyuError(String(result.message || result.error || "首次缓存下载失败"));
    const state = setRunyuAuthState("error", diagnosis.message, {
      source: options.source || "bootstrap",
      cookieDetected: true,
      queryVerified: true,
      ...diagnosis
    });
    if (options.notify !== false) await notifyRunyuAuthFailure(state);
    return state;
  }
  const cacheStatus = await fetchJson(localAiUrl("/judgments/status"), 5000).catch(() => ({ records: 0 }));
  const records = Number(cacheStatus.records || 0);
  if (!records) {
    const state = setRunyuAuthState("error", "远端查询成功，但没有下载到可引用记录", {
      source: options.source || "bootstrap",
      cookieDetected: true,
      queryVerified: true,
      errorCode: "RUNYU_BOOTSTRAP_EMPTY",
      errorDetail: "测试关键词“会员”没有写入本地缓存，请复制错误信息反馈"
    });
    if (options.notify !== false) await notifyRunyuAuthFailure(state);
    return state;
  }
  const state = setRunyuAuthState("ready", `判断库已就绪：远端查询成功，本地可引用 ${records} 条`, {
    source: options.source || "bootstrap",
    cookieDetected: true,
    queryVerified: true,
    downloadedRecords: records,
    lastCheckedAt: Date.now(),
    lastDownloadAt: Date.now(),
    verifiedAt: Date.now()
  });
  if (options.notify !== false) {
    await notifyHealthRecovered("runyu_auth", "判断库已恢复并可引用", `远端查询成功，本地可引用 ${records} 条。`, { eventType: "health" });
  }
  return state;
}

function diagnoseRunyuError(input) {
  const message = String(input || "判断库验证失败").trim();
  const httpMatch = message.match(/(?:API|HTTP|状态)\s*(401|403|404|408|429|5\d\d)/i);
  const httpStatus = Number(httpMatch?.[1] || 0);
  let errorCode = "RUNYU_VERIFY_FAILED";
  if (/LOCAL_AI_ROUTE_404|LOCAL_AI_SERVICE_INCOMPATIBLE/.test(message)) errorCode = "LOCAL_AI_SERVICE_INCOMPATIBLE";
  else if (/404/.test(message)) errorCode = "RUNYU_API_404";
  else if (/401|未登录|过期|UNAUTHORIZED/i.test(message)) errorCode = "RUNYU_AUTH_EXPIRED";
  else if (/403|没有.*权限|FORBIDDEN/i.test(message)) errorCode = "RUNYU_PERMISSION_DENIED";
  else if (/超时|timeout|ETIMEDOUT|408/i.test(message)) errorCode = "RUNYU_REQUEST_TIMEOUT";
  else if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNRESET|socket|network/i.test(message)) errorCode = "RUNYU_NETWORK_FAILED";
  return {
    message,
    errorCode,
    httpStatus,
    errorDetail: message
  };
}

async function clearRunyuBrowserSession(options = {}) {
  const authSession = session.fromPartition(RUNYU_AUTH_PARTITION);
  await authSession.clearStorageData({
    origin: RUNYU_BASE_URL,
    storages: ["cookies", "localstorage", "cachestorage"]
  });
  await authSession.flushStorageData();
  if (options.clearSavedCookie !== false) {
    await writeEnvValues({ RUNYU_WEB_COOKIE: "" });
  }
}

async function clearRunyuLogin() {
  if (runyuLoginWindow && !runyuLoginWindow.isDestroyed()) runyuLoginWindow.close();
  clearRunyuLoginDeadline();
  await clearRunyuBrowserSession({ clearSavedCookie: true });
  setRunyuAuthState("unconfigured", "已清除这台电脑上的润宇登录状态", { source: "", cookieDetected: false });
  return runyuAuthStatusPayload();
}

async function testJudgmentLibrary(payload = {}) {
  const query = String(payload.query || payload.keyword || "会员").trim();
  if (!query) return { ok: false, message: "测试关键词不能为空" };
  const result = await fetchJsonPost(localAiUrl("/judgments/search"), {
    query,
    limit: clampInt(payload.limit || 10, 1, 30),
    remoteOnly: payload.remoteOnly === true
  }, Number(config?.judgmentLibrary?.timeoutMs || 12000) + 5000).catch((error) => ({
    ok: false,
    errorCode: error?.code || "JUDGMENT_SEARCH_FAILED",
    httpStatus: Number(error?.status || 0),
    message: error?.code === "LOCAL_AI_ROUTE_404"
      ? "本机 AI 服务缺少判断库路由，程序将切换到兼容服务端口"
      : String(error?.message || error),
    results: []
  }));
  if (result.ok && payload.notify !== false) {
    await notifyHealthRecovered("judgments", "判断库接入已恢复", `测试关键词：${query}\n返回 ${result.results?.length || 0} 条。`);
  } else if (!result.ok && payload.notify !== false) {
    await sendNotification("judgments_test_failed", "判断库接入测试失败", result.message || "请检查 Cookie、Base URL、权限和网络", {
      severity: "warning",
      recoveryKey: "judgments",
      cooldownMs: 10 * 60_000
    });
  }
  return result;
}

async function refreshJudgmentLibrary(payload = {}) {
  const library = normalizeJudgmentLibraryConfig({
    ...config.judgmentLibrary,
    ...(payload || {})
  });
  const result = await fetchJsonPost(localAiUrl("/judgments/refresh"), {
    keywords: normalizeList(payload.keywords || library.refreshKeywords),
    sources: normalizeList(payload.sources || library.sources),
    searchTypes: normalizeList(payload.searchTypes || library.searchTypes),
    limit: clampInt(payload.limit || library.refreshLimit, 1, 3000),
    offset: clampInt(payload.offset || 0, 0, 1_000_000),
    reason: payload.reason || "manual_refresh"
  }, Math.max(20_000, Number(library.timeoutMs || 12000) * Math.max(1, normalizeList(payload.keywords || library.refreshKeywords).length))).catch((error) => ({
    ok: false,
    message: String(error?.message || error),
    errors: [{ message: String(error?.message || error) }]
  }));
  if (result.ok) {
    await notifyHealthRecovered("judgments", "判断库刷新已恢复", `已获取 ${result.fetched || 0} 条，新增 ${result.added || 0} 条，更新 ${result.updated || 0} 条。`);
  } else if (payload.notify !== false) {
    await sendNotification("judgments_refresh_manual_failed", "判断库刷新失败", result.message || "请检查 Cookie、Base URL、权限和网络", {
      severity: "warning",
      recoveryKey: "judgments",
      cooldownMs: 10 * 60_000
    });
  }
  return result;
}

async function startJudgmentFullDownload(payload = {}) {
  if (judgmentDownloadJob?.status === "running") return getJudgmentDownloadStatus();
  const library = normalizeJudgmentLibraryConfig({
    ...config.judgmentLibrary,
    ...(payload || {})
  });
  const status = await getJudgmentLibraryStatus();
  if (!library.enabled && !status.enabled) return { ok: false, message: "判断库未启用" };
  if (!status.configured) return { ok: false, message: "缺少 Runyu Session Cookie" };

  const keywords = normalizeList(payload.keywords || library.refreshKeywords);
  const sources = normalizeList(payload.sources || library.sources);
  const searchTypes = normalizeList(payload.searchTypes || library.searchTypes);
  const combinations = [];
  for (const keyword of keywords) {
    for (const source of sources) {
      for (const searchType of searchTypes) {
        combinations.push({ keyword, source, searchType });
      }
    }
  }
  if (!combinations.length) return { ok: false, message: "缺少下载范围" };

  judgmentDownloadJob = {
    ok: true,
    id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    status: "running",
    startedAt: Date.now(),
    finishedAt: 0,
    totalSteps: combinations.length,
    completedSteps: 0,
    current: "",
    fetched: 0,
    added: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
    cachePath: status.cachePath || "",
    progress: 0
  };
  runJudgmentFullDownload({ library, combinations }).catch((error) => {
    if (!judgmentDownloadJob) return;
    judgmentDownloadJob.status = "failed";
    judgmentDownloadJob.finishedAt = Date.now();
    judgmentDownloadJob.errors.push({ message: String(error?.message || error) });
    judgmentDownloadJob.progress = 100;
    sendNotification("judgments_full_download_failed", "判断库全量下载失败", String(error?.message || error), {
      severity: "warning",
      recoveryKey: "judgments",
      cooldownMs: 10 * 60_000
    }).catch((notifyError) => console.error("[notify] judgment download failed notification failed", notifyError));
    broadcastStatus();
  });
  return getJudgmentDownloadStatus();
}

function getJudgmentDownloadStatus() {
  if (!judgmentDownloadJob) {
    return { ok: true, status: "idle", progress: 0, message: "未开始下载" };
  }
  return { ...judgmentDownloadJob };
}

async function runJudgmentFullDownload({ library, combinations }) {
  const pageLimit = clampInt(library.fullDownloadPageLimit || library.refreshLimit || 300, 10, 3000);
  const maxPages = clampInt(library.fullDownloadMaxPages || 20, 1, 200);

  for (let index = 0; index < combinations.length; index += 1) {
    if (!judgmentDownloadJob || judgmentDownloadJob.status !== "running") return;
    const combo = combinations[index];
    judgmentDownloadJob.current = `${combo.source}/${combo.searchType}/${combo.keyword}`;
    let offset = 0;
    let pages = 0;
    while (pages < maxPages) {
      pages += 1;
      if (!judgmentDownloadJob || judgmentDownloadJob.status !== "running") return;
      const result = await refreshJudgmentLibrary({
        keywords: [combo.keyword],
        sources: [combo.source],
        searchTypes: [combo.searchType],
        limit: pageLimit,
        offset,
        reason: "full_download",
        notify: false
      });
      judgmentDownloadJob.fetched += Number(result.fetched || 0);
      judgmentDownloadJob.added += Number(result.added || 0);
      judgmentDownloadJob.updated += Number(result.updated || 0);
      judgmentDownloadJob.unchanged += Number(result.unchanged || 0);
      if (Array.isArray(result.errors) && result.errors.length) {
        judgmentDownloadJob.errors.push(...result.errors);
      }
      const pageProgress = Math.min(0.9, pages / maxPages) * (100 / combinations.length);
      judgmentDownloadJob.progress = Math.min(99, Math.round(((index / combinations.length) * 100) + pageProgress));
      broadcastStatus();
      if (!result.ok || Number(result.fetched || 0) < pageLimit) break;
      offset += pageLimit;
    }
    judgmentDownloadJob.completedSteps = index + 1;
    judgmentDownloadJob.progress = Math.min(99, Math.round((judgmentDownloadJob.completedSteps / combinations.length) * 100));
    broadcastStatus();
  }

  if (!judgmentDownloadJob) return;
  judgmentDownloadJob.status = judgmentDownloadJob.errors.length ? "completed_with_errors" : "completed";
  judgmentDownloadJob.finishedAt = Date.now();
  judgmentDownloadJob.current = "";
  judgmentDownloadJob.progress = 100;
  config.judgmentLibrary.lastAutoRefreshAt = Date.now();
  await saveConfig();
  if (judgmentDownloadJob.errors.length) {
    await sendNotification("judgments_full_download_partial", "判断库全量下载有失败项", `已获取 ${judgmentDownloadJob.fetched || 0} 条，失败 ${judgmentDownloadJob.errors.length} 项，请在控制台查看详情。`, {
      severity: "warning",
      recoveryKey: "judgments",
      cooldownMs: 10 * 60_000
    });
  } else {
    await notifyHealthRecovered("judgments", "判断库全量下载已恢复", `已获取 ${judgmentDownloadJob.fetched || 0} 条，新增 ${judgmentDownloadJob.added || 0} 条，更新 ${judgmentDownloadJob.updated || 0} 条。`);
  }
  broadcastStatus();
}

function startJudgmentRefreshScheduler() {
  if (judgmentRefreshTimer) clearInterval(judgmentRefreshTimer);
  judgmentRefreshTimer = setInterval(() => {
    maybeAutoRefreshJudgments().catch((error) => console.error("[judgments] auto refresh failed", error));
  }, 10 * 60_000);
  setTimeout(() => {
    maybeAutoRefreshJudgments().catch((error) => console.error("[judgments] initial refresh failed", error));
  }, 20_000);
}

async function maybeAutoRefreshJudgments() {
  const library = normalizeJudgmentLibraryConfig(config?.judgmentLibrary || {});
  if (!library.enabled || !library.autoRefreshEnabled) return;
  const status = await getJudgmentLibraryStatus();
  if (!status.configured) return;
  const lastAt = Number(status.updatedAt || library.lastAutoRefreshAt || 0);
  const intervalMs = clampInt(library.refreshIntervalHours || 168, 24, 720) * 60 * 60 * 1000;
  if (lastAt && Date.now() - lastAt < intervalMs) return;

  const result = await refreshJudgmentLibrary({
    ...library,
    reason: "auto_refresh",
    notify: false
  });
  config.judgmentLibrary.lastAutoRefreshAt = Date.now();
  await saveConfig();
  if (!result.ok) {
    await sendNotification("judgments_refresh_failed", "判断库自动刷新失败", result.message || "请打开控制台检查 Cookie、权限和关键词", {
      severity: "warning",
      recoveryKey: "judgments",
      cooldownMs: 6 * 60 * 60_000
    });
  } else {
    await notifyHealthRecovered("judgments", "判断库自动刷新已恢复", `已获取 ${result.fetched || 0} 条，新增 ${result.added || 0} 条，更新 ${result.updated || 0} 条。`);
  }
}

async function inspectLoginState() {
  const wc = getKfWebContents();
  if (!wc) return;
  const url = wc.getURL();
  if (!url) return;

  if (!url.includes("store.weixin.qq.com")) {
    await sendNotification("wrong_page", "客服窗口不在微信小店页面", `当前地址：${url}\n已尝试切回客服页`, {
      severity: "warning",
      recoveryKey: "page"
    });
    wc.loadURL(config.kfUrl);
    return;
  }

  try {
    const pageState = await readLoginPageState(wc);
    if (pageState.hasInput || isAuthenticatedKfUrl(url)) {
      clearPendingLoginNotification();
      await notifyHealthRecovered("login", "客服页登录已恢复", "已检测到客服输入框，可以继续自动回复。", { eventType: "login" });
      return;
    }
    if (pageState.hasLoginText && !pageState.hasInput) {
      if (!pageState.hasQr) updateFloatingStatus("等待二维码");
      scheduleLoginScreenshotNotification();
      updateFloatingStatus(pageState.hasQr ? "等待扫码确认" : "等待二维码");
    }
  } catch {
    // Page can be between navigations; the next watchdog pass will retry.
  }
}

async function readLoginPageState(wc) {
  return await wc.executeJavaScript(`(() => {
    const text = document.body ? document.body.innerText.slice(0, 3000) : "";
    const hasInput = Boolean(document.querySelector("#input-textarea"));
    const hasLoginText = /登录|扫码|微信扫一扫|二维码|验证/.test(text);
    const hasQr = (${detectQrReadyScript.toString()})();
    return { text, hasInput, hasLoginText, hasQr };
  })()`, true);
}

function scheduleLoginScreenshotNotification() {
  if (loginNotificationTimer) return;
  loginNotificationTimer = setTimeout(async () => {
    loginNotificationTimer = null;
    if (!(await isLoginStillRequired())) return;
    const sent = await sendLoginScreenshotNotification();
    updateFloatingStatus(sent ? "需要登录" : "等待二维码");
  }, 30_000);
}

function clearPendingLoginNotification() {
  if (!loginNotificationTimer) return;
  clearTimeout(loginNotificationTimer);
  loginNotificationTimer = null;
}

async function isLoginStillRequired() {
  const wc = getKfWebContents();
  if (!wc || wc.isDestroyed() || wc.isLoading()) return false;
  if (isAuthenticatedKfUrl(wc.getURL())) return false;
  return await wc.executeJavaScript(`(() => {
    const text = document.body ? document.body.innerText.slice(0, 3000) : "";
    const hasInput = Boolean(document.querySelector("#input-textarea"));
    const hasLoginText = /登录|扫码|微信扫一扫|二维码|验证/.test(text);
    const hasQr = (${detectQrReadyScript.toString()})();
    return hasLoginText && hasQr && !hasInput;
  })()`, true).catch(() => false);
}

async function inspectBotHeartbeat() {
  if (!config.bot.enabled) return;
  const wc = getKfWebContents();
  if (!wc) return;
  const url = wc.getURL();
  if (!url.includes("/shop/kf")) return;

  const pageHeartbeatAt = await wc.executeJavaScript("Number(window.__wechatShopKfBotHeartbeatAt || 0)", true).catch(() => 0);
  if (pageHeartbeatAt && Date.now() - pageHeartbeatAt < config.watchdog.botHeartbeatMs) {
    lastBotHeartbeatAt = Math.max(Number(lastBotHeartbeatAt || 0), Number(pageHeartbeatAt));
  }

  const age = Date.now() - Number(lastBotHeartbeatAt || 0);
  if (age < config.watchdog.botHeartbeatMs) return;

  await sendNotification("bot_stale", "自动回复脚本长时间无状态", "程序将重新注入脚本并刷新客服页，避免静默失效", {
    severity: "critical",
    recoveryKey: "bot",
    cooldownMs: 60_000
  });
  await injectBotScript();
  if (config.watchdog.reloadOnBotStale) reloadKfPage();
}

async function sendNotification(key, title, body, options = {}) {
  if (options.recoveryKey) {
    markHealthIssue(options.recoveryKey, title, body);
  }

  const cooldownMs = Number(options.cooldownMs ?? config?.notify?.cooldownMs ?? 300_000);
  const cooldownKey = String(key || title);
  const last = notifyCooldowns.get(cooldownKey) || 0;
  if (Date.now() - last < cooldownMs) return false;
  notifyCooldowns.set(cooldownKey, Date.now());

  console.log(`[notify] ${title}: ${body}`);
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }

  if (config?.notify?.enabled && config.notify.wecomWebhookUrl && shouldSendWebhookNotification(key, options)) {
    try {
      await postWecomWithRetry(title, body, options.severity || "info");
      if (String(key || "") !== "recovered:webhook") {
        await notifyWebhookRecovered("企业微信 Webhook 已恢复，本次通知已成功送达。");
      }
    } catch (error) {
      console.error("[notify] wecom failed", error);
      markHealthIssue("webhook", "企业微信通知发送失败", String(error?.message || error));
      await enqueueNotifyOutbox({
        key: cooldownKey,
        title,
        body,
        severity: options.severity || "info",
        error: String(error?.message || error)
      });
      if (Notification.isSupported()) {
        new Notification({
          title: "企业微信通知发送失败",
          body: String(error?.message || error)
        }).show();
      }
    }
  }

  return true;
}

function markHealthIssue(key, title, body = "") {
  const id = String(key || "").trim();
  if (!id) return;
  const current = healthIssues.get(id) || {};
  healthIssues.set(id, {
    title: String(title || current.title || id),
    body: String(body || current.body || ""),
    firstAt: current.firstAt || Date.now(),
    lastAt: Date.now()
  });
}

async function notifyHealthRecovered(key, title, body = "", options = {}) {
  const id = String(key || "").trim();
  if (!id || !healthIssues.has(id)) return false;
  healthIssues.delete(id);
  return await sendNotification(
    `recovered:${id}`,
    title,
    body,
    {
      severity: "info",
      cooldownMs: options.cooldownMs ?? 60_000,
      eventType: options.eventType || "health"
    }
  );
}

async function notifyWebhookRecovered(body = "企业微信 Webhook 已恢复，后续错误和恢复通知会继续推送。") {
  if (!healthIssues.has("webhook")) return false;
  healthIssues.delete("webhook");
  try {
    await postWecomWithRetry(`${APP_DISPLAY_NAME}通知通道已恢复`, body, "info");
    return true;
  } catch (error) {
    markHealthIssue("webhook", "企业微信通知发送失败", String(error?.message || error));
    return false;
  }
}

function shouldSendWebhookNotification(key, options = {}) {
  const rules = config?.notify?.eventRules || {};
  const eventType = String(options.eventType || webhookEventTypeFromKey(key));
  if (!eventType) return true;
  if (eventType in rules) return rules[eventType] !== false;
  return true;
}

function webhookEventTypeFromKey(key) {
  const text = String(key || "");
  if (/^reply_hourly_summary|^reply_daily_summary/.test(text)) return "summaries";
  if (/reply_success/.test(text)) return "replySuccess";
  if (/reply_failed|ai_followup_failed/.test(text)) return "replyFailed";
  if (/reply_timeout/.test(text)) return "replyTimeout";
  if (/needs_login|login|扫码/.test(text)) return "login";
  if (/^recovered:/.test(text)) return "health";
  if (/ai_|bot_stale|page_|shell_|wrong_page|judgments_/.test(text)) return "health";
  if (/app_started|webhook_missing/.test(text)) return "app";
  return "";
}

async function sendLoginScreenshotNotification() {
  if (loginScreenshotInProgress) return false;
  loginScreenshotInProgress = true;
  try {
    const qrReady = await waitForLoginQr(25_000);
    if (!qrReady) {
      updateFloatingStatus("等待二维码");
      return false;
    }
    return await sendLoginScreenshotNotificationNow();
  } finally {
    loginScreenshotInProgress = false;
  }
}

async function sendLoginScreenshotNotificationNow() {
  const cooldownMs = Number(config?.notify?.cooldownMs ?? 300_000);
  const cooldownKey = "needs_login_screenshot";
  const last = notifyCooldowns.get(cooldownKey) || 0;
  if (Date.now() - last < cooldownMs) return false;
  notifyCooldowns.set(cooldownKey, Date.now());

  const title = "客服页需要扫码登录";
  const body = "请打开桌面客服窗口，用微信扫码、验证码或登录确认完成登录。截图会紧跟这条消息发送。";
  markHealthIssue("login", title, body);
  console.log(`[notify] ${title}: ${body}`);

  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }

  let screenshotPath = "";
  try {
    screenshotPath = await captureLoginScreenshot();
  } catch (error) {
    console.error("[notify] login screenshot failed", error);
  }

  if (!config?.notify?.enabled || !config.notify.wecomWebhookUrl) return true;

  try {
    await postWecomWithRetry(title, body, "critical");
  } catch (error) {
    console.error("[notify] wecom login text failed", error);
    await enqueueNotifyOutbox({
      key: `${cooldownKey}:text`,
      title,
      body,
      severity: "critical",
      error: String(error?.message || error)
    });
  }

  if (!screenshotPath) {
    await enqueueNotifyOutbox({
      key: `${cooldownKey}:screenshot_failed`,
      title: "客服扫码截图生成失败",
      body: "程序检测到需要扫码登录，但未能截取客服窗口画面，请直接打开桌面应用查看。",
      severity: "critical",
      error: "capture_failed"
    });
    return true;
  }

  await removeNotifyOutbox((item) => item.key === `${cooldownKey}:screenshot_failed`);

  try {
    await postWecomImageWithRetry(screenshotPath);
    await unlink(screenshotPath).catch(() => {});
  } catch (error) {
    console.error("[notify] wecom login screenshot failed", error);
    await enqueueNotifyOutbox({
      key: `${cooldownKey}:image:${screenshotPath}`,
      title: "客服扫码登录截图",
      body: "客服页需要扫码登录，图片补发中。",
      severity: "critical",
      error: String(error?.message || error),
      messageType: "image",
      imagePath: screenshotPath
    });
  }

  return true;
}

async function waitForLoginQr(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const wc = getKfWebContents();
    if (!wc) return false;
    const ready = await wc.executeJavaScript(`(${detectQrReadyScript.toString()})()`, true).catch(() => false);
    if (ready) return true;
    await sleep(1000);
  }
  return false;
}

function detectQrReadyScript() {
  const bodyText = document.body ? document.body.innerText : "";
  const hasLoginText = /扫码|二维码|微信扫一扫|登录|验证/.test(bodyText);
  const nodes = Array.from(document.querySelectorAll("img,canvas,svg")).filter((node) => {
    const rect = node.getBoundingClientRect();
    if (rect.width < 90 || rect.height < 90) return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const label = [
      node.id || "",
      String(node.className || ""),
      node.getAttribute("alt") || "",
      node.getAttribute("aria-label") || "",
      node.getAttribute("title") || "",
      node.getAttribute("src") || ""
    ].join(" ");
    return /qr|qrcode|二维码|scan|login|code/i.test(label) || hasLoginText;
  });
  return hasLoginText && nodes.length > 0;
}

async function captureLoginScreenshot() {
  const image = await captureKfPageImage();
  let current = image;
  let buffer = current.toJPEG(72);
  const maxBytes = 1900 * 1024;

  for (let attempt = 0; buffer.length > maxBytes && attempt < 5; attempt += 1) {
    const size = current.getSize();
    current = current.resize({
      width: Math.max(480, Math.floor(size.width * 0.82)),
      height: Math.max(320, Math.floor(size.height * 0.82)),
      quality: "good"
    });
    buffer = current.toJPEG(68 - attempt * 6);
  }

  if (buffer.length > maxBytes) {
    throw new Error(`screenshot too large: ${buffer.length}`);
  }

  const dir = resolve(app.getPath("userData"), "login-screenshots");
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, `login-${Date.now()}.jpg`);
  await writeFile(path, buffer);
  return path;
}

async function captureKfPageImage() {
  const wc = getKfWebContents();
  if (wc) {
    try {
      return await wc.capturePage();
    } catch (error) {
      console.error("[notify] kf webContents capture failed", error);
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      if (kfView && kfViewAttached) {
        return await mainWindow.capturePage(kfView.getBounds());
      }
      return await mainWindow.capturePage();
    } catch (error) {
      console.error("[notify] main window capture failed", error);
    }
  }

  throw new Error("客服页面截图不可用");
}

async function postWecomWithRetry(title, body, severity) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await postWecom(title, body, severity);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

async function postWecomImageWithRetry(imagePath) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await postWecomImage(imagePath);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

async function loadNotifyOutbox() {
  const path = notifyOutboxPath();
  if (!existsSync(path)) return;

  try {
    const items = JSON.parse(await readFile(path, "utf8"));
    notifyOutbox = Array.isArray(items) ? items.slice(-NOTIFY_OUTBOX_LIMIT) : [];
  } catch (error) {
    console.error("[notify] load outbox failed", error);
    notifyOutbox = [];
  }
}

async function saveNotifyOutbox() {
  await mkdir(dirname(notifyOutboxPath()), { recursive: true });
  await writeFile(notifyOutboxPath(), JSON.stringify(notifyOutbox.slice(-NOTIFY_OUTBOX_LIMIT), null, 2), "utf8");
  broadcastStatus();
}

async function enqueueNotifyOutbox({ key, title, body, severity, error, messageType, imagePath }) {
  const now = Date.now();
  const existing = notifyOutbox.find((item) => item.key === key && item.title === title && item.body === body);
  if (existing) {
    existing.error = error || existing.error;
    if (messageType) existing.messageType = messageType;
    if (imagePath) existing.imagePath = imagePath;
    existing.nextTryAt = Math.min(existing.nextTryAt || now, now + 60_000);
    await saveNotifyOutbox();
    return;
  }

  notifyOutbox.push({
    id: `${now}:${Math.random().toString(36).slice(2)}`,
    key,
    title,
    body,
    severity,
    error,
    messageType,
    imagePath,
    attempts: 0,
    createdAt: now,
    nextTryAt: now + 60_000
  });
  notifyOutbox = notifyOutbox.slice(-NOTIFY_OUTBOX_LIMIT);
  await saveNotifyOutbox();
}

async function removeNotifyOutbox(predicate) {
  if (typeof predicate !== "function" || !notifyOutbox.length) return;
  const before = notifyOutbox.length;
  notifyOutbox = notifyOutbox.filter((item) => !predicate(item));
  if (notifyOutbox.length !== before) {
    await saveNotifyOutbox();
  }
}

function startNotifyOutboxPump() {
  if (notifyOutboxTimer) return;
  notifyOutboxTimer = setInterval(() => {
    flushNotifyOutbox().catch((error) => console.error("[notify] flush outbox failed", error));
  }, 60_000);
  flushNotifyOutbox().catch((error) => console.error("[notify] initial flush outbox failed", error));
}

async function flushNotifyOutbox() {
  if (notifyOutboxFlushing) return;
  if (!config?.notify?.enabled || !config.notify.wecomWebhookUrl || notifyOutbox.length === 0) return;

  notifyOutboxFlushing = true;
  let changed = false;
  let delivered = 0;
  try {
    const now = Date.now();
    const remaining = [];
    for (const item of notifyOutbox) {
      if (Number(item.nextTryAt || 0) > now) {
        remaining.push(item);
        continue;
      }

      try {
        if (item.messageType === "image" && item.imagePath) {
          await postWecomImageWithRetry(item.imagePath);
          await unlink(item.imagePath).catch(() => {});
        } else {
          await postWecomWithRetry(item.title, item.body, item.severity || "info");
        }
        changed = true;
        delivered += 1;
        console.log(`[notify] outbox delivered: ${item.title}`);
      } catch (error) {
        item.attempts = Number(item.attempts || 0) + 1;
        item.error = String(error?.message || error);
        item.nextTryAt = now + Math.min(30 * 60_000, 60_000 * Math.max(1, item.attempts));
        remaining.push(item);
        changed = true;
      }
    }
    notifyOutbox = remaining.slice(-NOTIFY_OUTBOX_LIMIT);
    if (delivered > 0) {
      await notifyWebhookRecovered(`企业微信 Webhook 已恢复，已补发 ${delivered} 条积压通知。`);
    }
  } finally {
    notifyOutboxFlushing = false;
    if (changed) await saveNotifyOutbox();
  }
}

async function postWecom(title, body, severity) {
  const marker = severity === "critical" ? "<font color=\"warning\">需要处理</font>" : "状态提醒";
  const content = [
    `**${escapeMarkdown(title)}**`,
    marker,
    escapeMarkdown(body || ""),
    `时间：${new Date().toLocaleString()}`
  ].filter(Boolean).join("\n\n");

  const data = await postJsonWithCurl(config.notify.wecomWebhookUrl, {
    msgtype: "markdown",
    markdown: { content }
  }, 10_000);
  if (data.errcode) {
    throw new Error(data.errmsg || `WeCom errcode ${data.errcode}`);
  }
}

async function postWecomImage(imagePath) {
  const buffer = await readFile(imagePath);
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error(`image too large for WeCom bot: ${buffer.length}`);
  }

  const data = await postJsonWithCurl(config.notify.wecomWebhookUrl, {
    msgtype: "image",
    image: {
      base64: buffer.toString("base64"),
      md5: createHash("md5").update(buffer).digest("hex")
    }
  }, 10_000);

  if (data.errcode) {
    throw new Error(data.errmsg || `WeCom errcode ${data.errcode}`);
  }
}

function postJsonWithCurl(url, payload, timeoutMs = 10_000) {
  return new Promise((resolvePost, rejectPost) => {
    const args = [
      "-sS",
      "--fail",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify(payload),
      "--config",
      "-"
    ];
    if (isLocalHttpUrl(url)) args.push("--noproxy", "*");

    const child = spawn("curl", args, {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPost);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPost(new Error(stderr || `curl exited with ${code}`));
        return;
      }

      try {
        resolvePost(JSON.parse(stdout || "{}"));
      } catch {
        rejectPost(new Error(`Webhook returned non-json: ${stdout.slice(0, 200)}`));
      }
    });
    child.stdin.end(`url = "${escapeCurlConfigValue(url)}"\n`);
  });
}

function isLocalHttpUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function escapeCurlConfigValue(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw httpResponseError(url, response.status, data.message);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonPost(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok) throw httpResponseError(url, response.status, data.message);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function httpResponseError(url, status, message = "") {
  const error = new Error(message || `HTTP ${status}`);
  error.status = Number(status || 0);
  error.url = String(url || "");
  error.code = isLocalHttpUrl(url) && Number(status) === 404 ? "LOCAL_AI_ROUTE_404" : "HTTP_ERROR";
  return error;
}

function applyLoginItemSetting() {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(config.autoStart) });
  } catch (error) {
    console.error("[desktop] set login item failed", error);
  }
}

function syncPowerBlocker() {
  const shouldRun = config?.watchdog?.preventAppSuspension !== false;
  if (!shouldRun) {
    stopPowerBlocker();
    return;
  }
  if (blockerId != null && powerSaveBlocker.isStarted(blockerId)) return;
  try {
    blockerId = powerSaveBlocker.start("prevent-app-suspension");
  } catch (error) {
    console.error("[desktop] power blocker failed", error);
  }
}

function stopPowerBlocker() {
  if (blockerId == null) return;
  try {
    if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
  } catch (error) {
    console.error("[desktop] stop power blocker failed", error);
  } finally {
    blockerId = null;
  }
}

function loadDotEnv(root, options = {}) {
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && (options.override || process.env[key] == null)) process.env[key] = value;
  }
}

function escapeMarkdown(value) {
  return String(value || "").replace(/[<>]/g, "");
}

function clip(value, size = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > size ? `${text.slice(0, size)}...` : text;
}
