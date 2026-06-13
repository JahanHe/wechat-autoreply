#!/usr/bin/env bash
set -euo pipefail

APP_NAME="小店AI客服.app"
INSTALL_APP="/Applications/$APP_NAME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_APP=""

log() {
  printf '%s\n' "$*"
}

fail() {
  log ""
  log "处理失败：$*"
  log "请把本窗口内容截图或复制给维护者。"
  read -r -p "按回车关闭窗口..." _
  exit 1
}

escape_osascript() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

run_with_admin() {
  local command="$1"
  osascript -e "do shell script \"$(escape_osascript "$command")\" with administrator privileges"
}

find_source_app() {
  local candidate
  for candidate in \
    "$SCRIPT_DIR/$APP_NAME" \
    "$(dirname "$SCRIPT_DIR")/$APP_NAME" \
    "/Volumes/小店AI客服/$APP_NAME"; do
    if [[ -d "$candidate" ]]; then
      SOURCE_APP="$candidate"
      return 0
    fi
  done

  while IFS= read -r candidate; do
    if [[ -d "$candidate" ]]; then
      SOURCE_APP="$candidate"
      return 0
    fi
  done < <(find /Volumes -maxdepth 3 -type d -name "$APP_NAME" 2>/dev/null | sort)

  return 1
}

copy_app_to_applications() {
  [[ -n "$SOURCE_APP" && -d "$SOURCE_APP" ]] || return 1
  log "正在把 App 复制到 Applications..."

  if rm -rf "$INSTALL_APP" 2>/dev/null && /usr/bin/ditto "$SOURCE_APP" "$INSTALL_APP" 2>/dev/null; then
    return 0
  fi

  log "需要管理员权限才能写入 Applications，系统可能会弹出密码确认。"
  run_with_admin "rm -rf \"$INSTALL_APP\" && /usr/bin/ditto \"$SOURCE_APP\" \"$INSTALL_APP\""
}

install_or_refresh_app() {
  if [[ -z "$SOURCE_APP" ]]; then
    if [[ -d "$INSTALL_APP" ]]; then
      log "没有找到 DMG 内 App，本次只修复已安装 App。"
      return 0
    fi
    fail "没有找到已安装 App，也没有在当前 DMG 中找到可复制的 App"
  fi

  if [[ -d "$INSTALL_APP" ]]; then
    log "Applications 已有 App，将使用当前 DMG 内 App 覆盖修复。"
  fi

  copy_app_to_applications
}

clear_quarantine() {
  log "正在清除 macOS 隔离属性..."
  if xattr -dr com.apple.quarantine "$INSTALL_APP" 2>/dev/null; then
    return 0
  fi

  log "需要管理员权限才能清除隔离属性，系统可能会弹出密码确认。"
  run_with_admin "xattr -dr com.apple.quarantine \"$INSTALL_APP\""
}

make_executable() {
  local executable="$INSTALL_APP/Contents/MacOS/小店AI客服"
  [[ -f "$executable" ]] || fail "找不到启动文件：$executable"
  chmod +x "$executable" 2>/dev/null || run_with_admin "chmod +x \"$executable\""
}

verify_app() {
  local resources="$INSTALL_APP/Contents/Resources"
  local plist="$INSTALL_APP/Contents/Info.plist"
  local asar="$resources/app.asar"

  [[ -d "$INSTALL_APP" ]] || fail "Applications 里没有找到 $APP_NAME"
  [[ -f "$plist" ]] || fail "App 缺少 Info.plist，安装包可能不完整"
  [[ -f "$asar" ]] || fail "App 缺少 app.asar，安装包可能不完整，请重新下载 DMG"

  local display_name
  local version
  display_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$plist" 2>/dev/null || true)"
  version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist" 2>/dev/null || true)"
  [[ "$display_name" == "小店AI客服" ]] || fail "App 名称异常：${display_name:-空}"
  [[ -n "$version" ]] || fail "App 版本号为空"

  log "App 检查通过：$display_name $version"
}

open_app() {
  log "正在打开小店AI客服..."
  open "$INSTALL_APP" || fail "系统仍然拒绝打开 App"
}

main() {
  log "小店AI客服 macOS 安装自动修复"
  log "--------------------------------"

  find_source_app || true

  if [[ -n "$SOURCE_APP" ]]; then
    log "找到 DMG 内 App：$SOURCE_APP"
  fi

  install_or_refresh_app

  verify_app
  make_executable
  clear_quarantine
  open_app

  log ""
  log "处理完成。"
  log "如果 App 已经打开，可以直接关闭这个终端窗口。"
  read -r -p "按回车关闭窗口..." _
}

main "$@"
