#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="${WECHAT_KF_DESKTOP_LABEL:-com.xiaodian-ai-kefu.desktop}"
LEGACY_LABEL="com.wechat-kf-desktop"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LEGACY_PLIST="$HOME/Library/LaunchAgents/$LEGACY_LABEL.plist"
UID_VALUE="$(id -u)"
RUNNER="$ROOT/scripts/run-desktop-mac.sh"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "缺少 $ROOT/.env，请先配置 DEEPSEEK_API_KEY"
  exit 1
fi

if [[ ! -x "$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ]]; then
  echo "缺少 Electron 可执行文件，请先执行 npm install"
  exit 1
fi

chmod +x "$RUNNER"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$RUNNER</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>/tmp/xiaodian-ai-kefu-desktop.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/xiaodian-ai-kefu-desktop.err.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$UID_VALUE" "$PLIST" >/dev/null 2>&1 || true
launchctl bootout "gui/$UID_VALUE" "$LEGACY_PLIST" >/dev/null 2>&1 || true
rm -f "$LEGACY_PLIST"
launchctl bootstrap "gui/$UID_VALUE" "$PLIST"
launchctl kickstart -k "gui/$UID_VALUE/$LABEL"

echo "小店AI客服桌面程序守护已安装：$LABEL"
echo "日志：/tmp/xiaodian-ai-kefu-desktop.log"
echo "错误日志：/tmp/xiaodian-ai-kefu-desktop.err.log"
