# Panduan Deploy Monorepo CatetPajak ke Railway

Monorepo ini terdiri dari 2 service utama:
1. **PocketBase Service** (Backend Go / Database SQLite & Realtime)
2. **Web Service** (Node.js Express + React Router SSR)

---

## 🛠️ Langkah 1: Push Project ke GitHub

Buka PowerShell di folder project:
```powershell
cd c:\Users\user\Downloads\catetpajak
git init
git add .
git commit -m "feat: initial commit for railway deploy"
git branch -M main
git remote add origin https://github.com/USERNAME_ANDA/NAMA_REPO_ANDA.git
git push -u origin main
```

---

## 🚂 Langkah 2: Buat Project di Railway

1. Buka [Railway Dashboard](https://railway.app/dashboard).
2. Klik **New Project** -> Pilih **Deploy from GitHub repo**.
3. Pilih repository GitHub Anda.

---

## 📦 Langkah 3: Konfigurasi Service 1 (PocketBase)

1. Pada service pertama yang terbentuk dari repo, buka **Settings**:
   - **Service Name**: Ubah nama menjadi `pocketbase`.
   - **Root Directory**: Ubah menjadi `/apps/pocketbase`.
   - Railway otomatis mendeteksi file `Dockerfile` yang sudah kita buat di folder tersebut.
2. Tambahkan **Persistent Volume** (Wajib agar database tidak hilang saat restart):
   - Klik tab **Volumes** -> Klik **Add Volume**.
   - **Mount Path**: `/pb/pb_data`
3. Tambahkan **Environment Variables** (Tab Variables):
   - `PB_ENCRYPTION_KEY`: *(Isi dengan nilai PB_ENCRYPTION_KEY dari file .env Anda)*
   - `PORT`: `8090`
4. Di tab **Settings** -> **Networking**:
   - Klik **Generate Domain** (misal: `pocketbase-production-xxxx.up.railway.app`).
   - Catat URL ini atau gunakan Private Networking Railway: `http://pocketbase.railway.internal:8090`.

---

## 🌐 Langkah 4: Konfigurasi Service 2 (Web Frontend)

1. Di dalam project yang sama di Railway, klik **+ New** (di canvas) -> Pilih **GitHub Repo** (pilih repo yang sama).
2. Buka **Settings** pada service kedua ini:
   - **Service Name**: Ubah menjadi `web`.
   - **Root Directory**: Biarkan `/` (root monorepo).
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start --prefix apps/web`
3. Tambahkan **Environment Variables** (Tab Variables):
   - `NODE_ENV`: `production`
   - `PORT`: `3000`
   - `POCKETBASE_URL`: `http://pocketbase.railway.internal:8090` *(atau domain publik PocketBase dari Langkah 3)*
   - `PB_SUPERUSER_EMAIL`: *(dari .env)*
   - `PB_SUPERUSER_PASSWORD`: *(dari .env)*
   - `PB_ENCRYPTION_KEY`: *(dari .env)*
   - `WEBSITE_DOMAIN`: *(Domain publik web Anda di Railway, misal: catetpajak-web.up.railway.app)*
4. Di tab **Settings** -> **Networking**:
   - Klik **Generate Domain** untuk mendapatkan URL akses publik web CatetPajak.

---

## 📥 Langkah 5: Migrasi Data Awal (Opsional / Sekali Saja)

Setelah kedua service berjalan:
- Buka PocketBase admin di browser: `https://URL_POCKETBASE_ANDA/_/`
- Login dengan `PB_SUPERUSER_EMAIL` dan `PB_SUPERUSER_PASSWORD`.
- Buka URL publik web Anda di browser. Web CatetPajak siap digunakan!
