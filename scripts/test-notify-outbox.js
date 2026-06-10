import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const userDataDir = await mkdtemp(join(tmpdir(), "wechat-kf-outbox-"));
const projectRoot = new URL("..", import.meta.url).pathname;
const webhookUrl = "http://127.0.0.1:19092/webhook";
const outboxPath = join(userDataDir, "notify-outbox.json");
const desktopConfigPath = join(userDataDir, "desktop-config.json");
let appProcess = null;
let server = null;

try {
  appProcess = spawn("npx", ["electron", "."], {
    cwd: projectRoot,
    env: {
      ...process.env,
      WECHAT_KF_ALLOW_MULTIPLE: "1",
      WECOM_BOT_WEBHOOK_URL: "http://127.0.0.1:19093/down",
      WECHAT_KF_DESKTOP_USER_DATA: userDataDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  await waitForFile(outboxPath, 30_000);
  const queued = JSON.parse(await readFile(outboxPath, "utf8"));
  if (!Array.isArray(queued) || queued.length === 0) {
    throw new Error("outbox was not populated after webhook failure");
  }

  stopProcess(appProcess);
  appProcess = null;

  const received = [];
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      received.push(raw);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{\"errcode\":0}");
    });
  });
  await new Promise((resolve) => server.listen(19092, "127.0.0.1", resolve));

  const patched = queued.map((item) => ({ ...item, nextTryAt: 0 }));
  await writeFile(outboxPath, JSON.stringify(patched, null, 2), "utf8");
  const desktopConfig = JSON.parse(await readFile(desktopConfigPath, "utf8"));
  desktopConfig.notify = {
    ...(desktopConfig.notify || {}),
    enabled: true,
    wecomWebhookUrl: webhookUrl
  };
  await writeFile(desktopConfigPath, JSON.stringify(desktopConfig, null, 2), "utf8");

  appProcess = spawn("npx", ["electron", "."], {
    cwd: projectRoot,
    env: {
      ...process.env,
      WECHAT_KF_ALLOW_MULTIPLE: "1",
      WECOM_BOT_WEBHOOK_URL: webhookUrl,
      WECHAT_KF_DESKTOP_USER_DATA: userDataDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  await waitFor(() => received.length > 0, 30_000, "outbox was not delivered");
  await waitFor(async () => {
    if (!existsSync(outboxPath)) return true;
    const items = JSON.parse(await readFile(outboxPath, "utf8"));
    return Array.isArray(items) && items.length === 0;
  }, 30_000, "outbox was not cleared");

  console.log("Notify outbox test passed");
} finally {
  if (appProcess) stopProcess(appProcess);
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(userDataDir, { recursive: true, force: true });
}

function stopProcess(child) {
  child.kill("SIGTERM");
}

async function waitForFile(path, timeoutMs) {
  await waitFor(() => existsSync(path), timeoutMs, `file not found: ${path}`);
}

async function waitFor(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return;
    await sleep(500);
  }

  throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
