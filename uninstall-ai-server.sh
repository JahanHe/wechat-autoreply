#!/usr/bin/env bash
set -euo pipefail

LABEL="${WECHAT_KF_SERVICE_LABEL:-com.wechat-kf-ai-server}"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_VALUE="$(id -u)"

launchctl bootout "gui/$UID_VALUE" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"

echo "已卸载小店AI客服 AI 后台服务"
