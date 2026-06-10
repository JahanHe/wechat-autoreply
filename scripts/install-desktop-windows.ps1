$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

if (-not (Test-Path ".env")) {
  Write-Error "缺少 .env，请先配置 DEEPSEEK_API_KEY"
}

$electron = Join-Path $Root "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electron)) {
  Write-Error "缺少 Electron 可执行文件，请先执行 npm install"
}

$taskName = "XiaodianAIKefuDesktop"
$legacyTaskName = "WeChatKfDesktop"
$runner = Join-Path $Root "scripts\run-desktop-windows.ps1"
$powershell = (Get-Command powershell.exe).Source

foreach ($name in @($taskName, $legacyTaskName)) {
  $old = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($old) {
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
  }
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
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "小店AI客服桌面程序" | Out-Null

Start-ScheduledTask -TaskName $taskName

Write-Host "桌面程序守护已安装：$taskName"
Write-Host "日志：$env:TEMP\xiaodian-ai-kefu-desktop.log"
Write-Host "错误日志：$env:TEMP\xiaodian-ai-kefu-desktop.err.log"
