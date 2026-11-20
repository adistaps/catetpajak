import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	Calendar,
	Download,
	Info,
	LogIn,
	LogOut,
	Printer,
	Radio,
	Search,
	Upload,
	Users,
	X,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import type { Company } from '@/lib/accounting';
import type { Employee } from '@/lib/payroll';
import {
	ATTENDANCE_CODE_LABELS,
	ATTENDANCE_CODES,
	countByCode,
	emptyAttendance,
	formatAttendanceDate,
	toDateInputValue,
	type AttendanceCode,
	type AttendanceRecord,
} from '@/lib/attendance';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import {
	calcOvertimeAmount,
	computeAutoOvertimeMinutes,
	type OvertimeCompensation,
	type OvertimeRequest,
	type OvertimeSettings,
	type OvertimeStatus,
} from '@/lib/overtime';
import { cn } from '@/lib/utils';
import { GeofenceSettingsPanel } from '@/components/app/attendance-geofence-settings';
import { listWorkSchedules, resolveSchedule, type WorkSchedule } from '@/lib/work-schedules';

interface AttendanceManagerProps {
	company: Company;
	/** Controlled side nav from parent (employee-manager rail). */
	sideNav: AttendanceSideNav;
	onSideNavChange: (nav: AttendanceSideNav) => void;
}

export type AttendanceSideNav =
	| 'live'
	| 'data'
	| 'activity'
	| 'report'
	| 'absence'
	| 'schedule'
	| 'setting';

/** Existing PB row or draft (empty id) for employees without a record yet. */
type AttendanceRow = AttendanceRecord;

export const ATTENDANCE_SIDE_ITEMS: { key: AttendanceSideNav; label: string; external?: boolean }[] =
	[
		{ key: 'live', label: 'Live attendance' },
		{ key: 'schedule', label: 'Jadwal kerja' },
		{ key: 'data', label: 'Attendance data' },
		{ key: 'activity', label: 'Attendance activity' },
		{ key: 'report', label: 'Attendance report' },
		{ key: 'absence', label: 'Absence deduction' },
		{ key: 'setting', label: 'Setting', external: true },
	];

const STAT_ORDER: { key: AttendanceCode; highlight?: boolean }[] = [
	{ key: 'on_time' },
	{ key: 'late_clock_in' },
	{ key: 'early_clock_out' },
	{ key: 'no_clock_out' },
	{ key: 'no_clock_in' },
	{ key: 'invalid' },
	{ key: 'absent' },
	{ key: 'day_off', highlight: true },
	{ key: 'time_off' },
];

/** Format a Date as HH:MM (24h, Asia/Jakarta locale). */
function formatNowTime(d: Date): string {
	return d.toLocaleTimeString('id-ID', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	});
}

/** Normalize loose time input to HH:MM. Module-level so it is safe to call
 * during render (before the in-component normalizeTime is initialized). */
function normalizeTimeValue(value: string): string {
	const v = (value ?? '').trim();
	if (!v || v === '—' || v === '-') return '';
	const m = v.match(/^(\d{1,2})[:.](\d{2})$/);
	if (m) {
		const h = Math.min(23, Math.max(0, Number(m[1])));
		const min = Math.min(59, Math.max(0, Number(m[2])));
		return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
	}
	const m2 = v.match(/^(\d{2})(\d{2})$/);
	if (m2) {
		const h = Math.min(23, Number(m2[1]));
		const min = Math.min(59, Number(m2[2]));
		return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
	}
	return v;
}

