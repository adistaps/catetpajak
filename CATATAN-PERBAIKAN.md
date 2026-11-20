# Catatan perbaikan (setelah analisis repo)

Semua perubahan diuji dengan PocketBase v0.40.6 + Node 22 (typecheck, lint, build, dan uji manual endpoint).

## Keamanan
| # | Masalah | Perbaikan | File |
|---|---|---|---|
| 1 | `event_registrations.updateRule = ""`: siapa pun bisa mengubah `payment_status` jadi "lunas" | Migrasi baru `1794555000_lock_event_registrations_rules.js`: update ditutup; create dibatasi (tanpa field verifikasi; "lunas" hanya jika `amount = 0`). Upload bukti bayar kini lewat route server `api/event-registration-proof` yang memaksa status `menunggu_verifikasi` dan menolak bila sudah lunas | `pb_migrations/1794555000_*`, `routes/api.event-registration-proof.ts`, `routes.ts`, `components/event/event-payment.tsx` |
| 2 | Secret HMAC tautan bayar invoice tertulis di kode | Dibaca dari env `INVOICE_PAY_SECRET` (min. 32 karakter, wajib di produksi). `gen-secrets.mjs` ikut membuatnya. **Tautan bayar lama tidak berlaku lagi** | `lib/invoice-pay-link.server.ts`, `scripts/gen-secrets.mjs`, `.env.example` |
| 3 | IP klien bisa dipalsukan lewat `X-Forwarded-For` (rate limit bisa dilewati) | IP diambil dari socket; header proxy hanya dipercaya bila koneksi dari loopback (Nginx), memakai `X-Real-IP` atau entri terakhir XFF | `server.ts` |
| 4 | Proxy `/hcgi/platform` membuka login superuser PocketBase ke internet | Path `/api/collections/_superusers/*` dan `/api/admins/*` diblokir (404) di proxy. Server web tetap memakai PocketBase langsung. Superuser login hanya lewat `127.0.0.1:8090` (mis. terowongan SSH) | `server.ts` |
| 5 | Hook `external-dashboard` mengambil HTML dari CDN Hostinger untuk halaman `/` | Hook dihapus | `pb_hooks/external-dashboard.pb.js` |

## Langganan tanpa Ecommerce
- `getUserSubscriptions` mengembalikan daftar kosong bila `ECOMMERCE_*` kosong (tidak ada panggilan jaringan).
- Loader `/plans` dan `/akuntan/langganan` tidak lagi gagal bila toko Hostinger tidak terjangkau.

## Deploy
- `deploy.sh`: cadangan konsisten (`sqlite3 .backup`; jika tidak ada, PocketBase dihentikan sebentar), opsi `--skip-build`, batas memori build.
- README: swap 2 GB dan paket `sqlite3`.

## Yang BELUM ditangani (diketahui)
- Halaman `/_/` PocketBase masih publik lewat proxy (hanya login superuser yang diblokir). Hook tema reset password
  menyajikan HTML dari CDN Hostinger (fallback ke UI standar jika gagal). Pertimbangkan membatasi `/_/` di Nginx kecuali
  untuk alur reset password.
- Pembuatan pendaftaran event masih langsung dari browser (dibatasi aturan di atas). Paket berbayar yang dikirim dengan
  `amount = 0` bisa terdaftar "lunas": admin perlu memeriksa jumlah. Perbaikan tuntas = pindahkan pembuatan ke route server.
- `users.createRule = ""` (pendaftaran publik) disengaja; belum ditinjau field apa saja yang bisa diisi saat daftar.
- Login SSH sebagai `root` di runbook: sebaiknya user non-root + sudo.
- Dependensi PocketBase client sisi web ^0.28.1 vs server 0.40.6: tidak ditemukan masalah di uji ini.
- Tes `.horizons-tests` tidak dijalankan.


---

# Perbaikan lanjutan (peninjauan kedua)

Paket ini diuji ulang dari nol (install, typecheck, build, import data asli, uji tembus keamanan). Hasilnya:

| # | Temuan | Perbaikan |
|---|---|---|
| A | **Klaim #4 di atas tidak benar sepenuhnya.** Blokir superuser hanya mencocokkan teks `_superusers`. Login superuser tetap berhasil lewat `/api/collections/%5Fsuperusers/...` dan `/api/collections/pbc_3142635823/...` (PocketBase menerima nama MAUPUN id koleksi, dan men-decode path) | `server.ts`: path didekode (hingga 3 lapis), huruf kecil, id koleksi ikut diblokir. Lapis kedua: hook `block-superuser-via-proxy.pb.js` menolak semua autentikasi superuser pada permintaan bertanda `x-via-web-proxy` (proxy selalu menimpa header ini). Diuji: 9 variasi path ditolak; login lewat `127.0.0.1:8090` tetap berfungsi |
| B | Rate limiter aplikasi membaca `X-Real-IP` dari request masuk; perbaikan #3 hanya menyentuh header ke PocketBase, sehingga klien tetap bisa memalsukan IP ke aplikasi | `server.ts`: `X-Real-IP` ditimpa dengan IP terverifikasi (entri terakhir `X-Forwarded-For` yang ditulis Nginx, cadangan `X-Real-IP`, lalu alamat socket). Diuji dengan server tiruan |
| C | **`created`/`updated` tidak ikut terimport** (PocketBase menimpanya). Semua record terlihat dibuat pada hari import; masa uji coba 30 hari (dihitung dari `users.created`) mulai ulang untuk semua user | `scripts/restore-timestamps.mjs` (update langsung ke SQLite saat PocketBase berhenti, dengan cadangan). Diuji: 27 dari 27 user kembali ke tanggal asli |

## Perlu diketahui
- Jika Nginx CloudPanel tidak menulis `X-Forwarded-For` maupun `X-Real-IP`, pembatasan laju per IP bisa dilewati. Cek dengan
  perintah di README (bagian C.9, langkah 5).
- Upload bukti event dengan file yang tidak valid mengembalikan HTTP 500 (bukan pesan 4xx yang ramah). Tidak berbahaya.
- Tautan bayar invoice lama tidak berlaku lagi setelah `INVOICE_PAY_SECRET` baru dipakai.
- Keputusan "transfer manual" dan harga paket di README adalah catatan dari AI sebelumnya. Pastikan memang sudah disetujui klien.
