# Migrasi catetpajak.com: Hostinger Horizons → VPS sendiri

Paket ini adalah hasil export Horizons yang sudah dirapikan agar bisa dijalankan di komputer lokal,
disimpan di GitHub, dan dipasang di VPS. Ikuti urutan: **A. tes lokal → B. push GitHub → C. VPS**.

## Isi paket

```
apps/web/          aplikasi web (React Router + Express, port 3000)
apps/pocketbase/   backend: pb_migrations + pb_hooks (binary dan data TIDAK ada di repo)
scripts/           import-data.mjs, configure-smtp.mjs, gen-secrets.mjs, pb-local.ps1/.sh
deploy/            service systemd, run-web.sh, deploy.sh, contoh env
import-data/       tempat JSON ekspor + folder uploads (isinya tidak di-commit)
```

## Perubahan dari export asli

| Perubahan | Alasan |
|---|---|
| `.gitignore` ditulis ulang: `.env`, `import-data/`, `pb_data/`, binary PocketBase dikecualikan | `.gitignore` asli **tidak** mengecualikan `.env`, push ke GitHub akan membocorkan kunci |
| `apps/web/.env` dihapus, diganti `.env.example` | rahasia tidak boleh ikut repo |
| Proxy `/hcgi/platform` → PocketBase ditambahkan di `apps/web/server.ts` | browser memakai path ini untuk login, realtime, dan file. Di Hostinger disediakan platform; di luar itu tidak ada |
| `cross-env` ditambahkan, script `dev`/`start` disesuaikan | agar `npm run dev/start` jalan di Windows |
| `bun.lock`/`bunfig.toml` diganti `package-lock.json` (npm) | satu cara install yang jalan di Windows dan Linux |
| `scripts/` dan `deploy/` ditambahkan | import data, SMTP, service systemd, deploy |

Kode aplikasi (`src/`) dan skema database (`pb_migrations`, `pb_hooks`) **tidak diubah**.

## Versi PocketBase

Export menyebut PocketBase `0.42.3`, tetapi rilis resmi dengan nomor itu tidak ada. Rilis terbaru yang
tersedia saat paket ini disiapkan adalah **v0.40.6**, dan semua pengujian di bawah memakai versi itu.
Jika kelak ada rilis resmi yang lebih baru, uji dulu di lokal sebelum dipakai di server.

---

## A. Tes di komputer lokal (Windows)

