#!/bin/sh
# Menjalankan PocketBase di container (Railway).
#  - Mengikat [::] (dual-stack) agar bisa dijangkau lewat jaringan privat Railway (*.railway.internal).
#  - Data di volume (PB_DATA_DIR, default /pb/pb_data). Pasang volume di path itu.
#  - PB_IMPORT_MODE=true: hook produksi diganti pb_import_hooks (untuk import data). Setelah import, matikan.
set -eu
PB_HOME="${PB_HOME:-/pb}"
PORT="${PORT:-8090}"
DATA_DIR="${PB_DATA_DIR:-$PB_HOME/pb_data}"
HOOKS="$PB_HOME/pb_hooks"

if [ "${PB_IMPORT_MODE:-false}" = "true" ]; then
  HOOKS="$PB_HOME/pb_import_hooks"
  echo "[entrypoint] MODE IMPORT AKTIF: hook produksi dimatikan. Matikan PB_IMPORT_MODE setelah import selesai."
fi

for v in PB_ENCRYPTION_KEY PB_SUPERUSER_EMAIL PB_SUPERUSER_PASSWORD; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || { echo "[entrypoint] ERROR: variabel $v belum diisi" >&2; exit 1; }
done

mkdir -p "$DATA_DIR"
exec "$PB_HOME/pocketbase" serve \
  --http="[::]:${PORT}" \
  --encryptionEnv=PB_ENCRYPTION_KEY \
  --dir="$DATA_DIR" \
  --migrationsDir="$PB_HOME/pb_migrations" \
  --hooksDir="$HOOKS" \
  --hooksWatch=false
