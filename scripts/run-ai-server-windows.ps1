$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$log = Join-Path $env:TEMP "wechat-kf-ai-server.log"
$err = Join-Path $env:TEMP "wechat-kf-ai-server.err.log"

node server.js 1>> $log 2>> $err
