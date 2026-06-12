#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
DMG_PATH="${1:-}"
if [[ -z "$DMG_PATH" ]]; then
  if [[ -f "$ROOT_DIR/dist/小店AI客服-$PACKAGE_VERSION-arm64.dmg" ]]; then
    DMG_PATH="$ROOT_DIR/dist/小店AI客服-$PACKAGE_VERSION-arm64.dmg"
  elif [[ -f "$ROOT_DIR/dist/xiaodian-ai-kefu-macos-arm64.dmg" ]]; then
    DMG_PATH="$ROOT_DIR/dist/xiaodian-ai-kefu-macos-arm64.dmg"
  else
    DMG_PATH="$(find "$ROOT_DIR/dist" -maxdepth 1 -type f -name "*$PACKAGE_VERSION*.dmg" | sort | tail -1)"
  fi
fi
if [[ ! -f "$DMG_PATH" ]]; then
  echo "macOS DMG 不存在: $DMG_PATH" >&2
  exit 1
fi

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/xiaodian-macos-package.XXXXXX")"
MOUNT_DIR="$TEMP_ROOT/mount"
INSTALL_DIR="$TEMP_ROOT/Applications"
USER_DATA="$TEMP_ROOT/user-data"
LOG_PATH="$TEMP_ROOT/app.log"
APP_PID=""

detach_mount_dir() {
  local dir="$1"
  local canonical
  [[ -n "$dir" ]] || return 0
  hdiutil detach "$dir" >/dev/null 2>&1 && return 0
  canonical="$(cd "$dir" 2>/dev/null && pwd -P || true)"
  if [[ -n "$canonical" && "$canonical" != "$dir" ]]; then
    hdiutil detach "$canonical" >/dev/null 2>&1 && return 0
  fi
  hdiutil detach -force "$dir" >/dev/null 2>&1 && return 0
  if [[ -n "$canonical" && "$canonical" != "$dir" ]]; then
    hdiutil detach -force "$canonical" >/dev/null 2>&1 || true
  fi
}

detach_stale_test_mounts() {
  local mount_dir
  while IFS= read -r mount_dir; do
    detach_mount_dir "$mount_dir"
  done < <(mount | awk '/xiaodian-macos-package/ {print $3}')
}

pick_port() {
  local port
  for _ in $(seq 1 50); do
    port=$((20000 + RANDOM % 20000))
    if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$port"
      return 0
    fi
  done
  echo "无法找到空闲端口" >&2
  exit 1
}

CONTROL_PORT="${MACOS_PACKAGE_CONTROL_PORT:-$(pick_port)}"
AI_PORT="${MACOS_PACKAGE_AI_PORT:-$(pick_port)}"
if [[ "$AI_PORT" == "$CONTROL_PORT" ]]; then
  AI_PORT="$(pick_port)"
fi

cleanup() {
  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
    sleep 1
  fi
  detach_mount_dir "$MOUNT_DIR"
}
trap cleanup EXIT

wait_for_json() {
  local url="$1"
  local output="$2"
  for _ in $(seq 1 50); do
    if curl -fsS --max-time 2 "$url" >"$output"; then
      return 0
    fi
    if ! kill -0 "$APP_PID" 2>/dev/null; then
      cat "$LOG_PATH" >&2 || true
      echo "应用在健康检查前退出" >&2
      return 1
    fi
    sleep 0.5
  done
  cat "$LOG_PATH" >&2 || true
  echo "健康检查超时: $url" >&2
  return 1
}

detach_stale_test_mounts
mkdir -p "$MOUNT_DIR" "$INSTALL_DIR" "$USER_DATA"
hdiutil attach "$DMG_PATH" -readonly -nobrowse -mountpoint "$MOUNT_DIR" >/dev/null
APP_IN_DMG="$(find "$MOUNT_DIR" -maxdepth 1 -type d -name '*.app' | sort | head -1)"
if [[ -z "$APP_IN_DMG" || ! -d "$APP_IN_DMG" ]]; then
  find "$MOUNT_DIR" -maxdepth 2 -print >&2
  echo "DMG 内没有找到 .app: $DMG_PATH" >&2
  exit 1
