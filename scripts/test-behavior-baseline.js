import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const main = read("desktop/main.js");
const content = read("extension/content.js");
const server = read("server.js");
const preload = read("desktop/main-shell-preload.cjs");
const replies = JSON.parse(read("config/replies.json"));

const checks = [
  ["文字规则", content.includes("matchRuleReply") && Array.isArray(replies.rules)],
  ["图片规则", content.includes("matchImageReply") && Array.isArray(replies.imageReplies)],
  ["动作规则", content.includes("matchActionRule") && Array.isArray(replies.actionRules)],
  ["发送图片", main.includes("handleImageReply") && preload.includes("chooseImage")],
  ["发送文件", main.includes("handleFileReply") && preload.includes("chooseFile")],
  ["商品与邀请下单", main.includes("findProductButton") && main.includes("邀请下单")],
  ["非文本识别", ["image", "emoji", "product", "file", "video"].every((kind) => content.includes(kind))],
  ["AI 回复", server.includes('req.url !== "/reply"') && content.includes("askLocalAi")],
  ["异步回复", content.includes("pendingAiFollowups") && content.includes("ai_followup")],
  ["判断库", server.includes("/judgments/search") && preload.includes("testJudgments")],
  ["Webhook 补发", main.includes("notifyOutbox") && main.includes("postWecomWithRetry")],
  ["状态同步", main.includes('ipcMain.handle("main-get-status"') && main.includes('ipcMain.handle("float-get-status"')],
  ["窗口恢复", main.includes("showMainWindow") && preload.includes("openFloating")],
  ["配置文件", existsSync(resolve(root, "config/assistant-profile.json"))],
  ["内置回复图片", [1, 2, 3, 4, 5].every((index) =>
    ["png", "jpg", "jpeg"].some((ext) => existsSync(resolve(root, `config/reply-images/image${index}.${ext}`)))
  )]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
if (failed.length) {
  console.error(`行为基线失败：${failed.map(([name]) => name).join("、")}`);
  process.exit(1);
}
console.log(`行为基线通过：${checks.length} 项`);

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}
