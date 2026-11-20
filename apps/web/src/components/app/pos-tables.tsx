import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	ArrowLeft,
	LayoutGrid,
	Plus,
	Store,
	Trash2,
	Users,
	CheckCircle2,
	Clock,
	Receipt,
	Pause,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, formatDate, type Company } from '@/lib/accounting';
import type { Table } from '@/lib/tables';
import type { BusinessDocument } from '@/lib/documents';
import { loadHeldOrders, type HeldOrder } from '@/lib/pos-held-orders';
import { NoCompany } from '@/components/app/no-company';
import { toast } from 'sonner';

interface PosTablesProps {
	activeCompany: Company | null;
}

interface TableStatus {
	table: Table;
	occupied: boolean;
	openInvoice?: BusinessDocument;
	heldOrder?: HeldOrder;
}

/**
 * Halaman daftar meja untuk POS dine-in.
 *
 * Menampilkan semua meja perusahaan aktif beserta status ketersediaannya:
 * kosong (tersedia) atau terisi (ada invoice belum lunas atau pesanan
 * tertahan yang menggunakan meja tersebut).
 */
export function PosTables({ activeCompany }: PosTablesProps) {
	const [tables, setTables] = useState<Table[]>([]);
	const [invoices, setInvoices] = useState<BusinessDocument[]>([]);
	const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	// Tambah / hapus meja.
	const [newTableName, setNewTableName] = useState('');
	const [newTableCapacity, setNewTableCapacity] = useState('');
	const [isSavingTable, setIsSavingTable] = useState(false);

	useEffect(() => {
		if (!activeCompany) {
			setTables([]);
			setInvoices([]);
			setHeldOrders([]);
			setIsLoading(false);
			return;
		}
		let cancelled = false;
		setIsLoading(true);
		setHeldOrders(loadHeldOrders(activeCompany.id));
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		const invoiceFilter = pb.filter(
			'company = {:company} && direction = "penjualan" && stage = "invoice" && table != ""',
			{ company: activeCompany.id },
		);
		Promise.allSettled([
			pb.collection('tables').getFullList<Table>({
				filter: companyFilter,
				sort: 'sort_order,name',
				requestKey: 'pos-tables-list',
			}),
			pb.collection('documents').getFullList<BusinessDocument>({
				filter: invoiceFilter,
				sort: '-date,-created',
				expand: 'contact,student',
				requestKey: 'pos-tables-invoices',
			}),
		])
			.then(results => {
				if (cancelled) return;
				setTables(results[0].status === 'fulfilled' ? results[0].value : []);
				setInvoices(results[1].status === 'fulfilled' ? results[1].value : []);
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	// Status per meja: terisi bila ada invoice belum lunas (saldo > 0) ATAU ada
	// pesanan tertahan (held) yang menggunakan meja tersebut.
	const tableStatuses = useMemo<TableStatus[]>(() => {
		return tables.map(table => {
			const openInvoice = invoices.find(inv => {
				if (inv.table !== table.id) return false;
				const total = Number(inv.total) || 0;
				const paid = Number(inv.paid_amount) || 0;
				return paid < total;
			});
			const heldOrder = heldOrders.find(o => o.tableId === table.id);
			return {
				table,
				occupied: Boolean(openInvoice) || Boolean(heldOrder),
				openInvoice,
				heldOrder,
			};
		});
	}, [tables, invoices, heldOrders]);

	const occupiedCount = tableStatuses.filter(t => t.occupied).length;
	const availableCount = tableStatuses.length - occupiedCount;

	const handleAddTable = async () => {
		if (!activeCompany) return;
		const name = newTableName.trim();
		if (!name) {
			toast.error('Nama meja wajib diisi.');
			return;
		}
		setIsSavingTable(true);
		try {
			const rec = await pb.collection('tables').create<Table>({
				company: activeCompany.id,
				name,
				capacity: Number(newTableCapacity) || 0,
				sort_order: tables.length,
				owner: pb.authStore.record?.id ?? '',
			});
			setTables(prev =>
				[...prev, rec].sort(
					(a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name),
				),
			);
			setNewTableName('');
			setNewTableCapacity('');
			toast.success(`Meja "${name}" ditambahkan.`);
		} catch {
			toast.error('Gagal menambahkan meja.');
		} finally {
			setIsSavingTable(false);
		}
	};

	const handleDeleteTable = async (table: Table) => {
		if (!window.confirm(`Hapus meja "${table.name}"?`)) return;
		try {
			await pb.collection('tables').delete(table.id);
			setTables(prev => prev.filter(t => t.id !== table.id));
			toast.success(`Meja "${table.name}" dihapus.`);
		} catch {
			toast.error('Gagal menghapus meja.');
		}
	};

	if (!activeCompany) {
		return <NoCompany />;
	}

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<Link
						to="/app/pos"
						className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
					>
						<ArrowLeft className="size-4" /> Kembali ke Kasir
					</Link>
					<h1 className="mt-2 flex items-center gap-2.5 text-3xl font-extrabold tracking-tight md:text-4xl">
						<LayoutGrid className="size-7 text-primary" strokeWidth={2} /> Daftar Meja
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Pantau meja yang kosong dan terisi untuk pesanan dine-in.
					</p>
				</div>
				<Link
					to="/app/pos"
					className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<Store className="size-4" /> Buka Kasir
				</Link>
			</header>

			{/* Ringkasan status */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<div className="rounded-2xl border border-border bg-card p-4 shadow-soft-sm">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						Total Meja
					</p>
					<p className="mt-1 text-2xl font-extrabold text-foreground">{tableStatuses.length}</p>
				</div>
				<div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-soft-sm">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
						Kosong
					</p>
					<p className="mt-1 text-2xl font-extrabold text-emerald-700">{availableCount}</p>
				</div>
				<div className="col-span-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-soft-sm sm:col-span-1">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
						Terisi
					</p>
					<p className="mt-1 text-2xl font-extrabold text-amber-700">{occupiedCount}</p>
				</div>
			</div>

			{/* Tambah meja */}
			<section className="rounded-2xl border border-border bg-card p-4 shadow-soft-sm">
				<h2 className="flex items-center gap-2 text-sm font-bold">
					<Plus className="size-4 text-primary" /> Tambah Meja
				</h2>
				<div className="mt-3 flex flex-wrap items-end gap-2">
					<div className="flex flex-1 flex-col gap-1.5">
						<label
							htmlFor="tables-new-name"
							className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
						>
							Nama Meja
						</label>
						<input
							id="tables-new-name"
							value={newTableName}
							onChange={e => setNewTableName(e.target.value)}
							placeholder="Meja 1"
							className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>
					<div className="flex w-28 flex-col gap-1.5">
						<label
							htmlFor="tables-new-cap"
							className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
						>
							Kursi
						</label>
						<input
							id="tables-new-cap"
							type="number"
							min="0"
							value={newTableCapacity}
							onChange={e => setNewTableCapacity(e.target.value)}
							placeholder="4"
							className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>
					<button
						type="button"
						onClick={handleAddTable}
						disabled={isSavingTable}
						className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
					>
						<Plus className="size-4" /> Tambah
					</button>
				</div>
			</section>

			{/* Grid meja */}
			{isLoading ? (
				<p className="px-2 py-8 text-sm font-semibold text-muted-foreground">Memuat meja…</p>
			) : tableStatuses.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
					<LayoutGrid className="mx-auto size-8 text-muted-foreground/50" />
					<p className="mt-3 text-sm font-semibold text-muted-foreground">
						Belum ada meja. Tambahkan meja di atas untuk pesanan dine-in.
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{tableStatuses.map(({ table, occupied, openInvoice, heldOrder }) => {
						const total = Number(openInvoice?.total) || 0;
						const paid = Number(openInvoice?.paid_amount) || 0;
						const remaining = openInvoice ? Math.max(0, total - paid) : 0;
						const partner =
							openInvoice?.expand?.contact?.name ??
							openInvoice?.expand?.student?.student_name ??
							openInvoice?.partner ??
							'';
						const heldItemCount = heldOrder
							? heldOrder.cart.reduce((s, i) => s + (i.quantity || 0), 0)
							: 0;
						return (
							<div
								key={table.id}
								className={
									'flex flex-col gap-3 rounded-2xl border p-4 shadow-soft-sm transition-colors ' +
									(occupied
										? 'border-amber-300 bg-amber-50/50'
										: 'border-emerald-200 bg-emerald-50/40')
								}
							>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<p className="truncate text-base font-extrabold text-foreground">
											{table.name}
										</p>
										<p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
											<Users className="size-3" />
											{table.capacity ? `${table.capacity} kursi` : 'Tanpa kapasitas'}
										</p>
									</div>
									{occupied ? (
										<span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white">
											<Clock className="size-3" /> Terisi
										</span>
									) : (
										<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white">
											<CheckCircle2 className="size-3" /> Kosong
										</span>
									)}
								</div>

								{openInvoice ? (
									<div className="rounded-xl bg-white/70 p-3 text-xs">
										<p className="flex items-center gap-1.5 font-bold text-foreground">
											<Receipt className="size-3.5 text-primary" />
											{openInvoice.number || '—'}
										</p>
										<p className="mt-1 text-muted-foreground">
											{partner || 'Pelanggan Umum'}
										</p>
										<div className="mt-1.5 flex items-center justify-between">
											<span className="text-muted-foreground">{formatDate(openInvoice.date)}</span>
											<span className="font-bold text-amber-700">
												Sisa {formatRupiah(remaining)}
											</span>
										</div>
									</div>
								) : heldOrder ? (
									<div className="rounded-xl bg-white/70 p-3 text-xs">
										<p className="flex items-center gap-1.5 font-bold text-foreground">
											<Pause className="size-3.5 text-amber-600" />
											{heldOrder.label}
										</p>
										<p className="mt-1 text-muted-foreground">
											{heldItemCount} item ditahan
										</p>
										<p className="mt-1.5 font-bold text-amber-700">
											Pesanan ditahan
										</p>
									</div>
								) : (
									<p className="text-xs font-medium text-emerald-700">
										Tersedia untuk pesanan baru.
									</p>
								)}

								<div className="mt-auto flex items-center justify-between gap-2 pt-1">
									<Link
										to="/app/pos"
										className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-accent"
									>
										<Store className="size-3.5" /> Kasir
									</Link>
									<button
										type="button"
										onClick={() => handleDeleteTable(table)}
										aria-label={`Hapus meja ${table.name}`}
										className="flex size-8 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
									>
										<Trash2 className="size-4" />
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