fi
cp -R "$APP_IN_DMG" "$INSTALL_DIR/"

APP_PATH="$INSTALL_DIR/$(basename "$APP_IN_DMG")"
EXECUTABLE="$APP_PATH/Contents/MacOS/小店AI客服"
ASAR_PATH="$APP_PATH/Contents/Resources/app.asar"
node "$ROOT_DIR/scripts/check-packaged-resources.js" "$ASAR_PATH" 0.4.1

DISPLAY_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$APP_PATH/Contents/Info.plist")"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")"
[[ "$DISPLAY_NAME" == "小店AI客服" ]] || { echo "应用名称异常: $DISPLAY_NAME" >&2; exit 1; }
[[ "$VERSION" == "0.4.1" ]] || { echo "应用版本异常: $VERSION" >&2; exit 1; }

WECHAT_KF_ALLOW_MULTIPLE=1 \
WECHAT_KF_DESKTOP_USER_DATA="$USER_DATA" \
DESKTOP_CONTROL_PORT="$CONTROL_PORT" \
PORT="$AI_PORT" \
"$EXECUTABLE" >"$LOG_PATH" 2>&1 &
APP_PID=$!

wait_for_json "http://127.0.0.1:$CONTROL_PORT/health" "$TEMP_ROOT/control-health.json"
wait_for_json "http://127.0.0.1:$AI_PORT/health" "$TEMP_ROOT/ai-health.json"

curl -fsS --max-time 5 \
  -H 'content-type: application/json' \
  -d '{"query":"会员专区"}' \
  "http://127.0.0.1:$AI_PORT/knowledge/search" >"$TEMP_ROOT/knowledge.json"

node - "$TEMP_ROOT/control-health.json" "$TEMP_ROOT/ai-health.json" "$TEMP_ROOT/knowledge.json" <<'NODE'
const fs = require("fs");
const [controlPath, aiPath, knowledgePath] = process.argv.slice(2);
const control = JSON.parse(fs.readFileSync(controlPath, "utf8"));
const ai = JSON.parse(fs.readFileSync(aiPath, "utf8"));
const knowledge = JSON.parse(fs.readFileSync(knowledgePath, "utf8"));
if (!control.ok || control.app !== "小店AI客服" || !control.authRequired) throw new Error("本机控制服务健康状态异常");
if (!ai.ok || ai.serviceName !== "xiaodian-ai-service") throw new Error("本地 AI 服务健康状态异常");
if (!Array.isArray(knowledge.results) || !knowledge.results.length) throw new Error("打包知识库查询没有命中");
if (!knowledge.index || knowledge.index.files < 1 || knowledge.index.chunks < 1) throw new Error("打包知识库索引为空");
console.log(JSON.stringify({
  ok: true,
  app: control.app,
  pageReady: Boolean(control.page?.ready),
  aiService: ai.serviceName,
  knowledgeFiles: knowledge.index.files,
  knowledgeHits: knowledge.results.length
}, null, 2));
NODE

for runtime_file in desktop-config.json .env assistant-profile.json; do
  [[ -f "$USER_DATA/$runtime_file" ]] || { echo "首次运行未生成 $runtime_file" >&2; exit 1; }
done
for image_file in image1.png image2.png image3.jpg; do
  [[ -f "$USER_DATA/config/reply-images/$image_file" ]] || { echo "首次运行未初始化回复图片 $image_file" >&2; exit 1; }
done
if grep -Eiq 'ERR_MODULE_NOT_FOUND|Cannot find module|Uncaught Exception' "$LOG_PATH"; then
  cat "$LOG_PATH" >&2
  echo "打包应用出现缺模块错误" >&2
  exit 1
fi

printf '{"ok":true,"dmg":"%s","sha256":"%s","version":"%s","displayName":"%s"}\n' \
  "$DMG_PATH" \
  "$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')" \
  "$VERSION" \
  "$DISPLAY_NAME"
