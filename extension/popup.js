const DEFAULTS = {
  configVersion: "0.3.4",
  enabled: true,
  aiFallback: true,
  aiEndpoint: "http://127.0.0.1:8787/reply",
  aiSlowMs: 15000,
  fallbackReplyMs: 60000
};

const enabled = document.querySelector("#enabled");
const aiFallback = document.querySelector("#aiFallback");
const aiEndpoint = document.querySelector("#aiEndpoint");
const apiKey = document.querySelector("#apiKey");
const setupCommand = document.querySelector("#setupCommand");
const copySetup = document.querySelector("#copySetup");
const checkServer = document.querySelector("#checkServer");
const testQuickReply = document.querySelector("#testQuickReply");
const copyKfUrl = document.querySelector("#copyKfUrl");
const status = document.querySelector("#status");

init();

async function init() {
  const config = await chrome.storage.local.get(DEFAULTS);
  enabled.checked = Boolean(config.enabled);
  aiFallback.checked = Boolean(config.aiFallback);
  aiEndpoint.value = config.aiEndpoint || DEFAULTS.aiEndpoint;
  renderStatus(config);

  enabled.addEventListener("change", save);
  aiFallback.addEventListener("change", save);
  aiEndpoint.addEventListener("change", save);
  checkServer.addEventListener("click", checkServerStatus);
  testQuickReply.addEventListener("click", testRandomQuickReply);
  apiKey.addEventListener("input", renderSetupCommand);
  copySetup.addEventListener("click", copySetupCommand);
  copyKfUrl.addEventListener("click", copyKfPageUrl);
  renderSetupCommand();
  checkServerStatus();
}

async function testRandomQuickReply() {
  const endpoint = (aiEndpoint.value || DEFAULTS.aiEndpoint).replace(/\/reply$/, "/quick-reply");
  status.className = "status";
  status.textContent = "正在测试随机快速回复...";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exclude: [] })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    status.className = "status ok";
    status.textContent = `随机回复：${data.text}`;
  } catch {
    status.className = "status error";
    status.textContent = "随机快速回复接口不可用，请确认本地 AI 后台服务正在运行";
  }
}

async function save() {
  const config = {
    configVersion: DEFAULTS.configVersion,
    enabled: enabled.checked,
    aiFallback: aiFallback.checked,
    aiEndpoint: aiEndpoint.value.trim() || DEFAULTS.aiEndpoint
  };
  await chrome.storage.local.set(config);
  renderStatus(config);
}

function renderStatus(config) {
  status.className = "status";
  status.textContent = config.enabled
    ? `状态：监听中${config.aiFallback ? "，AI 已开启" : "，仅规则回复"}`
    : "状态：已暂停，人工接管中";
}

async function checkServerStatus() {
  const endpoint = (aiEndpoint.value || DEFAULTS.aiEndpoint).replace(/\/reply$/, "/health");
  status.className = "status";
  status.textContent = "正在检查本地 AI 服务...";

  try {
    const response = await fetch(endpoint);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(`HTTP ${response.status}`);
    if (!data.hasKey) {
      status.className = "status error";
      status.textContent = "API 未配置：请在 .env 填入 DEEPSEEK_API_KEY，并重启 npm run ai-server";
      return;
    }

    status.className = "status ok";
    status.textContent = `API 已就绪：${data.model}，thinking=${data.thinking}，review=${data.review || "unknown"}`;
  } catch {
    status.className = "status error";
    status.textContent = "本地 AI 服务未启动：请先运行安装脚本启动后台服务";
  }
}

function renderSetupCommand() {
  const key = apiKey.value.trim();
  if (!key) {
    setupCommand.textContent = "请先填写 API Key";
    copySetup.disabled = true;
    return;
  }

  copySetup.disabled = false;
  setupCommand.textContent = isWindows()
    ? renderWindowsSetupCommand(key)
    : renderMacSetupCommand(key);
}

function renderMacSetupCommand(key) {
  return [
    "cd \"$HOME/Desktop/WeChat-chat\"",
    "npm install",
    "cat > .env <<'EOF'",
    `DEEPSEEK_API_KEY=${shellEscapeEnvValue(key)}`,
    "DEEPSEEK_MODEL=deepseek-v4-flash",
    "DEEPSEEK_THINKING=enabled",
    "DEEPSEEK_REASONING_EFFORT=medium",
    "DEEPSEEK_REVIEW=enabled",
    "PORT=8787",
    "WECOM_BOT_WEBHOOK_URL=",
    "EOF",
    "chmod +x scripts/install-ai-server-launch-agent.sh",
    "./scripts/install-ai-server-launch-agent.sh"
  ].join("\n");
}

function renderWindowsSetupCommand(key) {
  return [
    "cd \"$env:USERPROFILE\\Desktop\\WeChat-chat\"",
    "npm install",
    "$envText = @'",
    `DEEPSEEK_API_KEY=${powerShellHereStringValue(key)}`,
    "DEEPSEEK_MODEL=deepseek-v4-flash",
    "DEEPSEEK_THINKING=enabled",
    "DEEPSEEK_REASONING_EFFORT=medium",
    "DEEPSEEK_REVIEW=enabled",
    "PORT=8787",
    "WECOM_BOT_WEBHOOK_URL=",
    "'@",
    "$utf8NoBom = New-Object System.Text.UTF8Encoding($false)",
    "[System.IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $envText, $utf8NoBom)",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\install-on-windows.ps1"
  ].join("\n");
}

function isWindows() {
  return /Win/i.test(navigator.platform || navigator.userAgent || "");
}

function powerShellHereStringValue(value) {
  return value.replace(/\r?\n/g, "");
}

async function copySetupCommand() {
  const text = setupCommand.textContent;
  if (!text || text === "请先填写 API Key") return;
  await navigator.clipboard.writeText(text);
  const old = copySetup.textContent;
  copySetup.textContent = "已复制";
  setTimeout(() => {
    copySetup.textContent = old;
  }, 1200);
}

function shellEscapeEnvValue(value) {
  return value.replaceAll("\\\\", "\\\\\\\\").replaceAll("$", "\\$").replaceAll("`", "\\`");
}

async function copyKfPageUrl() {
  await navigator.clipboard.writeText("https://store.weixin.qq.com/shop/kf");
  const old = copyKfUrl.textContent;
  copyKfUrl.textContent = "已复制";
  setTimeout(() => {
    copyKfUrl.textContent = old;
  }, 1200);
}
