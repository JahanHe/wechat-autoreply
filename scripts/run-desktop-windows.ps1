$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$electron = Join-Path $Root "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electron)) {
  Write-Error "缺少 Electron 可执行文件，请先执行 npm install"
}

$log = Join-Path $env:TEMP "wechat-kf-desktop.log"
$err = Join-Path $env:TEMP "wechat-kf-desktop.err.log"

& $electron $Root 1>> $log 2>> $err
