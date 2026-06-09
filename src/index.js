import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { WechatKfPage } from "./page-adapter.js";
import { buildReply } from "./reply-engine.js";
import { ReplyState } from "./state.js";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CONFIG_PATH = resolve(ROOT, "config/replies.json");
const PROFILE_DIR = resolve(ROOT, ".wechat-kf-profile");
const STATE_PATH = resolve(ROOT, ".state/replied.json");

async function main() {
  const command = process.argv[2] ?? "run";
  const cliDryRun = process.argv.includes("--dry-run");
  const waitForWorkbench = process.argv.includes("--wait");
  const config = await loadConfig();
  const dryRun = cliDryRun || Boolean(config.dryRun);

  await mkdir(PROFILE_DIR, { recursive: true });
  const launchOptions = {
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  };

  if (process.env.CHROME_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.CHROME_EXECUTABLE_PATH;
  } else if (process.env.PLAYWRIGHT_CHANNEL !== "bundled") {
    launchOptions.channel = process.env.PLAYWRIGHT_CHANNEL || "chrome";
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, launchOptions);

  const page = context.pages()[0] ?? await context.newPage();
  const kf = new WechatKfPage(page, config);

  process.once("SIGINT", async () => {
    console.log("\n正在关闭浏览器...");
    await context.close();
    process.exit(0);
  });

  await kf.open();

  if (command === "login") {
    console.log("浏览器已打开。请扫码登录并进入客服工作台。按 Ctrl+C 结束。");
    await waitForever(page);
    return;
  }

  if (command === "inspect") {
    if (waitForWorkbench) {
      await kf.waitUntilReady();
    } else {
      await page.waitForTimeout(3000);
    }
    console.log(JSON.stringify(await kf.inspect(), null, 2));
    await context.close();
    return;
  }

  const state = new ReplyState(STATE_PATH);
  await state.load();
  await kf.waitUntilReady();

  if (command === "reply-once") {
    await processOne(kf, state, config, dryRun);
    await context.close();
    return;
  }

  console.log(`自动回复已启动。dryRun=${dryRun}，轮询间隔=${config.pollMs}ms`);
  for (;;) {
    try {
      await processOne(kf, state, config, dryRun);
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] ${error.message}`);
    }
    await page.waitForTimeout(config.pollMs ?? 5000);
  }
}

async function processOne(kf, state, config, dryRun) {
  const conversation = await kf.findNextConversation();
  if (!conversation) {
    console.log(`[${time()}] 没有找到未读会话。`);
    return false;
  }

  await kf.openConversation(conversation);
  const message = await kf.latestCustomerMessage();
  if (!message) {
    console.log(`[${time()}] 没有识别到客户消息。`);
    return false;
  }

  if (state.has(message)) {
    console.log(`[${time()}] 已回复过：${clip(message)}`);
    return false;
  }

  const { rule, reply } = buildReply(message, config);
  console.log(`[${time()}] 命中规则=${rule}`);
  console.log(`客户：${clip(message, 120)}`);
  console.log(`回复：${reply}`);

  if (!dryRun) {
    await kf.send(reply);
    await state.mark(message, { rule, reply });
  }

  return true;
}

async function loadConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

function time() {
  return new Date().toLocaleTimeString();
}

function clip(text, size = 80) {
  const value = String(text).replace(/\s+/g, " ").trim();
  return value.length > size ? `${value.slice(0, size)}...` : value;
}

async function waitForever(page) {
  for (;;) {
    await page.waitForTimeout(60_000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
