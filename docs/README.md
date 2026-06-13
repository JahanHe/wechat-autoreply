# 小店AI客服文档索引

本文是 `docs/` 目录导航。项目最高优先级规范是根目录 [ARCHITECTURE.md](../ARCHITECTURE.md)，协作规则是 [CONTRIBUTING.md](../CONTRIBUTING.md)，用户入口是 [README.md](../README.md)。

## 文档优先级

1. [ARCHITECTURE.md](../ARCHITECTURE.md)
2. [CONTRIBUTING.md](../CONTRIBUTING.md)
3. [README.md](../README.md)
4. [docs/README.md](README.md)
5. `docs/*` 专题文档

如果专题文档和上级规范冲突，以上级规范为准，并在同一个改动里修正文档。

## 维护者必读

| 场景 | 文档 |
| --- | --- |
| 理解系统边界、模块职责、数据流、安全和测试矩阵 | [ARCHITECTURE.md](../ARCHITECTURE.md) |
| 提交 PR、跑检查、处理密钥和页面自动化验证 | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| 桌面结构、运行目录、部署和打包 | [desktop-app-structure-deployment.md](desktop-app-structure-deployment.md) |
| Mac 原生菜单、Windows 三条杠菜单、托盘和快捷键 | [desktop-native-menu-guidelines.md](desktop-native-menu-guidelines.md) |
| 工作台信息架构和后续 UI 演进 | [workbench-optimization-plan.md](workbench-optimization-plan.md) |
| 状态灯、短状态、悬浮窗和主控台状态同步 | [runtime-statuses.md](runtime-statuses.md) |

## 使用者和运营

| 场景 | 文档 |
| --- | --- |
| 图文安装、初始化、使用和常见入口 | [rich-user-guide.md](rich-user-guide.md) |
| 回复规则、动作规则、商品动作和文字限制 | [customer-reply-rule-library.md](customer-reply-rule-library.md) |
| macOS 无证书安装拦截和打不开处理 | [mac-install-troubleshooting.md](mac-install-troubleshooting.md) |

## 页面自动化和历史

| 场景 | 文档 |
| --- | --- |
| 微信小店客服页 selector、上传入口、商品面板和页面结构 | [wechat-kf-page-structure.md](wechat-kf-page-structure.md) |
| 项目从浏览器脚本到桌面工作台的演进记录 | [project-journey.md](project-journey.md) |
| 历史发布说明 | [release-notes/](release-notes/) |
| v0.3.9 执行记录 | [execution/](execution/) |

## 文档同步规则

改动以下能力时，必须同步相关文档：

- Electron 窗口、菜单、托盘、悬浮窗。
- 回复决策顺序、规则匹配、AI 兜底。
- 外部知识同步配置、访问凭证、本机缓存、增量更新和本机检索。
- Webhook、通知补发、回复记录。
- 配置文件、运行目录、打包文件。
- 安全、密钥、权限、缓存。
- 发布流程和安装包命名。

## 文档语言规则

`docs/` 下的专题文档默认中文优先。只有文件名、命令、代码标识、API、产品名、错误原文、URL、安装包名等必须精确识别的内容保留英文。普通说明词要写中文，例如“兜底”“事实来源”“顶部栏”“发布说明”“发布就绪检查”。

## 分支清理规则

临时优化分支合并或关闭后必须清理。远端长期只保留 `main` 和仍有打开 PR 的活动分支；已经提交、合并、关闭或被 `main` 吸收的 `codex/*` 分支要删除。版本记录看 tag、发布说明和更新日志，不用历史分支保存。

文档改动至少运行：

```bash
git diff --check
npm run doctor
npm run check:secrets
```
