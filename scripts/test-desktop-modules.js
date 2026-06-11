import { createAppContext, snapshotAppContext } from "../desktop/app-context.js";
import {
  BOT_RUNTIME_STATUSES,
  clipStatusLabel,
  createUiStatusSnapshot,
  inferBotStatusCode
} from "../desktop/status-center.js";
import { allIpcChannels } from "../desktop/ipc-contract.js";

const context = createAppContext();
assert(context.windows.mainMode === "page", "AppContext 默认主模式错误");
assert(snapshotAppContext(context).configured === false, "AppContext 初始配置状态错误");

assert(BOT_RUNTIME_STATUSES.sending_image.label === "发送图片", "图片状态字典缺失");
assert(inferBotStatusCode("正在发送图片", {}, { enabled: true }) === "sending_image", "图片状态推导错误");
assert(inferBotStatusCode("任意状态", {}, { enabled: false }) === "paused", "暂停状态推导错误");
assert(clipStatusLabel("这是超过六个字的状态") === "这是超过六个", "状态长度限制错误");

const ui = createUiStatusSnapshot({
  enabled: true,
  bot: { label: "发送商品", tone: "active", detail: "正在发送商品卡片" },
  ai: { ok: true, message: "正常" },
  localServiceOk: true,
  page: { scriptHealthy: true, authenticated: true },
  now: 123
});
assert(ui.runtime.label === "发送商品", "统一 UI 状态运行标签错误");
assert(ui.ai.tone === "ok" && ui.login.tone === "ok", "统一 UI 状态灯错误");
assert(ui.updatedAt === 123, "统一 UI 状态时间错误");

const channels = allIpcChannels();
assert(channels.length === new Set(channels).size, "IPC 频道存在重复");
for (const required of ["main-get-status", "main-run-action", "float-open-main", "bot-image-reply"]) {
  assert(channels.includes(required), `IPC 契约缺少 ${required}`);
}

console.log(JSON.stringify({ ok: true, modules: ["app-context", "status-center", "ipc-contract"], ipcChannels: channels.length }));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
