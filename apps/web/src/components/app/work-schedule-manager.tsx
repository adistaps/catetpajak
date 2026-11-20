import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, ChevronDown, FileText, Plus, Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Company } from '@/lib/accounting';
import { toDateInputValue } from '@/lib/attendance';
import {
	DAY_NAMES, emptyScheduleDay, listWorkSchedules, saveWorkSchedule, scheduleError,
	type ScheduleDay, type ScheduleEmployee, type WorkSchedule,
} from '@/lib/work-schedules';

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
const outlineButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50';
const primaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50';
const displayOrder = [1, 2, 3, 4, 5, 6, 0];
type Tab = 'jadwal' | 'shift' | 'istirahat' | 'mesin';

function dateLabel(date: string): string {
	if (!date) return '—';
	return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}
function draft(company: string): WorkSchedule {
	return { id: '', company, name: '', effective_date: toDateInputValue(), description: '', is_active: true, days: DAY_NAMES.map((_, i) => i === 0 || i === 6 ? { ...emptyScheduleDay(), work: false, shift: '', start: '', end: '' } : emptyScheduleDay()), employees: [], updated: '' };
}

export function WorkScheduleManager({ company }: { company: Company }) {
	const [items, setItems] = useState<WorkSchedule[]>([]);
	const [employees, setEmployees] = useState<ScheduleEmployee[]>([]);
	const [canEdit, setCanEdit] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [tab, setTab] = useState<Tab>('jadwal');
	const [active, setActive] = useState(true);
	const [query, setQuery] = useState('');
	const [editing, setEditing] = useState<WorkSchedule | null>(null);
	const [searchEmployee, setSearchEmployee] = useState('');
	const [saving, setSaving] = useState(false);
	const savingRef = useRef(false);
	const [details, setDetails] = useState<{ title: string; text: string } | null>(null);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);

	useEffect(() => {
		if (!editing && !details) return;
		const handleKey = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			if (details) setDetails(null);
			else if (!savingRef.current) setEditing(null);
		};
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	}, [editing, details]);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const result = await listWorkSchedules(company.id);
			setItems(result.items);
			setEmployees(result.employees);
			setCanEdit(result.canEdit);
			setError('');
		} catch (err) { setError(scheduleError(err, 'Jadwal tidak dapat dimuat.')); }
		finally { setLoading(false); }
	}, [company.id]);
	useEffect(() => { void refresh(); }, [refresh]);

	const visible = useMemo(() => items.filter(item => item.is_active === active && item.name.toLowerCase().includes(query.trim().toLowerCase())), [items, active, query]);
	const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const shownItems = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	const employeeMap = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);
	const matchingEmployees = employees.filter(employee => employee.name.toLowerCase().includes(searchEmployee.trim().toLowerCase()) || employee.position.toLowerCase().includes(searchEmployee.trim().toLowerCase()));
	const openEditor = (item?: WorkSchedule) => {
		setSearchEmployee('');
		setEditing(item ? { ...item, days: item.days.map(day => ({ ...day })), employees: [...item.employees] } : draft(company.id));
	};
	const updateDay = (index: number, patch: Partial<ScheduleDay>) => setEditing(current => current ? { ...current, days: current.days.map((day, i) => i === index ? { ...day, ...patch } : day) } : null);
	const save = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!editing || savingRef.current) return;
		if (editing.employees.length > 2000) { toast.error('Maksimal 2.000 karyawan per jadwal.'); return; }
		for (const day of editing.days) {
			if (!day.work) continue;
			if (!day.shift.trim() || !day.start || !day.end || day.start >= day.end) { toast.error('Lengkapi nama dan jam shift; jam pulang harus setelah jam masuk pada hari yang sama.'); return; }
			if ((day.breakStart || day.breakEnd) && (!day.breakStart || !day.breakEnd || day.breakStart >= day.breakEnd || day.breakStart < day.start || day.breakEnd > day.end)) { toast.error('Jam istirahat harus lengkap dan berada di dalam jam kerja.'); return; }
		}
		savingRef.current = true;
		setSaving(true);
		try {
			await saveWorkSchedule(editing);
			setEditing(null);
			toast.success('Jadwal kerja disimpan.');
			await refresh();
		} catch (err) { toast.error(scheduleError(err, 'Jadwal tidak dapat disimpan.')); }
		finally { savingRef.current = false; setSaving(false); }
	};
	const toggleStatus = async (item: WorkSchedule) => {
		if (savingRef.current) return;
		savingRef.current = true;
		setSaving(true);
		try {
			await saveWorkSchedule({ ...item, is_active: !item.is_active });
			toast.success(item.is_active ? 'Jadwal dinonaktifkan.' : 'Jadwal diaktifkan.');
			await refresh();
		} catch (err) { toast.error(scheduleError(err, 'Status jadwal tidak dapat diubah.')); }
		finally { savingRef.current = false; setSaving(false); }
	};
	const summaryRows = items.filter(item => item.is_active === active).flatMap(item => displayOrder.map(index => ({ schedule: item, day: item.days[index], index })).filter(row => row.day?.work));

	return (
		<section className="min-w-0 bg-[#f7f8fb] text-slate-800">
			<header className="flex flex-wrap items-start justify-between gap-4 px-4 pb-4 pt-5 md:px-6">
				<div><h1 className="text-2xl font-bold tracking-tight">Absensi</h1><p className="mt-1 text-xs text-slate-500">{company.name}</p></div>
				{canEdit && tab !== 'mesin' ? <button type="button" disabled={loading || Boolean(error)} className={primaryButton} onClick={() => openEditor()}><Plus className="size-4" /> Buat jadwal baru</button> : null}
			</header>
			<nav aria-label="Pengaturan jadwal absensi" className="flex gap-6 overflow-x-auto border-b border-slate-300 px-4 md:px-6">
				{([['jadwal', 'Jadwal'], ['shift', 'Shift'], ['istirahat', 'Istirahat'], ['mesin', 'Mesin']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined} className={`shrink-0 border-b-2 px-0.5 pb-3 pt-2 text-sm ${tab === key ? 'border-emerald-600 font-semibold text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>{label}</button>)}
			</nav>
			<div className="min-h-80 bg-white px-4 py-5 md:px-6">
				{tab === 'mesin' ? <div className="py-12 text-center"><h2 className="font-semibold">Mesin absensi</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Integrasi mesin absensi belum tersedia. Jadwal tetap digunakan untuk Live Attendance melalui aplikasi.</p></div> : <>
					<div className="mb-5 flex flex-wrap items-center gap-3">
						<div className="inline-flex rounded-md border border-slate-300 p-1" aria-label="Status jadwal">
							{([true, false] as const).map(value => <button type="button" key={String(value)} onClick={() => { setActive(value); setPage(1); }} className={`rounded px-3 py-1.5 text-sm ${active === value ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-slate-500'}`}>{value ? 'Aktif' : 'Tidak aktif'}</button>)}
						</div>
						{tab === 'jadwal' ? <label className="relative ml-auto min-w-48 max-w-sm flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><span className="sr-only">Cari nama jadwal</span><input className={`${inputClass} pl-9`} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Cari nama jadwal" /></label> : null}
					</div>
					{tab === 'jadwal' ? <p className="mb-4 text-xs leading-5 text-slate-500">Bila belum ada jadwal yang berlaku, Live Attendance menggunakan jam absensi yang sudah ada atau jam bawaan 08:00–17:00. Jadwal aktif dengan tanggal berlaku terbaru digunakan; perubahan jadwal berlaku untuk clock in berikutnya dan tidak mengubah absensi yang telah tercatat. Menonaktifkan jadwal dapat membuat jadwal aktif sebelumnya kembali berlaku.</p> : null}
					{error ? <div role="alert" className="rounded-md bg-rose-50 p-4 text-sm text-rose-700">{error} <button type="button" className="font-semibold underline" onClick={() => void refresh()}>Coba lagi</button></div> : loading ? <p className="py-10 text-center text-sm text-slate-500">Memuat jadwal…</p> : tab === 'jadwal' ? <>
						<div className="overflow-x-auto pb-24 -mb-20"><table className="w-full min-w-[860px] text-left text-sm"><thead className="border-b-2 border-slate-300 bg-slate-50 text-slate-800"><tr><th className="px-4 py-4 font-semibold">Nama jadwal</th><th className="px-4 py-4 font-semibold">Tanggal berlaku</th><th className="px-4 py-4 font-semibold">Pola shift</th><th className="px-4 py-4 font-semibold">Ditetapkan ke</th><th className="px-4 py-4 font-semibold">Deskripsi</th><th className="border-l border-slate-300 px-4 py-4"><span className="sr-only">Tindakan</span></th></tr></thead><tbody>
							{shownItems.map(item => <tr key={item.id} className="border-b border-slate-200"><td className="px-4 py-4 font-medium">{item.name}</td><td className="px-4 py-4 whitespace-nowrap">{dateLabel(item.effective_date)}</td><td className="px-4 py-4">7 hari · {item.days.filter(day => day.work).length} hari kerja</td><td className="px-4 py-4"><button type="button" className="text-emerald-700 underline" onClick={() => setDetails({ title: `Karyawan · ${item.name}`, text: item.employees.length ? item.employees.map(id => employeeMap.get(id)?.name || 'Karyawan tidak tersedia').join('\n') : 'Belum ada karyawan yang ditetapkan.' })}>{item.employees.length} karyawan</button></td><td className="px-4 py-4"><button type="button" className="inline-flex items-center gap-1 text-emerald-700 underline" onClick={() => setDetails({ title: `Deskripsi · ${item.name}`, text: item.description || 'Tidak ada deskripsi.' })}><FileText className="size-4" /> Lihat</button></td><td className="border-l border-slate-200 px-4 py-3">{canEdit ? <details className="relative w-fit"><summary className={`${outlineButton} cursor-pointer list-none`}>Tindakan <ChevronDown className="size-4" /></summary><div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg"><button type="button" className="block w-full px-4 py-2 text-left hover:bg-slate-50" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); openEditor(item); }}>Ubah jadwal</button><button type="button" disabled={saving} className="block w-full px-4 py-2 text-left hover:bg-slate-50 disabled:opacity-50" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void toggleStatus(item); }}>{item.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></div></details> : <span className="text-xs text-slate-400">Hanya lihat</span>}</td></tr>)}
						</tbody></table></div>
						{visible.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">{query ? 'Tidak ada jadwal yang cocok.' : `Belum ada jadwal ${active ? 'aktif' : 'tidak aktif'}.`}</p> : null}
						<div className="flex flex-wrap items-center justify-between gap-3 pt-5 text-sm text-slate-500"><div className="flex items-center gap-3"><label>Baris per halaman <select className="ml-1 rounded border border-slate-200 bg-white px-2 py-1" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><span>Menampilkan {visible.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, visible.length)} dari {visible.length}</span></div><div className="flex items-center gap-2"><button type="button" className={outlineButton} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Sebelumnya</button><span>{currentPage} dari {pageCount}</span><button type="button" className={outlineButton} disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Berikutnya</button></div></div>
					</> : <>
						<p className="mb-4 text-sm text-slate-500">{tab === 'shift' ? 'Jam kerja per hari mengikuti pola pada masing-masing jadwal.' : 'Jam istirahat ditetapkan per hari di dalam jadwal kerja.'}</p>
						<div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b-2 border-slate-300 bg-slate-50"><tr><th className="px-4 py-4">Jadwal</th><th className="px-4 py-4">Hari</th><th className="px-4 py-4">{tab === 'shift' ? 'Shift' : 'Istirahat'}</th><th className="px-4 py-4">{tab === 'shift' ? 'Jam kerja' : 'Shift'}</th><th className="px-4 py-4">Tanggal berlaku</th></tr></thead><tbody>{summaryRows.map(({ schedule, day, index }) => <tr key={`${schedule.id}-${index}`} className="border-b border-slate-200"><td className="px-4 py-4">{schedule.name}</td><td className="px-4 py-4">{DAY_NAMES[index]}</td><td className="px-4 py-4">{tab === 'shift' ? day.shift : day.breakStart && day.breakEnd ? `${day.breakStart} – ${day.breakEnd}` : 'Tidak diatur'}</td><td className="px-4 py-4">{tab === 'shift' ? `${day.start} – ${day.end}` : day.shift}</td><td className="px-4 py-4">{dateLabel(schedule.effective_date)}</td></tr>)}</tbody></table></div>
						{summaryRows.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">Belum ada pola yang dapat ditampilkan.</p> : null}
					</>}
				</>}
			</div>
			{editing ? <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="work-schedule-title"><form onSubmit={save} className="my-auto w-full max-w-4xl rounded-xl bg-white shadow-xl"><div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 id="work-schedule-title" className="text-lg font-bold">{editing.id ? 'Ubah jadwal kerja' : 'Buat jadwal kerja'}</h2><p className="mt-1 text-xs text-slate-500">Pola berulang setiap minggu mulai tanggal berlaku.</p></div><button type="button" aria-label="Tutup" disabled={saving} onClick={() => setEditing(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button></div><div className="space-y-5 px-5 py-5">
				<div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Nama jadwal <span className="text-rose-600">*</span><input required maxLength={120} className={`${inputClass} mt-1.5`} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Nama jadwal" /></label><label className="text-sm font-medium">Tanggal mulai berlaku <span className="text-rose-600">*</span><input required type="date" className={`${inputClass} mt-1.5`} value={editing.effective_date} onChange={e => setEditing({ ...editing, effective_date: e.target.value })} /></label></div>
				<label className="block text-sm font-medium">Deskripsi<textarea maxLength={500} rows={2} className={`${inputClass} mt-1.5`} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="Keterangan jadwal (opsional)" /></label>
				<div><div className="flex items-center gap-2"><CalendarDays className="size-4 text-emerald-700" /><h3 className="font-semibold">Pola shift dan istirahat</h3></div><p className="mt-1 text-xs leading-5 text-slate-500">Pilih hari kerja, nama shift, jam masuk dan pulang. Istirahat opsional. Shift lintas tengah malam belum didukung.</p><div className="mt-3 space-y-2">{displayOrder.map(index => { const day = editing.days[index]; return <div key={index} className="grid items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[100px_repeat(5,minmax(0,1fr))]"><label className="flex min-h-10 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={day.work} onChange={e => updateDay(index, e.target.checked ? emptyScheduleDay() : { work: false, shift: '', start: '', end: '', breakStart: '', breakEnd: '' })} className="size-4 accent-emerald-600" />{DAY_NAMES[index]}</label>{day.work ? <><label className="text-xs font-medium text-slate-600">Nama shift<input required maxLength={40} className={`${inputClass} mt-1`} value={day.shift} onChange={e => updateDay(index, { shift: e.target.value })} /></label><label className="text-xs font-medium text-slate-600">Masuk<input required type="time" className={`${inputClass} mt-1`} value={day.start} onChange={e => updateDay(index, { start: e.target.value })} /></label><label className="text-xs font-medium text-slate-600">Pulang<input required type="time" className={`${inputClass} mt-1`} value={day.end} onChange={e => updateDay(index, { end: e.target.value })} /></label><label className="text-xs font-medium text-slate-600">Istirahat mulai<input type="time" className={`${inputClass} mt-1`} value={day.breakStart} onChange={e => updateDay(index, { breakStart: e.target.value })} /></label><label className="text-xs font-medium text-slate-600">Istirahat selesai<input type="time" className={`${inputClass} mt-1`} value={day.breakEnd} onChange={e => updateDay(index, { breakEnd: e.target.value })} /></label></> : <span className="py-2 text-sm text-slate-500 sm:col-span-5">Hari libur</span>}</div>; })}</div></div>
				<div><div className="flex items-center gap-2"><Users className="size-4 text-emerald-700" /><h3 className="font-semibold">Tetapkan karyawan</h3><span className="text-xs text-slate-500">({editing.employees.length} dipilih)</span></div><p className="mt-1 text-xs leading-5 text-slate-500">Jika beberapa jadwal aktif ditetapkan, jadwal dengan tanggal berlaku terbaru digunakan. Tanggal berlaku yang sama tidak dapat bertabrakan. Maksimal 2.000 karyawan per jadwal.</p><input className={`${inputClass} mt-3`} value={searchEmployee} onChange={e => setSearchEmployee(e.target.value)} placeholder="Cari karyawan" aria-label="Cari karyawan" /><div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-slate-200">{matchingEmployees.length ? matchingEmployees.map(employee => <label key={employee.id} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-0"><input type="checkbox" className="size-4 accent-emerald-600" checked={editing.employees.includes(employee.id)} onChange={e => setEditing({ ...editing, employees: e.target.checked ? [...editing.employees, employee.id] : editing.employees.filter(id => id !== employee.id) })} /><span className="flex-1">{employee.name}<span className="ml-2 text-xs text-slate-500">{employee.position || 'Karyawan'}{employee.status === 'nonaktif' ? ' · Tidak aktif' : ''}</span></span></label>) : <p className="p-4 text-sm text-slate-500">Tidak ada karyawan yang cocok.</p>}</div></div>
				<label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-emerald-600" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Jadwal aktif</label>
			</div><div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" disabled={saving} className={outlineButton} onClick={() => setEditing(null)}>Batal</button><button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Menyimpan…' : 'Simpan jadwal'}</button></div></form></div> : null}
			{details ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="schedule-details-title"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between gap-3"><h2 id="schedule-details-title" className="font-bold">{details.title}</h2><button type="button" aria-label="Tutup" onClick={() => setDetails(null)} className="rounded-md p-2 hover:bg-slate-100"><X className="size-5" /></button></div><p className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-600">{details.text}</p><div className="mt-5 text-right"><button type="button" className={outlineButton} onClick={() => setDetails(null)}>Tutup</button></div></div></div> : null}
		</section>
	);
}
