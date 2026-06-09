$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "未找到 Node.js，请先安装 Node.js 18+"
}

if (-not (Test-Path ".env")) {
  Write-Error "缺少 .env，请先配置 DEEPSEEK_API_KEY"
}

$taskName = "WeChatKfAiServer"
$runner = Join-Path $Root "scripts\run-ai-server-windows.ps1"
$powershell = (Get-Command powershell.exe).Source

$old = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($old) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
  -Execute $powershell `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`""

$trigger = New-ScheduledTaskTrigger -AtLogOn
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel LeastPrivilege
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "WeChat Shop customer service local AI server" | Out-Null

Start-ScheduledTask -TaskName $taskName

for ($i = 0; $i -lt 15; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 3
    $health | ConvertTo-Json -Compress
    exit 0
  } catch {
    Start-Sleep -Seconds 1
  }
}

Write-Error "AI 服务已提交给任务计划程序，但 15 秒内没有通过健康检查。请查看：$env:TEMP\wechat-kf-ai-server.err.log"
