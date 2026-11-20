import { useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, Info, Percent, Wallet } from 'lucide-react';
import {
	PAYMENT_TERM_PRESETS,
	computePaymentTerms,
	isValidPaymentTerms,
} from '@/lib/payment-terms';
import { formatDate, formatRupiah, todayIso } from '@/lib/accounting';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from '@/components/ui/dialog';
import { useLanguage } from '@/hooks/use-language';

interface PaymentTermsFieldProps {
	value: string;
	onChange: (value: string) => void;
	invoiceDate: string;
	total: number;
	presentation?: 'default' | 'sales-invoice';
	readOnly?: boolean;
}

/**
 * Pemilih syarat pembayaran invoice (notasi 2/3 N/30) dengan pratinjau hidup:
 * batas diskon, nominal diskon, jumlah yang harus dibayar bila memenuhi syarat,
 * dan tanggal jatuh tempo. Bila masa diskon sudah lewat, pratinjau menampilkan
 * jumlah penuh tanpa diskon.
 */
export function PaymentTermsField({
	value,
	onChange,
	invoiceDate,
	total,
	presentation = 'default',
	readOnly = false,
}: PaymentTermsFieldProps) {
	const { t } = useLanguage();
	const isPreset = PAYMENT_TERM_PRESETS.some(p => p.value === value);
	const invalid = value !== '' && !isValidPaymentTerms(value);

	const calc = useMemo(
		() => computePaymentTerms(value, invoiceDate, total, todayIso()),
		[value, invoiceDate, total],
	);

	const isSalesInvoice = presentation === 'sales-invoice';
	const [discountOpen, setDiscountOpen] = useState(false);

	const discountInfo = calc ? (
		<dl className="grid gap-2 text-xs sm:grid-cols-2">
			<div className="flex items-center gap-1.5">
				<Percent className="size-3.5 shrink-0 text-primary" />
				<dt className="text-muted-foreground">{t('sales.form.discount_label')}</dt>
				<dd className="font-bold text-foreground">
					{calc.parsed.discountRate}% bila dibayar ≤ {formatDate(calc.discountDeadline)}
				</dd>
			</div>
			<div className="flex items-center gap-1.5">
				<CalendarClock className="size-3.5 shrink-0 text-primary" />
				<dt className="text-muted-foreground">{t('sales.form.due_label')}</dt>
				<dd className="font-bold text-foreground">{formatDate(calc.dueDate)}</dd>
			</div>
			<div className="flex items-center gap-1.5">
				<Wallet className="size-3.5 shrink-0 text-emerald-600" />
				<dt className="text-muted-foreground">{t('sales.form.discount_amount')}</dt>
				<dd className="font-bold text-emerald-600">{formatRupiah(calc.discountAmount)}</dd>
			</div>
			<div className="flex items-center gap-1.5">
				<Wallet className="size-3.5 shrink-0 text-primary" />
				<dt className="text-muted-foreground">
					{calc.discountActive ? t('sales.form.pay_if_qualified') : t('sales.form.pay_full')}
				</dt>
				<dd className="font-extrabold text-primary">
					{formatRupiah(calc.discountActive ? calc.payableWithDiscount : calc.fullAmount)}
				</dd>
			</div>
			<p className="sm:col-span-2 text-[10px] text-muted-foreground">
				{calc.discountActive
					? t('sales.form.discount_active_note')
					: t('sales.form.discount_expired_note')}
			</p>
		</dl>
	) : null;

	return (
		<div
			className={
				isSalesInvoice
					? 'flex w-full flex-col gap-2'
					: 'flex flex-col gap-3 rounded-xl border border-border bg-accent/30 p-4'
			}
		>
			<div className={isSalesInvoice ? 'flex w-full flex-col gap-1 md:max-w-md' : 'flex flex-col gap-2 md:max-w-md'}>
				<label
					htmlFor="doc-payment-terms"
					className={isSalesInvoice ? 'text-xs font-medium text-foreground' : 'text-xs font-semibold'}
				>
					{t('sales.form.payment_terms')}
				</label>
				<div className={isSalesInvoice ? 'flex w-full items-center gap-2' : undefined}>
					<div className={isSalesInvoice ? 'relative min-w-0 flex-1' : undefined}>
						<select
							id="doc-payment-terms"
							value={isPreset ? value : '__custom'}
							disabled={readOnly}
							onChange={e => {
								const next = e.target.value;
								if (next === '__custom') {
									onChange(value && !isPreset ? value : '');
								} else {
									onChange(next);
								}
							}}
							className={
								isSalesInvoice
									? 'w-full appearance-none rounded-md border border-[#d5dbe3] bg-white px-2.5 py-1.5 pr-8 text-xs text-foreground outline-none ring-primary/30 focus:ring-2'
									: 'rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2'
							}
						>
							{PAYMENT_TERM_PRESETS.map(p => (
								<option key={p.value} value={p.value}>
									{isSalesInvoice && p.value === '2/3 N/30' ? 'Net 30' : p.label}
								</option>
							))}
							<option value="__custom">{t('sales.form.custom_terms')}</option>
						</select>
						{isSalesInvoice ? (
							<ChevronDown
								aria-hidden="true"
								className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground"
								strokeWidth={2.2}
							/>
						) : null}
					</div>
					{isSalesInvoice && calc ? (
						<>
							<button
								type="button"
								onClick={() => setDiscountOpen(true)}
								className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
							>
								<Info className="size-3.5" />
								{t('sales.form.discount_info')}
							</button>
							<Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
								<DialogContent className="max-w-lg gap-3 rounded-xl border border-emerald-200 bg-[#f4fbf7] p-4 shadow-soft sm:rounded-xl">
									<DialogTitle className="pr-6 text-sm font-bold text-foreground">
										{t('sales.form.discount_info_title')}
									</DialogTitle>
									{discountInfo}
									<div className="flex justify-end">
										<DialogClose
											type="button"
											className="inline-flex min-h-8 items-center rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground"
										>
											{t('sales.form.close')}
										</DialogClose>
									</div>
								</DialogContent>
							</Dialog>
						</>
					) : null}
				</div>
			</div>

			{!isPreset ? (
				<div className="flex flex-col gap-2 md:max-w-md">
					<label htmlFor="doc-payment-terms-custom" className="text-xs font-semibold">
						{t('sales.form.custom_notation')}
					</label>
					<input
						id="doc-payment-terms-custom"
						value={value}
						onChange={e => onChange(e.target.value)}
						placeholder="2/3 N/30"
						maxLength={20}
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
					<p className="text-[10px] text-muted-foreground">
						{t('sales.form.custom_format')}
					</p>
				</div>
			) : null}

			{invalid ? (
				<p className="text-xs font-semibold text-destructive">
					{t('sales.form.invalid_terms')}
				</p>
			) : null}

			{!isSalesInvoice && calc ? (
				<div className="rounded-lg border border-border bg-background px-3 py-2.5">{discountInfo}</div>
			) : null}
		</div>
	);
}
