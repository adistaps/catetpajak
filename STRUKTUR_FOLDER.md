# 🗺️ Struktur Folder & Panduan Kode — CatetPajak (`apps/web`)

Dokumen ini memetakan seluruh file di dalam `apps/web/src`, menjelaskan fungsi setiap modul, halaman (pages), API backend, komponen, serta pustaka helper agar proyek mudah dipahami, dimaintenance, dan dikembangkan.

Struktur folder rute (`src/routes/`) telah dirapikan ke dalam sub-folder modular berdasarkan fungsi dan hak akses pengguna.

---

## 📁 1. Ringkasan Struktur Direktori Utama

```
apps/web/src/
├── routes.ts                 # Peta routing utama (React Router v7)
├── root.tsx                  # Root HTML shell, Provider & Global layout
├── entry.client.tsx          # Hydration React di browser
├── entry.server.tsx          # Server-Side Rendering (SSR) handler
│
├── routes/                   # File halaman & Endpoint API backend (Sudah Dirapikan)
│   ├── landing/              # Halaman publik, login, fitur, checkout bayar
│   ├── app/                  # Dashboard utama aplikasi (Owner, Karyawan, HR, Akuntansi)
│   ├── admin/                # Dashboard Superadmin Pusat (Tenant, Lisensi, dll)
│   ├── akuntan/              # Portal komunitas akuntan publik & klien
│   ├── parent/               # Portal orang tua siswa / tagihan sekolah
│   └── api/                  # Endpoint backend server-side (loader/action)
│
├── components/               # Komponen UI React
│   ├── ui/                   # Komponen primitif (Button, Modal, Input, Badge, dll)
│   ├── app/                  # Komponen modul dashboard aplikasi (/app/*)
│   ├── admin-pusat/          # Komponen dashboard Superadmin Pusat
│   ├── akuntan/              # Komponen komunitas / portal akuntan
│   ├── parent/               # Komponen portal Parent / Orang Tua
│   ├── home/                 # Komponen landing page depan
│   ├── fitur/ & solusi/      # Komponen showcase fitur & solusi
│   └── bayar/ & plans/       # Komponen checkout & paket langganan
│
├── lib/                      # Business logic, service, kalkulasi & SDK
├── hooks/                    # Custom React hooks (auth, mobile, dll)
├── constants/                # Nilai konstan aplikasi
├── data/                     # Data statis & dummy
└── realtime/                 # Handler WebSocket / Realtime event
```

---

## 🌐 2. Peta Halaman (Pages / Routes) & Lokasi File

React Router v7 mendefinisikan rute di `src/routes.ts`.

### 🏠 A. Halaman Publik & Landing Page (`src/routes/landing/`)
| URL Path | Lokasi File Rute | Komponen Terkait (`src/components/`) | Keterangan |
| :--- | :--- | :--- | :--- |
| `/` | `routes/landing/home.tsx` | `components/home/*` | Halaman utama CatetPajak |
| `/event` | `routes/landing/event.tsx` | `components/event/*` | Event & webinar |
| `/fitur` | `routes/landing/fitur-index.tsx` | `components/fitur/*` | Daftar seluruh fitur |
| `/fitur/:slug` | `routes/landing/fitur-detail.tsx` | `components/fitur/*` | Detail spesifik fitur |
| `/solusi/:slug` | `routes/landing/solusi-detail.tsx` | `components/solusi/*` | Halaman solusi industri |
| `/plans` | `routes/landing/plans.tsx` | `components/plans/*` | Paket harga & fitur plan |
| `/subscriptions` | `routes/landing/subscriptions.tsx` | - | Status / manajemen langganan |
| `/bayar/:token` | `routes/landing/bayar.$token.tsx` | `components/bayar/*` | Halaman bayar invoice publik |
| `/bayar/:token/pdf`| `routes/landing/bayar.pdf.ts` | - | Unduh PDF tagihan publik |
| `/login` | `routes/landing/login.tsx` | - | Halaman masuk sistem |

---

### 🏢 B. Dashboard Aplikasi Utama (`src/routes/app/`)
> **Layout Induk:** `src/routes/app/app.tsx` (Mengatur sidebar, header profil, switch perusahaan, dan role context).

