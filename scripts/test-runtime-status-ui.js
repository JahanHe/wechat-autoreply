import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  ["last_kf", "客服最后", "ok", "等待", "当前会话最后一条消息来自客服"],
  ["matching_rule", "匹配规则", "active", "匹配", "正在匹配回复规则"],
  ["querying_judgment", "查询判断库", "active", "AI", "正在检索判断库"],
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
try {
  app = await electron.launch({
    args: ["."],
    cwd: root,
    env: {
      ...process.env,
      WECHAT_KF_ALLOW_MULTIPLE: "1",
      WECHAT_KF_DESKTOP_USER_DATA: userData,
      PORT: "18787",
      DESKTOP_CONTROL_PORT: "18797"
    }
  });

  const main = await waitForWindow(app, "小店AI客服控制台");
  const floating = await waitForWindow(app, "小店AI客服状态");
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
  await floating.screenshot({ path: screenshots.floating });
  await assertNoOverflow(floating, "展开悬浮窗");

  await floating.locator("#minimizeFloat").click();
  await floating.waitForTimeout(250);
  await floating.screenshot({ path: screenshots.mini });
  await assertNoOverflow(floating, "最小化悬浮窗");

  console.log(JSON.stringify({ ok: true, testedStatuses: statuses.length, screenshots }, null, 2));
} finally {
  if (app) await app.close().catch(() => {});
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
      if ((await page.title().catch(() => "")) === title) return page;
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
    trailCount: document.querySelectorAll(".runtime-step").length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  if (result.heading !== "总览状态") throw new Error(`主面板未打开: ${result.heading}`);
  if (!result.current.includes(expectedStatus)) throw new Error(`主面板未显示当前步骤: ${expectedStatus}`);
  if (!result.trailCount) throw new Error("主面板未显示最近步骤");
  if (result.overflow) throw new Error("主面板发生横向溢出");
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
