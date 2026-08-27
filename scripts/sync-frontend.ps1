$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Copy-Item -Recurse -Force (Join-Path $root "public\*") (Join-Path $root "frontend\public")
Write-Host "Assets sincronizados: public/ -> frontend/public/"
