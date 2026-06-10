import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

loadDotEnv();

const webhookUrl = process.env.WECOM_BOT_WEBHOOK_URL || "";
if (!webhookUrl) {
  console.error("缺少 WECOM_BOT_WEBHOOK_URL，请先在 .env 填入企业微信群机器人 Webhook");
  process.exit(1);
}

const content = [
  "**小店AI客服通知测试**",
  "<font color=\"warning\">如果你看到这条消息，Webhook 已可用</font>",
  `时间：${new Date().toLocaleString()}`
].join("\n\n");

const data = await postJsonWithCurl(webhookUrl, {
  msgtype: "markdown",
  markdown: { content }
});

if (data.errcode) {
  console.error(data.errmsg || `Webhook 测试失败：errcode ${data.errcode}`);
  process.exit(1);
}

console.log("Webhook 测试成功");

function loadDotEnv() {
  const path = resolve(".env");
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
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
