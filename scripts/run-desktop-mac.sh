#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON_BIN="$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "缺少 Electron 可执行文件，请先在 $ROOT 执行 npm install" >&2
  exit 1
fi

cd "$ROOT"
exec "$ELECTRON_BIN" "$ROOT"
