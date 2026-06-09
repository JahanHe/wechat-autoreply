#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
LABEL="${WECHAT_KF_SERVICE_LABEL:-com.wechat-kf-ai-server}"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_VALUE="$(id -u)"

if [[ -z "$NODE_BIN" ]]; then
  echo "未找到 Node.js，请先安装 Node.js 18+"
  exit 1
fi

if [[ ! -f "$ROOT/.env" ]]; then
  echo "缺少 $ROOT/.env，请先配置 DEEPSEEK_API_KEY"
  exit 1
fi

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
    <string>$NODE_BIN</string>
    <string>$ROOT/server.js</string>
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
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>/tmp/wechat-kf-ai-server.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/wechat-kf-ai-server.err.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$UID_VALUE" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID_VALUE" "$PLIST"
launchctl kickstart -k "gui/$UID_VALUE/$LABEL"

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl --noproxy 127.0.0.1,localhost -fsS http://127.0.0.1:8787/health; then
    echo
    exit 0
  fi
  sleep 1
done

echo "AI 服务已提交给 launchd，但 10 秒内还没有通过健康检查"
echo "请查看 /tmp/wechat-kf-ai-server.err.log"
exit 1
