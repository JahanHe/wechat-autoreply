import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const envPath = resolve(".env");
const webhookUrl = String(process.argv[2] || process.env.WECOM_BOT_WEBHOOK_URL || "").trim();

if (!webhookUrl) {
  console.error("缺少企业微信群机器人 Webhook URL");
  console.error("用法：npm run configure:webhook -- \"https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...\"");
  process.exit(1);
}

validateWebhookUrl(webhookUrl);
await upsertEnvValue("WECOM_BOT_WEBHOOK_URL", webhookUrl);
process.env.WECOM_BOT_WEBHOOK_URL = webhookUrl;
await sendTestMessage(webhookUrl);
console.log("Webhook 已写入 .env，并且测试消息发送成功");

function validateWebhookUrl(value) {
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
  const isLocalTest = /^https?:$/.test(url.protocol) &&
    ["127.0.0.1", "localhost"].includes(url.hostname);

  if (!isWecom && !isLocalTest) {
    throw new Error("只接受企业微信群机器人 Webhook，格式应为 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...");
  }
}

async function upsertEnvValue(key, value) {
  const lines = existsSync(envPath)
    ? readFileSync(envPath, "utf8").split(/\r?\n/)
    : [];
  let replaced = false;
  const next = lines.map((line) => {
    if (!line.startsWith(`${key}=`)) return line;
    replaced = true;
    return `${key}=${value}`;
  });

  if (!replaced) next.push(`${key}=${value}`);
  const content = `${next.filter((line, index) => line || index < next.length - 1).join("\n").replace(/\n*$/, "")}\n`;
  await writeFile(envPath, content, "utf8");
}

async function sendTestMessage(url) {
  const data = await postJsonWithCurl(url, {
    msgtype: "markdown",
    markdown: {
      content: [
        "**微信小店客服通知配置成功**",
        "<font color=\"warning\">如果你看到这条消息，说明 Webhook 已经能通知到人</font>",
        `时间：${new Date().toLocaleString()}`
      ].join("\n\n")
    }
  });
  if (data.errcode) {
    throw new Error(data.errmsg || `WeCom errcode ${data.errcode}`);
  }
}

function postJsonWithCurl(url, payload) {
  return new Promise((resolvePost, rejectPost) => {
    const child = spawn("curl", [
      "-sS",
      "--max-time",
      "10",
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify(payload),
      "--config",
      "-"
    ], { stdio: ["pipe", "pipe", "pipe"] });

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

function escapeCurlConfigValue(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
