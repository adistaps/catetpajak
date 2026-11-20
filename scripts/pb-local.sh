#!/usr/bin/env bash
# Menjalankan PocketBase (Linux/Mac) untuk tes lokal.
#   ./scripts/pb-local.sh            -> dengan hook, port 8090
#   ./scripts/pb-local.sh --no-hooks -> tanpa hook (WAJIB saat import data)
# Syarat: binary pocketbase di apps/pocketbase/ dan env PB_SUPERUSER_EMAIL,
# PB_SUPERUSER_PASSWORD, PB_ENCRYPTION_KEY sudah di-export.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/apps/pocketbase/pocketbase"
[ -x "$BIN" ] || { echo "Binary pocketbase tidak ditemukan/executable: $BIN" >&2; exit 1; }
for v in PB_SUPERUSER_EMAIL PB_SUPERUSER_PASSWORD PB_ENCRYPTION_KEY; do
  [ -n "${!v:-}" ] || { echo "Env $v belum di-set" >&2; exit 1; }
done
HOOKS="$ROOT/apps/pocketbase/pb_hooks"
if [ "${1:-}" = "--no-hooks" ]; then
  HOOKS="$ROOT/.local-data/empty_hooks"; mkdir -p "$HOOKS"
  echo "MODE IMPORT: hook dimatikan."
fi
mkdir -p "$ROOT/.local-data/pb_data"
exec "$BIN" serve --http=127.0.0.1:8090 --encryptionEnv=PB_ENCRYPTION_KEY \
  --dir="$ROOT/.local-data/pb_data" --migrationsDir="$ROOT/apps/pocketbase/pb_migrations" \
  --hooksDir="$HOOKS" --hooksWatch=false
