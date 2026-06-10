# 微信小店客服自动回复工具

这是一个微信小店客服自动回复工具，包含：

- 独立桌面程序
- 桌面悬浮窗
- 企业微信群机器人 Webhook 告警
- macOS launchd / Windows 任务计划桌面守护
- Chrome 扩展
- 本地 Node AI 服务
- DeepSeek 接入
- AI 审核层
- 知识库
- 快速回复和等待语配置
- macOS/Windows 后台服务安装脚本

## 当前默认业务规则

默认规则已根据客服 FAQ 写入：

- 润宇年度会员商业社群，商品码 `10000275472384`
- 会员专区使用和进群图文
- 会员权益目录图
- 年度会员商品卡片
- 年度会员邀请下单
- 月度会员取消自动续费图
- 咨询俱乐部详情图
- 联系方式违规提示
- 线下课、获客助手、推客、手册、福袋地址、代运营、导私域等 FAQ
- 客户道谢后不再补话

这些规则、动作和配套图片会随正式安装包一起打进去。新电脑首次打开 App 时会自动初始化运行配置；旧电脑升级新版时，也会自动补齐新版内置规则。正常情况下只需要在悬浮窗里补 DeepSeek API Key 和企业微信 Webhook，再扫码登录微信小店客服页即可使用。

规则说明：

```text
docs/customer-reply-rule-library.md
```

富文本使用说明：

```text
docs/rich-user-guide.md
```

项目开发历程：

```text
docs/project-journey.md
```

结构和部署说明：

```text
docs/desktop-app-structure-deployment.md
```

GitHub Actions 会自动构建 macOS 和 Windows 安装包：

```text
.github/workflows/build-installers.yml
```

## 迁移安装

请看：

```text
PORTABLE_INSTALL.md
```

Mac 安装方式：

```bash
cd ~/Desktop/WeChat-chat
chmod +x install-on-this-mac.sh
./install-on-this-mac.sh
```

Windows 安装方式：

```powershell
cd "$env:USERPROFILE\Desktop\WeChat-chat"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-on-windows.ps1
```

Windows 详细说明：

```text
WINDOWS_INSTALL.md
```

## 推荐使用：独立桌面程序

安装完成后运行：

```bash
npm run desktop
```

桌面程序会：

- 内置打开微信小店客服页，不依赖手动打开 Chrome 标签页
- 首次运行自动写入文字规则、图片动作、发商品、邀请下单、助手资料和图片资源
- 升级旧版本时自动补齐新版内置规则，保留同名规则的本地修改
- 悬浮窗关闭需要二次确认，确认后会彻底停止自动回复、Webhook 和本地 AI 服务
- 可安装系统级桌面守护，异常退出后自动重启
- 显示桌面悬浮窗，展示客服页、AI 服务和通知状态
- 发现 AI 服务异常、客服页需要登录、页面崩溃、消息未成功回复、客户消息超时未回复时，通过企业微信群机器人 Webhook 通知
- Webhook 临时失败时会写入本地待补发队列，恢复后自动补发
- 成功回复不会逐条刷 Webhook；每小时会发送回复总结，每天上午 10 点发送昨日总览

企业微信通知配置在 `.env`：

```text
WECOM_BOT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key
```

也可以一条命令写入并测试：

```bash
npm run configure:webhook -- "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key"
```

后续二次测试：

```bash
npm run test:webhook
```

通知补发队列自检：

```bash
npm run test:notify-outbox
```

生产就绪检查：

```bash
npm run doctor
```

桌面程序守护安装：

```bash
npm run install:desktop:mac
```

Windows 使用：

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

## 备用方式：Chrome 扩展

如果还要使用 Chrome 扩展，安装完成后在 Chrome 加载：

```text
dist/wechat-kf-extension
```

## 配置位置

知识库：

```text
knowledge-base/customer-service.md
```

默认回复规则：

```text
config/replies.json
```

规则图片：

```text
config/reply-images/
```

快速回复：

```text
config/quick-replies.json
```

AI 超过 50 秒才发的等待语：

```text
config/waiting-replies.json
```

## 注意

- 不要复制 `.env` 给别人
- `.env` 里是 DeepSeek API Key 和企业微信机器人 Webhook
- 工具不会绕过扫码、验证码或平台风控；需要人工登录时会通知
- 严禁引导客户加微信、打电话、私聊、留手机号或私下交易