| Menu Dashboard | URL Path | File Rute (`src/routes/app/`) | File Komponen / Logic Terkait |
| :--- | :--- | :--- | :--- |
| **Dasbor Utama** | `/app` & `/app/dasbor` | `app.home.tsx`, `app.dasbor.tsx` | `components/app/dasbor/*`, `lib/accounting.ts` |
| **Penjualan** | `/app/penjualan` | `app.penjualan.tsx` | `components/app/penjualan/*` |
| ↳ Buat Penjualan | `/app/penjualan/buat` | `app.penjualan.buat.tsx` | Form invoice/order penjualan |
| ↳ Lihat / Cetak Dokumen | `/app/penjualan/dokumen/*` | `app.penjualan.dokumen.tsx`, `app.penjualan.dokumen-buat.tsx` | Template invoice, surat jalan, PDF |
| **Pembelian** | `/app/pembelian` | `app.pembelian.tsx` | `components/app/pembelian/*` |
| ↳ Buat Pembelian | `/app/pembelian/buat` | `app.pembelian.buat.tsx` | PO dan tagihan pemasok |
| ↳ Dokumen Pembelian | `/app/pembelian/dokumen/*` | `app.pembelian.dokumen.tsx`, `app.pembelian.dokumen-buat.tsx` | Faktur tagihan & penerimaan barang |
| **Kas & Bank** | `/app/kas-bank` | `app.kas-bank.tsx`, `app.kas-bank.buat.tsx` | Transfer, mutasi kas, rekonsiliasi |
| **Biaya / Beban** | `/app/biaya` | `app.biaya.tsx`, `app.biaya.buat.tsx`, `app.biaya.ubah.tsx` | Catatan pengeluaran operasional |
| **Kontak** | `/app/kontak` | `app.kontak.tsx`, `app.kontak.buat.tsx`, `app.kontak.ubah.tsx` | Pelanggan, vendor, karyawan, mitra |
| **Produk & Stok** | `/app/produk` | `app.produk.tsx`, `app.produk.buat.tsx`, `app.produk.ubah.tsx` | Katalog barang/jasa |
| ↳ Gudang & Transfer | `/app/produk/gudang`, `/transfer` | `app.produk.gudang.tsx`, `app.produk.transfer.tsx` | Multi-gudang & mutasi |
| ↳ Stok Opname | `/app/produk/opname` | `app.produk.opname.tsx` | Penyesuaian fisik stok |
| **Aset Tetap** | `/app/aset` | `app.aset.tsx`, `app.aset.buat.tsx`, `app.aset.daftar.tsx` | Penyusutan & nilai buku |
| **Akun (COA)** | `/app/akun` | `app.akun.tsx`, `app.akun.buat.tsx`, `app.akun.saldo-awal.tsx` | Chart of Accounts & saldo awal |
| **Buku Jurnal** | `/app/jurnal` | `app.jurnal.tsx`, `app.jurnal.buat.tsx`, `app.jurnal.ubah.tsx` | Jurnal umum (debit/kredit) |
| **Laporan Keuangan** | `/app/laporan` | `app.laporan.tsx` | Laba Rugi, Neraca, Arus Kas, Buku Besar |
| **Pajak** | `/app/pajak` | `app.pajak.tsx`, `app.pajak.simulasi.tsx`, `app.pajak.unifikasi.tsx` | PPh 21, PPh Final UMKM, PPN |
| **POS (Kasir)** | `/app/pos` | `app.pos.tsx`, `app.pos.meja.tsx`, `app.pos.riwayat.tsx` | Point of Sale kasir & meja makan |
| **Karyawan (HR)** | `/app/karyawan` | `app.karyawan.tsx` | Biodata, cuti, absensi, ESS Karyawan |
| **Payroll** | `/app/payroll` | `app.payroll.tsx` | Gaji, tunjangan, potongan, slip gaji |
| **Manajemen HR** | `/app/management/*` | `app.management.performance.tsx`, `training.tsx` | KPI & pelatihan karyawan |
| **Chat Internal** | `/app/chat` | `app.chat.tsx` | `components/app/chat-module.tsx`, `lib/chat.ts` |
| **Pengaturan** | `/app/pengaturan` | `app.pengaturan.tsx` | Profil perusahaan, cabang, integrasi |
| **Pengguna** | `/app/pengguna` | `app.pengguna.tsx` | Role & hak akses anggota tim |

---

### 👨‍💼 C. Portal Akuntan Komunitas (`src/routes/akuntan/`)
| URL Path | Lokasi File Rute | Keterangan |
| :--- | :--- | :--- |
| `/akuntan` | `routes/akuntan/akuntan.tsx` | Portal direktori & marketplace jasa akuntan |
| `/akuntan/masuk` | `routes/akuntan/akuntan.masuk.tsx` | Login khusus akuntan |
| `/akuntan/dasbor` | `routes/akuntan/akuntan.dasbor.tsx` | Dashboard akuntan mengelola klien |
| `/akuntan/activity` | `routes/akuntan/akuntan.activity.tsx` | Aktivitas & interaksi klien |
| `/akuntan/langganan`| `routes/akuntan/akuntan.langganan.tsx` | Status langganan mitra akuntan |
| `/akuntan/posting` | `routes/akuntan/akuntan.posting.tsx` | Forum & publikasi artikel akuntansi |
| `/akuntan/profil/:id`| `routes/akuntan/akuntan.profil.tsx` | Portofolio publik seorang akuntan |

