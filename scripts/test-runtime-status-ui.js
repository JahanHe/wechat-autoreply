import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { _electron as electron } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const userData = await mkdtemp(join(tmpdir(), "xiaodian-ai-kefu-status-"));
const screenshots = {
  dashboard: "/tmp/xiaodian-ai-kefu-dashboard-status.png",
  floating: "/tmp/xiaodian-ai-kefu-floating-status.png",
  mini: "/tmp/xiaodian-ai-kefu-floating-mini.png"
};

const statuses = [
  ["detecting", "检测消息", "active", "检测", "正在检查当前会话的最新消息"],
  ["message_found", "已检测消息", "active", "检测", "已检测到客户最新消息"],
  ["image_found", "收到图片", "active", "检测", "已检测到客户发送的图片"],
  ["product_found", "收到商品", "active", "检测", "已检测到客户发送的商品卡片"],
  ["last_kf", "客服最后", "ok", "等待", "当前会话最后一条消息来自客服"],
  ["matching_rule", "匹配规则", "active", "匹配", "正在匹配回复规则"],
  ["querying_judgment", "查询判断库", "active", "AI", "正在检索判断库"],
  ["api_calling", "调用API", "active", "AI", "正在请求本地AI服务"],
  ["async_api", "异步API", "active", "AI", "后台继续生成详细回复"],
  ["ai_thinking", "AI思考中", "active", "AI", "AI正在生成回复"],
  ["sending_text", "发送文字", "active", "发送", "正在发送文字回复"],
  ["text_sent", "文字已发", "ok", "完成", "文字回复已经发送"],
  ["sending_image", "发送图片", "active", "发送", "正在上传图片"],
  ["image_sent", "图片已发", "ok", "完成", "图片回复已经发送"],
  ["sending_product", "发送商品", "active", "发送", "正在发送商品卡片"],
  ["product_sent", "商品已发", "ok", "完成", "商品卡片已经发送"],
  ["reply_failed", "回复失败", "bad", "异常", "本次回复未能完成"],
  ["paused", "暂停中", "warn", "控制", "Bot已暂停，不会自动回复"]
].map(([code, label, tone, category, detail], index) => ({
  code,
  label,
  status: label,
  tone,
  category,
  detail,
  at: Date.now() + index
}));

let app;
const legacyService = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/health") {
    res.end(JSON.stringify({ ok: true, hasKey: true, model: "legacy-service" }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not_found" }));
});
try {
  await new Promise((resolveListen, rejectListen) => {
    legacyService.once("error", rejectListen);
    legacyService.listen(19787, "127.0.0.1", resolveListen);
  });
  app = await electron.launch({
    args: ["."],
    cwd: root,
    env: {
      ...process.env,
      WECHAT_KF_ALLOW_MULTIPLE: "1",
      WECHAT_KF_DESKTOP_USER_DATA: userData,
      PORT: "19787",
      DESKTOP_CONTROL_PORT: "19797"
    }
  });

  const main = await waitForWindow(app, "小店AI客服控制台");
  const floating = await waitForWindow(app, "小店AI客服状态");
  await assertLegacyAiServiceFallback(main);
  const payload = buildPayload(statuses.at(-2), statuses.slice(-6));

  await main.evaluate((status) => {
    state.status = status;
    state.judgments = { enabled: true, hasCookie: true, records: 94 };
    state.view = "dashboard";
    renderDashboard();
  }, payload);

  for (const current of statuses) {
    await reportStatusThroughIpc(app, current);
    await floating.locator("#runtimeLabel").getByText(current.label, { exact: true }).waitFor({ timeout: 5_000 });
    const result = await floating.evaluate((expected) => {
      const label = document.querySelector("#runtimeLabel")?.textContent || "";
      return {
        label,
        length: Array.from(label).length,
        tone: document.querySelector("#runtimeLamp")?.className || "",
        expected
      };
    }, current.label);
    if (result.label !== result.expected || result.length > 6) {
      throw new Error(`状态标签异常: ${JSON.stringify(result)}`);
    }
  }

  await reportStatusThroughIpc(app, statuses.at(-2));
  await floating.locator("#runtimeLabel").getByText(statuses.at(-2).label, { exact: true }).waitFor({ timeout: 5_000 });
  await main.screenshot({ path: screenshots.dashboard });
  await assertMainDashboard(main, statuses.at(-2).label);
  await assertNavigationStructure(main);
  await floating.screenshot({ path: screenshots.floating });
  await assertNoOverflow(floating, "展开悬浮窗");
  await assertFloatingControls(floating);
  await assertControlWindowCanReopen(app, floating);
  await floating.locator("#minimizeFloat").click();
  await floating.waitForTimeout(250);
  await floating.screenshot({ path: screenshots.mini });
  await assertMiniFloatingControls(floating);
  await assertNoOverflow(floating, "最小化悬浮窗");

  console.log(JSON.stringify({ ok: true, testedStatuses: statuses.length, screenshots }, null, 2));
} finally {
  if (app) await app.close().catch(() => {});
  await new Promise((resolveClose) => legacyService.close(resolveClose));
}

