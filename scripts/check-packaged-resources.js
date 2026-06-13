import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { extractFile, listPackage } from "@electron/asar";

const asarPath = process.argv[2]
  ? resolve(process.argv[2])
  : findDefaultAsar();
const expectedVersion = String(process.argv[3] || "0.4.4");

if (!asarPath || !statSync(asarPath).isFile()) {
  throw new Error(`app.asar 不存在: ${asarPath}`);
}

const entries = new Set(listPackage(asarPath).map((entry) => normalizeEntry(entry)));
const requiredEntries = [
  "package.json",
  "desktop/main.js",
  "desktop/app-runtime.js",
  "desktop/floating.html",
  "desktop/floating.js",
  "desktop/assets/logo.png",
  "src/runyu-judgments.js",
  "src/deepseek-client.js",
  "extension/content.js",
  "docs/release-notes/v0.4.4.md",
  "config/reply-images/image1.png"
];

for (const entry of requiredEntries) {
  if (!entries.has(entry)) throw new Error(`app.asar 缺少资源: ${entry}`);
}

const forbiddenEntries = [".env", "desktop-control-token", "notify-outbox.json"];
for (const entry of forbiddenEntries) {
  if (entries.has(entry)) throw new Error(`app.asar 不应包含运行时敏感文件: ${entry}`);
}

const packageJson = JSON.parse(extractFile(asarPath, "package.json").toString("utf8"));
if (packageJson.version !== expectedVersion) {
  throw new Error(`安装包版本异常: ${packageJson.version || "(空)"}，预期 ${expectedVersion}`);
}
if (packageJson.name !== "xiaodian-ai-kefu" || packageJson.description !== "小店AI客服桌面程序") {
  throw new Error(`安装包身份异常: ${packageJson.name || "(空)"} / ${packageJson.description || "(空)"}`);
}

const floatingHtml = extractFile(asarPath, "desktop/floating.html").toString("utf8");
for (const marker of ["openMainMini", "expandFloat", "closeMiniFloat"]) {
  if (!floatingHtml.includes(`id="${marker}"`)) throw new Error(`安装包悬浮窗缺少最小化按钮: ${marker}`);
}
const runtimeSource = extractFile(asarPath, "desktop/app-runtime.js").toString("utf8");
for (const marker of ["uiVersion: 7", "width: 244, height: 52", "mode === \"mini\""]) {
  if (!runtimeSource.includes(marker)) throw new Error(`安装包悬浮窗运行时缺少标记: ${marker}`);
}

console.log(JSON.stringify({
  ok: true,
  asarPath,
  bytes: statSync(asarPath).size,
  entries: entries.size,
  version: packageJson.version,
  packageName: packageJson.name,
  requiredEntries: requiredEntries.length,
  floatingMiniControls: 3
}, null, 2));

function normalizeEntry(entry) {
  return String(entry || "").replace(/^[/\\]+/, "").replaceAll("\\", "/");
}

function findDefaultAsar() {
  const candidates = [
    "dist/mac-arm64/小店AI客服.app/Contents/Resources/app.asar",
    "dist/win-unpacked/resources/app.asar"
  ].map((entry) => resolve(entry));
  return candidates.find((entry) => existsSync(entry)) || candidates[0];
}
