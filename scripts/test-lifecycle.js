import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const userData = await mkdtemp(join(tmpdir(), "xiaodian-lifecycle-"));
let app;
try {
  app = await electron.launch({
    args: ["."],
    cwd: root,
    env: {
      ...process.env,
      WECHAT_KF_ALLOW_MULTIPLE: "1",
      WECHAT_KF_DESKTOP_USER_DATA: userData,
      PORT: "19987",
      DESKTOP_CONTROL_PORT: "19997"
    }
  });
  const main = await waitForWindow(app, "小店AI客服控制台");
  await waitForWindow(app, "小店AI客服状态");

  const closeState = await app.evaluate(async ({ BrowserWindow, app: electronApp }) => {
    const mainWindow = BrowserWindow.getAllWindows().find((win) => !win.getTitle().includes("状态"));
    mainWindow.close();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    return {
      mainVisible: mainWindow.isVisible(),
      mainDestroyed: mainWindow.isDestroyed(),
      dockVisible: process.platform === "darwin" ? electronApp.dock?.isVisible?.() !== false : true
    };
  });
  assert(closeState.mainVisible === false && closeState.mainDestroyed === false, "主窗口关闭没有隐藏保活");
  assert(closeState.dockVisible, "Dock 图标不应隐藏");

  const restored = await app.evaluate(async ({ BrowserWindow, app: electronApp }) => {
    electronApp.emit("activate");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    const mainWindow = BrowserWindow.getAllWindows().find((win) => !win.getTitle().includes("状态"));
    return Boolean(mainWindow && mainWindow.isVisible());
  });
  assert(restored, "Dock/activate 未恢复主控台");

  const first = await main.evaluate(() => window.mainShell.requestQuit({ source: "test" }));
  assert(first.requireConfirm && first.confirmText === "小店AI客服", "彻底退出缺少二次确认");

  const closed = app.waitForEvent("close", { timeout: 12_000 }).then(() => true).catch(() => false);
  await main.evaluate(() => {
    window.mainShell.requestQuit({ source: "test", confirm: "小店AI客服" }).catch(() => {});
    return true;
  }).catch(() => {});
  assert(await closed, "彻底退出未关闭 Electron 应用");
  app = null;

  console.log(JSON.stringify({ ok: true, closeHides: true, activateRestores: true, fullQuit: true }));
} finally {
  if (app) await app.close().catch(() => {});
  await rm(userData, { recursive: true, force: true });
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
