#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js，请先安装 Node.js 18+"
  echo "Mac 可用 Homebrew 安装：brew install node"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm，请先安装 Node.js 18+"
  exit 1
fi

if [[ -z "${DEEPSEEK_API_KEY:-}" && ! -f .env ]]; then
  read -rsp "请输入 DeepSeek API Key: " DEEPSEEK_API_KEY
  echo
fi

if [[ -f .env ]]; then
  EXISTING_WEBHOOK="$(grep -E '^WECOM_BOT_WEBHOOK_URL=' .env | tail -1 | cut -d= -f2- || true)"
else
  EXISTING_WEBHOOK=""
fi

if [[ -z "${WECOM_BOT_WEBHOOK_URL:-}" && -z "$EXISTING_WEBHOOK" ]]; then
  read -rp "请输入企业微信群机器人 Webhook（必填）: " WECOM_BOT_WEBHOOK_URL
fi

if [[ -z "${WECOM_BOT_WEBHOOK_URL:-}" && -z "$EXISTING_WEBHOOK" ]]; then
  echo "必须配置企业微信群机器人 Webhook，否则无法通知到人"
  echo "也可以先运行：npm run configure:webhook -- \"https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key\""
  exit 1
fi

if [[ ! -f .env ]]; then
  cat > .env <<EOF
DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_THINKING=enabled
DEEPSEEK_REASONING_EFFORT=medium
DEEPSEEK_TIMEOUT_MS=80000
DEEPSEEK_REVIEW=enabled
PORT=8787
WECOM_BOT_WEBHOOK_URL=$WECOM_BOT_WEBHOOK_URL
EOF
fi

if [[ -n "${WECOM_BOT_WEBHOOK_URL:-}" ]]; then
  node scripts/configure-wecom-webhook.js "$WECOM_BOT_WEBHOOK_URL"
fi

npm install
npm run build-extension
chmod +x scripts/install-ai-server-launch-agent.sh
scripts/install-ai-server-launch-agent.sh
chmod +x scripts/install-desktop-launch-agent.sh
scripts/install-desktop-launch-agent.sh

cat <<EOF

安装完成

Chrome 插件加载目录：
$ROOT/dist/wechat-kf-extension

打开 chrome://extensions
开启“开发者模式”
点击“加载已解压的扩展程序”
选择上面的目录

然后打开微信小店客服页：
https://store.weixin.qq.com/shop/kf

独立桌面程序启动：
npm run desktop

桌面程序守护已安装，登录后会自动运行，异常退出会由 launchd 重启。
EOF
