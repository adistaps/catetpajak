# Deploy CatetPajak ke Railway

Dua service dari satu repo: **pocketbase** (backend + database, pakai volume) dan **web** (aplikasi).
Panduan ini menggantikan versi sebelumnya, yang tidak bisa jalan karena folder `apps/pocketbase`
tidak pernah ter-push ke GitHub (lihat bagian 1).

> **Penting dibaca dulu: IP tetap untuk TDPSE.** Setahu saya Railway tidak memberi IP publik tetap untuk
> *masuk* ke aplikasi (domain-nya menunjuk ke infrastruktur bersama), jadi Railway **tidak memenuhi** tujuan
> awal klien (IP server untuk TDPSE). Gunakan Railway untuk uji coba/staging, dan VPS (`76.13.21.145`)
> untuk produksi. Silakan konfirmasi ke dokumentasi Railway sebelum memutuskan.

## 1. Perbaiki repo dulu (wajib)

`.gitignore` lama berisi `**/pocketbase`. Pola itu mengabaikan **folder** `apps/pocketbase`, bukan hanya
file binary-nya, sehingga seluruh skema database dan hook tidak ikut ke GitHub.
Paket ini sudah memperbaikinya dan menambahkan: `apps/pocketbase/` lengkap (+ `Dockerfile`, `entrypoint.sh`,
`pb_import_hooks/`), `Dockerfile.web`, `.dockerignore`, perbaikan script `start`, dan dukungan proxy Railway.

Salin isi paket ke folder proyek lokal (timpa), lalu:
```powershell
git add .
git status
git ls-files apps/pocketbase | findstr /i "Dockerfile entrypoint pb_migrations"   # harus ada hasilnya
git commit -m "Tambah backend PocketBase, Dockerfile Railway, perbaikan gitignore"
git push
```
Repo ini **publik**. Pastikan tidak ada `.env`, JSON data klien, atau `import-data\uploads` yang ikut
(`git status` sebelum commit). Sebaiknya jadikan repo **Private**: di Railway, izinkan akses repo private
saat menghubungkan GitHub.

## 2. Service `pocketbase`

Di project Railway: **+ New → GitHub Repo →** pilih repo ini.

**Settings**
- Service Name: `pocketbase`
- Root Directory: `/apps/pocketbase` (Dockerfile terdeteksi otomatis)
- Volume: tambah volume dengan Mount Path **`/pb/pb_data`** (tanpa ini database hilang setiap deploy)
- Replicas: **1** (SQLite, jangan di-scale)

**Variables**
| Nama | Isi |
|---|---|
| `PORT` | `8090` |
| `PB_ENCRYPTION_KEY` | 32 karakter acak. Simpan, tidak boleh berubah lagi (`node scripts/gen-secrets.mjs`) |
| `PB_SUPERUSER_EMAIL` | email admin |
| `PB_SUPERUSER_PASSWORD` | password panjang acak |
| `PB_IMPORT_MODE` | `true` (**sementara**, hanya untuk import) |

**Networking:** Generate Domain (**sementara**, hanya untuk import). Hapus setelah import (langkah 4).

Deploy. Di Logs harus muncul `MODE IMPORT AKTIF` dan `Server started`. Jika `ERROR: variabel ... belum diisi`,
lengkapi variabelnya.

## 3. Import data (dari laptop)

