#!/usr/bin/env bash
# Menjalankan server web produksi. Dipanggil oleh catetpajak-web.service.
# Memuat Node lewat nvm (cara CloudPanel memasang Node untuk user situs).
# Rahasia dibaca dari apps/web/.env oleh Node (--env-file-if-exists).
set -euo pipefail
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || true
fi
cd "$(dirname "$0")/../apps/web"
export NODE_ENV=production
exec node --env-file-if-exists=.env server.ts
