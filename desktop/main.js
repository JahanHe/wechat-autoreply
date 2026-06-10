import { app, BrowserView, BrowserWindow, Menu, Notification, Tray, clipboard, dialog, ipcMain, nativeImage, powerSaveBlocker, screen } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const CONTENT_SCRIPT_PATH = resolve(APP_ROOT, "extension/content.js");
const FLOATING_HTML_PATH = resolve(__dirname, "floating.html");
const MAIN_SHELL_HTML_PATH = resolve(__dirname, "main-shell.html");
const BUNDLED_ASSISTANT_PROFILE_PATH = resolve(APP_ROOT, "config/assistant-profile.json");
const BUNDLED_REPLIES_PATH = resolve(APP_ROOT, "config/replies.json");
const BUNDLED_REPLY_IMAGES_DIR = resolve(APP_ROOT, "config/reply-images");
const BOT_CONFIG_VERSION = "desktop-0.2.0";
const MAIN_SHELL_SIDEBAR_WIDTH = 236;

process.env.WECHAT_KF_ROOT = APP_ROOT;
process.env.WECHAT_KF_CONFIG_ROOT = APP_ROOT;
loadDotEnv(APP_ROOT);

const PORT = Number(process.env.PORT || 8787);
const CONTROL_PORT = Number(process.env.DESKTOP_CONTROL_PORT || 8797);

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
let lastBotStatus = {
  status: "启动中",
  enabled: true,
  href: "",
  title: "",
  at: Date.now()
};
let lastAiHealth = {
  ok: false,
  hasKey: false,
  at: 0,
  message: "未检查"
};
const notifyCooldowns = new Map();
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
});

app.on("window-all-closed", () => {});

async function startDesktopApp() {
  applyUserDataOverride();
  await ensureRuntimeConfigFiles();
  process.env.WECHAT_KF_CONFIG_ROOT = runtimeConfigRoot();
  loadDotEnv(runtimeConfigRoot(), { override: true });
  config = await loadConfig();
  await saveConfig();
  await loadNotifyOutbox();
  await loadReplyRecords();
  await loadReplySummaryState();
  applyLoginItemSetting();
  startPowerBlocker();
  registerIpc();
  await startAiServerWithNotify();
  await startDesktopControlServer();
  createMainWindow();
  createFloatingWindow();
  createTray();
  startWatchdogs();
  startNotifyOutboxPump();
  startReplySummaryScheduler();
  await sendNotification("app_started", "客服桌面程序已启动", "程序、悬浮窗和本地 AI 服务已开始运行", {
    cooldownMs: 60_000
  });
  await notifyMissingWebhookIfNeeded();
}

function applyUserDataOverride() {
  if (!process.env.WECHAT_KF_DESKTOP_USER_DATA) return;
  app.setPath("userData", resolve(process.env.WECHAT_KF_DESKTOP_USER_DATA));
}

