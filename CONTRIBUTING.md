# 贡献规范

本文是协作者改动项目时的准入规则。架构和模块边界以 [ARCHITECTURE.md](ARCHITECTURE.md) 为准；用户入口以 [README.md](README.md) 为准。

## 本地准备

```bash
npm install
npm run build-extension
npm run desktop
```

只在你有权限的店铺和账号上测试微信小店客服页。自动化测试优先使用 `scripts/` 下的 fixture 或 Playwright/Electron 脚本。

## PR 前检查

每个 PR 都要说明：

- 改动内容和用户影响。
- 涉及的模块边界。
- 跑过的检查命令。
- 是否涉及微信客服页自动化、外部知识库授权或导入、AI、Webhook、配置、安装包或敏感数据。
- 如果测试无法运行，说明原因、风险和替代验证。

基础检查：

```bash
npm run build-extension
npm run check:secrets
npm run doctor
```

按改动类型追加：

| 改动类型 | 追加检查 |
| --- | --- |
| 规则、文本、AI、知识库 | `npm run test:extension-modules`, `npm run test:ai-knowledge`, `npm run test:baseline` |
| Electron 主进程、窗口、生命周期 | `npm run test:desktop-modules`, `npm run test:lifecycle` |
| 主控台、悬浮窗、状态 UI | `npm run test:status-ui` |
| 页面动作、图片、文件、商品、登录 | `npm run test:regressions`，并补充人工验证说明 |
| 发布、安装包、资源 | `npm run test:release-readiness`, `npm run test:packaged-resources` |
| macOS 打包 | `npm run dist:mac`, `npm run test:macos-package` |
| Windows 打包 | `npm run dist:win`, `npm run test:windows-packages` 或 GitHub Actions 结果 |

## 目录归属

- `desktop/`：Electron 主进程、窗口、托盘、悬浮窗、preload、状态中心和配置校验。
- `extension/`：注入微信小店客服页的 content script 和浏览器扩展相关文件。
- `src/`：可复用业务逻辑，如规则匹配、AI 客户端、知识库、外部知识库查询和文本工具。
- `config/`：默认规则、默认 AI 风格、承接语和随包图片。
- `scripts/`：构建、安装、测试、诊断和发布检查脚本。
- `docs/`：专题文档、历史说明和发布说明。

不要把同一段业务逻辑复制到多个 UI。规则匹配、页面动作、状态推断、菜单命令等共享行为应有单一事实来源。

## 代码和 UI 规则

- 保持现有 Electron + plain JavaScript 结构，除非已有明确迁移计划。
- 确定性规则优先，AI 只做兜底或补充判断。
- 用户界面保持紧凑、浅色、可扫描，适合客服长期值守。
- 全局命令遵守 `docs/desktop-native-menu-guidelines.md`：Mac 用系统菜单栏，Windows 用小型三条杠菜单。
- 状态标签遵守 `docs/runtime-statuses.md`，短状态不要随意新增或改名。
- 敏感值不得进入命令行参数、日志、通知、截图、测试 fixture 或文档示例。

## 微信客服页自动化

触碰客服页 DOM、selector、上传、商品、邀请下单、发送按钮或登录判断时，必须提供验证说明：

- 测试页面状态和 URL。
- 触发的客户消息或人工操作。
- 实际发送的类型：文字、图片、文件、商品卡片、邀请下单、素材或忽略。
- 是否产生回复记录、状态追踪和 Webhook 摘要。
- 页面结构是否需要重新捕捉并更新 `docs/wechat-kf-page-structure.md`。

禁止用猜测替换已验证 selector。页面结构变化时，先捕捉结构，再改动作逻辑。

## 配置和密钥

永远不要提交：

- DeepSeek API Key。
- 企业微信 / WeCom Webhook URL。
- 外部知识库访问凭证、session token 或授权历史。
- Desktop control Token。
- `.env`、个人运行缓存、私有外部知识库导入缓存或导出。
- 微信小店登录态、Chrome profile、二维码截图或客户隐私。

如果日志、截图、fixture 或文档包含凭证，先脱敏再提交。`npm run check:secrets` 通过不代表可以跳过人工检查。

## 文档同步

以下改动必须同步文档：

- Electron 窗口、菜单、托盘、悬浮窗。
- 回复决策顺序、规则匹配、AI 兜底。
- 外部知识库网络调用、本地导入、访问凭证和查询。
- Webhook、通知补发、回复记录。
- 配置文件、运行目录、打包文件。
- 安全、密钥、权限、缓存。
- 发布流程、安装包命名和下载链接。

文档优先级：`ARCHITECTURE.md` > `CONTRIBUTING.md` > `README.md` > `docs/README.md` > `docs/*`。

文档语言默认中文优先。除文件名、命令、代码标识、API、产品名、错误原文、URL、安装包名等必须保留英文的格式内容外，标题、说明、表格、发布记录和规范条款都要用中文表达。新增或修改 Markdown 时要主动清理非必要英文，不能把 fallback、source of truth、Top Bar、Release Notes 这类普通说明词继续写成英文。

## 发布和版本

发布相关提交必须一起更新：

- `package.json` 版本。
- `README.md` 下载链接和版本说明。
- `CHANGELOG.md`。
- `docs/release-notes/` 下对应版本说明。
- 发布检查脚本或打包资源检查，如果产物命名或资源列表改变。

正式安装包在 GitHub 发布页，不在 Packages。

## 分支清理

临时工作分支必须及时清理。`codex/*` 分支只服务一个明确任务或一个 PR，不作为长期版本分支。

规则：

- PR 合并后，删除对应远端分支和本地分支。
- PR 关闭且不再继续时，删除对应远端分支和本地分支。
- 已被 `main` 吸收的历史优化分支要删除，不保留“以防万一”的旧分支。
- 只有 `main` 和仍有打开 PR 或正在处理任务的分支可以保留。
- 删除前先确认没有未推送提交、打开 PR 或仍需移植的有效修复。

## 提交风格

优先使用简短前缀：

- `fix:` bug 修复。
- `feat:` 新能力。
- `docs:` 文档。
- `test:` 测试。
- `ci:` 工作流。
- `chore:` 版本、发布或维护。

提交范围要小而明确。不要把无关 logo 草稿、个人运行目录、构建产物和功能改动混在同一个提交里。
