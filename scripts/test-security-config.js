import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { startAiServer } from "../server.js";
import { repairDesktopConfig, validateDesktopConfig } from "../desktop/config-validator.js";
import { redactSecrets } from "../src/redact.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const userData = await mkdtemp(join(tmpdir(), "xiaodian-security-"));
const invalid = {
  configSchemaVersion: 1,
  kfUrl: "https://store.weixin.qq.com/shop/kf",
  autoStart: false,
  bot: { enabled: "yes", aiEndpoint: "http://127.0.0.1:8787/reply", rules: [], actionRules: [], imageReplies: [] },
  notify: {}, judgmentLibrary: {}, floatWindow: {}, watchdog: {}
};
await writeFile(join(userData, "desktop-config.json"), JSON.stringify(invalid), "utf8");

const defaults = { ...invalid, bot: { ...invalid.bot, enabled: true } };
const initial = validateDesktopConfig(invalid);
assert(!initial.valid && initial.errors.some((item) => item.path === "$.bot.enabled"), "配置类型错误未被识别");
assert(repairDesktopConfig(invalid, defaults).bot.enabled === true, "配置修复未使用默认布尔值");

const redacted = redactSecrets("session_token=abcdef DESKTOP_CONTROL_TOKEN=secret qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc-def");
assert(!redacted.includes("abcdef") && !redacted.includes("abc-def"), "敏感值脱敏失败");

const aiServer = await startAiServer({ port: 0, host: "127.0.0.1" });
try {
  const port = aiServer.address().port;
  const allowed = await fetch(`http://127.0.0.1:${port}/health`, { headers: { origin: "https://store.weixin.qq.com" } });
  assert(allowed.headers.get("access-control-allow-origin") === "https://store.weixin.qq.com", "微信小店 CORS 未放行");
  const denied = await fetch(`http://127.0.0.1:${port}/health`, { headers: { origin: "https://evil.example" } });
  assert(!denied.headers.get("access-control-allow-origin"), "未知来源不应获得 CORS 许可");
} finally {
  await new Promise((resolveClose) => aiServer.close(resolveClose));
}

let app;
try {
  app = await electron.launch({
    args: ["."], cwd: root,
    env: {
      ...process.env,
      WECHAT_KF_ALLOW_MULTIPLE: "1",
      WECHAT_KF_DESKTOP_USER_DATA: userData,
      DESKTOP_CONTROL_TOKEN: "",
      PORT: "19887",
      DESKTOP_CONTROL_PORT: "19897"
    }
  });
  const main = await waitForMain(app);
  const settings = await main.evaluate(() => window.mainShell.getSettings());
  assert(settings.config.bot.enabled === true, "损坏配置未自动修复");
  assert(settings.configValidation.repaired === true, "界面未暴露配置修复状态");
  assert(readdirSync(userData).some((name) => name.includes("desktop-config.json.invalid-") && name.endsWith(".bak")), "损坏配置未备份");

  const health = await fetch("http://127.0.0.1:19897/health").then((response) => response.json());
  assert(health.ok && health.authRequired && health.tokenConfigured, "控制服务健康状态错误");
  const unauthorized = await fetch("http://127.0.0.1:19897/inspect");
  assert(unauthorized.status === 401, "控制服务未拒绝无 Token 请求");
  const envText = readFileSync(join(userData, ".env"), "utf8");
  const token = envText.match(/^DESKTOP_CONTROL_TOKEN=(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, "");
  assert(token && token.length >= 32, "控制 Token 未生成");
  const authorized = await fetch("http://127.0.0.1:19897/inspect", { headers: { "x-control-token": token } });
  assert(authorized.status === 200, "有效控制 Token 未获授权");

  console.log(JSON.stringify({ ok: true, backup: true, controlAuth: true, cors: true, redaction: true }));
} finally {
  if (app) await app.close().catch(() => {});
  await rm(userData, { recursive: true, force: true });
}

async function waitForMain(electronApp) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      const title = await page.title().catch(() => "");
      if (title === "小店AI客服" || title === "小店AI客服控制台") return page;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("未找到主控台");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