function defaultConfig() {
  const replyDefaults = loadBundledReplyDefaults();
  return {
    kfUrl: "https://store.weixin.qq.com/shop/kf",
    autoStart: true,
    bot: {
      configVersion: BOT_CONFIG_VERSION,
      enabled: true,
      aiFallback: true,
      aiEndpoint: `http://127.0.0.1:${PORT}/reply`,
      quickAck: replyDefaults.quickAck || "在",
      fallbackReply: replyDefaults.fallbackReply || "在\n您说",
      aiSlowMs: 50000,
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
      enabled: true,
      visible: true,
      alwaysOnTop: true,
      bounds: null,
      compactSize: { width: 320, height: 182 },
      settingsSize: { width: 760, height: 680 }
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
    watchdog: {
      aiHealthMs: 60_000,
      pageHealthMs: 60_000,
      botHeartbeatMs: 60_000,
      reloadOnBotStale: true
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
  const path = configPath();
  if (!existsSync(path)) return base;

  try {
    const saved = JSON.parse(await readFile(path, "utf8"));
    return mergeConfig(base, saved);
  } catch (error) {
    console.error("[desktop] config load failed", error);
    return base;
  }
}

async function saveConfig() {
  await mkdir(dirname(configPath()), { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
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

function mergeConfig(base, saved) {
  return {
    ...base,
    ...saved,
    bot: mergeBotConfig(base.bot, saved?.bot || {}),
    floatWindow: {
      ...base.floatWindow,
      ...(saved?.floatWindow || {}),
      compactSize: {
        ...base.floatWindow.compactSize,
        ...(saved?.floatWindow?.compactSize || {})
      },
      settingsSize: {
        ...base.floatWindow.settingsSize,
        ...(saved?.floatWindow?.settingsSize || {})
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
    watchdog: { ...base.watchdog, ...(saved?.watchdog || {}) }
  };
}

function mergeBotConfig(baseBot, savedBot) {
  const bot = { ...baseBot, ...savedBot };
  bot.configVersion = BOT_CONFIG_VERSION;
  bot.rules = mergeRuleList(baseBot.rules, savedBot.rules);
  bot.actionRules = mergeRuleList(baseBot.actionRules, savedBot.actionRules);
  bot.imageReplies = mergeRuleList(baseBot.imageReplies, savedBot.imageReplies);
  return bot;
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
  if (Array.isArray(defaultRule.keywords) && (!Array.isArray(savedRule.keywords) || savedRule.keywords.length === 0)) {
    rule.keywords = defaultRule.keywords;
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
    aiServer = await startAiServer({ port: PORT, host: "127.0.0.1" });
    await checkAiHealth({ notifyOk: false });
  } catch (error) {
    if (String(error?.message || "").includes("EADDRINUSE")) {
      await checkAiHealth({ notifyOk: false });
      if (lastAiHealth.ok) return;
    }

    lastAiHealth = {
      ok: false,
      hasKey: false,
      at: Date.now(),
      message: String(error?.message || error)
    };
    await sendNotification("ai_start_failed", "本地 AI 服务启动失败", lastAiHealth.message, {
      severity: "critical",
      cooldownMs: 60_000
    });
  }
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
      setControlCors(res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://127.0.0.1:${CONTROL_PORT}`);
      if (req.method === "GET" && url.pathname === "/health") {
        controlJson(res, 200, {
          ok: true,
          port: CONTROL_PORT,
          app: "微信小店客服自动回复",
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

      if (req.method === "POST" && url.pathname === "/action") {
        const body = await readControlJson(req);
        controlJson(res, 200, await runPageAction(body || {}));
        return;
      }

      controlJson(res, 404, { ok: false, message: "not found" });
    } catch (error) {
      controlJson(res, 500, { ok: false, message: String(error?.message || error) });
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

function setControlCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
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
    title: "微信小店客服自动回复",
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
    updateFloatingStatus("窗口已隐藏，后台运行中");
  });

  mainWindow.on("unresponsive", () => {
    sendNotification("shell_unresponsive", "控制台窗口无响应", "桌面程序将尝试重载控制台", {
      severity: "critical",
      cooldownMs: 60_000
    });
    mainWindow.webContents.reload();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    sendNotification("shell_crashed", "控制台进程异常", `原因：${details.reason || "unknown"}，已尝试重开`, {
      severity: "critical",
      cooldownMs: 60_000
    });
    mainWindow.loadFile(MAIN_SHELL_HTML_PATH);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    broadcastStatus();
  });

  mainWindow.on("resize", layoutKfView);
  mainWindow.on("maximize", layoutKfView);
  mainWindow.on("unmaximize", layoutKfView);

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    sendNotification("shell_load_failed", "控制台加载失败", `${description || code}\n${url || ""}`, {
      severity: "critical",
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
      partition: "persist:wechat-kf-desktop"
    }
  });

  const wc = kfView.webContents;
  wc.on("unresponsive", () => {
    sendNotification("page_unresponsive", "客服页面无响应", "桌面程序将尝试重载客服页面", {
      severity: "critical",
      cooldownMs: 60_000
    });
    wc.reload();
  });

  wc.on("render-process-gone", (_event, details) => {
    sendNotification("page_crashed", "客服页面进程异常", `原因：${details.reason || "unknown"}，已尝试重开`, {
      severity: "critical",
      cooldownMs: 60_000
    });
    wc.loadURL(config.kfUrl);
  });

  wc.on("did-finish-load", () => {
    injectBotScript();
    inspectLoginState();
    broadcastStatus();
  });

  wc.on("did-navigate", () => {
    injectBotScript();
    broadcastStatus();
  });

  wc.on("did-fail-load", (_event, code, description, url) => {
    sendNotification("page_load_failed", "客服页面加载失败", `${description || code}\n${url || ""}`, {
      severity: "critical",
      cooldownMs: 60_000
    });
    broadcastStatus();
  });

  wc.setWindowOpenHandler(({ url }) => {
    wc.loadURL(url);
    return { action: "deny" };
  });

  wc.loadURL(config.kfUrl);
  return kfView;
}

function getKfWebContents() {
  if (!kfView || kfView.webContents.isDestroyed()) return null;
  return kfView.webContents;
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
      loading: false
    };
  }

  return {
    ready: true,
    visible: Boolean(kfViewAttached && mainMode === "page"),
    url: wc.getURL(),
    title: wc.getTitle(),
    loading: wc.isLoading()
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

  const initialBounds = normalizeBounds(config.floatWindow.bounds) || {
    width: Number(config.floatWindow.compactSize?.width || 320),
    height: Number(config.floatWindow.compactSize?.height || 182)
  };

  floatWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    frame: false,
    resizable: true,
    movable: true,
    alwaysOnTop: Boolean(config.floatWindow.alwaysOnTop),
    skipTaskbar: true,
    title: "客服状态",
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
  tray.setToolTip("微信小店客服自动回复");
  tray.on("click", () => showMainWindow());
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const enabled = Boolean(config.bot.enabled);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开客服窗口", click: showMainWindow },
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
  const png = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAI0lEQVR4AWNkYGD4z0ABYBw1gGE0DBqG////GQkE0KQBAEOjAhHhXi8YAAAAAElFTkSuQmCC";
  const image = nativeImage.createFromDataURL(`data:image/png;base64,${png}`);
  image.setTemplateImage(process.platform === "darwin");
  return image;
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== "object") return null;
  const width = clampInt(bounds.width, 280, 1200);
  const height = clampInt(bounds.height, 160, 1000);
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
  const size = mode === "settings" ? config.floatWindow.settingsSize : config.floatWindow.compactSize;
  const width = clampInt(size?.width, 280, 1200);
  const height = clampInt(size?.height, 160, 1000);
  floatWindow.setSize(width, height, true);
  config.floatWindow.bounds = normalizeBounds(floatWindow.getBounds());
  await saveConfig();
  broadcastStatus();
  return true;
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
    const content = await readFile(CONTENT_SCRIPT_PATH, "utf8");
    await wc.executeJavaScript(content, true);
    lastBotStatus = {
      ...lastBotStatus,
      status: "脚本已注入",
      href: url,
      title: wc.getTitle(),
      at: Date.now()
    };
    broadcastStatus();
  } catch (error) {
    await sendNotification("bot_inject_failed", "自动回复脚本注入失败", String(error?.message || error), {
      severity: "critical",
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
    lastBotStatus = {
      ...lastBotStatus,
      ...status,
      at: Date.now()
    };
    broadcastStatus();
  });

  ipcMain.on("bot-event", (_event, event) => {
    handleBotEvent(event);
  });

  ipcMain.handle("float-open-main", () => showMainWindow());
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
  ipcMain.handle("float-quit", () => {
    isQuitting = true;
    app.quit();
    return true;
  });
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
  ipcMain.handle("main-reload", () => reloadKfPage());
  ipcMain.handle("main-check-ai", async () => {
    await checkAiHealth({ notifyOk: false });
    return lastAiHealth;
  });
  ipcMain.handle("main-test-webhook", (_event, webhookUrl) => testWebhookUrl(webhookUrl));
  ipcMain.handle("main-capture-structure", () => capturePageStructure());
  ipcMain.handle("main-run-action", (_event, action) => runPageAction(action || {}));
  ipcMain.handle("main-choose-image", () => chooseImagePath());
  ipcMain.handle("main-get-reply-records", (_event, options = {}) => replyRecordsPayload(options || {}));
  ipcMain.handle("main-test-ai-reply", (_event, payload = {}) => testAiReply(payload || {}));
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
  updateFloatingStatus(enabled ? "接管已开启" : "已暂停");
  return statusPayload();
}

function reloadKfPage() {
  const wc = getKfWebContents() || ensureKfView().webContents;
  showKfView();
  mainMode = "page";
  wc.loadURL(config.kfUrl);
  updateFloatingStatus("正在重载客服页");
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateFloatingStatus(status) {
  lastBotStatus = {
    ...lastBotStatus,
    status,
    at: Date.now()
  };
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
  const records = replyRecordStats(replyRecords);
  return {
    bot: lastBotStatus,
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
      bounds: floatWindow && !floatWindow.isDestroyed() ? floatWindow.getBounds() : config?.floatWindow?.bounds || null
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
    records,
    now: Date.now()
  };
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
      floatWindow: config.floatWindow,
      watchdog: config.watchdog
    },
    assistantProfile: loadAssistantProfile(),
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

    if (payload.config.floatWindow && typeof payload.config.floatWindow === "object") {
      config.floatWindow = {
        ...config.floatWindow,
        ...payload.config.floatWindow,
        compactSize: {
          ...config.floatWindow.compactSize,
          ...(payload.config.floatWindow.compactSize || {})
        },
        settingsSize: {
          ...config.floatWindow.settingsSize,
          ...(payload.config.floatWindow.settingsSize || {})
        }
      };
      config.floatWindow.bounds = normalizeBounds(config.floatWindow.bounds);
      if (floatWindow && !floatWindow.isDestroyed()) {
        floatWindow.setAlwaysOnTop(Boolean(config.floatWindow.alwaysOnTop));
      }
    }

    if (payload.config.watchdog && typeof payload.config.watchdog === "object") {
      config.watchdog = {
        ...config.watchdog,
        ...payload.config.watchdog
      };
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
      PORT: payload.env.port
    };
    await writeEnvValues(envUpdates);
    config.notify.wecomWebhookUrl = String(envUpdates.WECOM_BOT_WEBHOOK_URL || "").trim();
    config.notify.enabled = Boolean(config.notify.enabled && config.notify.wecomWebhookUrl);
  }

  await saveConfig();
  if (Object.keys(botChanges).length > 0) sendConfigChanges(botChanges);
  if (botChanges.enabled) updateFloatingStatus(config.bot.enabled ? "接管已开启" : "已暂停");
  updateTrayMenu();
  broadcastStatus();
  flushNotifyOutbox().catch((error) => console.error("[notify] flush after settings failed", error));
  return settingsPayload();
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
    ...profile
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
    reviewEnabled: true
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
    await postWecomWithRetry("微信小店客服通知测试", "悬浮窗配置里的 Webhook 测试消息", "info");
    return { ok: true, message: "Webhook 测试成功" };
  } catch (error) {
    return { ok: false, message: String(error?.message || error) };
  } finally {
    config.notify = oldNotify;
  }
}

async function chooseImagePath() {
  const result = await dialog.showOpenDialog(floatWindow || mainWindow, {
    title: "选择回复图片",
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return "";
  return result.filePaths[0];
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
  if (type === "open_float") {
    showFloatingWindow();
    if (action.mode === "settings") await setFloatingMode("settings");
    return { ok: true };
  }
  if (type === "image") return handleImageReply(action);
  if (type === "file") return handleFileReply(action);
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
      return {
        ...result,
        nativeFallback: nativeResult,
        pendingDialog: Boolean(stillPending),
        ok: Boolean(nativeResult.ok && !stillPending),
        sent: Boolean(nativeResult.ok && !stillPending),
        message: nativeResult.ok && !stillPending ? "panel action sent by native fallback" : result.message
      };
    }
    return result;
  }

  return { ok: false, message: `未知 action.type: ${type}` };
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
    const clickedText = textOf(button);
    button.click();
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
    const confirmed = action.confirm === false ? false : await confirmSendDialog(action.confirmButton || defaultConfirmButton);
    await sleep(Number(action.afterConfirmMs || defaultAfterConfirmMs(tabLabel)));
    const pendingButton = action.confirm === false ? null : findDialogButton(action.confirmButton || defaultConfirmButton);
    const pendingDialog = Boolean(pendingButton);
    const sent = action.confirm === false || !pendingDialog;
    return {
      ok: sent,
      sent,
      button: textOf(button),
      confirmed,
      pendingDialog,
      pendingSelector: pendingButton ? buildSelector(pendingButton) : "",
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
    const cards = Array.from(document.querySelectorAll(".product-panel .product-card, .product-card"))
      .filter(visible)
      .filter(isRightPanelNode)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (!cards.length) return null;

    const terms = matchTerms(item, ["productId", "productName", "query", "match", "name"]);
    const card = findMatchedNode(cards, terms) || cards[0];
    return findButtonInside(card, labels);
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
        button.click();
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

  if (config.bot.autoPasteImages && getKfWebContents()) {
    const uploadResult = await uploadAndSendImageFile(resolvedPath);
    uploaded = Boolean(uploadResult.uploaded);
    sent = Boolean(uploadResult.sent);
    fallbackMessage = uploadResult.message || "";
  }

  let copied = false;
  if (!sent) {
    clipboard.writeImage(image);
    copied = true;
    if (config.bot.autoPasteImages && getKfWebContents()) {
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

  return {
    ok: true,
    copied,
    uploaded,
    pasted,
    sent,
    path: resolvedPath,
    message: sent ? (uploaded ? "图片已通过上传控件发送" : "图片已自动发送") : pasted ? "图片已粘贴待确认" : "图片已复制到剪贴板"
  };
}

async function handleFileReply(payload = {}) {
  const filePath = String(payload.path || payload.filePath || "").trim();
  const customer = clip(String(payload.customer || ""), 100);
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

  return {
    ok: Boolean(result.sent),
    uploaded: Boolean(result.uploaded),
    sent: Boolean(result.sent),
    path: resolvedPath,
    message: result.message || (result.sent ? "文件已发送" : "文件未发送")
  };
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
    await sleep(1200);
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
    if (last?.sendButtonVisible || hasNewPreview) {
      return { ...last, ready: true };
    }
    await sleep(300);
  }
  return { ...(last || {}), ready: false, message: "等待图片预览超时" };
}

function findFileUploadInputScript() {
  const input = document.querySelector("#file2") ||
    Array.from(document.querySelectorAll("input[type='file']")).find((node) => node.id !== "file1");
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
  const input = document.querySelector("#file1") ||
    inputs.find((node) => visible(node) && /image|jpg|jpeg|png|gif|bmp/i.test(node.getAttribute("accept") || "")) ||
    inputs.find((node) => visible(node) && /图片/.test(titleNear(node)));
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
  return {
    previewCount,
    sendButtonVisible: sendButtonVisible || dialogSendButtonVisible
  };
}

async function pasteAndSendClipboardImage() {
  const wc = getKfWebContents();
  if (!wc) return { pasted: false, sent: false, message: "客服窗口未打开" };
  showMainWindow();
  await setMainMode("page");
  const focused = await wc.executeJavaScript(`(${focusComposerScript.toString()})()`, true).catch(() => false);
  if (!focused) return { pasted: false, sent: false, message: "客服输入框不可见" };

  wc.paste();
  await sleep(1200);

  const clicked = await wc.executeJavaScript(`(${clickSendButtonScript.toString()})()`, true).catch(() => false);
  if (!clicked) return { pasted: true, sent: false, message: "未找到发送按钮" };
  await sleep(1200);
  return { pasted: true, sent: true, message: "已点击发送按钮" };
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
    const record = await recordReplyEvent("sent", payload);
    await maybeSendReplySuccessNotification(record);
    return;
  }

  if (type === "reply_failed") {
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
    rule: String(payload.rule || payload.ruleName || ""),
    status: String(payload.status || payload.error || payload.reason || ""),
    customer: clip(String(payload.customer || payload.message || ""), 180),
    reply: clip(String(payload.reply || ""), 240),
    actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 8) : [],
    latencyMs: Number.isFinite(Number(payload.latencyMs)) ? Number(payload.latencyMs) : null
  };
  replyRecords.push(record);
  replyRecords = replyRecords.slice(-REPLY_RECORD_LIMIT);
  await saveReplyRecords().catch((error) => console.error("[summary] save reply record failed", error));
  broadcastStatus();
  return record;
}

function classifyReplySource(stageValue, payload = {}) {
  const stage = String(stageValue || payload.stage || "").trim();
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const hasProductAction = actions.some((action) => ["product", "material", "quick_reply", "file", "image"].includes(String(action?.type || "")));

  if (payload.usedAi === true || /^ai/.test(stage)) {
    return {
      sourceType: "ai_followup",
      sourceLabel: "AI 接管",
      usedRuleLibrary: false,
      usedDirectReply: false,
      usedAi: true
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

  if (stage === "panel_action") {
    return {
      sourceType: "panel_action",
      sourceLabel: "页面动作",
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
    intervalHours === 1 ? "客服自动回复小时总结" : `客服自动回复 ${intervalHours} 小时总结`,
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
    "客服自动回复昨日总览",
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
  setInterval(() => checkAiHealth({ notifyOk: false }), config.watchdog.aiHealthMs);
  setInterval(() => inspectLoginState(), config.watchdog.pageHealthMs);
  setInterval(() => inspectBotHeartbeat(), Math.min(config.watchdog.botHeartbeatMs, 60_000));
}

async function checkAiHealth({ notifyOk = false } = {}) {
  try {
    const data = await fetchJson(`http://127.0.0.1:${PORT}/health`, 5000);
    lastAiHealth = {
      ok: Boolean(data.ok),
      hasKey: Boolean(data.hasKey),
      at: Date.now(),
      message: data.hasKey ? `${data.model || "model"} ${data.review || ""}`.trim() : "缺少 DeepSeek API Key"
    };

    if (!data.hasKey) {
      await sendNotification("ai_missing_key", "本地 AI 服务缺少 API Key", "请检查项目 .env 里的 DEEPSEEK_API_KEY", {
        severity: "critical"
      });
    } else if (notifyOk) {
      await sendNotification("ai_health_ok", "AI 服务正常", lastAiHealth.message, {
        cooldownMs: 30_000
      });
    }
  } catch (error) {
    lastAiHealth = {
      ok: false,
      hasKey: false,
      at: Date.now(),
      message: String(error?.message || error)
    };
    await sendNotification("ai_down", "本地 AI 服务异常", `${lastAiHealth.message}\n程序将尝试重启 AI 服务`, {
      severity: "critical",
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
    const response = await fetch(`http://127.0.0.1:${PORT}/reply`, {
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
      message: "AI 测试回复成功"
    };
  } catch (error) {
    return { ok: false, message: String(error?.message || error) };
  }
}

async function inspectLoginState() {
  const wc = getKfWebContents();
  if (!wc) return;
  const url = wc.getURL();
  if (!url) return;

  if (!url.includes("store.weixin.qq.com")) {
    await sendNotification("wrong_page", "客服窗口不在微信小店页面", `当前地址：${url}\n已尝试切回客服页`, {
      severity: "warning"
    });
    wc.loadURL(config.kfUrl);
    return;
  }

  try {
    const pageState = await wc.executeJavaScript(`({
      text: document.body ? document.body.innerText.slice(0, 3000) : "",
      hasInput: Boolean(document.querySelector("#input-textarea")),
      hasQr: (${detectQrReadyScript.toString()})()
    })`, true);
    if (/登录|扫码|微信扫一扫|二维码|验证/.test(pageState.text) && !pageState.hasInput) {
      if (!pageState.hasQr) updateFloatingStatus("等待二维码");
      const sent = await sendLoginScreenshotNotification();
      updateFloatingStatus(sent ? "需要登录" : "等待二维码");
    }
  } catch {
    // Page can be between navigations; the next watchdog pass will retry.
  }
}

async function inspectBotHeartbeat() {
  if (!config.bot.enabled) return;
  const wc = getKfWebContents();
  if (!wc) return;
  const url = wc.getURL();
  if (!url.includes("/shop/kf")) return;

  const age = Date.now() - Number(lastBotStatus.at || 0);
  if (age < config.watchdog.botHeartbeatMs) return;

  await sendNotification("bot_stale", "自动回复脚本长时间无状态", "程序将重新注入脚本并刷新客服页，避免静默失效", {
    severity: "critical",
    cooldownMs: 60_000
  });
  await injectBotScript();
  if (config.watchdog.reloadOnBotStale) reloadKfPage();
}

async function sendNotification(key, title, body, options = {}) {
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
    } catch (error) {
      console.error("[notify] wecom failed", error);
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
  if (/ai_|bot_stale|page_|shell_|wrong_page/.test(text)) return "health";
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

  const wc = getKfWebContents();
  if (wc) {
    try {
      return await wc.capturePage();
    } catch (error) {
      console.error("[notify] kf view capture failed", error);
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
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function applyLoginItemSetting() {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(config.autoStart) });
  } catch (error) {
    console.error("[desktop] set login item failed", error);
  }
}

function startPowerBlocker() {
  try {
    blockerId = powerSaveBlocker.start("prevent-app-suspension");
  } catch (error) {
    console.error("[desktop] power blocker failed", error);
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
