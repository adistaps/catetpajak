import { useEffect, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

export function ManualPayForm({
	token,
	remaining,
	bank,
	paymentDate,
	onPaymentDate,
}: {
	token: string;
	remaining: number;
	bank: { bank_name: string; account_holder: string; account_number: string } | null;
	paymentDate: string;
	onPaymentDate: (value: string) => void;
}) {
	const [amount, setAmount] = useState(String(remaining));
	const [payerName, setPayerName] = useState('');
	const [notes, setNotes] = useState('');
	const [file, setFile] = useState<File | null>(null);
	const [expected, setExpected] = useState<{ amount: number; label: string } | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [done, setDone] = useState('');

	useEffect(() => {
		const base = Number(amount) || 0;
		if (base <= 0) {
			setExpected(null);
			return;
		}
		let cancelled = false;
		fetch('/api/public-invoice-pay', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token, baseAmount: base }),
		})
			.then(async res => {
				const data = (await res.json().catch(() => ({}))) as {
					expected_amount?: number;
					expected_amount_formatted?: string;
					error?: string;
				};
				if (!res.ok) throw new Error(data.error || 'Gagal menyiapkan nominal.');
				if (!cancelled) {
					setExpected({
						amount: Number(data.expected_amount) || 0,
						label: data.expected_amount_formatted || '',
					});
				}
			})
			.catch(() => {
				if (!cancelled) setExpected(null);
			});
		return () => {
			cancelled = true;
		};
	}, [amount, token]);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!file || !expected?.amount || !bank) {
			toast.error('Lengkapi bukti, nominal, dan pastikan rekening tujuan tersedia.');
			return;
		}
		setSubmitting(true);
		try {
			const form = new FormData();
			form.append('token', token);
			form.append('amount', amount);
			form.append('expectedAmount', String(expected.amount));
			form.append('bank', bank.bank_name);
			form.append('paymentDate', paymentDate);
			form.append('payerName', payerName);
			form.append('notes', notes);
			form.append('proof', file);
			const res = await fetch('/api/public-invoice-pay', { method: 'POST', body: form });
			const data = (await res.json().catch(() => ({}))) as {
				error?: string;
				verified?: boolean;
				reason?: string;
			};
			if (!res.ok) throw new Error(data.error || 'Gagal mengirim bukti.');
			setDone(
				data.verified
					? 'Pembayaran terverifikasi. Invoice diperbarui sesuai bukti transfer.'
					: data.reason || 'Bukti terkirim dan menunggu verifikasi. Invoice belum ditandai lunas.',
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal mengirim bukti.');
		} finally {
			setSubmitting(false);
		}
	}

	if (done) {
		return <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{done}</p>;
	}

	return (
		<form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4 text-sm">
			<div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
				<p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Transfer ke</p>
				{bank ? (
					<>
						<p className="mt-1 font-bold">{bank.bank_name}</p>
						<p className="font-semibold tracking-tight">{bank.account_number}</p>
						<p className="text-muted-foreground">a.n. {bank.account_holder}</p>
					</>
				) : (
					<p className="mt-1 text-amber-700">Rekening perusahaan belum tersedia. Hubungi pengirim invoice.</p>
				)}
				<p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
					Nominal yang harus ditransfer
				</p>
				<p className="text-xl font-extrabold">{expected?.label || 'Menyiapkan nominal unik…'}</p>
			</div>
			<label className="flex flex-col gap-1.5">
				<span className="text-xs font-semibold">Nominal pembayaran (Rp)</span>
				<input
					type="number"
					min="1"
					required
					value={amount}
					onChange={event => setAmount(event.target.value)}
					className="rounded-xl border border-border bg-background px-3 py-2.5 outline-none ring-primary/30 focus:ring-2"
				/>
			</label>
			<label className="flex flex-col gap-1.5">
				<span className="text-xs font-semibold">Tanggal transfer</span>
				<input
					type="date"
					required
					value={paymentDate}
					onChange={event => onPaymentDate(event.target.value)}
					className="rounded-xl border border-border bg-background px-3 py-2.5 outline-none ring-primary/30 focus:ring-2"
				/>
			</label>
			<label className="flex flex-col gap-1.5">
				<span className="text-xs font-semibold">Nama pengirim</span>
				<input
					value={payerName}
					onChange={event => setPayerName(event.target.value)}
					maxLength={120}
					className="rounded-xl border border-border bg-background px-3 py-2.5 outline-none ring-primary/30 focus:ring-2"
				/>
			</label>
			<label className="flex flex-col gap-1.5">
				<span className="text-xs font-semibold">Catatan</span>
				<textarea
					value={notes}
					onChange={event => setNotes(event.target.value)}
					rows={2}
					maxLength={500}
					className="resize-none rounded-xl border border-border bg-background px-3 py-2.5 outline-none ring-primary/30 focus:ring-2"
				/>
			</label>
			<label className="flex flex-col gap-1.5">
				<span className="text-xs font-semibold">Bukti transfer</span>
				<input
					type="file"
					required
					accept="image/jpeg,image/png,image/webp,application/pdf"
					onChange={event => setFile(event.target.files?.[0] ?? null)}
					className="text-xs"
				/>
			</label>
			<button
				type="submit"
				disabled={submitting || !bank}
				className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
			>
				{submitting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
				Kirim bukti pembayaran
			</button>
			<p className="text-xs text-muted-foreground">
				Mengirim bukti tidak langsung menandai invoice lunas. Pelunasan hanya terjadi setelah bukti diverifikasi.
			</p>
		</form>
	);
}
