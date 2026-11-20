import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	formatDate,
	formatRupiah,
	groupJournalEntries,
	type JournalEntry,
	type JournalTransaction,
} from '@/lib/accounting';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';

export default function AppJurnal() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const [entries, setEntries] = useState<JournalEntry[]>([]);

	useEffect(() => {
		if (!activeCompany) {
			setEntries([]);
			return;
		}
		let cancelled = false;
		const filter = pb.filter('company = {:company}', { company: activeCompany.id });
		pb
			.collection('entries')
			.getFullList<JournalEntry>({ filter, sort: '-date,-created', expand: 'account' })
			.then(entryList => {
				if (cancelled) return;
				setEntries(entryList);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const handleDelete = async (transaction: JournalTransaction) => {
		if (transaction.lines.some(line => line.payroll_run)) return;
		const count = transaction.lines.length;
		const label = count > 1 ? `transaksi ini (${count} baris akun)` : 'transaksi jurnal ini';
		if (!window.confirm(`Hapus ${label}?`)) return;
		const ids = new Set(transaction.lines.map(line => line.id));
		await Promise.all(transaction.lines.map(line => pb.collection('entries').delete(line.id)));
		setEntries(previous => previous.filter(item => !ids.has(item.id)));
	};

	const transactions = groupJournalEntries(entries);

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Jurnal Umum</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Satu baris per transaksi.
					</p>
				</div>
				<Link
					to="/app/jurnal/buat"
					className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
				>
					<Plus className="size-4" />
					Buat Jurnal Umum
				</Link>
			</header>

			<section className="bg-transparent">
				<div className="mb-3 flex justify-end">
					<h2 className="text-base font-semibold text-foreground">Daftar Akun</h2>
				</div>
				{entries.length === 0 ? (
					<p className="py-8 text-sm text-muted-foreground">Belum ada jurnal untuk perusahaan ini.</p>
				) : (
					<div className="overflow-x-auto bg-transparent">
						<table className="w-full min-w-[720px] border-collapse bg-transparent text-[13px] text-neutral-800">
							<thead>
								<tr className="border-b border-neutral-200 text-left text-[13px] font-semibold text-neutral-900">
									<th className="whitespace-nowrap px-3 py-2.5 font-semibold">Tanggal</th>
									<th className="whitespace-nowrap px-3 py-2.5 font-semibold">Nomor</th>
									<th className="whitespace-nowrap px-3 py-2.5 font-semibold">Referensi</th>
									<th className="whitespace-nowrap px-3 py-2.5 font-semibold">Jurnal</th>
									<th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Total</th>
									<th className="whitespace-nowrap px-3 py-2.5 font-semibold">Status</th>
									<th className="w-10 py-2.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{transactions.map(transaction => (
									<tr
										key={transaction.id}
										className="border-b border-neutral-200 bg-transparent align-top last:border-b hover:bg-foreground/[0.03]"
									>
										<td className="whitespace-nowrap px-3 py-2">{formatDate(transaction.date)}</td>
										<td className="whitespace-nowrap px-3 py-2 font-medium text-neutral-700">
											{transaction.number}
										</td>
										<td
												className="max-w-[220px] truncate px-3 py-2 text-neutral-600"
												title={transaction.description || undefined}
											>
												{transaction.description || '—'}
											</td>
											<td className="whitespace-nowrap px-3 py-2">Jurnal Umum</td>
											<td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
												{transaction.total ? formatRupiah(transaction.total) : '—'}
											</td>
											<td className="px-3 py-2">
												<span className="inline-flex rounded-full bg-[#22c55e] px-2.5 py-0.5 text-[11px] font-semibold leading-4 text-white">
													Tercatat
												</span>
											</td>
											<td className="py-1.5 text-right">
												<div className="flex items-center justify-end gap-1">
													{transaction.lines.some(line => line.payroll_run) ? <Link to="/app/biaya" className="text-xs font-semibold text-primary">Lihat Payroll</Link> : <>
													<Link
														to={`/app/jurnal/ubah/${transaction.id}`}
														aria-label="Edit jurnal"
														className="p-1 text-neutral-400 transition-colors hover:text-primary"
													>
														<Pencil className="size-3.5" />
													</Link>
													<button
														type="button"
														onClick={() => handleDelete(transaction)}
														aria-label="Hapus jurnal"
														className="p-1 text-neutral-400 transition-colors hover:text-destructive"
													>
														<Trash2 className="size-3.5" />
													</button>
													</>}
												</div>
											</td>
										</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	);
}
