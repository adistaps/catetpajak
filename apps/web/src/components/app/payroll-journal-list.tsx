import { useState } from 'react';
import { Calculator, CheckCircle2, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate, formatRupiah, type JournalEntry } from '@/lib/accounting';
import { payrollErrorMessage, recordPayrollTransaction, type PayrollJournalGroup } from '@/lib/payroll-expenses';

interface Props {
	companyId: string;
	groups: PayrollJournalGroup[];
	columns: Record<'date' | 'partner' | 'description' | 'debit' | 'credit' | 'amount' | 'status', boolean>;
	onRecorded: () => void;
}

export function PayrollJournalList({ companyId, groups, columns, onRecorded }: Props) {
	const [selected, setSelected] = useState<PayrollJournalGroup | null>(null);
	const [pending, setPending] = useState('');
	const record = async (group: PayrollJournalGroup) => {
		if (pending) return;
		setPending(group.runId);
		try {
			const result = await recordPayrollTransaction(companyId, group.runId);
			toast.success(result.alreadyRecorded ? 'Transaksi payroll sudah tercatat; tidak dibuat duplikat.' : 'Transaksi payroll tercatat menggunakan jurnal yang sudah ada.');
			onRecorded();
		} catch (error) {
			toast.error(payrollErrorMessage(error, 'Gagal mencatat transaksi payroll. Silakan coba lagi.'));
		} finally {
			setPending('');
		}
	};
	if (groups.length === 0) return <p className="px-5 py-8 text-sm text-muted-foreground">Belum ada periode payroll yang diterbitkan untuk perusahaan ini. Terbitkan jurnal melalui menu Penggajian.</p>;
	return <>
		<div className="overflow-x-auto">
			<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
				<thead className="sticky top-0 z-20"><tr className="text-left text-[13px] font-semibold text-slate-900">
					{columns.date && <th className="border-b border-slate-200 px-5 py-2.5">Tanggal</th>}
					{columns.partner && <th className="border-b border-slate-200 px-2 py-2.5">Sumber</th>}
					{columns.description && <th className="border-b border-slate-200 px-2 py-2.5">Keterangan</th>}
					{columns.debit && <th className="border-b border-slate-200 px-2 py-2.5">Akun Debit</th>}
					{columns.credit && <th className="border-b border-slate-200 px-2 py-2.5">Akun Kredit</th>}
					{columns.amount && <th className="border-b border-slate-200 px-2 py-2.5 text-right">Nominal</th>}
					{columns.status && <th className="border-b border-slate-200 px-2 py-2.5 text-right">Status</th>}
					<th className="border-b border-slate-200 px-2 py-2.5 text-right">Aksi</th>
				</tr></thead>
				<tbody>{groups.map(group => {
					const debit = group.lines.filter(line => Number(line.debit) > 0);
					const credit = group.lines.filter(line => Number(line.credit) > 0);
					const label = (lines: JournalEntry[]) => lines.length > 1 ? `Beberapa akun (${lines.length})` : lines[0]?.expand?.account ? `${lines[0].expand.account.code} — ${lines[0].expand.account.name}` : '—';
					const debitTotal = group.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
					const creditTotal = group.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
					const valid = group.lines.length >= 2 && debit.length > 0 && credit.length > 0 && !group.lines.some(line => line.transaction) && debitTotal > 0 && Math.abs(debitTotal - creditTotal) < 0.005;
					return <tr key={group.runId} className="border-b border-slate-100 hover:bg-slate-50">
						{columns.date && <td className="whitespace-nowrap px-5 py-3">{formatDate(group.date)}</td>}
						{columns.partner && <td className="px-2 py-3 font-semibold">Running Payroll</td>}
						{columns.description && <td className="px-2 py-3"><p>{group.description}</p><span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><Calculator className="size-3" /> Payroll{group.run.period ? ` · ${group.run.period}` : ''}</span></td>}
						{columns.debit && <td className="px-2 py-3">{label(debit)}</td>}
						{columns.credit && <td className="px-2 py-3">{label(credit)}</td>}
						{columns.amount && <td className="whitespace-nowrap px-2 py-3 text-right font-medium tabular-nums">{group.lines.length ? formatRupiah(group.total) : '—'}</td>}
						{columns.status && <td className="px-2 py-3 text-right"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${group.transaction ? 'bg-emerald-500 text-white' : valid ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{group.transaction ? 'Tercatat' : valid ? 'Belum dicatat' : 'Jurnal perlu diperiksa'}</span></td>}
						<td className="px-2 py-3"><div className="flex justify-end gap-2 whitespace-nowrap">
							{group.lines.length > 0 && <button type="button" onClick={() => setSelected(group)} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"><Wallet className="size-3.5" /> Lihat Jurnal</button>}
							{!group.transaction && <button type="button" disabled={!valid || Boolean(pending)} onClick={() => { void record(group); }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{pending === group.runId ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Catat Transaksi</button>}
						</div></td>
					</tr>;
				})}</tbody>
			</table>
		</div>
		{groups.some(group => group.lines.length < 2 || group.total <= 0 || Math.abs(group.total - group.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0)) >= 0.005) && <p className="px-5 text-sm text-amber-800">Ada jurnal yang tidak lengkap atau tidak seimbang. Periksa periode dan riwayat jurnal sebelum mencatat transaksi.</p>}
		<Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}>
			<DialogContent className="max-h-[85vh] overflow-auto rounded-xl bg-white sm:max-w-3xl">
				<DialogHeader><DialogTitle>Laporan Jurnal Running Payroll</DialogTitle><DialogDescription>Rincian akun debit dan kredit untuk {selected?.description}.</DialogDescription></DialogHeader>
				<table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-3">Akun</th><th className="py-3 text-right">Debit</th><th className="py-3 text-right">Kredit</th></tr></thead><tbody>
					{selected?.lines.map(line => <tr key={line.id} className="border-b"><td className="py-3 pr-4">{line.expand?.account ? `${line.expand.account.code} — ${line.expand.account.name}` : 'Akun tidak tersedia'}</td><td className="py-3 text-right tabular-nums">{formatRupiah(Number(line.debit) || 0)}</td><td className="py-3 text-right tabular-nums">{formatRupiah(Number(line.credit) || 0)}</td></tr>)}
					<tr className="font-bold"><td className="py-3">Total</td><td className="py-3 text-right">{formatRupiah(selected?.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) || 0)}</td><td className="py-3 text-right">{formatRupiah(selected?.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0) || 0)}</td></tr>
				</tbody></table>
			</DialogContent>
		</Dialog>
	</>;
}