function buildPayload(bot, history) {
  return {
    enabled: bot.code !== "paused",
    now: Date.now(),
    bot,
    botHistory: history,
    ai: { ok: true, hasKey: true, message: "正常" },
    page: {
      ready: true,
      visible: true,
      url: "https://store.weixin.qq.com/shop/kf",
      title: "微信小店客服",
      loading: false,
      authenticated: true,
      scriptHealthy: true,
      scriptUpdatedAt: Date.now()
    },
    floating: { visible: true, alwaysOnTop: true, mode: "compact" },
    watchdog: { enabled: true, autoStart: true, powerSaveBlockerActive: true },
    notify: { enabled: true, configured: true, outboxCount: 0 },
    records: { total: 8, sent: 7, failed: 1, timeout: 0, bySource: { text_rule: 3, ai_followup: 4 } }
  };
}

async function waitForWindow(electronApp, title) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      const actual = await page.title().catch(() => "");
      if (actual === title || (title === "小店AI客服控制台" && actual === "小店AI客服")) return page;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`未找到窗口: ${title}`);
}

async function reportStatusThroughIpc(electronApp, status) {
  const reported = await electronApp.evaluate(({ ipcMain }, payload) => {
    return ipcMain.emit("bot-status", {}, payload);
  }, status);
  if (!reported) throw new Error("bot-status IPC 未注册");
}

async function assertMainDashboard(page, expectedStatus) {
  const result = await page.evaluate(() => ({
    heading: document.querySelector(".page-head h2")?.textContent || "",
    current: Array.from(document.querySelectorAll(".metric strong")).map((node) => node.textContent),
    currentCount: document.querySelectorAll(".runtime-current").length,
    recentTitleCount: Array.from(document.querySelectorAll("h3")).filter((node) => node.textContent === "最近步骤").length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  if (result.heading !== "总览状态") throw new Error(`主面板未打开: ${result.heading}`);
  if (!result.current.includes(expectedStatus)) throw new Error(`主面板未显示当前步骤: ${expectedStatus}`);
  if (!result.currentCount) throw new Error("主面板未显示当前状态");
  if (result.recentTitleCount) throw new Error("主面板仍显示最近步骤");
  if (result.overflow) throw new Error("主面板发生横向溢出");
}

async function assertNavigationStructure(page) {
  const result = await page.evaluate(async () => {
    const navButtons = Array.from(document.querySelectorAll("#nav button"));
    const topItems = navButtons.map((node) => ({
      top: node.getAttribute("data-top"),
      view: node.getAttribute("data-view"),
      text: node.querySelector(".nav-title")?.textContent || "",
      icon: Boolean(node.querySelector(".nav-icon svg"))
    }));
    document.querySelector('#nav button[data-top="rules"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const rulesTabs = Array.from(document.querySelectorAll(".section-tabs button")).map((node) => node.textContent);
    document.querySelector('#nav button[data-top="settings"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const settingsTabs = Array.from(document.querySelectorAll(".section-tabs button")).map((node) => node.textContent);
    return { topItems, rulesTabs, settingsTabs };
  });
  const expectedTop = ["客服工作台", "回复中心", "运行监控", "系统设置"];
  if (JSON.stringify(result.topItems.map((item) => item.text)) !== JSON.stringify(expectedTop)) {
    throw new Error(`一级导航不符合预期: ${JSON.stringify(result.topItems)}`);
  }
  if (result.topItems.some((item) => !item.icon)) throw new Error(`一级导航缺少本地图标: ${JSON.stringify(result.topItems)}`);
  if (!result.rulesTabs.includes("API风格") || !result.rulesTabs.includes("判断库")) {
    throw new Error(`回复中心二级导航缺失: ${JSON.stringify(result.rulesTabs)}`);
  }
  if (!result.settingsTabs.includes("Webhook") || !result.settingsTabs.includes("悬浮窗")) {
    throw new Error(`系统设置二级导航缺失: ${JSON.stringify(result.settingsTabs)}`);
  }
  if (result.settingsTabs.includes("API风格") || result.rulesTabs.includes("Webhook")) {
    throw new Error(`二级导航仍存在重复归属: ${JSON.stringify(result)}`);
  }
}

async function assertControlWindowCanReopen(electronApp, floatingPage) {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.getTitle().includes("小店AI客服") && !item.getTitle().includes("状态"));
    window?.close();
  });
  await floatingPage.waitForTimeout(150);
  const hidden = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.getTitle().includes("小店AI客服") && !item.getTitle().includes("状态"));
    return Boolean(window && !window.isVisible());
  });
  if (!hidden) throw new Error("控制台关闭后没有进入后台隐藏状态");
  await floatingPage.locator("#openMain").click();
  await floatingPage.waitForTimeout(150);
  const visible = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.getTitle().includes("小店AI客服") && !item.getTitle().includes("状态"));
    return Boolean(window?.isVisible());
  });
  if (!visible) throw new Error("悬浮窗无法重新打开控制台");
}

