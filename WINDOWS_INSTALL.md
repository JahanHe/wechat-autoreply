# Windows 安装说明

## 必要条件

- Windows 10/11
- Chrome 浏览器
- Node.js 18 或更高版本
- DeepSeek API Key
- 可以访问 `https://api.deepseek.com`
- 微信小店客服账号可扫码登录

Node.js 下载地址：

```text
https://nodejs.org/
```

## 解压位置

建议解压到桌面：

```text
C:\Users\你的用户名\Desktop\WeChat-chat
```

## 一键安装

方式一：双击运行：

```text
install-on-windows.bat
```

方式二：PowerShell 运行：

```powershell
cd "$env:USERPROFILE\Desktop\WeChat-chat"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-on-windows.ps1
```

安装脚本会完成：

- 输入 DeepSeek API Key
- 生成 `.env`
- 执行 `npm install`
- 构建 Chrome 插件目录
- 配置企业微信群机器人 Webhook（必填，用于通知到人）
- 创建 Windows 任务计划：`XiaodianAIKefuAiServer`
- 创建 Windows 任务计划：`XiaodianAIKefuDesktop`
- 启动本地 AI 服务
- 检查 `http://127.0.0.1:8787/health`

## 推荐启动独立桌面程序

PowerShell 执行：

```powershell
npm run desktop
```

桌面程序会打开独立客服窗口，并显示悬浮窗。关闭主窗口不会退出程序，会隐藏到后台继续运行。
一键安装后还会注册 `XiaodianAIKefuDesktop` 任务，登录后自动运行，异常退出后由任务计划程序重启。

以下情况会通过企业微信群机器人 Webhook 通知：

- 客服页需要扫码、验证码或重新登录
- AI 服务异常或缺少 API Key
- 客服页面崩溃、无响应或长时间无状态
- 有客户消息但没有成功发出回复
- 客户消息超过 90 秒仍未看到客服回复
- Webhook 临时失败后恢复，程序会自动补发之前失败的通知

企业微信机器人地址写在 `.env`：

```text
WECOM_BOT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key
```

一条命令写入并测试：

```powershell
npm run configure:webhook -- "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key"
```

后续二次测试：

```powershell
npm run test:webhook
```

补发队列自检：

```powershell
npm run test:notify-outbox
```

生产就绪检查：

```powershell
npm run doctor
```

只安装桌面程序守护：

```powershell
npm run install:desktop:win
```

## 备用：加载 Chrome 插件

打开 Chrome：

```text
chrome://extensions
```

然后：

1. 打开“开发者模式”
2. 点击“加载已解压的扩展程序”
3. 选择：

```text
C:\Users\你的用户名\Desktop\WeChat-chat\dist\wechat-kf-extension
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

扫码登录后：

1. 打开插件弹窗
2. 点击“检查 API 配置”
3. 确认看到 `review=enabled`
4. 打开“自动监听并回复”

## 检查本地 AI 服务

PowerShell 执行：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

正常应看到：

```text
ok: true
hasKey: true
review: enabled
```

## 卸载后台服务

PowerShell 执行：

```powershell
cd "$env:USERPROFILE\Desktop\WeChat-chat"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\uninstall-ai-server-windows.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\uninstall-desktop-windows.ps1
```

## 注意

- 不要把 `.env` 发给别人
- `.env` 里是 DeepSeek API Key 和企业微信机器人 Webhook
- 需要企业微信通知时，必须配置 `WECOM_BOT_WEBHOOK_URL`
- 不能引导客户加微信、打电话、私聊、留手机号或私下交易
