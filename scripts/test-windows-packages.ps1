$ErrorActionPreference = "Stop"

function Assert-File([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label 不存在: $Path" }
  if ((Get-Item -LiteralPath $Path).Length -le 0) { throw "$Label 是空文件: $Path" }
}

function Test-AppLaunch([string]$ExePath, [string]$Label, [int]$ControlPort, [int]$AiPort) {
  $userData = Join-Path $env:RUNNER_TEMP ("xiaodian-ai-kefu-" + $Label + "-" + [guid]::NewGuid().ToString("N"))
  New-Item -Path $userData -ItemType Directory -Force | Out-Null

  $oldAllowMultiple = $env:WECHAT_KF_ALLOW_MULTIPLE
  $oldUserData = $env:WECHAT_KF_DESKTOP_USER_DATA
  $oldControlPort = $env:DESKTOP_CONTROL_PORT
  $oldAiPort = $env:PORT
  try {
    $env:WECHAT_KF_ALLOW_MULTIPLE = "1"
    $env:WECHAT_KF_DESKTOP_USER_DATA = $userData
    $env:DESKTOP_CONTROL_PORT = [string]$ControlPort
    $env:PORT = [string]$AiPort
    $launcher = Start-Process -FilePath $ExePath -PassThru

    $health = $null
    for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
      Start-Sleep -Milliseconds 500
      try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$ControlPort/health" -TimeoutSec 2
        if ($health.ok -and $health.app -eq "小店AI客服") { break }
      } catch {
        $health = $null
      }
    }
    if (-not $health) {
      $exit = if ($launcher.HasExited) { "，启动器退出码 $($launcher.ExitCode)" } else { "" }
      throw "$Label 未在规定时间内启动本机控制服务$exit"
    }

    $connection = Get-NetTCPConnection -LocalPort $ControlPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) { throw "$Label 已响应健康检查但未找到监听进程" }
    & taskkill.exe /PID $connection.OwningProcess /T /F | Out-Null
  } finally {
    $env:WECHAT_KF_ALLOW_MULTIPLE = $oldAllowMultiple
    $env:WECHAT_KF_DESKTOP_USER_DATA = $oldUserData
    $env:DESKTOP_CONTROL_PORT = $oldControlPort
    $env:PORT = $oldAiPort
    Remove-Item -Path $userData -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
$version = "0.3.9"
$unpackedExe = Join-Path $dist "win-unpacked\小店AI客服.exe"
$unpackedAsar = Join-Path $dist "win-unpacked\resources\app.asar"
$setup = Get-ChildItem -Path $dist -File -Filter "*.exe" |
  Where-Object { $_.Name -match "Setup" } |
  Sort-Object Length -Descending |
  Select-Object -First 1
$portable = Get-ChildItem -Path $dist -File -Filter "*.exe" |
  Where-Object { $_.Name -notmatch "Setup" } |
  Sort-Object Length -Descending |
  Select-Object -First 1

Assert-File $unpackedExe "Windows 解包版主程序"
Assert-File $unpackedAsar "Windows app.asar"
if (-not $setup) { throw "未找到 Windows Setup 安装包" }
if (-not $portable) { throw "未找到 Windows portable 安装包" }

node (Join-Path $root "scripts\check-packaged-resources.js") $unpackedAsar $version
if ($LASTEXITCODE -ne 0) { throw "Windows 解包版资源检查失败" }

Test-AppLaunch $unpackedExe "解包版" 19197 19187

$installDir = Join-Path $env:RUNNER_TEMP "xiaodian-ai-kefu-installed"
Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
$setupProcess = Start-Process -FilePath $setup.FullName -ArgumentList "/S", "/D=$installDir" -PassThru -Wait
if ($setupProcess.ExitCode -ne 0) { throw "Windows 安装包静默安装失败，退出码 $($setupProcess.ExitCode)" }

$installedExe = Get-ChildItem -Path $installDir -Recurse -File -Filter "小店AI客服.exe" | Select-Object -First 1
if (-not $installedExe) { throw "安装后未找到 小店AI客服.exe: $installDir" }
$installedAsar = Join-Path $installedExe.DirectoryName "resources\app.asar"
Assert-File $installedAsar "安装版 app.asar"
node (Join-Path $root "scripts\check-packaged-resources.js") $installedAsar $version
if ($LASTEXITCODE -ne 0) { throw "Windows 安装版资源检查失败" }
Test-AppLaunch $installedExe.FullName "安装版" 19297 19287

Test-AppLaunch $portable.FullName "便携版" 19397 19387

$uninstaller = Get-ChildItem -Path $installDir -Recurse -File -Filter "Uninstall*.exe" | Select-Object -First 1
if ($uninstaller) {
  Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait | Out-Null
}
Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Output (@{
  ok = $true
  unpacked = $unpackedExe
  setup = $setup.FullName
  portable = $portable.FullName
  checks = @("asar资源", "解包版启动", "安装版安装与启动", "便携版启动")
} | ConvertTo-Json -Depth 3)
