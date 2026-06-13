$ErrorActionPreference = "Stop"

function Assert-File([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label does not exist: $Path" }
  if ((Get-Item -LiteralPath $Path).Length -le 0) { throw "$Label is empty: $Path" }
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
        if ($health.ok -and $health.tokenConfigured) { break }
      } catch {
        $health = $null
      }
    }
    if (-not $health) {
      $exit = if ($launcher.HasExited) { "; launcher exit code $($launcher.ExitCode)" } else { "" }
      throw "$Label did not start the local control service in time$exit"
    }

    $connection = Get-NetTCPConnection -LocalPort $ControlPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) { throw "$Label health responded but no listener process was found" }
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
$version = "0.4.6"
$unpackedExe = Get-ChildItem -Path (Join-Path $dist "win-unpacked") -File -Filter "*.exe" |
  Where-Object { $_.Name -notmatch "Uninstall" } |
  Sort-Object Length -Descending |
  Select-Object -First 1
$unpackedAsar = Join-Path $dist "win-unpacked\resources\app.asar"
$setup = Get-ChildItem -Path $dist -File -Filter "*.exe" |
  Where-Object { $_.Name -match "Setup" } |
  Sort-Object Length -Descending |
  Select-Object -First 1
$portable = Get-ChildItem -Path $dist -File -Filter "*.exe" |
  Where-Object { $_.Name -notmatch "Setup" } |
  Sort-Object Length -Descending |
  Select-Object -First 1

if (-not $unpackedExe) { throw "Windows unpacked executable was not found" }
Assert-File $unpackedExe.FullName "Windows unpacked executable"
Assert-File $unpackedAsar "Windows app.asar"
if (-not $setup) { throw "Windows Setup package was not found" }
if (-not $portable) { throw "Windows portable package was not found" }

node (Join-Path $root "scripts\check-packaged-resources.js") $unpackedAsar $version
if ($LASTEXITCODE -ne 0) { throw "Windows unpacked resource check failed" }

Test-AppLaunch $unpackedExe.FullName "unpacked" 19197 19187

$installDir = Join-Path $env:RUNNER_TEMP "xiaodian-ai-kefu-installed"
Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
$setupProcess = Start-Process -FilePath $setup.FullName -ArgumentList "/S", "/D=$installDir" -PassThru -Wait
if ($setupProcess.ExitCode -ne 0) { throw "Windows silent install failed with exit code $($setupProcess.ExitCode)" }

$installedExe = Get-ChildItem -Path $installDir -Recurse -File -Filter "*.exe" |
  Where-Object { $_.Name -notmatch "Uninstall" } |
  Sort-Object Length -Descending |
  Select-Object -First 1
if (-not $installedExe) { throw "Installed application executable was not found: $installDir" }
$installedAsar = Join-Path $installedExe.DirectoryName "resources\app.asar"
Assert-File $installedAsar "Installed app.asar"
node (Join-Path $root "scripts\check-packaged-resources.js") $installedAsar $version
if ($LASTEXITCODE -ne 0) { throw "Windows installed resource check failed" }
Test-AppLaunch $installedExe.FullName "installed" 19297 19287

Test-AppLaunch $portable.FullName "portable" 19397 19387

$uninstaller = Get-ChildItem -Path $installDir -Recurse -File -Filter "Uninstall*.exe" | Select-Object -First 1
if ($uninstaller) {
  Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait | Out-Null
}
Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Output (@{
  ok = $true
  unpacked = $unpackedExe.FullName
  setup = $setup.FullName
  portable = $portable.FullName
  checks = @("asar-resources", "unpacked-launch", "installed-launch", "portable-launch")
} | ConvertTo-Json -Depth 3)
