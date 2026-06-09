param(
  [string]$DeepSeekApiKey = "",
  [string]$WecomBotWebhookUrl = ""
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "未找到 Node.js，请先安装 Node.js 18+" -ForegroundColor Red
  Write-Host "下载地址：https://nodejs.org/"
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "未找到 npm，请先安装 Node.js 18+" -ForegroundColor Red
  exit 1
}

if (Test-Path ".env") {
  $existingWebhookLine = Get-Content ".env" | Where-Object { $_ -like "WECOM_BOT_WEBHOOK_URL=*" } | Select-Object -Last 1
  $existingWebhook = if ($existingWebhookLine) { $existingWebhookLine.Substring("WECOM_BOT_WEBHOOK_URL=".Length) } else { "" }
} else {
  $existingWebhook = ""
}

if (-not $WecomBotWebhookUrl -and -not $existingWebhook) {
  $WecomBotWebhookUrl = Read-Host "请输入企业微信群机器人 Webhook（必填）"
}

if (-not $WecomBotWebhookUrl -and -not $existingWebhook) {
  Write-Host "必须配置企业微信群机器人 Webhook，否则无法通知到人" -ForegroundColor Red
  Write-Host "也可以先运行：npm run configure:webhook -- `"https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key`""
  exit 1
}

if (-not (Test-Path ".env")) {
  if (-not $DeepSeekApiKey) {
    $secure = Read-Host "请输入 DeepSeek API Key" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $DeepSeekApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
  }

  $envText = @"
DEEPSEEK_API_KEY=$DeepSeekApiKey
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_THINKING=enabled
DEEPSEEK_REASONING_EFFORT=medium
DEEPSEEK_TIMEOUT_MS=80000
DEEPSEEK_REVIEW=enabled
PORT=8787
WECOM_BOT_WEBHOOK_URL=$WecomBotWebhookUrl
"@
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText((Join-Path $Root ".env"), $envText, $utf8NoBom)
}

if ($WecomBotWebhookUrl) {
  node scripts/configure-wecom-webhook.js $WecomBotWebhookUrl
}

npm install
npm run build-extension

powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-ai-server-windows.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-desktop-windows.ps1"

Write-Host ""
Write-Host "安装完成" -ForegroundColor Green
Write-Host ""
Write-Host "Chrome 插件加载目录："
Write-Host "$Root\dist\wechat-kf-extension"
Write-Host ""
Write-Host "打开 chrome://extensions"
Write-Host "开启“开发者模式”"
Write-Host "点击“加载已解压的扩展程序”"
Write-Host "选择上面的目录"
Write-Host ""
Write-Host "然后打开微信小店客服页："
Write-Host "https://store.weixin.qq.com/shop/kf"
Write-Host ""
Write-Host "独立桌面程序启动："
Write-Host "npm run desktop"
Write-Host ""
Write-Host "桌面程序守护已安装，登录后会自动运行，异常退出会由任务计划程序重启。"