async function assertFloatingControls(page) {
  await page.getByRole("button", { name: "打开控制台", exact: true }).waitFor();
  await page.getByRole("button", { name: "暂停 Bot", exact: true }).waitFor();
  await page.locator("#minimizeFloat").waitFor();
  const controls = await page.evaluate(() => ({
    commandButtons: Array.from(document.querySelectorAll(".command-button")).map((node) => node.textContent.trim()),
    hasMiniButton: Boolean(document.querySelector("#minimizeFloat")),
    hasLoginButton: Boolean(document.querySelector("#openLogin"))
  }));
  if (!controls.hasMiniButton || controls.hasLoginButton || controls.commandButtons.length !== 2) {
    throw new Error(`悬浮窗操作区不够明确: ${JSON.stringify(controls)}`);
  }
  const before = await page.locator("#liveClock").textContent();
  await page.waitForTimeout(1100);
  const after = await page.locator("#liveClock").textContent();
  if (!before || before === after) throw new Error(`悬浮窗时间未实时更新: ${before} -> ${after}`);
  const layout = await page.evaluate(() => {
    const process = document.querySelector(".process")?.getBoundingClientRect();
    const lamp = document.querySelector("#runtimeLamp")?.getBoundingClientRect();
    const heading = document.querySelector(".process-heading")?.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll(".command-button")).map((node) => node.getBoundingClientRect());
    return {
      processCenter: process ? process.top + process.height / 2 : 0,
      lampCenter: lamp ? lamp.top + lamp.height / 2 : 0,
      headingCenter: heading ? heading.top + heading.height / 2 : 0,
      buttonHeights: buttons.map((rect) => rect.height),
      buttonTops: buttons.map((rect) => rect.top)
    };
  });
  if (Math.abs(layout.lampCenter - layout.processCenter) > 2) {
    throw new Error(`状态指示灯未与当前状态卡片居中对齐: ${JSON.stringify(layout)}`);
  }
  if (new Set(layout.buttonHeights).size !== 1 || new Set(layout.buttonTops).size !== 1) {
    throw new Error(`操作按钮尺寸或基线不统一: ${JSON.stringify(layout)}`);
  }
}

async function assertMiniFloatingControls(page) {
  const result = await page.evaluate(() => ({
    isMini: document.body.classList.contains("mini"),
    buttons: ["#openMainMini", "#expandFloat", "#closeMiniFloat"].map((selector) => Boolean(document.querySelector(selector))),
    visibleButtons: Array.from(document.querySelectorAll(".mini-actions button")).map((node) => node.getAttribute("aria-label")),
    width: window.innerWidth,
    height: window.innerHeight
  }));
  if (!result.isMini || result.buttons.some((item) => !item)) {
    throw new Error(`最小化悬浮窗缺少三按钮: ${JSON.stringify(result)}`);
  }
  if (JSON.stringify(result.visibleButtons) !== JSON.stringify(["打开控制台", "展开", "关闭悬浮窗"])) {
    throw new Error(`最小化按钮语义异常: ${JSON.stringify(result.visibleButtons)}`);
  }
  if (result.width !== 244 || result.height !== 52) {
    throw new Error(`最小化尺寸异常: ${JSON.stringify(result)}`);
  }
}

async function assertNoOverflow(page, name) {
  const result = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight
  }));
  if (result.scrollWidth > result.width || result.scrollHeight > result.height || result.bodyWidth > result.width || result.bodyHeight > result.height) {
    throw new Error(`${name}内容溢出: ${JSON.stringify(result)}`);
  }
}

async function assertLegacyAiServiceFallback(page) {
  const settings = await page.evaluate(() => window.mainShell.getSettings());
  const endpoint = String(settings?.config?.bot?.aiEndpoint || "");
  if (!endpoint.includes("127.0.0.1:19788/reply")) {
    throw new Error(`旧本地服务占用端口时未自动切换: ${endpoint}`);
  }
}
