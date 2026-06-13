# macOS 安装和打不开处理

> 本文定位：macOS 安装拦截和打不开问题处理。上级入口：[README.md](../README.md)，发布和打包规则见 [ARCHITECTURE.md](../ARCHITECTURE.md)。

> 这份文件会放在 DMG 里。遇到“无法打开”“开发者无法验证”“JavaScript error occurred in the main process”时，先按这里排查。DMG 里也会放一个 `repair-macos-install.command`，可以双击运行自动修复常见安装问题。

## 正常安装

1. 打开 `xiaodian-ai-kefu-macos-arm64.dmg`。
2. 把“小店AI客服”拖到 `Applications`。
3. 第一次打开建议右键 App，选择“打开”，再点“打开”确认。
4. 打开后在主控制台配置 DeepSeek API Key、企业微信 Webhook，并扫码登录微信小店客服页。

## 一键修复脚本

如果遇到下面情况，不需要复制终端命令，直接双击 DMG 里的 `repair-macos-install.command`：

- 提示“开发者无法验证”。
- 提示 App 已损坏或无法打开。
- 已经拖到 `Applications`，但第一次打开仍然被拦截。
- 不确定是否已经正确复制到 `Applications`。

脚本会自动：

1. 查找 DMG 里的 `小店AI客服.app`。
2. 将 DMG 里的 App 复制到 `/Applications`；如果已经存在，会用当前 DMG 内 App 覆盖修复。
3. 检查 `Info.plist`、`app.asar` 和启动文件。
4. 清除 `com.apple.quarantine` 隔离属性。
5. 打开 App。

如果系统提示输入密码，说明脚本需要写入 `/Applications` 或清除隔离属性；这是 macOS 权限确认，不会上传任何密钥或登录信息。

## 提示开发者无法验证

当前安装包没有 Apple Developer ID 签名。macOS 首次打开可能拦截，这是系统安全提示，不代表程序文件缺失。

优先用这个方法：

1. 打开 Finder。
2. 进入 `Applications`。
3. 右键“小店AI客服”。
4. 选择“打开”。
5. 在弹窗里再次点“打开”。

如果仍然打不开，优先双击 DMG 里的 `repair-macos-install.command`。也可以手动在终端执行：

```bash
xattr -dr com.apple.quarantine "/Applications/小店AI客服.app"
open "/Applications/小店AI客服.app"
```

## 出现 JavaScript error occurred in the main process

如果错误里包含：

```text
Cannot find module ... app.asar/src/runyu-judgments.js
```

说明你安装的是 `v0.3.0` 旧包。请下载 `v0.3.1` 或更新版本重新安装。

处理步骤：

1. 退出正在运行的“小店AI客服”。
2. 删除 `/Applications/小店AI客服.app`。
3. 下载最新发布页的 DMG。
4. 重新拖到 `Applications`。
5. 第一次打开如被拦截，按上一节执行 `xattr` 命令。

## 需要重新扫码

更换电脑、清理缓存、重新安装或微信登录态失效时，客服页会回到扫码页。程序会通过 Webhook 发送二维码截图；也可以打开主控制台的“客服页映射”手动扫码。

扫码后必须选中一个真实会话，再测试图片、商品卡片和邀请下单。

## 图片或文件发不出去

进入知识库 > 规则库：

1. 打开“动作规则”。
2. 找到图片或文件动作。
3. 点“打开位置”确认文件存在。
4. 文件不存在时，点“选择/替换”选择新图片或文件。
5. 保存规则库后重新测试。

## 仍然打不开

在终端执行下面命令，把输出截图或复制给维护者：

```bash
ls -la "/Applications/小店AI客服.app/Contents/Resources"
plutil -p "/Applications/小店AI客服.app/Contents/Info.plist" | grep -E "CFBundleIconFile|CFBundleShortVersionString|CFBundleIdentifier"
open "/Applications/小店AI客服.app"
```