---

### 🎓 D. Portal Parent / Sekolah (`src/routes/parent/`)
| URL Path | Lokasi File Rute | Keterangan |
| :--- | :--- | :--- |
| `/app/parent` | `routes/parent/parent.tsx` | Layout dasar portal orang tua |
| `/app/parent/dashboard` | `routes/parent/parent.dashboard.tsx` | Ringkasan tagihan sekolah anak |
| `/app/parent/riwayat-pembayaran`| `routes/parent/parent.riwayat-pembayaran.tsx` | Riwayat transaksi SPP/kegiatan |
| `/app/parent/pengumuman` | `routes/parent/parent.pengumuman.tsx` | Pengumuman dari sekolah/yayasan |
| `/app/parent/chat` | `routes/parent/parent.chat.tsx` | Komunikasi pesan dengan staf sekolah |
| `/app/parent/pengaturan` | `routes/parent/parent.pengaturan.tsx` | Pengaturan akun orang tua |

---

### 👑 E. Admin Pusat / Superadmin (`src/routes/admin/`)
| URL Path | Lokasi File Rute | Keterangan |
| :--- | :--- | :--- |
| `/admin-pusat` | `routes/admin/admin-pusat.tsx` | Mengelola seluruh tenant perusahaan, user global, lisensi, pembayaran manual, event, dan feature flags. |

---

## ⚡ 3. Endpoint API Backend (`src/routes/api/`)

File-file ini adalah endpoint server-side (loader/action) yang dijalankan oleh Express / SSR:

| Kategori API | Lokasi File Endpoint | Fungsi |
| :--- | :--- | :--- |
| **Autentikasi & Akun** | `routes/api/api.login-lookup.ts` | Cek role, tipe akun, dan redirect login |
| | `routes/api/api.my-companies.ts` | Ambil daftar perusahaan milik user |
| | `routes/api/api.company-members.ts` | Kelola member/staf perusahaan |
| **Chat & Komunikasi** | `routes/api/api.chat.peers.ts` | Ambil kontak (karyawan + owner) |
| | `routes/api/api.chat.parent-peers.ts`| Ambil kontak parent untuk sekolah |
| | `routes/api/api.push-call.ts` | Notifikasi panggilan suara/video |
| **Admin Pusat** | `routes/api/api.central-admin.*.ts` | CRUD perusahaan, user, promo, SMTP, dan aktivasi paket |
| **Portal Akuntan** | `routes/api/api.akuntan.*.ts` | Profil akuntan, postingan artikel, verifikasi bayar |
| **Invoice & Bayar** | `routes/api/api.invoice-payments.ts` | Hitung nominal unik & status bayar invoice |
| | `routes/api/api.public-invoice-pay.ts`| Konfirmasi pembayaran dari pihak luar |
| | `routes/api/api.parent.pay-invoice.ts`| Pembayaran tagihan sekolah oleh parent |
| **Integrasi & Utilitas**| `routes/api/api.health.ts` | Healthcheck server & PocketBase |
| | `routes/api/api.neo-bank.*.ts` | Integrasi transfer & disburse perbankan |
| | `routes/api/api.karyawan.photo.ts` | Upload & serve foto karyawan |

---

## 📚 4. Modul Bisnis & Helper (`src/lib/`)

Folder `src/lib/` berisi business logic murni. Dipisahkan menjadi:

### A. Server-Only Logic (`*.server.ts`)
> Berisi kredensial rahasia PocketBase SuperAdmin, SMTP, hashing, dan token yang **hanya dieksekusi di Node.js**:
- `pocketbase-client.server.ts`: Klien PocketBase dengan hak akses admin
- `api.server.ts`: Helper respon API (`json`, `apiError`, middleware)
- `logger.server.ts`: Logging pino server
- `feature-flags.server.ts`: Cek status aktivasi modul perusahaan
- `events.server.ts`, `central-admin.server.ts`, dll.

### B. Client / Universal Logic (`*.ts`)
> Dapat dipanggil di komponen React frontend:
- `pocketbase-client.ts`: Koneksi SDK PocketBase di browser user
- `accounting.ts`: Rumus jurnal, kalkulasi balance debet-kredit, laporan keuangan
- `chat.ts`: Logika load pesan chat, realtime subscription, unread count
- `payroll.ts` & `payroll-calc.ts`: Rumus hitung gaji, BPJS, PPh 21
- `attendance.ts`: Validasi absensi GPS, shift kerja, dan cuti
- `tax.ts`: Perhitungan PPh, PPN, dan tarif pajak Indonesia
- `utils.ts`: Format Rupiah (`Intl.NumberFormat`), format tanggal Indonesia, class merge (`cn`)
