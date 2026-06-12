import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const targetVersion = "0.3.9";
const tag = `v${targetVersion}`;

const failures = [];

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
  } catch (error) {
    fail(`${relativePath} 不是可读 JSON: ${error.message}`);
    return {};
  }
}

function readText(relativePath) {
  try {
    return readFileSync(resolve(root, relativePath), "utf8");
  } catch (error) {
    fail(`${relativePath} 不可读取: ${error.message}`);
    return "";
  }
}

function fail(message) {
  failures.push(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function pathExists(relativePath) {
  return existsSync(resolve(root, relativePath));
}

const packageJson = readJson("package.json");
const gates = readJson("docs/execution/v0.3.9-gates.json");
const progress = readText("docs/execution/v0.3.9-progress.md");
const readme = readText("README.md");
const workflow = readText(".github/workflows/build-installers.yml");
const releaseNotesPath = `docs/release-notes/${tag}.md`;
const releaseNotes = readText(releaseNotesPath);

const requiredScripts = [
  "build-extension",
  "doctor",
  "check:secrets",
  "test:baseline",
  "test:desktop-modules",
  "test:ai-knowledge",
  "test:security-config",
  "test:extension-modules",
  "test:lifecycle",
  "test:status-ui",
  "test:regressions",
  "test:notify-outbox",
  "test:release-readiness"
];

for (const script of requiredScripts) {
  expect(Boolean(packageJson.scripts?.[script]), `package.json 缺少脚本: ${script}`);
}

expect(packageJson.version === targetVersion, `package.json version 应为 ${targetVersion}，当前为 ${packageJson.version || "(空)"}`);
expect(packageJson.build?.productName === "小店AI客服", "Electron productName 必须是 小店AI客服");
expect(packageJson.build?.icon === "build/icon", "Electron build.icon 必须指向 build/icon");
expect(pathExists("build/icon.icns"), "缺少 macOS 图标 build/icon.icns");
expect(pathExists("build/icon.ico"), "缺少 Windows 图标 build/icon.ico");
expect(pathExists("build/icon.png"), "缺少 PNG 图标 build/icon.png");

const validStatuses = new Set(["pending", "in_progress", "passed", "blocked"]);
const stages = Array.isArray(gates.stages) ? gates.stages : [];
expect(gates.version === targetVersion, `gates.version 应为 ${targetVersion}`);
expect(gates.overall === "passed", `gates.overall 应为 passed，当前为 ${gates.overall}`);
expect(stages.length === 9, `gates 应包含 9 个阶段，当前 ${stages.length}`);
expect(stages.filter((stage) => stage.status === "in_progress").length === 0, "最终发布前不能存在 in_progress 阶段");
for (let index = 0; index < stages.length; index += 1) {
  const stage = stages[index];
  expect(stage.id === index, `阶段 id 顺序异常: index=${index}, id=${stage.id}`);
  expect(validStatuses.has(stage.status), `阶段 ${stage.id} 状态非法: ${stage.status}`);
  expect(stage.status === "passed", `阶段 ${stage.id} 未通过: ${stage.status}`);
  expect(Boolean(String(stage.commit || "").trim()), `阶段 ${stage.id} 缺少提交号`);
  expect(!String(stage.commit || "").includes("pending"), `阶段 ${stage.id} 提交号仍是占位值: ${stage.commit}`);
}

const progressMustContain = [
  "阶段 0",
  "阶段 1",
  "阶段 2",
  "阶段 3",
  "阶段 4",
  "阶段 5",
  "阶段 6",
  "阶段 7",
  "阶段 8",
  "test:release-readiness"
];
for (const marker of progressMustContain) {
  expect(progress.includes(marker), `进度文件缺少标记: ${marker}`);
}

const docLinks = [
  "docs/rich-user-guide.md",
  "docs/customer-reply-rule-library.md",
  "docs/desktop-app-structure-deployment.md",
  "docs/wechat-kf-page-structure.md",
  "docs/runtime-statuses.md",
  "docs/project-journey.md",
  "docs/mac-install-troubleshooting.md",
  releaseNotesPath
];
for (const link of docLinks) {
  expect(pathExists(link), `缺少发布文档: ${link}`);
  expect(readme.includes(link), `README 未链接 ${link}`);
}

expect(readme.includes(tag), `README 未指向 ${tag}`);
expect(readme.includes("xiaodian-ai-kefu-macos-arm64.dmg"), "README 未使用 macOS v0.3.9 资产名");
expect(readme.includes("xiaodian-ai-kefu-windows-setup.exe"), "README 未使用 Windows 安装版 v0.3.9 资产名");
expect(readme.includes("xiaodian-ai-kefu-windows-portable.exe"), "README 未使用 Windows 便携版 v0.3.9 资产名");

expect(releaseNotes.includes(`# 小店AI客服 ${tag}`), `${releaseNotesPath} 标题缺少版本号`);
expect(releaseNotes.includes("xiaodian-ai-kefu-macos-arm64.dmg"), "Release Notes 缺少 macOS 资产名");
expect(releaseNotes.includes("xiaodian-ai-kefu-windows-setup.exe"), "Release Notes 缺少 Windows 安装版资产名");
expect(releaseNotes.includes("xiaodian-ai-kefu-windows-portable.exe"), "Release Notes 缺少 Windows 便携版资产名");
expect(releaseNotes.includes("真实环境验收"), "Release Notes 缺少真实环境验收说明");

expect(workflow.includes("npm run test:release-readiness"), "CI 未运行 test:release-readiness");
expect(workflow.includes("xiaodian-ai-kefu-macos-arm64.dmg"), "CI 未产出 macOS 目标资产名");
expect(workflow.includes("xiaodian-ai-kefu-windows-setup.exe"), "CI 未产出 Windows 安装版目标资产名");
expect(workflow.includes("xiaodian-ai-kefu-windows-portable.exe"), "CI 未产出 Windows 便携版目标资产名");
expect(workflow.includes(`docs/release-notes/${tag}.md`) || workflow.includes("docs/release-notes/${GITHUB_REF_NAME}.md"), "CI 未读取标签对应 Release Notes");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  version: targetVersion,
  stages: stages.length,
  scripts: requiredScripts.length,
  docs: docLinks.length
}, null, 2));
