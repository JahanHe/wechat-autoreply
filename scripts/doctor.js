import { existsSync, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const env = loadDotEnv();
const checks = [];

await check("Node.js 可用", async () => {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) throw new Error(`需要 Node.js 18+，当前 ${process.version}`);
});

await check(".env 存在", async () => {
  if (!existsSync(resolve(root, ".env"))) throw new Error("缺少 .env");
});

await check("DeepSeek API Key 已配置", async () => {
  if (!env.DEEPSEEK_API_KEY) throw new Error("缺少 DEEPSEEK_API_KEY");
});

await check("企业微信 Webhook 已配置", async () => {
  validateWebhookUrl(env.WECOM_BOT_WEBHOOK_URL || "");
});

await check("Electron 可执行文件存在", async () => {
  const macPath = resolve(root, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
  const winPath = resolve(root, "node_modules/electron/dist/electron.exe");
  if (!existsSync(macPath) && !existsSync(winPath)) {
    throw new Error("缺少 Electron 可执行文件，请先执行 npm install");
  }
});

await check("Chrome 扩展构建产物存在", async () => {
  await access(resolve(root, "dist/wechat-kf-extension/content.js"));
  await access(resolve(root, "dist/wechat-kf-extension/manifest.json"));
});

await check("桌面程序守护脚本存在", async () => {
  await access(resolve(root, "scripts/install-desktop-launch-agent.sh"));
  await access(resolve(root, "scripts/install-desktop-windows.ps1"));
});

await check("通知补发测试脚本存在", async () => {
  await access(resolve(root, "scripts/test-notify-outbox.js"));
});

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  const mark = item.ok ? "OK" : "FAIL";
  console.log(`${mark} ${item.name}${item.message ? ` - ${item.message}` : ""}`);
}

if (failed.length > 0) {
  console.error(`生产就绪检查失败：${failed.length} 项未通过`);
  process.exit(1);
}

console.log("生产就绪检查通过");

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, message: String(error?.message || error) });
  }
}

function loadDotEnv() {
  const path = resolve(root, ".env");
  if (!existsSync(path)) return {};

  const values = {};
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }
  return values;
}

function validateWebhookUrl(value) {
  if (!value) throw new Error("缺少 WECOM_BOT_WEBHOOK_URL");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Webhook URL 格式不正确");
  }

  const isWecom = url.protocol === "https:" &&
    url.hostname === "qyapi.weixin.qq.com" &&
    url.pathname === "/cgi-bin/webhook/send" &&
    Boolean(url.searchParams.get("key"));
  if (!isWecom) {
    throw new Error("必须是企业微信群机器人 Webhook");
  }
}
