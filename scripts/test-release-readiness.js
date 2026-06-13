import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const targetVersion = "0.4.4";
const tag = `v${targetVersion}`;
const gateBaselineVersion = "0.3.9";

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
const gates = readJson(`docs/execution/v${gateBaselineVersion}-gates.json`);
const progress = readText(`docs/execution/v${gateBaselineVersion}-progress.md`);
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
  "test:packaged-resources",
  "test:macos-package",
  "test:windows-packages",
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
expect(gates.version === gateBaselineVersion, `gates.version 应为 ${gateBaselineVersion}`);
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
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "docs/rich-user-guide.md",
  "docs/customer-reply-rule-library.md",
  "docs/desktop-app-structure-deployment.md",
  "docs/wechat-kf-page-structure.md",
  "docs/workbench-optimization-plan.md",
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
expect(readme.includes("xiaodian-ai-kefu-macos-arm64.dmg"), `README 未使用 macOS ${tag} 资产名`);
expect(readme.includes("xiaodian-ai-kefu-windows-setup.exe"), `README 未使用 Windows 安装版 ${tag} 资产名`);
expect(readme.includes("xiaodian-ai-kefu-windows-portable.exe"), `README 未使用 Windows 便携版 ${tag} 资产名`);
expect(readme.includes("微信小店客服页属于第三方网页映射"), "README 缺少微信小店映射风险提示");
expect(readme.includes("外部知识库是私有外部服务"), "README 缺少 外部知识库权限提示");

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
expect(workflow.includes("gh release upload") && workflow.includes("--clobber"), "CI 未支持覆盖已有 Release 安装资产");
expect(workflow.includes("gh release edit"), "CI 未支持更新已有 Release 说明");
expect(!workflow.includes("actions/checkout@v4"), "CI 仍使用基于 Node 20 的 checkout@v4");
expect(!workflow.includes("actions/setup-node@v4"), "CI 仍使用基于 Node 20 的 setup-node@v4");
expect(!workflow.includes("actions/upload-artifact@v4"), "CI 仍使用基于 Node 20 的 upload-artifact@v4");
expect(!workflow.includes("actions/download-artifact@v4"), "CI 仍使用基于 Node 20 的 download-artifact@v4");
expect(workflow.includes("actions/checkout@v6"), "CI 未升级到 checkout@v6");
expect(workflow.includes("actions/setup-node@v6"), "CI 未升级到 setup-node@v6");
expect(workflow.includes("actions/upload-artifact@v7"), "CI 未升级到 upload-artifact@v7");
expect(workflow.includes("actions/download-artifact@v8"), "CI 未升级到 download-artifact@v8");
expect(workflow.includes("Smoke test Windows packages"), "CI 未执行 Windows 安装资产冒烟测试");
expect(workflow.includes("test-windows-packages.ps1"), "CI 未接入 Windows 安装版和便携版启动测试");
expect(workflow.includes("Smoke test macOS package"), "CI 未执行 macOS DMG 冒烟测试");
expect(workflow.includes("test-macos-package.sh"), "CI 未接入 macOS 安装包启动测试");
expect(pathExists("scripts/check-packaged-resources.js"), "缺少安装包资源完整性检查脚本");
expect(pathExists("scripts/test-windows-packages.ps1"), "缺少 Windows 安装资产冒烟脚本");
expect(pathExists("scripts/test-macos-package.sh"), "缺少 macOS 安装资产冒烟脚本");
expect(pathExists("scripts/repair-macos-install.command"), "缺少 macOS 安装一键修复脚本");
expect(workflow.includes("repair-macos-install.command") || readText("package.json").includes("repair-macos-install.command"), "DMG 未包含 macOS 安装一键修复脚本");

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
