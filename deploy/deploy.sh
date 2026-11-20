#!/usr/bin/env bash
# Update aplikasi di VPS: cadangan, tarik kode, install, build, restart.
# Jalankan sebagai root:  bash /home/catetpajak/htdocs/catetpajak.com/deploy/deploy.sh [--skip-build]
#   --skip-build : jangan build di server (build di laptop lalu unggah folder dist/ (di root repo, hasil build ke dist/apps/web) ke server.
#                  Dipakai jika build di VPS gagal karena memori.
# Data (pb_data) tidak disentuh. Migrasi skema PocketBase berjalan otomatis saat service restart.
set -euo pipefail
SITE_USER=catetpajak
APP_DIR=/home/${SITE_USER}/htdocs/catetpajak.com
SKIP_BUILD=0
[ "${1:-}" = "--skip-build" ] && SKIP_BUILD=1

# ---- cadangan database yang KONSISTEN ----
# Menyalin file SQLite saat PocketBase berjalan bisa menghasilkan cadangan rusak.
# Utamakan sqlite3 .backup; kalau tidak ada, hentikan PocketBase sebentar.
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/home/${SITE_USER}/backup-${STAMP}
mkdir -p "$BACKUP_DIR"
PB_DATA=/home/${SITE_USER}/pb_data
if command -v sqlite3 >/dev/null 2>&1; then
  for db in data.db auxiliary.db; do
    [ -f "$PB_DATA/$db" ] && sqlite3 "$PB_DATA/$db" ".backup '$BACKUP_DIR/$db'"
  done
  [ -d "$PB_DATA/storage" ] && cp -a "$PB_DATA/storage" "$BACKUP_DIR/storage"
  tar -czf "${BACKUP_DIR}.tar.gz" -C /home/${SITE_USER} "backup-${STAMP}"
else
  echo "sqlite3 tidak ada: menghentikan PocketBase sebentar untuk cadangan (apt install sqlite3 untuk menghindarinya)"
  systemctl stop pocketbase
  tar -czf "${BACKUP_DIR}.tar.gz" -C /home/${SITE_USER} pb_data
  systemctl start pocketbase
fi
rm -rf "$BACKUP_DIR"
chown ${SITE_USER}:${SITE_USER} "${BACKUP_DIR}.tar.gz"
echo "Cadangan: ${BACKUP_DIR}.tar.gz"

runuser -l ${SITE_USER} -c "
  set -e
  export NVM_DIR=\"\$HOME/.nvm\"; [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && nvm use 22 >/dev/null
  cd ${APP_DIR}
  git pull --ff-only
  npm ci --no-audit --no-fund
  if [ ${SKIP_BUILD} -eq 0 ]; then NODE_OPTIONS=--max-old-space-size=2048 npm run build; else echo 'Lewati build (--skip-build)'; fi
"
chmod +x ${APP_DIR}/deploy/run-web.sh
systemctl restart pocketbase catetpajak-web
sleep 3
systemctl is-active pocketbase catetpajak-web
curl -fsS http://127.0.0.1:3000/hcgi/platform/api/health && echo
