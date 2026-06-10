#!/usr/bin/env bash
set -euo pipefail

LABEL="${WECHAT_KF_DESKTOP_LABEL:-com.xiaodian-ai-kefu.desktop}"
LEGACY_LABEL="com.wechat-kf-desktop"
UID_VALUE="$(id -u)"

for item in "$LABEL" "$LEGACY_LABEL"; do
  PLIST="$HOME/Library/LaunchAgents/$item.plist"
  launchctl bootout "gui/$UID_VALUE" "$PLIST" >/dev/null 2>&1 || true
  rm -f "$PLIST"
done

echo "已卸载小店AI客服桌面程序守护"