export function AttendanceManager({
	company,
	sideNav,
	onSideNavChange,
}: AttendanceManagerProps) {
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [records, setRecords] = useState<AttendanceRecord[]>([]);
	const [workSchedules, setWorkSchedules] = useState<WorkSchedule[]>([]);
	const [scheduleUnavailable, setScheduleUnavailable] = useState(true);
	const [date, setDate] = useState(toDateInputValue());
	const [search, setSearch] = useState('');
	const [codeFilter, setCodeFilter] = useState<'all' | AttendanceCode>('all');
	const [showBanner, setShowBanner] = useState(true);
	const [importOpen, setImportOpen] = useState(false);
	const [formOpen, setFormOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<Partial<AttendanceRecord>>(emptyAttendance(toDateInputValue()));
	const [saving, setSaving] = useState(false);
	const [loading, setLoading] = useState(true);
	const [inlineSaving, setInlineSaving] = useState<string | null>(null);
	const [now, setNow] = useState(() => new Date());
	const [liveBusy, setLiveBusy] = useState<string | null>(null);

	const ownerId = pb.authStore.record?.id ?? '';

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const companyFilter = pb.filter('company = {:company}', { company: company.id });
			const [emps, recs] = await Promise.all([
				pb.collection('employees').getFullList<Employee>({
					filter: companyFilter,
					sort: 'name',
				}),
				pb.collection('attendance_records').getFullList<AttendanceRecord>({
					filter: pb.filter('company = {:company} && date ~ {:date}', {
						company: company.id,
						date,
					}),
					sort: 'created',
					expand: 'employee',
				}),
			]);
			setEmployees(emps);
			setRecords(recs);
		} catch {
			toast.error('Gagal memuat data absensi.');
		} finally {
			setLoading(false);
		}
	}, [company.id, date]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		let cancelled = false;
		const load = () => listWorkSchedules(company.id).then(result => {
			if (!cancelled) { setWorkSchedules(result.items); setScheduleUnavailable(false); }
		}).catch(() => { if (!cancelled) { setWorkSchedules([]); setScheduleUnavailable(true); } });
		setScheduleUnavailable(true);
		void load();
		const timer = window.setInterval(() => void load(), 60_000);
		window.addEventListener('focus', load);
		return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', load); };
	}, [company.id]);

	// Live ticking clock — always running while the manager is mounted.
	useEffect(() => {
		const id = window.setInterval(() => setNow(new Date()), 1000);
		return () => window.clearInterval(id);
	}, []);

	// When entering Live attendance, pin the date to today so the realtime
	// feed and the data table both reflect the current working day.
	useEffect(() => {
		if (sideNav === 'live') {
			const today = toDateInputValue();
			setDate(prev => (prev === today ? prev : today));
		}
	}, [sideNav]);

	// Realtime subscription — keeps `records` in sync as clock-ins/outs happen
	// from any device (e.g. a karyawan clocking in via the self-service portal).
	// Active on both Live attendance and Attendance data so admins see updates
	// without manually reloading.
	useEffect(() => {
		if (sideNav !== 'live' && sideNav !== 'data') return;
		let active = true;
		void pb
			.collection('attendance_records')
			.subscribe('*', event => {
				if (!active) return;
				const next = event.record as unknown as AttendanceRecord;
				// Only track records for the currently selected date so the data
				// table (which is date-scoped) stays accurate.
				const recDate = (next.date ?? '').slice(0, 10);
				if (event.action !== 'delete' && recDate !== date) return;
				setRecords(prev => {
					if (event.action === 'delete') {
						return prev.filter(r => r.id !== next.id);
					}
					// Drop records that no longer match the selected date (e.g. after an edit).
					if (recDate !== date) return prev.filter(r => r.id !== next.id);
					const exists = prev.some(r => r.id === next.id);
					const emp = employees.find(e => e.id === next.employee);
					const withExpand: AttendanceRecord = { ...next, expand: next.expand ?? { employee: emp } };
					return exists
						? prev.map(r => (r.id === next.id ? { ...r, ...withExpand } : r))
						: [...prev, withExpand];
				});
			})
			.catch(error => console.error('Attendance subscription failed', error));
		return () => {
			active = false;
			void pb.collection('attendance_records').unsubscribe('*').catch(() => {});
		};
	}, [sideNav, employees, date]);

	const counts = useMemo(() => countByCode(records), [records]);

	/** One row per employee for the selected date (existing record or editable draft). */
	const tableRows = useMemo((): AttendanceRow[] => {
		const byEmp = new Map(records.map(r => [r.employee, r]));
		const rows: AttendanceRow[] = [];
		for (const emp of employees) {
			const existing = byEmp.get(emp.id);
			if (existing) {
				rows.push({
					...existing,
					expand: existing.expand ?? { employee: emp },
				});
				byEmp.delete(emp.id);
			} else if (emp.status !== 'nonaktif') {
				const schedule = resolveSchedule(workSchedules, emp.id, date);
				rows.push({
					id: '',
					company: company.id,
					employee: emp.id,
					date,
					shift: schedule ? (schedule.work ? schedule.shift : 'dayoff') : 'Regular',
					schedule_in: schedule ? (schedule.work ? schedule.start : '') : '08:00',
					schedule_out: schedule ? (schedule.work ? schedule.end : '') : '17:00',
					clock_in: '',
					clock_out: '',
					attendance_code: schedule && !schedule.work ? 'day_off' : 'no_clock_in',
					notes: '',
					owner: ownerId,
					created: '',
					expand: { employee: emp },
				});
			}
		}
		// Orphan records (employee deleted / not in list)
		for (const r of byEmp.values()) rows.push(r);
		return rows;
	}, [employees, records, company.id, date, ownerId, workSchedules]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return tableRows.filter(r => {
			if (codeFilter !== 'all' && r.attendance_code !== codeFilter) return false;
			if (!q) return true;
			const name = r.expand?.employee?.name ?? '';
			const pos = r.expand?.employee?.position ?? '';
			const id = r.expand?.employee?.id ?? r.employee;
			return (
				name.toLowerCase().includes(q) ||
				pos.toLowerCase().includes(q) ||
				id.toLowerCase().includes(q)
			);
		});
	}, [tableRows, search, codeFilter]);

	type LiveStatus =
		| 'not_in'
		| 'present'
		| 'late'
		| 'done'
		| 'day_off'
		| 'absent'
		| 'time_off';

	const LIVE_STATUS_LABELS: Record<LiveStatus, string> = {
		not_in: 'Belum masuk',
		present: 'Hadir',
		late: 'Terlambat',
		done: 'Selesai',
		day_off: 'Day off',
		absent: 'Absen',
		time_off: 'Time off',
	};

	const LIVE_STATUS_STYLES: Record<
		LiveStatus,
		{ count: string; badge: string; dot: string }
	> = {
		present: { count: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
		late: { count: 'text-amber-600', badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
		not_in: { count: 'text-slate-700', badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
		done: { count: 'text-indigo-600', badge: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
		day_off: { count: 'text-sky-600', badge: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
		absent: { count: 'text-rose-600', badge: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
		time_off: { count: 'text-violet-600', badge: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
	};

	function computeLiveStatus(rec: AttendanceRecord | undefined): LiveStatus {
		if (!rec || !rec.id) return 'not_in';
		if (rec.attendance_code === 'day_off') return 'day_off';
		if (rec.attendance_code === 'absent') return 'absent';
		if (rec.attendance_code === 'time_off') return 'time_off';
		const inVal = normalizeTimeValue(rec.clock_in ?? '');
		const outVal = normalizeTimeValue(rec.clock_out ?? '');
		if (inVal && outVal) return 'done';
		if (inVal && !outVal) {
			const schIn = normalizeTimeValue(rec.schedule_in || '08:00');
			return inVal > schIn ? 'late' : 'present';
		}
		return 'not_in';
	}

	const liveRows = useMemo(() => {
		const byEmp = new Map(records.map(r => [r.employee, r]));
		return employees
			.filter(e => e.status === 'aktif')
			.map(emp => {
				const rec = byEmp.get(emp.id);
				const schedule = resolveSchedule(workSchedules, emp.id, date);
				const status: LiveStatus = !rec?.clock_in && schedule && !schedule.work && (!rec || rec.attendance_code === 'no_clock_in') ? 'day_off' : computeLiveStatus(rec);
				return { emp, rec, schedule, status };
			});
	}, [employees, records, workSchedules, date]);

	const liveCounts = useMemo(() => {
		const counts = { not_in: 0, present: 0, late: 0, done: 0, day_off: 0, absent: 0, time_off: 0 } as Record<LiveStatus, number>;
		for (const row of liveRows) counts[row.status] += 1;
		return counts;
	}, [liveRows]);

	const liveClockIn = async (emp: Employee) => {
		setLiveBusy(emp.id);
		try {
			if (date !== toDateInputValue()) { setDate(toDateInputValue()); toast.error('Tanggal telah berubah. Memuat absensi hari ini.'); return; }
			const time = normalizeTimeValue(formatNowTime(new Date()));
			const latest = await listWorkSchedules(company.id);
			const schedule = resolveSchedule(latest.items, emp.id, date);
			if (schedule && !schedule.work) { toast.error('Hari ini adalah hari libur pada jadwal karyawan.'); return; }
			const schIn = schedule?.start || '08:00';
			const schOut = schedule?.end || '17:00';
			const code: AttendanceCode = time > schIn ? 'late_clock_in' : 'no_clock_out';
			const matches = await pb.collection('attendance_records').getFullList<AttendanceRecord>({
				filter: pb.filter('company = {:company} && employee = {:employee} && date ~ {:date}', { company: company.id, employee: emp.id, date }),
				requestKey: null,
			});
			const existing = matches[0];
			if (existing?.clock_in || existing?.clock_out || existing?.attendance_code === 'day_off' || existing?.attendance_code === 'time_off') {
				toast.error('Status absensi telah berubah atau ditandai libur/cuti. Muat ulang data.');
				await refresh();
				return;
			}
			const payload = {
				company: company.id,
				employee: emp.id,
				date,
				shift: schedule?.shift || 'Regular',
				schedule_in: schIn,
				schedule_out: schOut,
				clock_in: time,
				clock_out: '',
				attendance_code: code,
				notes: '',
				owner: ownerId,
			};
			if (existing?.id) {
				await pb.collection('attendance_records').update(existing.id, { shift: payload.shift, schedule_in: payload.schedule_in, schedule_out: payload.schedule_out, clock_in: payload.clock_in, attendance_code: payload.attendance_code }, {
					requestKey: `live-upd-in-${emp.id}`,
				});
			} else {
				await pb.collection('attendance_records').create(payload, {
					requestKey: `live-create-in-${emp.id}`,
				});
			}
			await refresh();
			toast.success(`${emp.name} clock in pukul ${time}.`);
		} catch {
			toast.error('Gagal mencatat clock in.');
		} finally {
			setLiveBusy(null);
		}
	};

	const liveClockOut = async (emp: Employee) => {
		setLiveBusy(emp.id);
		try {
			if (date !== toDateInputValue()) { setDate(toDateInputValue()); toast.error('Tanggal telah berubah. Memuat absensi hari ini.'); return; }
			const time = normalizeTimeValue(formatNowTime(new Date()));
			const matches = await pb.collection('attendance_records').getFullList<AttendanceRecord>({
				filter: pb.filter('company = {:company} && employee = {:employee} && date ~ {:date}', { company: company.id, employee: emp.id, date }),
				requestKey: null,
			});
			const existing = matches[0];
			if (!existing) {
				toast.error('Belum ada data clock in untuk karyawan ini hari ini.');
				return;
			}
			if (!existing.clock_in || existing.clock_out) { toast.error('Status absensi telah berubah. Muat ulang data.'); await refresh(); return; }
			const inVal = normalizeTimeValue(existing.clock_in ?? '');
			const schOut = normalizeTimeValue(existing.schedule_out || '17:00');
			const schIn = normalizeTimeValue(existing.schedule_in || '08:00');
			const code: AttendanceCode =
				!inVal ? 'no_clock_in' : time < schOut ? 'early_clock_out' : inVal > schIn ? 'late_clock_in' : 'on_time';
			await pb.collection('attendance_records').update(
				existing.id,
				{ clock_out: time, attendance_code: code },
				{ requestKey: `live-upd-out-${emp.id}` },
			);
			await refresh();
			toast.success(`${emp.name} clock out pukul ${time}.`);
		} catch {
			toast.error('Gagal mencatat clock out.');
		} finally {
			setLiveBusy(null);
		}
	};

	const openCreate = () => {
		setEditingId(null);
		setForm({ ...emptyAttendance(date), employee: employees[0]?.id ?? '' });
		setFormOpen(true);
	};

	const openEdit = (rec: AttendanceRow) => {
		if (!rec.id) {
			setEditingId(null);
			setForm({
				...emptyAttendance(date),
				employee: rec.employee,
				shift: rec.shift,
				schedule_in: rec.schedule_in,
				schedule_out: rec.schedule_out,
			});
		} else {
			setEditingId(rec.id);
			setForm({ ...rec });
		}
		setFormOpen(true);
	};

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!form.employee) {
			toast.error('Pilih karyawan.');
			return;
		}
		setSaving(true);
		try {
			const payload = {
				company: company.id,
				employee: form.employee,
				date: (form.date || date).slice(0, 10),
				shift: form.shift ?? '',
				schedule_in: form.schedule_in ?? '',
				schedule_out: form.schedule_out ?? '',
				clock_in: normalizeTime(form.clock_in ?? ''),
				clock_out: normalizeTime(form.clock_out ?? ''),
				attendance_code: (form.attendance_code ?? 'on_time') as AttendanceCode,
				notes: form.notes ?? '',
				owner: ownerId,
			};
			if (editingId) {
				await pb.collection('attendance_records').update(editingId, payload);
				toast.success('Absensi diperbarui.');
			} else {
				// Upsert: if a record already exists for this employee+date, update it
				// instead of failing on the unique (company, employee, date) index.
				let existing = records.find(
					r => r.employee === payload.employee && (r.date ?? '').slice(0, 10) === payload.date,
				);
				if (!existing) {
					try {
						const found = await pb.collection('attendance_records').getFirstListItem<AttendanceRecord>(
							pb.filter(
								'company = {:company} && employee = {:employee} && date = {:date}',
								{ company: company.id, employee: payload.employee, date: payload.date },
							),
						);
						existing = found;
					} catch {
						/* no existing record — proceed to create */
					}
				}
				if (existing) {
					await pb.collection('attendance_records').update(existing.id, payload);
					toast.success('Absensi diperbarui.');
				} else {
					await pb.collection('attendance_records').create(payload);
					toast.success('Absensi ditambahkan.');
				}
			}
			setFormOpen(false);
			await refresh();
			if (payload.clock_in && payload.clock_out) {
				const emp = employees.find(e => e.id === payload.employee);
				void maybeAutoOvertime(
					emp,
					payload.date,
					payload.schedule_in || '08:00',
					payload.schedule_out || '17:00',
					payload.clock_in,
					payload.clock_out,
				);
			}
		} catch {
			toast.error('Gagal menyimpan absensi. Pastikan tidak duplikat tanggal untuk karyawan yang sama.');
		} finally {
			setSaving(false);
		}
	};

	const remove = async (rec: AttendanceRow) => {
		if (!rec.id) {
			toast.info('Belum ada data absensi untuk dihapus.');
			return;
		}
		const name = rec.expand?.employee?.name ?? 'karyawan';
		if (!window.confirm(`Hapus absensi ${name}?`)) return;
		try {
			await pb.collection('attendance_records').delete(rec.id);
			await refresh();
			toast.success('Absensi dihapus.');
		} catch {
			toast.error('Gagal menghapus.');
		}
	};

	const normalizeTime = (value: string) => {
		const v = value.trim();
		if (!v || v === '—' || v === '-') return '';
		const m = v.match(/^(\d{1,2})[:.](\d{2})$/);
		if (m) {
			const h = Math.min(23, Math.max(0, Number(m[1])));
			const min = Math.min(59, Math.max(0, Number(m[2])));
			return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
		}
		// HHMM
		const m2 = v.match(/^(\d{2})(\d{2})$/);
		if (m2) {
			const h = Math.min(23, Number(m2[1]));
			const min = Math.min(59, Number(m2[2]));
			return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
		}
		return v;
	};

	const maybeAutoOvertime = async (
		emp: Employee | undefined,
		recDate: string,
		scheduleIn: string,
		scheduleOut: string,
		clockIn: string,
		clockOut: string,
	) => {
		if (!emp || !clockIn || !clockOut) return;
		try {
			const settingsList = await pb
				.collection('overtime_settings')
				.getFullList<OvertimeSettings>({
					filter: pb.filter('company = {:company}', { company: company.id }),
					requestKey: null,
				});
			const s = settingsList[0];
			if (!s || !s.auto_overtime) return;
			const { before, after, total } = computeAutoOvertimeMinutes({
				scheduleIn,
				scheduleOut,
				clockIn,
				clockOut,
			});
			const beforeThreshold = s.overtime_before_minutes ?? 0;
			const afterThreshold = s.overtime_after_minutes ?? 0;
			const beforeOk = beforeThreshold <= 0 ? before > 0 : before >= beforeThreshold;
			const afterOk = afterThreshold <= 0 ? after > 0 : after >= afterThreshold;
			if (!beforeOk || !afterOk || total <= 0) return;
			const hourly = Math.round((emp.basic_salary || 0) / 173);
			const multiplier = s.weekday_multiplier || 1.5;
			const amount = calcOvertimeAmount(hourly, total, multiplier);
			const status: OvertimeStatus = s.auto_approve ? 'approved' : 'awaiting_approval';
			let existing: OvertimeRequest | undefined;
			try {
				existing = await pb.collection('overtime_requests').getFirstListItem<OvertimeRequest>(
					pb.filter(
						'company = {:company} && employee = {:employee} && overtime_date = {:date} && auto_generated = true',
						{ company: company.id, employee: emp.id, date: recDate },
					),
					{ requestKey: `find-auto-ot-${emp.id}-${recDate}` },
				);
			} catch {
				/* no existing auto-generated request */
			}
			const base = {
				company: company.id,
				employee: emp.id,
				requested_date: recDate,
				overtime_date: recDate,
				duration_minutes: total,
				compensation: 'paid_overtime' as OvertimeCompensation,
				status,
				hourly_rate: hourly,
				amount,
				reason: `Otomatis dari absensi (clock in ${clockIn}, clock out ${clockOut})`,
				auto_generated: true,
				owner: ownerId,
			};
			if (existing) {
				await pb.collection('overtime_requests').update(existing.id, base, {
					requestKey: `upd-auto-ot-${emp.id}-${recDate}`,
				});
			} else {
				await pb.collection('overtime_requests').create(base, {
					requestKey: `create-auto-ot-${emp.id}-${recDate}`,
				});
			}
			toast.success(`Overtime otomatis dibuat untuk ${emp.name} (${total} menit).`);
		} catch {
			/* silent — auto overtime is best-effort */
		}
	};

	const deriveClockCode = (inVal: string, outVal: string, scheduleIn: string, scheduleOut: string): AttendanceCode => {
		if (!inVal && !outVal) return 'no_clock_in';
		if (!inVal) return 'no_clock_in';
		if (!outVal) return inVal > scheduleIn ? 'late_clock_in' : 'no_clock_out';
		if (outVal < scheduleOut) return 'early_clock_out';
		return inVal > scheduleIn ? 'late_clock_in' : 'on_time';
	};

	const saveClockField = async (
		rec: AttendanceRow,
		field: 'clock_in' | 'clock_out',
		value: string,
	) => {
		const next = normalizeTime(value);
		const prev = normalizeTime(rec[field] ?? '');
		if (next === prev) return;
		const saveKey = `${rec.id || `draft-${rec.employee}`}-${field}`;
		setInlineSaving(saveKey);
		try {
			if (!rec.id) {
				if (scheduleUnavailable) { toast.error('Jadwal tidak dapat dimuat. Coba lagi sebelum mencatat absensi.'); await refresh(); return; }
				const latest = await listWorkSchedules(company.id);
				const schedule = resolveSchedule(latest.items, rec.employee, date);
				if (schedule && !schedule.work) { toast.error('Hari ini merupakan hari libur pada jadwal karyawan.'); await refresh(); return; }
				const shift = schedule?.shift || rec.shift || 'Regular';
				const scheduleIn = schedule?.start || rec.schedule_in || '08:00';
				const scheduleOut = schedule?.end || rec.schedule_out || '17:00';
				const payload = {
					company: company.id,
					employee: rec.employee,
					date,
					shift,
					schedule_in: scheduleIn,
					schedule_out: scheduleOut,
					clock_in: field === 'clock_in' ? next : '',
					clock_out: field === 'clock_out' ? next : '',
					attendance_code: deriveClockCode(field === 'clock_in' ? next : '', field === 'clock_out' ? next : '', scheduleIn, scheduleOut),
					notes: '',
					owner: ownerId,
				};
				// Upsert: cek record yang sudah ada untuk (company, employee, date)
				// sebelum membuat, agar tidak memicu pelanggaran unique index.
				const existing = await pb.collection('attendance_records').getFullList<AttendanceRecord>({
					filter: pb.filter('company = {:company} && employee = {:employee} && date ~ {:date}', { company: company.id, employee: rec.employee, date }),
					requestKey: null,
				});
				if (existing.length) { toast.error('Data absensi telah berubah. Data terbaru akan dimuat.'); await refresh(); return; }
				const created = await pb.collection('attendance_records').create<AttendanceRecord>(payload, {
					requestKey: `create-clock-${rec.employee}-${field}`,
				});
				const emp = employees.find(e => e.id === rec.employee);
				setRecords(list => {
					if (list.some(r => r.id === created.id)) {
						return list.map(r =>
							r.id === created.id
								? { ...r, ...created, expand: r.expand ?? { employee: emp } }
								: r,
						);
					}
					return [...list, { ...created, expand: { employee: emp } }];
				});
			} else {
				const other =
					field === 'clock_in'
						? normalizeTime(rec.clock_out ?? '')
						: normalizeTime(rec.clock_in ?? '');
				const inVal = field === 'clock_in' ? next : other;
				const outVal = field === 'clock_out' ? next : other;
				let scheduleIn = normalizeTime(rec.schedule_in || '08:00');
				let scheduleOut = normalizeTime(rec.schedule_out || '17:00');
				let shift = rec.shift;
				if (field === 'clock_in' && !prev && next) {
					if (scheduleUnavailable) { toast.error('Jadwal tidak dapat dimuat. Coba lagi sebelum mencatat absensi.'); await refresh(); return; }
					const latest = await listWorkSchedules(company.id);
					const schedule = resolveSchedule(latest.items, rec.employee, (rec.date || date).slice(0, 10));
					if (schedule && !schedule.work) { toast.error('Hari ini merupakan hari libur pada jadwal karyawan.'); await refresh(); return; }
					if (schedule?.work) { scheduleIn = schedule.start; scheduleOut = schedule.end; shift = schedule.shift; }
				}
				const code = deriveClockCode(inVal, outVal, scheduleIn, scheduleOut);
				const updated = await pb.collection('attendance_records').update<AttendanceRecord>(rec.id, {
					[field]: next,
					attendance_code: code,
					shift,
					schedule_in: scheduleIn,
					schedule_out: scheduleOut,
				});
				setRecords(list =>
					list.map(r =>
						r.id === rec.id ? { ...r, ...updated, expand: r.expand } : r,
					),
				);
				if (inVal && outVal) {
					const emp = employees.find(e => e.id === rec.employee);
					void maybeAutoOvertime(
						emp,
						(rec.date || date).slice(0, 10),
						scheduleIn,
						scheduleOut,
						inVal,
						outVal,
					);
				}
			}
		} catch {
			toast.error('Gagal menyimpan jam absensi.');
			await refresh();
		} finally {
			setInlineSaving(null);
		}
	};

	const handleExport = () => {
		const rows = [
			[
				'Employee name',
				'Employee ID',
				'Date',
				'Shift',
				'Schedule in',
				'Schedule out',
				'Clock in',
				'Clock out',
				'Attendance code',
				'Notes',
			],
			...filtered.map(r => [
				r.expand?.employee?.name ?? '',
				r.employee,
				r.date,
				r.shift ?? '',
				r.schedule_in ?? '',
				r.schedule_out ?? '',
				r.clock_in ?? '',
				r.clock_out ?? '',
				ATTENDANCE_CODE_LABELS[r.attendance_code] ?? r.attendance_code,
				r.notes ?? '',
			]),
		];
		exportCsv(timestampedFilename('attendance'), rows);
		toast.success('Attendance data exported.');
	};

	const handleImportFile = async (file: File) => {
		const text = await file.text();
		const lines = text
			.split(/\r?\n/)
			.map(l => l.trim())
			.filter(Boolean);
		if (lines.length < 2) {
			toast.error('File kosong.');
			return;
		}
		const parseLine = (line: string) => {
			const cols: string[] = [];
			let cur = '';
			let inQ = false;
			for (let i = 0; i < line.length; i++) {
				const ch = line[i];
				if (ch === '"') {
					inQ = !inQ;
					continue;
				}
				if (ch === ',' && !inQ) {
					cols.push(cur);
					cur = '';
					continue;
				}
				cur += ch;
			}
			cols.push(cur);
			return cols;
		};
		const dataRows = lines.slice(1).map(parseLine);
		let created = 0;
		let updated = 0;
		let skipped = 0;
		const nameToId = new Map(employees.map(e => [e.name.toLowerCase(), e.id]));
		for (const row of dataRows) {
			const [
				rawName,
				rawEmpId,
				rawDate,
				rawShift,
				rawSchIn,
				rawSchOut,
				rawIn,
				rawOut,
				rawCode,
			] = row;
			const empId =
				(rawEmpId ?? '').trim() ||
				nameToId.get((rawName ?? '').trim().toLowerCase()) ||
				'';
			if (!empId) {
				skipped += 1;
				continue;
			}
			const codeRaw = (rawCode ?? '').trim().toLowerCase().replace(/\s+/g, '_');
			const code =
				ATTENDANCE_CODES.find(
					c =>
						c === codeRaw ||
						ATTENDANCE_CODE_LABELS[c].toLowerCase() === (rawCode ?? '').trim().toLowerCase(),
				) ?? 'on_time';
			const recDate = (rawDate ?? date).trim().slice(0, 10);
			const payload = {
				company: company.id,
				employee: empId,
				date: recDate,
				shift: (rawShift ?? '').trim(),
				schedule_in: (rawSchIn ?? '').trim(),
				schedule_out: (rawSchOut ?? '').trim(),
				clock_in: (rawIn ?? '').trim(),
				clock_out: (rawOut ?? '').trim(),
				attendance_code: code,
				notes: '',
				owner: ownerId,
			};
			try {
				// Upsert: update existing record for this employee+date if present.
				let existingId: string | undefined;
				try {
					const found = await pb
						.collection('attendance_records')
						.getFirstListItem<AttendanceRecord>(
							pb.filter(
								'company = {:company} && employee = {:employee} && date = {:date}',
								{ company: company.id, employee: empId, date: recDate },
							),
							{ requestKey: `find-import-${created}-${updated}-${empId}` },
						);
					existingId = found.id;
				} catch {
					/* no existing record */
				}
				if (existingId) {
					await pb.collection('attendance_records').update(existingId, payload, {
						requestKey: `upd-import-${created}-${updated}-${empId}`,
					});
					updated += 1;
				} else {
					await pb.collection('attendance_records').create(payload, {
						requestKey: `import-att-${created}-${updated}-${empId}`,
					});
					created += 1;
				}
			} catch {
				skipped += 1;
			}
		}
		await refresh();
		if (created === 0 && updated === 0)
			toast.error('Tidak ada baris yang berhasil diimpor.');
		else
			toast.success(
				`${created} absensi diimpor${updated ? `, ${updated} diperbarui` : ''}${skipped ? `, ${skipped} dilewati` : ''}.`,
			);
		setImportOpen(false);
	};

	const generateDayOffForAll = async () => {
		const active = employees.filter(e => e.status === 'aktif');
		if (active.length === 0) {
			toast.info('Tidak ada karyawan aktif.');
			return;
		}
		if (
			!window.confirm(
				`Tandai day off untuk ${active.length} karyawan aktif pada ${formatAttendanceDate(date)}?`,
			)
		) {
			return;
		}
		let created = 0;
		for (let i = 0; i < active.length; i++) {
			const emp = active[i];
			const exists = records.some(r => r.employee === emp.id);
			if (exists) continue;
			try {
				await pb.collection('attendance_records').create(
					{
						company: company.id,
						employee: emp.id,
						date,
						shift: 'dayoff',
						schedule_in: '00:00',
						schedule_out: '00:00',
						clock_in: '',
						clock_out: '',
						attendance_code: 'day_off',
						notes: '',
						owner: ownerId,
					},
					{ requestKey: `dayoff-${i}` },
				);
				created += 1;
			} catch {
				/* skip duplicates */
			}
		}
		await refresh();
		toast.success(created ? `${created} day off ditambahkan.` : 'Semua karyawan sudah punya data hari ini.');
	};

	const title =
		sideNav === 'live'
			? 'Live attendance'
			: sideNav === 'data'
				? 'Attendance data'
			: sideNav === 'activity'
				? 'Attendance activity'
				: sideNav === 'report'
					? 'Attendance report'
					: sideNav === 'absence'
						? 'Absence deduction'
						: 'Setting';

	return (
		<div className="min-w-0 flex-1 bg-[#f7f8fc]">
			{/* Header */}
			<div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-5 md:px-5">
				<div>
					<h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">{title}</h1>
					<p className="mt-0.5 text-xs text-slate-500">{company.name}</p>
				</div>
				{sideNav === 'data' ? (
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() =>
								toast.info(
									'Attendance data menampilkan ringkasan absensi harian per karyawan. Gunakan Import untuk unggah massal.',
								)
							}
							className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
						>
							Help
						</button>
						<div className="relative">
							<button
								type="button"
								onClick={() => setImportOpen(o => !o)}
								className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
							>
								Import attendance
							</button>
							{importOpen ? (
								<div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
									<label className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
										<Upload className="size-3.5 text-indigo-600" /> Import CSV
										<input
											type="file"
											accept=".csv,text/csv"
											className="hidden"
											onChange={e => {
												const f = e.target.files?.[0];
												if (f) void handleImportFile(f);
												e.target.value = '';
											}}
										/>
									</label>
									<button
										type="button"
										onClick={() => {
											setImportOpen(false);
											openCreate();
										}}
										className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
									>
										Add single record
									</button>
									<button
										type="button"
										onClick={() => {
											setImportOpen(false);
											void generateDayOffForAll();
										}}
										className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
									>
										Mark all day off
									</button>
								</div>
							) : null}
						</div>
					</div>
				) : null}
			</div>

			{sideNav === 'live' ? (
				<div className="space-y-4 px-4 pb-6 md:px-5">
					{scheduleUnavailable ? <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Jadwal kerja belum dapat dimuat. Clock in ditunda agar jam kerja tidak keliru; coba buka ulang halaman atau periksa izin Anda.</p> : null}
					{/* Live clock + status banner */}
					<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
						<div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex items-center gap-4">
								<div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-indigo-100">
									<Radio className="size-6 animate-pulse text-emerald-600" />
								</div>
								<div>
									<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
										<span className="inline-flex size-1.5 animate-pulse rounded-full bg-emerald-500" />
											Live
									</p>
									<p className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight text-slate-900">
										{now.toLocaleTimeString('id-ID', { hour12: false })}
									</p>
									<p className="text-xs text-slate-500">{formatAttendanceDate(date)}</p>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
								<div className="flex items-center gap-2">
									<Users className="size-4 text-slate-400" />
									<span className="text-slate-500">Total aktif</span>
									<span className="font-bold tabular-nums text-slate-900">{liveRows.length}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="inline-flex size-2 rounded-full bg-emerald-500" />
									<span className="text-slate-500">Hadir</span>
									<span className="font-bold tabular-nums text-emerald-600">{liveCounts.present + liveCounts.late}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="inline-flex size-2 rounded-full bg-amber-500" />
									<span className="text-slate-500">Terlambat</span>
									<span className="font-bold tabular-nums text-amber-600">{liveCounts.late}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="inline-flex size-2 rounded-full bg-slate-300" />
									<span className="text-slate-500">Belum masuk</span>
									<span className="font-bold tabular-nums text-slate-700">{liveCounts.not_in}</span>
								</div>
							</div>
						</div>
					</div>

					{/* Summary cards */}
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
						{(['present', 'late', 'not_in', 'done', 'day_off', 'absent'] as LiveStatus[]).map(key => (
							<div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
								<p className={`text-2xl font-extrabold tabular-nums ${LIVE_STATUS_STYLES[key].count}`}>{liveCounts[key]}</p>
								<p className="mt-0.5 text-xs font-medium text-slate-500">{LIVE_STATUS_LABELS[key]}</p>
							</div>
						))}
					</div>

					{/* Live employee list */}
					<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
						<div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3 text-sm font-semibold text-slate-700">
							Status kehadiran real-time — diperbarui otomatis
						</div>
						{loading ? (
							<p className="px-5 py-10 text-center text-sm text-slate-500">Memuat…</p>
						) : liveRows.length === 0 ? (
							<p className="px-5 py-10 text-center text-sm text-slate-500">
								Belum ada karyawan aktif. Tambahkan karyawan di menu Karyawan terlebih dahulu.
							</p>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full min-w-[820px] text-left text-sm">
									<thead>
										<tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
											<th className="px-4 py-3">Karyawan</th>
											<th className="px-4 py-3">Jadwal</th>
											<th className="px-4 py-3">Clock in</th>
											<th className="px-4 py-3">Clock out</th>
											<th className="px-4 py-3">Status</th>
											<th className="px-4 py-3 text-right">Aksi</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{liveRows.map(({ emp, rec, schedule, status }) => {
											const style = LIVE_STATUS_STYLES[status];
											const busy = liveBusy === emp.id;
											const canClockIn = status === 'not_in';
											const canClockOut = status === 'present' || status === 'late';
											return (
												<tr key={emp.id} className="hover:bg-slate-50/80">
													<td className="px-4 py-3">
														<div className="flex items-center gap-3">
															<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold uppercase text-indigo-700">
																{emp.name.slice(0, 2)}
															</div>
															<div className="min-w-0">
																<p className="truncate font-semibold text-slate-900">{emp.name}</p>
																<p className="truncate text-xs text-slate-400">{emp.position || '—'}</p>
															</div>
														</div>
													</td>
													<td className="px-4 py-3 tabular-nums text-slate-500">
														{rec?.clock_in && rec.schedule_in && rec.schedule_out ? `${normalizeTimeValue(rec.schedule_in)} – ${normalizeTimeValue(rec.schedule_out)}` : schedule ? (schedule.work ? `${schedule.start} – ${schedule.end}` : 'Hari libur') : scheduleUnavailable ? 'Jadwal tidak tersedia' : rec?.schedule_in && rec.schedule_out ? `${normalizeTimeValue(rec.schedule_in)} – ${normalizeTimeValue(rec.schedule_out)}` : '08:00 – 17:00'}
													</td>
													<td className="px-4 py-3 tabular-nums text-slate-700">
														{normalizeTimeValue(rec?.clock_in || '') || '—'}
													</td>
													<td className="px-4 py-3 tabular-nums text-slate-700">
														{normalizeTimeValue(rec?.clock_out || '') || '—'}
													</td>
													<td className="px-4 py-3">
														<span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
															<span className={`inline-flex size-1.5 rounded-full ${style.dot}`} />
																{LIVE_STATUS_LABELS[status]}
														</span>
													</td>
													<td className="px-4 py-3 text-right">
														{canClockIn ? (
															<button
																type="button"
																disabled={busy || scheduleUnavailable}
																onClick={() => void liveClockIn(emp)}
																className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
															>
																	<LogIn className="size-3.5" /> Clock in
															</button>
														) : canClockOut ? (
															<button
																type="button"
																disabled={busy}
																onClick={() => void liveClockOut(emp)}
																className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-sm transition-colors hover:bg-rose-50 disabled:opacity-60"
															>
																	<LogOut className="size-3.5" /> Clock out
															</button>
														) : (
															<span className="text-xs text-slate-400">—</span>
														)}
													</td>
												</tr>
										);
										})}
									</tbody>
								</table>
							</div>
						)}
					</div>

					<p className="flex items-center gap-1.5 text-xs text-slate-400">
						<Radio className="size-3.5" />
						Data absensi tersinkron real-time. Clock in/out tercatat dengan waktu perangkat saat ini.
					</p>
				</div>
			) : null}

			{sideNav === 'data' ? (
				<div className="space-y-4 px-4 pb-6 md:px-5">
					{showBanner ? (
						<div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-sm text-slate-700">
							<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-200 to-emerald-200">
								<svg className="size-5 text-sky-700" viewBox="0 0 24 24" fill="none" aria-hidden>
									<path
										d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
										stroke="currentColor"
										strokeWidth="1.5"
									/>
									<path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" />
									<path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
								</svg>
							</div>
							<p className="flex-1 pt-1">
								Submit attendance at the workplace with attendance devices synchronized directly with
								the Talenta by Mekari system.{' '}
								<button
									type="button"
									onClick={() => toast.info('Sinkronisasi perangkat absensi dapat dikonfigurasi di Setting.')}
									className="font-semibold text-indigo-600 hover:underline"
								>
									Learn more
								</button>
							</p>
							<button
								type="button"
								aria-label="Tutup"
								onClick={() => setShowBanner(false)}
								className="text-slate-400 hover:text-slate-700"
							>
								<X className="size-4" />
							</button>
						</div>
					) : null}

					{/* Toolbar */}
					<div className="flex flex-wrap items-center gap-2">
						<label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm">
							<span className="font-medium text-slate-800">
								{formatAttendanceDate(date).replace(/^[^,]+,\s*/, '')}
							</span>
							<Calendar className="size-4 text-slate-400" />
							<input
								type="date"
								value={date}
								onChange={e => setDate(e.target.value)}
								className="sr-only"
								aria-label="Pilih tanggal"
							/>
						</label>
						<select
							value={codeFilter}
							onChange={e => setCodeFilter(e.target.value as 'all' | AttendanceCode)}
							className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 shadow-sm outline-none ring-indigo-200 focus:ring-2"
						>
							<option value="all">All filters</option>
							{ATTENDANCE_CODES.map(c => (
								<option key={c} value={c}>
									{ATTENDANCE_CODE_LABELS[c]}
								</option>
							))}
						</select>
						<div className="ml-auto flex items-center gap-1.5">
							<button
								type="button"
								onClick={() => window.print()}
								className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50"
								aria-label="Print"
							>
								<Printer className="size-4" />
							</button>
							<button
								type="button"
								onClick={handleExport}
								className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50"
								aria-label="Export"
							>
								<Download className="size-4" />
							</button>
							<div className="relative">
								<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
								<input
									value={search}
									onChange={e => setSearch(e.target.value)}
									placeholder="Search employee name / ID"
									className="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm outline-none ring-indigo-200 focus:ring-2 md:w-56"
								/>
							</div>
						</div>
					</div>

					{/* Stats strip */}
					<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
						<div className="grid grid-cols-3 divide-x divide-y divide-slate-100 sm:grid-cols-5 lg:grid-cols-9 lg:divide-y-0">
							{STAT_ORDER.map(({ key, highlight }) => (
								<button
									key={key}
									type="button"
									onClick={() => setCodeFilter(c => (c === key ? 'all' : key))}
									className={cn(
										'px-3 py-4 text-center transition-colors hover:bg-slate-50',
										codeFilter === key && 'bg-indigo-50',
									)}
								>
									<p
										className={cn(
											'text-2xl font-bold tabular-nums',
											highlight ? 'text-indigo-600' : 'text-slate-800',
										)}
									>
										{counts[key]}
									</p>
									<p className="mt-1 flex items-center justify-center gap-0.5 text-[11px] text-slate-500">
										{ATTENDANCE_CODE_LABELS[key]}
										{(key === 'no_clock_out' || key === 'no_clock_in') && (
											<span
												title="Belum ada data clock"
												className="inline-flex size-3.5 items-center justify-center rounded-full border border-slate-300 text-[9px] font-bold text-slate-400"
											>
												i
											</span>
										)}
									</p>
								</button>
							))}
						</div>
					</div>

					{formOpen ? (
						<form
							onSubmit={submit}
							className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
						>
							<div className="flex items-center justify-between">
								<h2 className="text-base font-bold text-slate-900">
									{editingId ? 'Edit attendance' : 'Add attendance'}
								</h2>
								<button
									type="button"
									onClick={() => setFormOpen(false)}
									className="text-slate-400 hover:text-slate-700"
									aria-label="Tutup"
								>
									<X className="size-4" />
								</button>
							</div>
							<div className="grid gap-3 md:grid-cols-3">
								<div className="space-y-1.5 md:col-span-2">
									<label htmlFor="att-emp" className="text-xs font-semibold text-slate-600">
										Employee
									</label>
									<select
										id="att-emp"
										required
										value={form.employee ?? ''}
										onChange={e => setForm(f => ({ ...f, employee: e.target.value }))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
									>
										<option value="">Select employee</option>
										{employees.map(e => (
											<option key={e.id} value={e.id}>
												{e.name}
												{e.position ? ` — ${e.position}` : ''}
											</option>
										))}
									</select>
								</div>
								<div className="space-y-1.5">
									<label htmlFor="att-date" className="text-xs font-semibold text-slate-600">
										Date
									</label>
									<input
										id="att-date"
										type="date"
										required
										value={(form.date ?? date).slice(0, 10)}
										onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label htmlFor="att-shift" className="text-xs font-semibold text-slate-600">
										Shift
									</label>
									<input
										id="att-shift"
										value={form.shift ?? ''}
										onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}
										placeholder="Regular / dayoff"
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label htmlFor="att-sch-in" className="text-xs font-semibold text-slate-600">
										Schedule in
									</label>
									<input
										id="att-sch-in"
										value={form.schedule_in ?? ''}
										onChange={e => setForm(f => ({ ...f, schedule_in: e.target.value }))}
										placeholder="08:00"
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label htmlFor="att-sch-out" className="text-xs font-semibold text-slate-600">
										Schedule out
									</label>
									<input
										id="att-sch-out"
										value={form.schedule_out ?? ''}
										onChange={e => setForm(f => ({ ...f, schedule_out: e.target.value }))}
										placeholder="17:00"
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label htmlFor="att-in" className="text-xs font-semibold text-slate-600">
										Clock in
									</label>
									<input
										id="att-in"
										type="text"
										inputMode="numeric"
										value={form.clock_in ?? ''}
										onChange={e => setForm(f => ({ ...f, clock_in: e.target.value }))}
										onBlur={e =>
											setForm(f => ({ ...f, clock_in: normalizeTime(e.target.value) }))
										}
										placeholder="08:00"
										className="w-full rounded-full border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none ring-indigo-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label htmlFor="att-out" className="text-xs font-semibold text-slate-600">
										Clock out
									</label>
									<input
										id="att-out"
										type="text"
										inputMode="numeric"
										value={form.clock_out ?? ''}
										onChange={e => setForm(f => ({ ...f, clock_out: e.target.value }))}
										onBlur={e =>
											setForm(f => ({ ...f, clock_out: normalizeTime(e.target.value) }))
										}
										placeholder="17:00"
										className="w-full rounded-full border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none ring-indigo-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label htmlFor="att-code" className="text-xs font-semibold text-slate-600">
										Attendance code
									</label>
									<select
										id="att-code"
										value={form.attendance_code ?? 'on_time'}
										onChange={e =>
											setForm(f => ({
												...f,
												attendance_code: e.target.value as AttendanceCode,
												shift:
													e.target.value === 'day_off' ? 'dayoff' : f.shift === 'dayoff' ? '' : f.shift,
											}))
										}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
									>
										{ATTENDANCE_CODES.map(c => (
											<option key={c} value={c}>
												{ATTENDANCE_CODE_LABELS[c]}
											</option>
										))}
									</select>
								</div>
								<div className="space-y-1.5 md:col-span-3">
									<label htmlFor="att-notes" className="text-xs font-semibold text-slate-600">
										Notes
									</label>
									<input
										id="att-notes"
										value={form.notes ?? ''}
										onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
									/>
								</div>
							</div>
							<div className="flex gap-2">
								<button
									type="submit"
									disabled={saving}
									className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
								>
									{saving ? 'Saving…' : editingId ? 'Save changes' : 'Save attendance'}
								</button>
								<button
									type="button"
									onClick={() => setFormOpen(false)}
									className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
								>
									Cancel
								</button>
							</div>
						</form>
					) : null}

					{/* Table */}
					<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
						{loading ? (
							<p className="px-5 py-10 text-center text-sm text-slate-500">Memuat…</p>
						) : filtered.length === 0 ? (
							<p className="px-5 py-10 text-center text-sm text-slate-500">
								{employees.length === 0
									? 'Belum ada karyawan. Tambah karyawan dulu di menu Karyawan.'
									: 'Tidak ada baris yang cocok dengan filter. Ubah filter atau tanggal.'}
							</p>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full min-w-[960px] text-left text-sm">
									<thead>
										<tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold text-slate-500">
											<th className="px-4 py-3">
												<span className="inline-flex items-center gap-1">
													Employee name <span className="text-slate-300">↕</span>
												</span>
											</th>
											<th className="px-4 py-3">
												Date <span className="text-slate-300">↕</span>
											</th>
											<th className="px-4 py-3">
												Shift <span className="text-slate-300">↕</span>
											</th>
											<th className="px-4 py-3">
												Schedule in <span className="text-slate-300">↕</span>
											</th>
											<th className="px-4 py-3">
												Schedule out <span className="text-slate-300">↕</span>
											</th>
											<th className="px-4 py-3">
												Clock in <span className="text-slate-300">↕</span>
											</th>
											<th className="px-4 py-3">
												Clock out <span className="text-slate-300">↕</span>
											</th>
											<th className="px-4 py-3">Attendance code</th>
											<th className="px-4 py-3 text-right">Actions</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{filtered.map(rec => {
											const emp = rec.expand?.employee;
											const isDayOff = rec.attendance_code === 'day_off';
											const rowKey = rec.id || `draft-${rec.employee}`;
											const savingIn = inlineSaving === `${rowKey}-clock_in`;
											const savingOut = inlineSaving === `${rowKey}-clock_out`;
											return (
												<tr key={rowKey} className="hover:bg-slate-50/80">
													<td className="px-4 py-3">
														<div className="flex items-center gap-3">
															<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold uppercase text-indigo-700">
																{(emp?.name ?? '?').slice(0, 2)}
															</div>
															<div className="min-w-0">
																<p className="truncate font-semibold uppercase tracking-wide text-indigo-600">
																	{emp?.name ?? rec.employee}
																</p>
																<p className="truncate text-xs text-slate-400">
																	{rec.employee.slice(0, 8).toUpperCase()}
																	{emp?.position ? ` | ${emp.position.toUpperCase()}` : ''}
																</p>
															</div>
														</div>
													</td>
													<td className="px-4 py-3 whitespace-nowrap text-slate-700">
														{formatAttendanceDate(rec.date || date)}
													</td>
													<td
														className={cn(
															'px-4 py-3',
															isDayOff ? 'font-medium text-red-500' : 'text-slate-700',
														)}
													>
														{rec.shift || '—'}
													</td>
													<td className="px-4 py-3 tabular-nums text-slate-600">
														{rec.schedule_in || '00:00'}
													</td>
													<td className="px-4 py-3 tabular-nums text-slate-600">
														{rec.schedule_out || '00:00'}
													</td>
													<td className="px-4 py-3">
														<input
															type="text"
															inputMode="numeric"
															placeholder="—"
															defaultValue={rec.clock_in || ''}
															key={`${rowKey}-in-${rec.clock_in ?? ''}-${rec.id}`}
															disabled={savingIn}
															onFocus={e => e.currentTarget.select()}
															onBlur={e => void saveClockField(rec, 'clock_in', e.target.value)}
															onKeyDown={e => {
																if (e.key === 'Enter') {
																	e.preventDefault();
																	e.currentTarget.blur();
																}
															}}
															aria-label={`Clock in ${emp?.name ?? ''}`}
															className="w-[7.5rem] rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm tabular-nums text-slate-700 shadow-sm outline-none transition placeholder:text-slate-300 hover:border-indigo-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
														/>
													</td>
													<td className="px-4 py-3">
														<input
															type="text"
															inputMode="numeric"
															placeholder="—"
															defaultValue={rec.clock_out || ''}
															key={`${rowKey}-out-${rec.clock_out ?? ''}-${rec.id}`}
															disabled={savingOut}
															onFocus={e => e.currentTarget.select()}
															onBlur={e => void saveClockField(rec, 'clock_out', e.target.value)}
															onKeyDown={e => {
																if (e.key === 'Enter') {
																	e.preventDefault();
																	e.currentTarget.blur();
																}
															}}
															aria-label={`Clock out ${emp?.name ?? ''}`}
															className="w-[7.5rem] rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm tabular-nums text-slate-700 shadow-sm outline-none transition placeholder:text-slate-300 hover:border-indigo-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
														/>
													</td>
													<td className="px-4 py-3 text-slate-600">
														{!rec.id || rec.attendance_code === 'day_off'
															? '—'
															: ATTENDANCE_CODE_LABELS[rec.attendance_code]}
													</td>
													<td className="px-4 py-3 text-right">
														<div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
															<button
																type="button"
																onClick={() => openEdit(rec)}
																className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
															>
																Actions
															</button>
															<button
																type="button"
																onClick={() => void remove(rec)}
																className="border-l border-slate-200 px-2 py-1.5 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600"
																aria-label="Hapus"
															>
																▾
															</button>
														</div>
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			) : null}

			{sideNav === 'activity' ? (
				<div className="px-5 py-8">
					<div className="mx-auto max-w-lg rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
						<p className="text-base font-semibold text-slate-800">Attendance activity</p>
						<p className="mt-2 text-sm text-slate-500">
							Riwayat aktivitas clock-in/out dan perubahan status absensi akan tampil di sini. Gunakan
							Attendance data untuk mencatat kehadiran harian.
						</p>
						<button
							type="button"
							onClick={() => onSideNavChange('data')}
							className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
						>
							Buka Attendance data
						</button>
					</div>
				</div>
			) : null}

			{sideNav === 'report' ? (
				<div className="px-5 py-8">
					<div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
						<h2 className="text-lg font-bold text-slate-900">Attendance report</h2>
						<p className="text-sm text-slate-600">
							Ringkasan kode absensi untuk tanggal terpilih ({formatAttendanceDate(date)}).
						</p>
						<div className="grid gap-2 sm:grid-cols-3">
							{STAT_ORDER.map(({ key, highlight }) => (
								<div
									key={key}
									className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-center"
								>
									<p
										className={cn(
											'text-xl font-bold tabular-nums',
											highlight ? 'text-indigo-600' : 'text-slate-800',
										)}
									>
										{counts[key]}
									</p>
									<p className="text-xs text-slate-500">{ATTENDANCE_CODE_LABELS[key]}</p>
								</div>
							))}
						</div>
						<button
							type="button"
							onClick={handleExport}
							className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
						>
							Export CSV
						</button>
					</div>
				</div>
			) : null}

			{sideNav === 'absence' ? (
				<div className="px-5 py-8">
					<div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
						<div className="mb-3 flex items-center gap-2 text-amber-600">
							<Info className="size-5" />
							<h2 className="text-lg font-bold text-slate-900">Absence deduction</h2>
						</div>
						<p className="text-sm text-slate-600">
							Karyawan dengan status <strong>Absent</strong> pada hari kerja dapat dipotong dari
							payroll. Saat ini ada{' '}
							<span className="font-semibold text-slate-900">{counts.absent}</span> absen pada tanggal
							terpilih.
						</p>
						<p className="mt-2 text-xs text-slate-400">
							Integrasi potongan otomatis ke slip gaji dapat diatur saat menjalankan payroll periode.
						</p>
						<button
							type="button"
							onClick={() => {
								setCodeFilter('absent');
								onSideNavChange('data');
							}}
							className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
						>
							Lihat absen di Attendance data
						</button>
					</div>
				</div>
			) : null}

			{sideNav === 'setting' ? (
				<GeofenceSettingsPanel company={company} />
			) : null}
		</div>
	);
}
