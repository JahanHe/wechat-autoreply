# 微信小店客服自动回复迁移安装说明

## 目录

Mac 解压后建议放在桌面：

```bash
~/Desktop/WeChat-chat
```

Windows 解压后建议放在桌面：

```text
C:\Users\你的用户名\Desktop\WeChat-chat
```

## Mac 一键安装

```bash
cd ~/Desktop/WeChat-chat
chmod +x install-on-this-mac.sh
./install-on-this-mac.sh
```

## Windows 一键安装

双击：

```text
install-on-windows.bat
```

或 PowerShell 执行：

```powershell
cd "$env:USERPROFILE\Desktop\WeChat-chat"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-on-windows.ps1
```

脚本会要求输入 DeepSeek API Key，并自动完成：

- 安装 Node 依赖
- 生成 Chrome 插件目录
- 配置企业微信群机器人 Webhook（必填，用于通知到人）
- 注册本地 AI 后台服务，Mac 使用 launchd，Windows 使用任务计划程序
- 注册桌面程序守护，异常退出后自动重启
- 检查 `http://127.0.0.1:8787/health`

## 推荐启动独立桌面程序

```bash
npm run desktop
```

桌面程序会打开独立客服窗口，并显示悬浮窗。关闭主窗口不会退出程序，会隐藏到后台继续运行。
一键安装后还会注册系统级守护：Mac 使用 launchd，Windows 使用任务计划程序。

触发以下情况会通过企业微信群机器人 Webhook 通知：

- 客服页需要扫码、验证码或重新登录
- AI 服务异常或缺少 API Key
- 客服页面崩溃、无响应或长时间无状态
- 有客户消息但没有成功发出回复
- 客户消息超过 90 秒仍未看到客服回复
- Webhook 临时失败后恢复，程序会自动补发之前失败的通知

企业微信机器人地址写在：

```text
.env
```

字段：

```text
WECOM_BOT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key
```

一条命令写入并测试：

```bash
npm run configure:webhook -- "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key"
```

后续二次测试：

```bash
npm run test:webhook
```

补发队列自检：

```bash
npm run test:notify-outbox
```

生产就绪检查：

```bash
npm run doctor
```

只安装桌面程序守护：

```bash
npm run install:desktop:mac
```

Windows：

```powershell
npm run install:desktop:win
```

## 备用：加载 Chrome 插件

打开 Chrome：

```text
chrome://extensions
```

然后：

1. 打开右上角“开发者模式”
2. 点击“加载已解压的扩展程序”
3. 选择：

```text
~/Desktop/WeChat-chat/dist/wechat-kf-extension
```

插件弹窗顶部应显示当前扩展版本。版本号以 `extension/manifest.json` 为准，例如：

```text
v0.1.0 · Windows/Mac 安装版
```

## 使用

打开微信小店客服页：

```text
https://store.weixin.qq.com/shop/kf
```

扫码登录后，打开插件：

1. 点击“检查 API 配置”
2. 确认看到 `review=enabled`
3. 打开“自动监听并回复”

## 知识库位置

可以编辑：

```text
knowledge-base/customer-service.md
```

也可以在 `knowledge-base/` 里新增 `.md` 文件。

修改知识库后，重启服务：

Mac：

```bash
scripts/install-ai-server-launch-agent.sh
```

Windows：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-ai-server-windows.ps1
```

## 快速回复和等待语

快速回复：

```text
config/quick-replies.json
```

AI 超过 50 秒才发的等待语：

```text
config/waiting-replies.json
```

## 卸载后台服务

Mac：

```bash
chmod +x uninstall-ai-server.sh
./uninstall-ai-server.sh
chmod +x uninstall-desktop-launch-agent.sh
./uninstall-desktop-launch-agent.sh
```

Windows：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\uninstall-ai-server-windows.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\uninstall-desktop-windows.ps1
```

## 注意

- 不要把 `.env` 发给别人，里面是 API Key
- 这个迁移包默认不包含 `.env`
- 需要企业微信通知时，必须配置 `WECOM_BOT_WEBHOOK_URL`
- 严禁引导客户加微信、打电话、私聊、留手机号或私下交易
