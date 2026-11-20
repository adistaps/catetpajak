<#
 Menjalankan PocketBase di Windows untuk tes lokal.
   .\scripts\pb-local.ps1            -> PocketBase normal (dengan hook), port 8090
   .\scripts\pb-local.ps1 -NoHooks   -> tanpa hook (WAJIB saat import data)
 Syarat: pocketbase.exe ada di apps\pocketbase\ (unduh rilis windows_amd64 dari
 https://github.com/pocketbase/pocketbase/releases), dan env PB_SUPERUSER_EMAIL,
 PB_SUPERUSER_PASSWORD, PB_ENCRYPTION_KEY sudah di-set di jendela PowerShell ini.
#>
param([switch]$NoHooks, [int]$Port = 8090)

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'apps\pocketbase\pocketbase.exe'
if (-not (Test-Path $exe)) { Write-Error "pocketbase.exe tidak ditemukan di $exe"; exit 1 }
foreach ($v in 'PB_SUPERUSER_EMAIL', 'PB_SUPERUSER_PASSWORD', 'PB_ENCRYPTION_KEY') {
  if (-not (Get-Item "Env:$v" -ErrorAction SilentlyContinue)) { Write-Error "Env $v belum di-set"; exit 1 }
}

$data = Join-Path $root '.local-data\pb_data'
New-Item -ItemType Directory -Force -Path $data | Out-Null
$hooks = Join-Path $root 'apps\pocketbase\pb_hooks'
if ($NoHooks) {
  $hooks = Join-Path $root '.local-data\empty_hooks'
  New-Item -ItemType Directory -Force -Path $hooks | Out-Null
  Write-Host 'MODE IMPORT: hook dimatikan.' -ForegroundColor Yellow
}

& $exe serve "--http=127.0.0.1:$Port" --encryptionEnv=PB_ENCRYPTION_KEY "--dir=$data" `
  "--migrationsDir=$(Join-Path $root 'apps\pocketbase\pb_migrations')" "--hooksDir=$hooks" --hooksWatch=false
