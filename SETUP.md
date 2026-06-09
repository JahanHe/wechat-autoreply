# 安装配置指南

这份文件保留给旧入口使用。新电脑安装请直接看：

```text
PORTABLE_INSTALL.md
```

一键安装：

```bash
cd ~/Desktop/WeChat-chat
chmod +x install-on-this-mac.sh
./install-on-this-mac.sh
```

Chrome 插件加载目录：

```text
dist/wechat-kf-extension
```

后台服务健康检查：

```bash
curl --noproxy 127.0.0.1,localhost http://127.0.0.1:8787/health
```

正常应看到：

```json
{"ok":true,"hasKey":true,"review":"enabled"}
```

独立桌面程序：

```bash
npm run desktop
```

桌面程序守护：

```bash
npm run install:desktop:mac
```

Windows：

```powershell
npm run install:desktop:win
```

企业微信 Webhook 通知配置：

```text
WECOM_BOT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key
```

写入并测试：

```bash
npm run configure:webhook -- "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key"
```

Webhook 二次测试：

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
