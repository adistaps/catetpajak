import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, FileText, Pencil, Receipt } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah, type Company } from '@/lib/accounting';
import { CONTACT_TYPE_LABELS, type Contact } from '@/lib/contacts';
import { STUDENT_STATUS_LABELS, type Student } from '@/lib/students';
import type { Transaction, TransactionCategory } from '@/lib/transactions';
import {
	STAGE_CONFIG,
	DIRECTION_CONFIG,
	type BusinessDocument,
} from '@/lib/documents';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';

export type ContactHistoryType = 'kontak' | 'siswa';

interface ContactHistoryProps {
	type: ContactHistoryType;
	id: string;
	company: Company | null;
}

const CATEGORY_KEYS: Record<TransactionCategory, string> = {
	penjualan: 'tx.category.penjualan',
	pembelian: 'tx.category.pembelian',
	kas_bank: 'tx.category.kas_bank',
	aset: 'tx.category.aset',
	biaya: 'tx.category.biaya',
};

interface DocRow {
	id: string;
	date: string;
	number: string;
	stage: string;
	direction: string;
	total: number;
	status: string;
}

interface TxRow {
	id: string;
	date: string;
	description: string;
	category: TransactionCategory;
	amount: number;
	partner: string;
}

export function ContactHistory({ type, id, company }: ContactHistoryProps) {
	const { t } = useLanguage();
	const [record, setRecord] = useState<Contact | Student | null>(null);
	const [documents, setDocuments] = useState<DocRow[]>([]);
	const [transactions, setTransactions] = useState<TxRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!company) {
			setLoading(false);
			return;
		}
		let cancelled = false;

		const load = async () => {
			setLoading(true);
			setError('');
			try {
				let partnerName = '';
				let contactFilter = '';
				let partnerFilter = '';

				if (type === 'kontak') {
					const c = await pb
						.collection('contacts')
						.getOne<Contact>(id);
					if (cancelled) return;
					setRecord(c);
					partnerName = c.name;
					contactFilter = pb.filter('company = {:company} && contact = {:id}', {
						company: company.id,
						id,
					});
				} else {
					const s = await pb
						.collection('students')
						.getOne<Student>(id);
					if (cancelled) return;
					setRecord(s);
					partnerName = s.student_name;
					partnerFilter = pb.filter('company = {:company} && partner = {:name}', {
						company: company.id,
						name: partnerName,
					});
				}

				const docFilter = type === 'kontak' ? contactFilter : partnerFilter;
				const txFilter = type === 'kontak' ? contactFilter : partnerFilter;

				const [docList, txList] = await Promise.all([
					pb
						.collection('documents')
						.getFullList<BusinessDocument>({
							filter: docFilter,
							sort: '-date,-created',
							requestKey: `history-docs-${type}-${id}`,
						})
						.catch(() => [] as BusinessDocument[]),
					pb
						.collection('transactions')
						.getFullList<Transaction>({
							filter: txFilter,
							sort: '-date,-created',
							requestKey: `history-tx-${type}-${id}`,
						})
						.catch(() => [] as Transaction[]),
				]);

				if (cancelled) return;

				setDocuments(
					docList.map(d => ({
						id: d.id,
						date: d.date,
						number: d.number || `${STAGE_CONFIG[d.stage]?.numberPrefix ?? ''}-${d.id.slice(0, 6)}`,
						stage: d.stage,
						direction: d.direction,
						total: d.total || 0,
						status: d.status,
					})),
				);
				setTransactions(
					txList.map(tx => ({
						id: tx.id,
						date: tx.date,
						description: tx.description || '',
						category: tx.category,
						amount: tx.amount || 0,
						partner: tx.partner || '',
					})),
				);
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : t('contact.history.load_failed'));
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		load();
		return () => {
			cancelled = true;
		};
	}, [type, id, company, t]);

	const docTotal = useMemo(
		() => documents.reduce((sum, d) => sum + (d.status === 'cancelled' ? 0 : d.total), 0),
		[documents],
	);
	const txTotal = useMemo(
		() => transactions.reduce((sum, tx) => sum + tx.amount, 0),
		[transactions],
	);

	const backTo = '/app/kontak';
	const titleName =
		type === 'kontak'
			? (record as Contact | null)?.name ?? t('contact.history.default_contact')
			: (record as Student | null)?.student_name ?? t('contact.history.default_student');

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Link
					to={backTo}
					className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> {t('contact.history.back')}
				</Link>
				{type === 'kontak' ? (
					<Link
						to={`/app/kontak/ubah/${id}`}
						className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
					>
						<Pencil className="size-4" /> {t('contact.edit')}
					</Link>
				) : null}
			</div>

			<header className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
				<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					{type === 'kontak' ? t('contact.history.title_contact') : t('contact.history.title_student')}
				</p>
				<h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">{titleName}</h1>
				{record ? (
					<dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
						{type === 'kontak' ? (
							<>
								<Detail label={t('contact.history.type')} value={CONTACT_TYPE_LABELS[(record as Contact).type] ?? '—'} />
								<Detail label={t('contact.history.code')} value={(record as Contact).code || '—'} />
								<Detail label={t('contact.history.phone')} value={(record as Contact).phone || '—'} />
								<Detail label={t('contact.history.email')} value={(record as Contact).email || '—'} />
							</>
						) : (
							<>
								<Detail
									label={t('contact.history.status')}
									value={STUDENT_STATUS_LABELS[(record as Student).active_status || 'active']}
								/>
								<Detail label={t('contact.history.nis')} value={(record as Student).student_id_number || '—'} />
								<Detail label={t('contact.history.program')} value={(record as Student).school_program || '—'} />
								<Detail label={t('contact.history.grade')} value={(record as Student).school_grade || '—'} />
							</>
						)}
					</dl>
				) : null}
			</header>

			{loading ? (
				<p className="rounded-2xl border border-border bg-card px-5 py-10 text-sm text-muted-foreground">
					{t('contact.history.loading')}
				</p>
			) : error ? (
				<p className="rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-6 text-sm text-destructive">
					{error}
				</p>
			) : (
				<>
					<div className="grid gap-3 sm:grid-cols-3">
						<SummaryCard label={t('contact.history.total_docs')} value={formatRupiah(docTotal)} sub={t('contact.history.docs_count', { count: documents.length })} />
						<SummaryCard label={t('contact.history.total_tx')} value={formatRupiah(txTotal)} sub={t('contact.history.tx_count', { count: transactions.length })} />
						<SummaryCard
							label={t('contact.history.total_all')}
							value={formatRupiah(docTotal + txTotal)}
							sub={t('contact.history.docs_plus_tx')}
						/>
					</div>

					<section className="rounded-2xl border border-border bg-card shadow-soft">
						<div className="flex items-center gap-2 border-b border-border px-5 py-3">
							<FileText className="size-4 text-primary" />
							<h2 className="text-sm font-bold uppercase tracking-wide">{t('contact.history.documents')}</h2>
						</div>
						{documents.length === 0 ? (
							<p className="px-5 py-8 text-sm text-muted-foreground">
								{t('contact.history.no_docs')}
							</p>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full min-w-[640px] text-sm">
									<thead>
										<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
											<th className="px-5 py-2.5">{t('contact.history.col_date')}</th>
											<th className="px-5 py-2.5">{t('contact.history.col_number')}</th>
											<th className="px-5 py-2.5">{t('contact.history.col_stage')}</th>
											<th className="px-5 py-2.5">{t('contact.history.col_direction')}</th>
											<th className="px-5 py-2.5 text-right">{t('contact.history.col_total')}</th>
											<th className="px-5 py-2.5">{t('contact.history.col_status')}</th>
										</tr>
									</thead>
									<tbody>
										{documents.map(d => (
											<tr key={d.id} className="border-b border-foreground/10 last:border-0">
												<td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">
													{formatDate(d.date)}
												</td>
												<td className="px-5 py-2.5 font-semibold">
															<Link
																to={
																	d.direction === 'penjualan' && (d.stage === 'invoice' || d.stage === 'pengiriman')
																		? `/app/penjualan/dokumen/lihat/${d.id}`
																		: `/app/${d.direction}/dokumen/buat/${d.stage}/ubah/${d.id}`
																}
																className="text-primary underline-offset-4 transition-colors hover:text-primary/75 hover:underline"
																aria-label={t('contact.history.open', { number: d.number })}
															>
																{d.number}
															</Link>
														</td>
												<td className="px-5 py-2.5">
													<span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">
														{STAGE_CONFIG[d.stage as keyof typeof STAGE_CONFIG]?.label ?? d.stage}
													</span>
												</td>
												<td className="px-5 py-2.5 text-muted-foreground">
													{DIRECTION_CONFIG[d.direction as keyof typeof DIRECTION_CONFIG]?.title ?? d.direction}
												</td>
												<td className="px-5 py-2.5 text-right font-semibold">
													{formatRupiah(d.total)}
												</td>
												<td className="px-5 py-2.5">
													<span
														className={cn(
															'rounded-full px-2.5 py-0.5 text-[11px] font-bold',
															d.status === 'confirmed'
																? 'bg-primary/10 text-primary'
																: d.status === 'cancelled'
																	? 'bg-destructive/10 text-destructive'
																	: 'bg-muted text-muted-foreground',
														)}
													>
														{d.status}
													</span>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</section>

					<section className="rounded-2xl border border-border bg-card shadow-soft">
						<div className="flex items-center gap-2 border-b border-border px-5 py-3">
							<Receipt className="size-4 text-primary" />
							<h2 className="text-sm font-bold uppercase tracking-wide">{t('contact.history.transactions')}</h2>
						</div>
						{transactions.length === 0 ? (
							<p className="px-5 py-8 text-sm text-muted-foreground">
								{t('contact.history.no_tx')}
							</p>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full min-w-[640px] text-sm">
									<thead>
										<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
											<th className="px-5 py-2.5">{t('contact.history.col_date')}</th>
											<th className="px-5 py-2.5">{t('contact.history.col_category')}</th>
											<th className="px-5 py-2.5">{t('contact.history.col_description')}</th>
											<th className="px-5 py-2.5 text-right">{t('contact.history.col_amount')}</th>
										</tr>
									</thead>
									<tbody>
										{transactions.map(tx => (
											<tr key={tx.id} className="border-b border-foreground/10 last:border-0">
												<td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">
													{formatDate(tx.date)}
												</td>
												<td className="px-5 py-2.5">
													<span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">
														{t(CATEGORY_KEYS[tx.category])}
													</span>
												</td>
												<td className="px-5 py-2.5">{tx.description || '—'}</td>
												<td className="px-5 py-2.5 text-right font-semibold">
													{formatRupiah(tx.amount)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</section>
				</>
			)}
		</div>
	);
}

function Detail({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
				{label}
			</dt>
			<dd className="font-semibold">{value}</dd>
		</div>
	);
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
	return (
		<div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft-sm">
			<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<p className="mt-1 text-xl font-extrabold">{value}</p>
			<p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
		</div>
	);
}
