import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
	// ---------------------------------------------------------------------------
	// 1. Landing Page & Halaman Publik
	// ---------------------------------------------------------------------------
	index('routes/landing/home.tsx'),
	route('event', 'routes/landing/event.tsx'),
	route('solusi/:slug', 'routes/landing/solusi-detail.tsx'),
	route('fitur', 'routes/landing/fitur-index.tsx'),
	route('fitur/:slug', 'routes/landing/fitur-detail.tsx'),
	route('plans', 'routes/landing/plans.tsx'),
	route('subscriptions', 'routes/landing/subscriptions.tsx'),
	route('login', 'routes/landing/login.tsx'),
	route('bayar/:token/pdf', 'routes/landing/bayar.pdf.ts'),
	route('bayar/:token', 'routes/landing/bayar.$token.tsx'),

	// ---------------------------------------------------------------------------
	// 2. Portal Akuntan
	// ---------------------------------------------------------------------------
	route('akuntan', 'routes/akuntan/akuntan.tsx'),
	route('akuntan/masuk', 'routes/akuntan/akuntan.masuk.tsx'),
	route('akuntan/activity', 'routes/akuntan/akuntan.activity.tsx'),
	route('akuntan/activity/:id', 'routes/akuntan/akuntan.activity.$id.tsx'),
	route('akuntan/dasbor', 'routes/akuntan/akuntan.dasbor.tsx'),
	route('akuntan/langganan', 'routes/akuntan/akuntan.langganan.tsx'),
	route('akuntan/posting', 'routes/akuntan/akuntan.posting.tsx'),
	route('akuntan/profil-detail', 'routes/akuntan/akuntan.profil-detail.tsx'),
	route('akuntan/profil/:id', 'routes/akuntan/akuntan.profil.tsx'),

	// ---------------------------------------------------------------------------
	// 3. Dashboard Aplikasi (/app/*)
	// ---------------------------------------------------------------------------
	route('app', 'routes/app/app.tsx', [
		index('routes/app/app.home.tsx'),
		route('dasbor', 'routes/app/app.dasbor.tsx'),
		route('penjualan', 'routes/app/app.penjualan.tsx'),
		route('penjualan/buat', 'routes/app/app.penjualan.buat.tsx'),
		route('penjualan/dokumen/buat/*', 'routes/app/app.penjualan.dokumen-buat.tsx'),
		route('penjualan/dokumen/lihat/:id', 'routes/app/app.penjualan.dokumen.tsx'),
		route('pembelian', 'routes/app/app.pembelian.tsx'),
		route('pembelian/buat', 'routes/app/app.pembelian.buat.tsx'),
		route('pembelian/dokumen/buat/*', 'routes/app/app.pembelian.dokumen-buat.tsx'),
		route('pembelian/dokumen/lihat/:id', 'routes/app/app.pembelian.dokumen.tsx'),
		route('kas-bank', 'routes/app/app.kas-bank.tsx'),
		route('kas-bank/buat', 'routes/app/app.kas-bank.buat.tsx'),
		route('aset', 'routes/app/app.aset.tsx'),
		route('aset/buat', 'routes/app/app.aset.buat.tsx'),
		route('aset/daftar', 'routes/app/app.aset.daftar.tsx'),
		route('biaya', 'routes/app/app.biaya.tsx'),
		route('biaya/buat', 'routes/app/app.biaya.buat.tsx'),
		route('biaya/ubah/:id', 'routes/app/app.biaya.ubah.tsx'),
		route('kontak', 'routes/app/app.kontak.tsx'),
		route('kontak/buat', 'routes/app/app.kontak.buat.tsx'),
		route('kontak/ubah/:id', 'routes/app/app.kontak.ubah.tsx'),
		route('kontak/riwayat/:type/:id', 'routes/app/app.kontak.riwayat.tsx'),
		route('produk', 'routes/app/app.produk.tsx'),
		route('produk/buat', 'routes/app/app.produk.buat.tsx'),
		route('produk/ubah/:id', 'routes/app/app.produk.ubah.tsx'),
		route('produk/gudang', 'routes/app/app.produk.gudang.tsx'),
		route('produk/opname', 'routes/app/app.produk.opname.tsx'),
		route('produk/transfer', 'routes/app/app.produk.transfer.tsx'),
		route('perusahaan', 'routes/app/app.perusahaan.tsx'),
		route('akun', 'routes/app/app.akun.tsx'),
		route('akun/buat', 'routes/app/app.akun.buat.tsx'),
		route('akun/ubah/:id', 'routes/app/app.akun.ubah.tsx'),
		route('akun/saldo-awal', 'routes/app/app.akun.saldo-awal.tsx'),
		route('jurnal', 'routes/app/app.jurnal.tsx'),
		route('jurnal/buat', 'routes/app/app.jurnal.buat.tsx'),
		route('jurnal/ubah/:id', 'routes/app/app.jurnal.ubah.tsx'),
		route('laporan', 'routes/app/app.laporan.tsx'),
		route('pengguna', 'routes/app/app.pengguna.tsx'),
		route('payroll', 'routes/app/app.payroll.tsx'),
		route('karyawan', 'routes/app/app.karyawan.tsx'),
		route('pos', 'routes/app/app.pos.tsx'),
		route('pos/meja', 'routes/app/app.pos.meja.tsx'),
		route('pos/riwayat', 'routes/app/app.pos.riwayat.tsx'),
		route('pajak', 'routes/app/app.pajak.tsx'),
		route('pajak/simulasi', 'routes/app/app.pajak.simulasi.tsx'),
		route('pajak/unifikasi', 'routes/app/app.pajak.unifikasi.tsx'),
		route('pajak/pengaturan', 'routes/app/app.pajak.pengaturan.tsx'),
		route('pengaturan', 'routes/app/app.pengaturan.tsx'),
		route('management/performance', 'routes/app/app.management.performance.tsx'),
		route('management/training', 'routes/app/app.management.training.tsx'),
		route('chat', 'routes/app/app.chat.tsx'),
	]),

	// ---------------------------------------------------------------------------
	// 4. Portal Parent Siswa
	// ---------------------------------------------------------------------------
	route('app/parent', 'routes/parent/parent.tsx'),
	route('app/parent/dashboard', 'routes/parent/parent.dashboard.tsx'),
	route('app/parent/riwayat-pembayaran', 'routes/parent/parent.riwayat-pembayaran.tsx'),
	route('app/parent/pengaturan', 'routes/parent/parent.pengaturan.tsx'),
	route('app/parent/pengumuman', 'routes/parent/parent.pengumuman.tsx'),
	route('app/parent/chat', 'routes/parent/parent.chat.tsx'),

	// ---------------------------------------------------------------------------
	// 5. Admin Pusat (Superadmin)
	// ---------------------------------------------------------------------------
	route('admin-pusat', 'routes/admin/admin-pusat.tsx'),

	// ---------------------------------------------------------------------------
	// 6. API Endpoints
	// ---------------------------------------------------------------------------
	route('api/ecommerce/subscriptions', 'routes/api/api.ecommerce.subscriptions.ts'),
	route('api/ecommerce/subscriptions/manage', 'routes/api/api.ecommerce.subscriptions.manage.ts'),
	route('api/login-lookup', 'routes/api/api.login-lookup.ts'),
	route('api/company-members', 'routes/api/api.company-members.ts'),
	route('api/my-companies', 'routes/api/api.my-companies.ts'),
	route('api/chat/peers', 'routes/api/api.chat.peers.ts'),
	route('api/chat/parent-peers', 'routes/api/api.chat.parent-peers.ts'),
	route('api/push-call', 'routes/api/api.push-call.ts'),
	route('api/central-admin/companies', 'routes/api/api.central-admin.companies.ts'),
	route('api/central-admin/company/:id', 'routes/api/api.central-admin.company.ts'),
	route('api/central-admin/users', 'routes/api/api.central-admin.users.ts'),
	route('api/central-admin/subscriptions', 'routes/api/api.central-admin.subscriptions.ts'),
	route('api/central-admin/manual-payments', 'routes/api/api.central-admin.manual-payments.ts'),
	route('api/akuntan/manual-payments/verify', 'routes/api/api.akuntan.manual-payments.verify.ts'),
	route('api/akuntan/manual-payments/expected-amount', 'routes/api/api.akuntan.manual-payments.expected-amount.ts'),
	route('api/akuntan/profiles', 'routes/api/api.akuntan.profiles.ts'),
	route('api/karyawan/photo', 'routes/api/api.karyawan.photo.ts'),
	route('api/akuntan/posts', 'routes/api/api.akuntan.posts.ts'),
	route('api/central-admin/transactions', 'routes/api/api.central-admin.transactions.ts'),
	route('api/central-admin/plan-prices', 'routes/api/api.central-admin.plan-prices.ts'),
	route('api/central-admin/bank-accounts', 'routes/api/api.central-admin.bank-accounts.ts'),
	route('api/central-admin/smtp', 'routes/api/api.central-admin.smtp.ts'),
	route('api/central-admin/email-branding', 'routes/api/api.central-admin.email-branding.ts'),
	route('api/central-admin/feature-flags', 'routes/api/api.central-admin.feature-flags.ts'),
	route('api/central-admin/promos', 'routes/api/api.central-admin.promos.ts'),
	route('api/central-admin/events', 'routes/api/api.central-admin.events.ts'),
	route('api/central-admin/event-registrations', 'routes/api/api.central-admin.event-registrations.ts'),
	route('api/event-confirmation-email', 'routes/api/api.event-confirmation-email.ts'),
	route('api/event-registration-proof', 'routes/api/api.event-registration-proof.ts'),
	route('api/central-admin/parent-payments', 'routes/api/api.central-admin.parent-payments.ts'),
	route('api/bank-accounts', 'routes/api/api.bank-accounts.ts'),
	route('api/company-bank-account', 'routes/api/api.company-bank-account.ts'),
	route('api/document-email', 'routes/api/api.document-email.ts'),
	route('api/invoice-pay-link', 'routes/api/api.invoice-pay-link.ts'),
	route('api/public-invoice-pay', 'routes/api/api.public-invoice-pay.ts'),
	route('api/documents-import', 'routes/api/api.documents-import.ts'),
	route('api/invoice-payments', 'routes/api/api.invoice-payments.ts'),
	route('api/reimbursement-saldo', 'routes/api/api.reimbursement-saldo.ts'),
	route('api/invoice-payments/expected-amount', 'routes/api/api.invoice-payments.expected-amount.ts'),
	route('api/company-parent-payments', 'routes/api/api.company-parent-payments.ts'),
	route('api/parent/manage', 'routes/api/api.parent.manage.ts'),
	route('api/parent/pay-invoice', 'routes/api/api.parent.pay-invoice.ts'),
	route('api/neo-bank/status', 'routes/api/api.neo-bank.status.ts'),
	route('api/neo-bank/disburse', 'routes/api/api.neo-bank.disburse.ts'),
	route('api/health', 'routes/api/api.health.ts'),
	route('api/*', 'routes/api/api.$.ts'),

	// ---------------------------------------------------------------------------
	// 7. SEO & Statis
	// ---------------------------------------------------------------------------
	route('sitemap.xml', 'routes/sitemap.xml.ts'),
	route('robots.txt', 'routes/robots.txt.ts'),
] satisfies RouteConfig;
