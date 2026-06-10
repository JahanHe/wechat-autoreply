# 微信小店客服自动回复工具

> 这是微信小店客服自动回复的桌面工作台。它把客服页、本地 AI 服务、规则库、悬浮窗、企业微信 Webhook 通知和安装包发布流程放在一起，让新电脑下载安装后，只补 API Key、Webhook 并扫码登录即可开始使用。

## 第一章：先看这里

这个项目不是普通浏览器脚本。正式版本会把微信小店客服页封装到独立桌面应用里，并在首次运行时自动初始化默认规则、配套图片、商品动作、邀请下单动作、助手资料和通知配置骨架。

最重要的判断：

| 问题 | 答案 |
| --- | --- |
| 去哪里下载？ | 去 [GitHub Releases](https://github.com/JahanHe/wechat-autoreply/releases/tag/v0.1.0)，不是 Packages |
| 需要自己配什么？ | DeepSeek API Key、企业微信机器人 Webhook、微信小店扫码登录 |
| 下载后默认有什么？ | 文字回复、图片回复、商品卡片、邀请下单、悬浮窗、Webhook 汇总 |
| 密钥会不会进仓库？ | 不会，真实 API Key 和 Webhook 只写入本机运行目录 |

## 直接下载

当前正式版本：`v0.1.0`

- [macOS Apple Silicon DMG](https://github.com/JahanHe/wechat-autoreply/releases/download/v0.1.0/wechat-autoreply-macos-arm64.dmg)
- [Windows 安装版](https://github.com/JahanHe/wechat-autoreply/releases/download/v0.1.0/wechat-autoreply-windows-setup.exe)
- [Windows 便携版](https://github.com/JahanHe/wechat-autoreply/releases/download/v0.1.0/wechat-autoreply-windows-portable.exe)

如果只是在本机开发或调试，也可以在仓库目录运行：

```bash
npm install
npm run desktop
```

## 首次运行三步

| 步骤 | 在哪里做 | 做什么 |
| --- | --- | --- |
| 1 | 悬浮窗 > API | 填 DeepSeek API Key |
| 2 | 悬浮窗 > 通知 | 填企业微信机器人 Webhook，并点测试 |
| 3 | 桌面客服页 | 微信扫码登录并选中客服会话 |

完成后确认悬浮窗显示 Bot 已开启。Bot 默认开启；如果手动暂停，可以在悬浮窗里重新开启。彻底关闭需要二次确认。

## 默认业务能力

当前默认规则围绕“润宇年度会员商业社群”配置，商品码为 `10000275472384`。

| 场景 | 默认动作 |
| --- | --- |
| 想买会员、会员链接、会员入口 | 发年度会员商品卡片 |
| 怎么买、怎么付款、怎么下单 | 邀请下单 |
| 会员权益、课程目录、包含什么 | 文字加目录图 |
| 怎么使用会员专区、怎么进群 | 文字加说明图 |
| 月度会员取消自动续费 | 文字加图 |
| 咨询俱乐部、产品详情 | 文字加图 |
| 加微信、手机号、电话 | 平台内沟通合规提示 |
| 谢谢、明白了、OK | 标记已处理，不再补话 |

这些规则和图片会打进安装包。新电脑首次打开会自动写入运行配置；旧版本升级时会补齐缺失的新版默认规则，并尽量保留同名规则的本地修改。

## 文档地图

README 是第一章，负责告诉你“先做什么、去哪看”。更细的内容看下面这些文档：

| 想了解 | 文档 |
| --- | --- |
| 图文版使用、下载、配置、通知、规则入口 | [docs/rich-user-guide.md](docs/rich-user-guide.md) |
| 规则库怎么写，什么时候发文字/图片/商品 | [docs/customer-reply-rule-library.md](docs/customer-reply-rule-library.md) |
| 桌面版结构、运行目录、Webhook、构建部署 | [docs/desktop-app-structure-deployment.md](docs/desktop-app-structure-deployment.md) |
| 微信小店客服页结构、商品/素材/快捷语入口 | [docs/wechat-kf-page-structure.md](docs/wechat-kf-page-structure.md) |
| 项目从浏览器依赖到桌面版发布的历程 | [docs/project-journey.md](docs/project-journey.md) |
| 旧迁移包安装方式 | [PORTABLE_INSTALL.md](PORTABLE_INSTALL.md) |
| Windows 手动安装说明 | [WINDOWS_INSTALL.md](WINDOWS_INSTALL.md) |

## 常用操作

配置企业微信 Webhook：

```bash
npm run configure:webhook -- "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key"
```

测试 Webhook：

```bash
npm run test:webhook
```

生产就绪检查：

```bash
npm run doctor
```

安装桌面程序守护：

```bash
npm run install:desktop:mac
```

Windows：

```powershell
npm run install:desktop:win
```

卸载桌面程序守护：

```bash
npm run uninstall:desktop:mac
```

Windows：

```powershell
npm run uninstall:desktop:win
```

备用 Chrome 扩展构建：

```bash
npm run build-extension
```

Chrome 加载目录：

```text
dist/wechat-kf-extension
```

## 配置位置

| 内容 | 仓库默认文件 | 运行时位置 |
| --- | --- | --- |
| 默认回复规则 | `config/replies.json` | `desktop-config.json` |
| 回复图片 | `config/reply-images/` | `config/reply-images/` |
| 助手风格和知识库 | `config/assistant-profile.json` | `assistant-profile.json` |
| FAQ 知识库 | `knowledge-base/customer-service.md` | 随安装包读取 |
| API Key / Webhook | 不进仓库 | `.env` |

macOS 运行目录：

```text
~/Library/Application Support/wechat-shop-kf-bot/
```

Windows 运行目录：

```text
%APPDATA%/wechat-shop-kf-bot/
```

## 构建和发布

本地构建：

```bash
npm run dist:mac
npm run dist:win
```

GitHub Actions 工作流：

- [.github/workflows/build-installers.yml](.github/workflows/build-installers.yml)
- 推送到 `main` 会构建 macOS 和 Windows 产物，作为 Actions artifacts。
- 推送 `v*` 标签会创建 GitHub Release，并上传 DMG、Windows 安装版和便携版。
- Actions 会先执行 `npm run check:secrets`，避免真实密钥进入仓库。

## 安全边界

- 不要提交或转发 `.env`。
- `.env` 里只能保存在本机运行所需的 DeepSeek API Key 和企业微信机器人 Webhook。
- 工具不会绕过扫码、验证码或平台风控；需要人工登录时会通过 Webhook 通知。
- 严禁引导客户加微信、打电话、私聊、留手机号或私下交易。