Syarat: Node 22 (minimal 22.18), Git, dan `pocketbase.exe` v0.40.6
(unduh `pocketbase_0.40.6_windows_amd64.zip` dari https://github.com/pocketbase/pocketbase/releases,
ekstrak `pocketbase.exe` ke folder `apps\pocketbase\`).

### 1. Install dan siapkan rahasia
```powershell
npm install
node scripts/gen-secrets.mjs
```
Salin nilai yang tercetak. Lalu set di jendela PowerShell yang sama (nilai contoh, ganti):
```powershell
$env:PB_SUPERUSER_EMAIL = "admin@catetpajak.com"
$env:PB_SUPERUSER_PASSWORD = "<dari gen-secrets>"
$env:PB_ENCRYPTION_KEY = "<32 karakter dari gen-secrets>"
```

### 2. Siapkan data
- Taruh semua file `*.json` hasil ekspor di folder `import-data\` (nama file bebas; kalau ada file
  lama dan baru untuk koleksi yang sama, id yang sama otomatis tidak ganda).
- Taruh file upload yang diunduh (logo, foto, lampiran, dll.) di `import-data\uploads\`
  dengan nama file persis seperti di panel.

### 3. Import data (PocketBase TANPA hook)
Terminal 1:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\pb-local.ps1 -NoHooks
```
Terminal 2 (di folder proyek, env yang sama):
```powershell
$env:PB_URL = "http://127.0.0.1:8090"
npm run import:data -- --dry-run     # simulasi, tidak menulis apa pun
npm run import:data                  # import sungguhan
```
Jika `npm run import:data -- --dry-run` bermasalah di PowerShell, pakai langsung:
`node scripts/import-data.mjs --dry-run` dan `node scripts/import-data.mjs`.

Buka `import-data\import-report.json` dan baca hasilnya (lihat bagian "Hasil yang diharapkan").
Hentikan terminal 1 dengan Ctrl+C, lalu **wajib** pulihkan tanggal dibuat/diubah asli
(PocketBase mengisinya dengan waktu import; tanpa ini masa uji coba 30 hari semua user mulai ulang dari hari ini):
```powershell
npm run import:timestamps -- .local-data\pb_data import-data
```
Butuh Node 22.13+. Perintah ini mengubah database langsung, sehingga PocketBase harus sudah berhenti.
Cadangan `data.db` dibuat otomatis.

> Kenapa tanpa hook? Hook PocketBase mengirim email verifikasi ke user yang dibuat dan membuat profil
> otomatis. Saat import itu berarti email ke user asli dan data ganda. Script menolak jalan kalau hook
> terdeteksi aktif.

### 4. Jalankan aplikasi penuh
Terminal 1 (kini DENGAN hook):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\pb-local.ps1
```
Terminal 2:
```powershell
copy apps\web\.env.example apps\web\.env
# isi apps\web\.env: POCKETBASE_URL=http://127.0.0.1:8090, PB_SUPERUSER_*, WEBSITE_DOMAIN, VAPID_*
npm run build
npm run start --prefix apps/web
```
Buka http://localhost:3000

### 5. Login untuk tes
Semua user diimport dengan password acak (password asli tidak bisa diekspor). Untuk tes lokal:
buka http://127.0.0.1:8090/_/ → login superuser → koleksi `users` → pilih akun → isi password baru →
lalu login di http://localhost:3000/login. Email reset password tidak terkirim di lokal karena SMTP belum diatur.

### Checklist tes
- [ ] Login berhasil dan daftar perusahaan muncul
- [ ] Jurnal, transaksi, dokumen, produk, karyawan, dan payslip tampil
- [ ] Logo/foto yang diunggah tampil
- [ ] Chat realtime berjalan (buka dua browser)
- [ ] Akun placeholder (nama "Akun terhapus ...", kode `X-...`) ada di perusahaan yang terdampak dan sudah dicek akuntan

---

## B. Push ke GitHub

Buat repo **Private** di GitHub (kosong, tanpa README). Lalu di folder proyek:
```powershell
git init
git add .
git status
```
**Sebelum commit, pastikan** daftar `git status` TIDAK memuat `.env`, `import-data\*.json`, `pb_data`,
`node_modules`, atau `pocketbase.exe`. Pemeriksaan cepat:
```powershell
git ls-files | findstr /i "\.env import-data pb_data node_modules pocketbase.exe"
```
Yang boleh muncul hanya `apps/web/.env.example`, `deploy/pocketbase.env.example`,
`import-data/README.md`. Setelah bersih:
```powershell
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:USERNAME/REPO.git
git push -u origin main
```
Data pelanggan (JSON ekspor) jangan pernah di-commit, bahkan ke repo private.

---

## C. Pasang di VPS (CloudPanel, Ubuntu 24.04)

Situs `catetpajak.com` (tipe Node.js, user `catetpajak`, port 3000) sudah dibuat di CloudPanel.
Di pengaturannya: Direktori Root = `catetpajak.com` (tanpa awalan `cd`), Node 22, port 3000.

> Langkah di bagian C **belum diuji di VPS ini**. Jalankan satu per satu dan baca hasilnya.

### 1. Folder dan binary PocketBase (sebagai root)
```bash
ssh root@76.13.21.145
apt update && apt install -y git unzip curl sqlite3
# swap 2 GB agar build tidak mati kehabisan memori (VPS 4 GB / 1 vCPU)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
mkdir -p /home/catetpajak/bin /home/catetpajak/pb_data /home/catetpajak/import-data/uploads
cd /tmp
curl -L -o pb.zip https://github.com/pocketbase/pocketbase/releases/download/v0.40.6/pocketbase_0.40.6_linux_amd64.zip
unzip -o pb.zip pocketbase -d /home/catetpajak/bin
chown -R catetpajak:catetpajak /home/catetpajak/bin /home/catetpajak/pb_data /home/catetpajak/import-data
```

### 2. Ambil kode dari GitHub (sebagai user catetpajak)
```bash
su - catetpajak
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub        # daftarkan di GitHub: repo → Settings → Deploy keys (read-only)
printf 'Host github.com\n  IdentityFile ~/.ssh/deploy_key\n' >> ~/.ssh/config
ls -la ~/htdocs/catetpajak.com   # lihat dulu isinya; folder situs baru biasanya hanya berisi file contoh
rm -rf ~/htdocs/catetpajak.com && git clone git@github.com:USERNAME/REPO.git ~/htdocs/catetpajak.com
```

### 3. File rahasia (sebagai user catetpajak)
```bash
cd ~/htdocs/catetpajak.com
cp deploy/pocketbase.env.example ~/pocketbase.env && chmod 600 ~/pocketbase.env
cp apps/web/.env.example apps/web/.env && chmod 600 apps/web/.env
nano ~/pocketbase.env      # isi PB_SUPERUSER_*, PB_ENCRYPTION_KEY (dari: node scripts/gen-secrets.mjs)
nano apps/web/.env         # isi POCKETBASE_URL=http://127.0.0.1:8090, PB_SUPERUSER_* (SAMA dengan di atas),
                           # WEBSITE_DOMAIN=catetpajak.com, VAPID_*, dan opsi lain sesuai keputusan klien
```
`PB_ENCRYPTION_KEY` harus sama selamanya untuk database ini. Simpan di password manager.

### 4. Build (sebagai user catetpajak)
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22   # jika nvm tidak ada, lihat versi Node di CloudPanel
npm ci && npm run build
chmod +x deploy/*.sh
```
Jika build gagal karena memori (VPS 4 GB), build di laptop lalu unggah folder `dist/` ke
`~/htdocs/catetpajak.com/dist`.

### 5. Service systemd (sebagai root)
```bash
cp /home/catetpajak/htdocs/catetpajak.com/deploy/pocketbase.service /etc/systemd/system/
cp /home/catetpajak/htdocs/catetpajak.com/deploy/catetpajak-web.service /etc/systemd/system/
systemctl daemon-reload
```
Jangan di-start dulu. Import data dulu (langkah 6).

### 6. Import data di VPS
Unggah JSON dan file upload ke `/home/catetpajak/import-data/` (SFTP/WinSCP, user `catetpajak`).
Lalu, sebagai user `catetpajak`, jalankan PocketBase **tanpa hook** di jendela SSH pertama:
```bash
set -a; . ~/pocketbase.env; set +a
mkdir -p ~/empty_hooks
~/bin/pocketbase serve --http=127.0.0.1:8090 --encryptionEnv=PB_ENCRYPTION_KEY \
  --dir=$HOME/pb_data --migrationsDir=$HOME/htdocs/catetpajak.com/apps/pocketbase/pb_migrations \
  --hooksDir=$HOME/empty_hooks --hooksWatch=false
```
Di jendela SSH kedua (user `catetpajak`):
```bash
cd ~/htdocs/catetpajak.com && set -a && . ~/pocketbase.env && set +a
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
PB_URL=http://127.0.0.1:8090 npm run import:data -- ~/import-data --dry-run
PB_URL=http://127.0.0.1:8090 npm run import:data -- ~/import-data
```
Setelah selesai, Ctrl+C di jendela pertama, lalu pulihkan tanggal asli (PocketBase harus sudah berhenti):
```bash
node scripts/restore-timestamps.mjs $HOME/pb_data $HOME/import-data
```
Lalu (root):
```bash
systemctl enable --now pocketbase catetpajak-web
systemctl status pocketbase catetpajak-web --no-pager
curl http://127.0.0.1:3000/hcgi/platform/api/health
```
Hapus JSON data dari server setelah dipastikan aman (`rm -r ~/import-data`), simpan salinannya di tempat aman.

### Akses admin PocketBase (superuser)
Login superuser **sengaja diblokir** dari internet (di proxy web dan di hook `block-superuser-via-proxy`).
Untuk membuka dashboard admin, buat terowongan SSH dari laptop, lalu buka di browser laptop:
```powershell
ssh -L 8090:127.0.0.1:8090 catetpajak@76.13.21.145
# lalu buka http://127.0.0.1:8090/_/
```

### 7. Email (SMTP)
Di Hostinger email dikirim lewat relay platform. Di VPS SMTP wajib diaktifkan, kalau tidak email reset
password dan undangan tidak terkirim. Dengan password mailbox `info@catetpajak.com` dari klien:
```bash
PB_URL=http://127.0.0.1:8090 SMTP_PASSWORD='<password mailbox>' \
APP_URL=https://catetpajak.com/hcgi/platform npm run smtp:configure -- --test emailanda@contoh.com
```
`APP_URL` memang berakhir `/hcgi/platform`: link di email reset password dan undangan dibangun dari nilai
ini, dan tanpa itu link tidak sampai ke PocketBase.

### 8. Tes sebelum DNS dipindah
Di laptop, tambahkan baris ini ke `C:\Windows\System32\drivers\etc\hosts` (sebagai Administrator):
```
76.13.21.145 catetpajak.com
```
Buka https://catetpajak.com (akan ada peringatan sertifikat sementara, normal). Lakukan checklist tes di bagian A.
**Hapus baris itu setelah selesai tes.**

### 9. Pindah DNS dan SSL
1. Di pengelola DNS domain, ubah record A `catetpajak.com` (dan `www` jika ada) ke `76.13.21.145`.
2. Setelah DNS menyebar, di CloudPanel: situs → SSL/TLS → Let's Encrypt.
3. Jangan buka port 3000 dan 8090 di firewall. Hanya 80/443 (dan 22/8443 sesuai kebutuhan).
4. Jika chat/telepon realtime tidak jalan, tambahkan di Vhost situs (CloudPanel) pada blok `location /`:
   `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`
5. Pastikan Nginx CloudPanel menulis `X-Forwarded-For` (dipakai untuk pembatasan laju per IP):
   `grep -rn "X-Forwarded-For\|X-Real-IP" /etc/nginx/sites-enabled/catetpajak.com.conf`
   Harus ada `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Jika tidak ada, tambahkan di Vhost.
6. Aktifkan backup harian di hPanel (backup mingguan saja kurang untuk data keuangan).
7. Setelah semuanya stabil, IP `76.13.21.145` siap didaftarkan di TDPSE.

### Update berikutnya
```bash
git push                                            # dari laptop
bash /home/catetpajak/htdocs/catetpajak.com/deploy/deploy.sh   # di VPS, sebagai root
```
`deploy.sh` membuat cadangan `pb_data`, menarik kode, build, lalu restart. Migrasi skema berjalan otomatis.

---

## Hasil yang diharapkan dari import (data ekspor saat paket ini disiapkan)

- 829 record dalam 55 koleksi → **827 masuk, 2 dilewati, 0 gagal.**
- Dilewati (relasi wajib menunjuk data yang sudah dihapus di sistem lama): 1 `company_members`
  (user terhapus) dan 1 `product_stocks` (gudang terhapus).
- **10 akun placeholder** dibuat untuk akun yang sudah terhapus tetapi masih dirujuk transaksi
  (semuanya perusahaan PT Kurya). Tipe default `aset`; mohon akuntan meninjau dan mengganti nama/tipe.
- **154 record** yang pemiliknya (satu user yang sudah dihapus) diganti pemilik perusahaannya.
- 97 relasi opsional ke data yang sudah tidak ada dikosongkan (kontak, gudang, siswa, pengirim chat, dll.).
- 21 data bawaan migrasi (`feature_flags`, `plan_prices`, `events`) diganti data live.
  `events` dan `promos` masih punya 2 dan 1 record bawaan ekstra yang tidak ada di ekspor (informasi di laporan).
- **27 user diimport dengan password acak** → semua wajib reset password.
- 25 file upload perlu diunduh dari panel Hostinger dan ditaruh di `import-data/uploads/`. File yang tidak
  ditemukan dicatat di laporan dan kolomnya dikosongkan.

## Keputusan klien yang sudah ditetapkan

- PocketBase **v0.40.6** (isi `apps/pocketbase/.pocketbase-version` = 0.42.3 sengaja TIDAK diubah: file itu hanya
  dipakai hook tema halaman reset password untuk mengambil tampilan dari CDN, dan jika gagal otomatis memakai tampilan standar).
- Langganan: **transfer manual**. Hostinger Ecommerce tidak dipakai; seluruh `ECOMMERCE_*` dikosongkan.
  Tanpa konfigurasi itu aplikasi tidak lagi memanggil toko Hostinger (halaman `/plans` dan `/akuntan/langganan` tetap tampil).
- Harga: Pro Rp299.000, Enterprise Rp499.000 per bulan (sudah sesuai kode dan data `plan_prices`).
- Build dilakukan di VPS lewat `deploy/deploy.sh` (tanpa CI). Jika gagal karena memori: `bash deploy/deploy.sh --skip-build`
  setelah `npm run build` di laptop dan folder `dist/` diunggah ke root repo di server.

## Perbaikan keamanan yang sudah diterapkan di paket ini

Lihat `CATATAN-PERBAIKAN.md`. **Wajib:** isi `INVOICE_PAY_SECRET` di `apps/web/.env` (dicetak oleh `node scripts/gen-secrets.mjs`).
Tanpa itu server produksi menolak membuat/memeriksa tautan bayar invoice. **Tautan bayar invoice yang sudah
> terlanjur dikirim ke pelanggan tidak akan berlaku lagi** (secret lama tertulis di kode dan sengaja dibuang).

## Fitur yang berbeda dari Hostinger (perlu keputusan klien)

| Fitur | Status di VPS |
|---|---|
| Email verifikasi/reset/undangan | Aktif setelah SMTP diatur (C.7) |
| Langganan | Transfer manual (diputuskan klien). Hostinger Ecommerce tidak dipakai |
| AI bawaan dan verifikasi bukti bayar otomatis | Tidak aktif (`PROXY_ENTRANCE_ID` hanya ada di platform Hostinger) |
| Pencairan gaji Neo Bank | Butuh `NEO_BANK_*` dari klien |
| Halaman tema reset password | Hook mencoba mengambil tampilan dari CDN Hostinger; jika gagal otomatis memakai tampilan standar PocketBase |

## Peninjauan lanjutan (v3)

Paket ini sudah ditinjau ulang dan diuji ulang. Tiga masalah ditemukan dan sudah diperbaiki:
1. **Blokir superuser di proxy bisa ditembus** (`%5Fsuperusers`, id koleksi `pbc_3142635823`). Kini path didekode dan
   id koleksi ikut diblokir, ditambah lapis kedua di PocketBase (hook `block-superuser-via-proxy`).
2. **IP klien masih bisa dipalsukan** lewat `X-Real-IP` (dibaca rate limiter aplikasi). Kini ditimpa dengan IP terverifikasi.
3. **Tanggal `created`/`updated` hilang saat import** (semua terlihat dibuat hari import, masa uji coba user mulai ulang).
   Dipulihkan oleh `scripts/restore-timestamps.mjs`. Lihat `CATATAN-PERBAIKAN.md`.

## Apa yang sudah dan belum diuji

**Sudah diuji** (PocketBase v0.40.6, Node 22, Linux):
- Semua migrasi dan hook dimuat tanpa error; PocketBase dengan hook lengkap hidup di atas data hasil import.
- Import penuh dari data ekspor asli (dry-run dan sungguhan), termasuk pemasangan file upload dan pengaman hook.
- `npm run typecheck` dan `npm run build` lolos.
- Server web produksi: halaman utama dan login 200; login, file upload, dan koneksi realtime lewat proxy
  `/hcgi/platform`; alur reset password end-to-end (email tertangkap, ganti password, login).
- Script SMTP mengubah pengaturan dengan benar.
- Pemulihan tanggal asli (27 dari 27 user cocok), blokir superuser (9 variasi path, kedua lapis), penimpaan IP palsu,
  aturan baru pendaftaran event (tolak "lunas" palsu dan update langsung, upload bukti lewat route server).

**Belum diuji:** script `.ps1` dan `pocketbase.exe` di Windows, `npm run dev` (mode pengembangan),
seluruh langkah bagian C di VPS (CloudPanel, systemd), tampilan di browser (hanya level HTTP),
dan fitur Ecommerce, AI, Neo Bank.
