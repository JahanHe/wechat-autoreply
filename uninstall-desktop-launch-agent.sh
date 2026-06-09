#!/usr/bin/env bash
set -euo pipefail

LABEL="${WECHAT_KF_DESKTOP_LABEL:-com.wechat-kf-desktop}"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_VALUE="$(id -u)"

launchctl bootout "gui/$UID_VALUE" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"

echo "已卸载微信小店客服桌面程序守护"
