import { useEffect, useState } from 'react';
import { data } from 'react-router';
import type { Route } from './+types/bayar.$token';
import { seo } from '@/lib/seo';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { formatDate, formatRupiah, todayIso } from '@/lib/accounting';
import { verifyInvoicePayToken } from '@/lib/invoice-pay-link.server';
import { getActiveBankAccounts } from '@/lib/bank-accounts.server';
import { computePaymentTerms } from '@/lib/payment-terms';
import {
	computeLatePenaltyServer,
	getLatePenaltySettingsServer,
} from '@/lib/late-penalty-settings.server';
import { ManualPayForm } from '@/components/bayar/manual-pay-form';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Pembayaran Manual Invoice',
		description: 'Lihat tagihan invoice dan unggah bukti transfer tanpa menandai pembayaran sebagai lunas.',
		noindex: true,
	});
}

export async function loader({ params }: Route.LoaderArgs) {
	const invoiceId = verifyInvoicePayToken(params.token ?? '');
	if (!invoiceId) throw data({ message: 'Tautan pembayaran tidak valid.' }, { status: 404 });

	const doc = await pocketbaseAdmin
		.getRecord<{
			id: string;
			company: string;
			number: string;
			date: string;
			partner: string;
			description: string;
			total: number;
			paid_amount: number;
			payment_terms?: string;
			status: string;
			stage: string;
			direction: string;
			expand?: { contact?: { name?: string } };
		}>('documents', invoiceId, { expand: 'contact' })
		.catch(() => null);
	if (!doc || doc.stage !== 'invoice' || doc.direction !== 'penjualan') {
		throw data({ message: 'Invoice tidak ditemukan.' }, { status: 404 });
	}

	const company = await pocketbaseAdmin.getRecord<{
		name: string;
		address?: string;
		bank_name?: string;
		account_holder?: string;
		account_number?: string;
	}>('companies', doc.company);

	const banks = await getActiveBankAccounts().catch(() => []);
	const bank = company.bank_name && company.account_number
		? {
				bank_name: company.bank_name,
				account_holder: company.account_holder || company.name,
				account_number: company.account_number,
			}
		: banks[0]
			? {
					bank_name: banks[0].bank_name,
					account_holder: banks[0].account_holder,
					account_number: banks[0].account_number,
				}
			: null;

	const total = Number(doc.total) || 0;
	const paid = Number(doc.paid_amount) || 0;
	const settings = await getLatePenaltySettingsServer(doc.company).catch(() => null);
	const penalty = computeLatePenaltyServer(
		settings,
		{ total, payment_terms: doc.payment_terms, date: doc.date, paid_amount: paid },
		todayIso(),
	);
	const terms = computePaymentTerms(doc.payment_terms, doc.date, total);
	const payable = terms?.discountActive ? terms.payableWithDiscount : total + penalty;
	const remaining = Math.max(0, payable - paid);

	return {
		token: params.token ?? '',
		companyName: company.name,
		address: company.address || '',
		number: doc.number || doc.id.slice(0, 8).toUpperCase(),
		dateLabel: formatDate(doc.date),
		partner: doc.expand?.contact?.name || doc.partner || 'Pelanggan',
		description: doc.description || '',
		totalLabel: formatRupiah(total),
		remaining,
		remainingLabel: formatRupiah(remaining),
		penaltyLabel: penalty > 0 ? formatRupiah(penalty) : '',
		termsLabel: doc.payment_terms || '',
		dueLabel: terms ? formatDate(terms.dueDate) : '',
		discountLabel: terms?.discountActive ? formatRupiah(terms.discountAmount) : '',
		cancelled: doc.status === 'cancelled',
		paid: remaining <= 0 && doc.status !== 'cancelled',
		bank,
		pdfPath: `/bayar/${params.token}/pdf`,
	};
}

export default function BayarInvoice({ loaderData }: Route.ComponentProps) {
	return (
		<main className="min-h-dvh bg-[#f6faf8] px-4 py-10 text-foreground">
			<div className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-8">
				<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					Pembayaran Manual
				</p>
				<h1 className="mt-1 text-2xl font-extrabold tracking-tight">{loaderData.companyName}</h1>
				{loaderData.address ? (
					<p className="mt-1 text-sm text-muted-foreground">{loaderData.address}</p>
				) : null}
				<dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
					<div>
						<dt className="text-[11px] font-semibold uppercase text-muted-foreground">Invoice</dt>
						<dd className="font-bold">{loaderData.number}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold uppercase text-muted-foreground">Tanggal</dt>
						<dd>{loaderData.dateLabel}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold uppercase text-muted-foreground">Kepada</dt>
						<dd className="font-semibold">{loaderData.partner}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold uppercase text-muted-foreground">Total</dt>
						<dd className="font-bold">{loaderData.totalLabel}</dd>
					</div>
				</dl>
				{loaderData.description ? (
					<p className="mt-4 rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground">
						{loaderData.description}
					</p>
				) : null}
				<p className="mt-4 text-sm">
					Sisa yang perlu dibayar: <strong className="text-primary">{loaderData.remainingLabel}</strong>
				</p>
				{loaderData.termsLabel ? (
					<p className="mt-1 text-xs text-muted-foreground">
						Syarat {loaderData.termsLabel}
						{loaderData.dueLabel ? ` · jatuh tempo ${loaderData.dueLabel}` : ''}
						{loaderData.discountLabel ? ` · diskon ${loaderData.discountLabel}` : ''}
					</p>
				) : null}
				{loaderData.penaltyLabel ? (
					<p className="mt-1 text-xs font-semibold text-amber-700">
						Termasuk denda keterlambatan {loaderData.penaltyLabel}.
					</p>
				) : null}
				<a href={loaderData.pdfPath} className="mt-4 inline-flex text-sm font-bold text-primary underline">
					Unduh lampiran PDF
				</a>
				<PayState data={loaderData} />
			</div>
		</main>
	);
}

function PayState({
	data,
}: {
	data: {
		token: string;
		cancelled: boolean;
		paid: boolean;
		remaining: number;
		bank: { bank_name: string; account_holder: string; account_number: string } | null;
	};
}) {
	const [paymentDate, setPaymentDate] = useState('');
	useEffect(() => {
		const now = new Date();
		setPaymentDate(
			`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
		);
	}, []);

	if (data.cancelled) {
		return <p className="mt-6 text-sm font-semibold text-destructive">Invoice ini telah dibatalkan.</p>;
	}
	if (data.paid) {
		return (
			<p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
				Invoice ini sudah lunas. Tidak perlu mengunggah pembayaran lagi.
			</p>
		);
	}
	return (
		<ManualPayForm
			token={data.token}
			remaining={data.remaining}
			bank={data.bank}
			paymentDate={paymentDate}
			onPaymentDate={setPaymentDate}
		/>
	);
}

export function ErrorBoundary() {
	return (
		<main className="mx-auto max-w-lg px-4 py-16 text-center">
			<h1 className="text-2xl font-extrabold">Tautan tidak ditemukan</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Minta pengirim invoice untuk mengirim ulang email pembayaran.
			</p>
		</main>
	);
}
