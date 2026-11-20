import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';

export const FAQS = [
	{
		q: 'Apa itu Catet Pajak?',
		a: 'Catet Pajak adalah aplikasi akuntansi, pajak, dan payroll all-in-one untuk mengelola penjualan, pembelian, persediaan, aset tetap, penggajian, e-Bupot, dan laporan keuangan banyak perusahaan — siap dijual kembali sebagai white-label.',
	},
	{
		q: 'Modul apa saja yang tersedia?',
		a: 'Penjualan & Pembelian (penawaran, SO/PO, invoice, pembayaran), Kas & Bank, Aset Tetap dengan penyusutan, Persediaan & Gudang (stok, opname, transfer), Penggajian (karyawan, absensi, overtime, slip gaji, PPh 21), Pajak (e-Bupot, simulasi PPh 21, PPN), Kontak, serta laporan keuangan lengkap.',
	},
	{
		q: 'Laporan apa saja yang dihasilkan?',
		a: 'Neraca, Laba Rugi, Arus Kas, Buku Besar, Neraca Saldo, Jurnal Umum, Perubahan Modal, Ringkasan Bisnis, Laba Rugi Fiskal, Rekonsiliasi Pajak, serta laporan posisi keuangan & perubahan aset neto yayasan — semua bisa diekspor ke PDF dan CSV.',
	},
	{
		q: 'Apakah data tiap perusahaan terpisah?',
		a: 'Ya. Setiap perusahaan memiliki bagan akun, jurnal, dan laporan sendiri. Akses diatur per pengguna dengan peran, batasan modul, dan masa berlaku.',
	},
	{
		q: 'Bagaimana cara memulai?',
		a: 'Daftar gratis, buat perusahaan pertama Anda, bagan akun standar akan dibuat otomatis, lalu mulai catat transaksi dan buka laporan.',
	},
	{
		q: 'Apakah cocok untuk dijual kembali?',
		a: 'Ya. Catet Pajak dirancang sebagai fondasi white-label: multi-tenant, modul lengkap, dan UI modern siap branding ulang.'
	},
];

export function Faq() {
	return (
		<section id="faq" className="bg-secondary/40 px-5 py-20 md:px-8 md:py-24">
			<div className="mx-auto max-w-3xl">
				<h2 className="text-center text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
					Frequently Asked Questions (FAQ)
				</h2>
				<div className="mt-10 rounded-2xl border border-border bg-white px-5 shadow-soft-sm md:px-6">
					<Accordion type="single" collapsible defaultValue="item-0" className="w-full">
						{FAQS.map((item, index) => (
							<AccordionItem key={item.q} value={`item-${index}`} className="border-border">
								<AccordionTrigger className="text-left text-sm font-semibold text-foreground hover:no-underline md:text-base">
									{item.q}
								</AccordionTrigger>
								<AccordionContent className="text-sm leading-relaxed text-muted-foreground">
									{item.a}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</div>
		</section>
	);
}