Siapkan `import-data\` (JSON ekspor) dan `import-data\uploads\` (file upload), lalu di PowerShell:
```powershell
npm install
$env:PB_URL = "https://<domain-pocketbase>.up.railway.app"
$env:PB_SUPERUSER_EMAIL = "<sama dengan di Railway>"
$env:PB_SUPERUSER_PASSWORD = "<sama dengan di Railway>"
node scripts/import-data.mjs --dry-run
node scripts/import-data.mjs
```
Script menolak jalan bila hook produksi aktif (artinya `PB_IMPORT_MODE` belum `true`). Pada mode import,
tanggal `created/updated` asli dipulihkan otomatis (baris "Tanggal asli dipulihkan"). Baca
`import-data\import-report.json`.

Opsional, aktifkan email (butuh password mailbox):
```powershell
$env:SMTP_PASSWORD = "<password mailbox info@catetpajak.com>"
$env:APP_URL = "https://<domain-web>/hcgi/platform"
node scripts/configure-smtp.mjs --test emailanda@contoh.com
```

## 4. Tutup mode import

1. Di service `pocketbase`: **hapus** variabel `PB_IMPORT_MODE` (atau ubah ke `false`). Railway akan redeploy.
2. Pastikan di Logs **tidak** ada `MODE IMPORT AKTIF`.
3. **Hapus domain publik** PocketBase (Settings → Networking). PocketBase hanya perlu dijangkau service `web`
   lewat jaringan privat. Login superuser memang diblokir di proxy web, tapi tidak ada alasan membiarkan
   PocketBase terbuka.

## 5. Service `web`

**+ New → GitHub Repo →** repo yang sama. (Service `web` yang sudah ada di canvas bisa dipakai; periksa
setiap pengaturan di bawah.)

**Settings**
- Service Name: `web`
- Root Directory: `/`
- Builder: Dockerfile. Jika tidak terdeteksi otomatis, isi variabel `RAILWAY_DOCKERFILE_PATH=Dockerfile.web`
- Build/Start Command: **kosongkan** (sudah di Dockerfile)

**Variables**
| Nama | Isi |
|---|---|
| `POCKETBASE_URL` | `http://${{pocketbase.RAILWAY_PRIVATE_DOMAIN}}:8090` |
| `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` | sama persis dengan service `pocketbase` |
| `WEBSITE_DOMAIN` | domain web tanpa `https://` |
| `INVOICE_PAY_SECRET` | minimal 32 karakter acak |
| `TRUST_PROXY` | `true` |
| `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | dari `node scripts/gen-secrets.mjs` |
| `ECOMMERCE_*`, `NEO_BANK_*` | hanya jika dipakai (lihat `apps/web/.env.example`) |

Jangan isi `PORT` (Railway menyuntikkannya, server membacanya otomatis) dan jangan isi `HOST`.
`VITE_VAPID_PUBLIC_KEY` dipakai saat **build**, jadi isi sebelum deploy pertama.

**Networking:** Generate Domain. Deploy (tombol **Deploy** di bar ungu, atau `⇧+Enter`).

## 6. Tes

- [ ] Halaman utama terbuka dan halaman login tampil
- [ ] Login berhasil (user hasil import memakai password acak: reset password lewat email, atau set manual lewat dashboard PocketBase)
- [ ] Data perusahaan, jurnal, transaksi, dan dokumen tampil; logo tampil
- [ ] Chat realtime berjalan
- [ ] **IP klien benar**: buka dashboard PocketBase (domain publik sementara) → Logs, dan lihat IP request Anda.
  Harus IP asli Anda, bukan IP internal Railway yang sama untuk semua orang. Jika salah, ubah
  `TRUSTED_IP_HEADER` (`xff-last` atau `xff-first`) lalu redeploy. Jika tidak dicek, pembatasan laju login
  bisa memukul semua user sekaligus.

## 7. Domain sendiri

Settings service `web` → Networking → Custom Domain, lalu buat record CNAME di DNS sesuai petunjuk Railway.
Setelah aktif, perbarui `WEBSITE_DOMAIN` dan (jika SMTP dipakai) `APP_URL` menjadi domain baru.

## 8. Yang perlu diketahui

- **Trial Railway** ("30 days or $5.00 left" di dashboard) akan habis; layanan butuh paket berbayar untuk terus berjalan.
- **Backup:** data ada di satu volume. Aktifkan backup volume di Railway, dan simpan salinan ekspor sendiri.
- **Data klien asli** akan berada di infrastruktur pihak ketiga. Pastikan klien setuju sebelum memakai data produksi untuk uji coba.
- Fitur yang bergantung pada platform Hostinger (AI, verifikasi bukti bayar otomatis, Ecommerce) tidak aktif, sama seperti di VPS.

## 9. Status pengujian

**Sudah diuji di sini:** build dan typecheck; container PocketBase disimulasikan lewat `entrypoint.sh`
(variabel wajib, mode import, mode produksi di volume yang sama); import 829 record dengan pemulihan tanggal otomatis
(824 record cocok); hook produksi tidak aktif di mode import dan aktif di mode produksi; web membaca `PORT` dari env;
proxy `/hcgi/platform`, blokir superuser, dan pemilihan header IP.

**Belum diuji:** build Docker sebenarnya (sandbox tanpa Docker; langkahnya sama dengan yang saya jalankan manual),
perilaku Railway itu sendiri (volume, jaringan privat IPv6, variabel referensi, `RAILWAY_DOCKERFILE_PATH`),
IPv6 (sandbox tanpa IPv6), dan header IP yang dikirim edge proxy Railway.
