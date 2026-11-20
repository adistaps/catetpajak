import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	Camera,
	ChevronDown,
	Columns3,
	HelpCircle,
	Info,
	LayoutList,
	Mail,
	Network,
	Pencil,
	Plus,
	Search,
	Share2,
	Trash2,
	Upload,
	UserPlus,
	X,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, type Company } from '@/lib/accounting';
import {
	EMPLOYEE_STATUS_LABELS,
	EMPLOYEE_TYPE_LABELS,
	EMPLOYEE_TYPE_OPTIONS,
	grossSalary,
	netSalary,
	totalAllowance,
	totalDeductions,
	type ApprovalLine,
	type Employee,
	type EmployeeType,
} from '@/lib/payroll';
import {
	PPH21_METHOD_LABELS,
	PPH21_METHOD_OPTIONS,
	PTKP_LABELS,
	PTKP_OPTIONS,
	TAX_METHOD_LABELS,
	TAX_METHOD_OPTIONS,
	calcDeductions,
	type Pph21Method,
	type PtkpStatus,
	type TaxMethod,
} from '@/lib/payroll-calc';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import { cn } from '@/lib/utils';
import { AmountInput } from '@/components/ui/amount-input';
import { useOutletContext, Link } from 'react-router';
import type { AppOutletContext } from '@/lib/app-context';
import { employeeDirectoryScopeForRole } from '@/data/user-roles';
import {
	AttendanceManager,
	ATTENDANCE_SIDE_ITEMS,
	type AttendanceSideNav,
} from '@/components/app/attendance-manager';
import type { PayrollComponent } from '@/components/app/payroll-components';
import { WorkScheduleManager } from '@/components/app/work-schedule-manager';
import { listCompanyMembers, inviteCompanyMember, type CompanyMember } from '@/lib/company-members';
import { effectiveEmployeeLimit } from '@/lib/plan-access';
import { EmployeeTransfer } from '@/components/app/employee-transfer';
import { OffboardingManager } from '@/components/app/offboarding-manager';
import {
	collectLegacyLevels,
	mergeLevelOptions,
	useJobLevels,
} from '@/lib/job-levels';

interface EmployeeManagerProps {
	company: Company;
}

type SideNav =
	| 'list'
	| 'transfer'
	| 'offboarding'
	| 'import-export'
	| 'ptkp'
	| AttendanceSideNav;

type ViewMode = 'directory' | 'org';

const ATTENDANCE_KEYS = new Set<string>(ATTENDANCE_SIDE_ITEMS.map(i => i.key));

function isAttendanceNav(nav: SideNav): nav is AttendanceSideNav {
	return ATTENDANCE_KEYS.has(nav);
}

const EMPLOYEE_EXPORT_HEADERS = [
	'Nama',
	'Jabatan',
	'Level Jabatan',
	'NPWP',
	'Rekening',
	'Gaji Pokok',
	'Tunjangan Makan',
	'Tunjangan Transport',
	'Tunjangan Lain',
	'BPJS TK',
	'BPJS Kesehatan',
	'PPh 21',
	'Status',
	'PTKP',
];

const emptyEmployee = (): Partial<Employee> => ({
	name: '',
	position: '',
	level: '',
	npwp: '',
	bank_account: '',
	basic_salary: 0,
	meal_allowance: 0,
	transport_allowance: 0,
	other_allowance: 0,
	bpjs_tk: 0,
	bpjs_kes: 0,
	pph21: 0,
	status: 'aktif',
	ptkp_status: 'TK0',
	pph21_method: 'annual',
	tax_method: 'gross',
	auto_calc: true,
	user: '',
	manager: '',
	approval_line: '',
	employee_type: 'permanent',
});

const SIDE_ITEMS: { key: SideNav; label: string }[] = [
	{ key: 'list', label: 'Employee list' },
	{ key: 'transfer', label: 'Employee transfer' },
	{ key: 'offboarding', label: 'Offboarding' },
	{ key: 'import-export', label: 'Import/export prorate' },
	{ key: 'ptkp', label: 'PTKP status adjustment' },
];

function monthLabel(d = new Date()): string {
	return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function isSameMonth(iso: string | undefined, ref = new Date()): boolean {
	if (!iso) return false;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return false;
	return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function empActiveComponents(components: PayrollComponent[], empId: string): PayrollComponent[] {
	return components.filter(
		c => c.status === 'Active' && Array.isArray(c.employees) && c.employees.includes(empId),
	);
}

export function EmployeeManager({ company }: EmployeeManagerProps) {
	const { memberRole } = useOutletContext<AppOutletContext>();
	const directoryScope = employeeDirectoryScopeForRole(memberRole);
	const allowedSideItems =
		directoryScope === 'full' ? SIDE_ITEMS : SIDE_ITEMS.filter(i => i.key === 'list');
	// Attendance tampil untuk scope 'full' (pemilik/admin/akuntan/custom) dan
	// 'hr'. Finance hanya melihat employee list, tanpa menu attendance.
	const allowedAttendanceItems = directoryScope === 'finance' ? [] : ATTENDANCE_SIDE_ITEMS;
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [sideNav, setSideNav] = useState<SideNav>('list');

	// Finance hanya melihat employee list; HR melihat list + attendance.
	const allowedNavKeys = useMemo(
		() =>
			new Set<string>([
				...allowedSideItems.map(i => i.key),
				...allowedAttendanceItems.map(i => i.key),
			]),
		[allowedSideItems, allowedAttendanceItems],
	);
	useEffect(() => {
		if (!allowedNavKeys.has(sideNav)) setSideNav('list');
	}, [allowedNavKeys, sideNav]);
	const [viewMode, setViewMode] = useState<ViewMode>('directory');
	const [search, setSearch] = useState('');
	const [statusFilter, setStatusFilter] = useState<'all' | 'aktif' | 'nonaktif'>('all');
	const [showQuotaBanner, setShowQuotaBanner] = useState(true);
	const [addMenuOpen, setAddMenuOpen] = useState(false);
	const [bulkOpen, setBulkOpen] = useState(false);

	const [empForm, setEmpForm] = useState<Partial<Employee>>(emptyEmployee());
	const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
	const [showEmpForm, setShowEmpForm] = useState(false);
	const [empSaving, setEmpSaving] = useState(false);
	const [components, setComponents] = useState<PayrollComponent[]>([]);
	const [members, setMembers] = useState<CompanyMember[]>([]);
	const [inviteEmp, setInviteEmp] = useState<Employee | null>(null);
	const [inviteEmail, setInviteEmail] = useState('');
	const [inviteSaving, setInviteSaving] = useState(false);
	const [inviteResult, setInviteResult] = useState<{ email: string; emailSent: boolean } | null>(null);
	const [formEssEmail, setFormEssEmail] = useState('');
	const [formEssSaving, setFormEssSaving] = useState(false);
	const [formEssResult, setFormEssResult] = useState<{ email: string; emailSent: boolean } | null>(null);
	const [approvalLines, setApprovalLines] = useState<ApprovalLine[]>([]);
	const [lineSaving, setLineSaving] = useState(false);
	const [photoFile, setPhotoFile] = useState<File | null>(null);
	const [photoPreview, setPhotoPreview] = useState('');
	const { levels: jobLevels } = useJobLevels(company.id);
	const levelOptions = useMemo(
		() =>
			mergeLevelOptions(jobLevels, [
				...collectLegacyLevels(employees),
				...(empForm.level ? [empForm.level] : []),
			]),
		[jobLevels, employees, empForm.level],
	);

	const ownerId = pb.authStore.record?.id ?? '';

	const refreshEmployees = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb.collection('employees').getFullList<Employee>({
			filter,
			sort: 'name',
			requestKey: null,
		});
		setEmployees(list);
	}, [company.id]);

	const refreshComponents = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb
			.collection('payroll_components')
			.getFullList<PayrollComponent>({ filter, sort: '-created', requestKey: null });
		setComponents(list);
	}, [company.id]);

	const refreshApprovalLines = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb.collection('approval_lines').getFullList<ApprovalLine>({
			filter,
			sort: 'name',
			requestKey: null,
		});
		setApprovalLines(list);
	}, [company.id]);

	useEffect(() => {
		let cancelled = false;
		refreshEmployees()
			.catch(err => {
				if (!cancelled && err?.status !== 0) toast.error('Gagal memuat data karyawan.');
			});
		refreshComponents().catch(() => {});
		refreshApprovalLines().catch(() => {});
		listCompanyMembers(company.id)
			.then(list => {
				if (!cancelled) setMembers(list);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [refreshEmployees, refreshComponents, refreshApprovalLines, company.id]);

	const activeEmployees = useMemo(
		() => employees.filter(emp => emp.status === 'aktif'),
		[employees],
	);
	const inactiveEmployees = useMemo(
		() => employees.filter(emp => emp.status === 'nonaktif'),
		[employees],
	);
	const newHires = useMemo(
		() => employees.filter(emp => isSameMonth(emp.created) && emp.status === 'aktif').length,
		[employees],
	);
	const leaving = inactiveEmployees.length;

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return employees.filter(emp => {
			if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
			if (!q) return true;
			return (
				emp.name.toLowerCase().includes(q) ||
				(emp.position || '').toLowerCase().includes(q) ||
				(emp.npwp || '').toLowerCase().includes(q) ||
				(emp.bank_account || '').toLowerCase().includes(q)
			);
		});
	}, [employees, search, statusFilter]);

	const filterCount = statusFilter === 'all' ? 0 : 1;
	// Batas karyawan mengikuti kuota efektif: kuota kustom Admin Pusat bila aktif,
	// jika tidak batas bawaan paket perusahaan (Pro 10, Enterprise 20).
	const employeeLimit = effectiveEmployeeLimit(company);
	const quotaAlmostFull = employees.length >= employeeLimit * 0.85;

	const openCreateEmployee = () => {
		setEditingEmpId(null);
		setEmpForm(emptyEmployee());
		setFormEssEmail('');
		setFormEssResult(null);
		setPhotoFile(null);
		setPhotoPreview('');
		setShowEmpForm(true);
		setAddMenuOpen(false);
		setSideNav('list');
	};

	const openEditEmployee = (emp: Employee) => {
		setEditingEmpId(emp.id);
		setEmpForm({ ...emp });
		const linked = members.find(m => m.user === emp.user && m.user);
		setFormEssEmail(linked?.email ?? '');
		setFormEssResult(null);
		setPhotoFile(null);
		setPhotoPreview(emp.photo ? pb.files.getURL(emp, emp.photo, { thumb: '200x200' }) : '');
		setShowEmpForm(true);
		setSideNav('list');
	};

	const onPickPhoto = (file: File | undefined) => {
		if (!file) return;
		if (!/image\/(jpeg|png|webp)/.test(file.type)) {
			toast.error('Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			toast.error('Ukuran foto terlalu besar (maksimal 5 MB).');
			return;
		}
		setPhotoFile(file);
		setPhotoPreview(URL.createObjectURL(file));
	};

	const submitEmployee = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!empForm.name?.trim()) {
			toast.error('Nama karyawan wajib diisi.');
			return;
		}
		// Batas jumlah karyawan aktif sesuai kuota efektif perusahaan.
		if (!editingEmpId && activeEmployees.length >= effectiveEmployeeLimit(company)) {
			toast.error(
				`Kuota karyawan perusahaan ini dibatasi maksimal ${effectiveEmployeeLimit(company)} karyawan aktif. Hubungi Admin Pusat untuk menambah kuota.`,
			);
			return;
		}
		setEmpSaving(true);
		try {
			const autoCalc = Boolean(empForm.auto_calc);
			const method = (empForm.pph21_method ?? 'annual') as Pph21Method;
			const computed = autoCalc
				? calcDeductions({
						bpjsBase: Number(empForm.basic_salary) || 0,
						monthlyBruto: grossSalary(empForm as Employee),
						ptkpStatus: (empForm.ptkp_status ?? 'TK0') as PtkpStatus,
						hasNpwp: Boolean((empForm.npwp ?? '').trim()),
						pph21Method: method,
						employeeType: empForm.employee_type,
				  })
				: null;
			const payload = {
				company: company.id,
				name: empForm.name,
				position: empForm.position ?? '',
				level: empForm.level ?? '',
				npwp: empForm.npwp ?? '',
				bank_account: empForm.bank_account ?? '',
				basic_salary: Number(empForm.basic_salary) || 0,
				meal_allowance: Number(empForm.meal_allowance) || 0,
				transport_allowance: Number(empForm.transport_allowance) || 0,
				other_allowance: Number(empForm.other_allowance) || 0,
				bpjs_tk: computed ? computed.bpjsTk.employeeTotal : Number(empForm.bpjs_tk) || 0,
				bpjs_kes: computed ? computed.bpjsKes.employee : Number(empForm.bpjs_kes) || 0,
				pph21: computed ? computed.pph21.monthlyTax : Number(empForm.pph21) || 0,
				status: empForm.status ?? 'aktif',
				ptkp_status: empForm.ptkp_status ?? 'TK0',
				pph21_method: method,
				tax_method: (empForm.tax_method ?? 'gross') as TaxMethod,
				auto_calc: autoCalc,
				user: empForm.user ?? '',
				manager: empForm.manager && empForm.manager !== editingEmpId ? empForm.manager : '',
				approval_line: empForm.approval_line ?? '',
				join_date: (empForm.join_date || '').slice(0, 10),
				employee_type: (empForm.employee_type ?? 'permanent') as EmployeeType,
				owner: ownerId,
			};
			const saveWithPhoto = (id: string | null) => {
				if (!photoFile) {
					return id
						? pb.collection('employees').update(id, payload)
						: pb.collection('employees').create<Employee>(payload);
				}
				const fd = new FormData();
				Object.entries(payload).forEach(([k, v]) => {
					fd.append(k, v === undefined || v === null ? '' : String(v));
				});
				fd.append('photo', photoFile, photoFile.name);
				return id
					? pb.collection('employees').update(id, fd)
					: pb.collection('employees').create<Employee>(fd);
			};
			if (editingEmpId) {
				await saveWithPhoto(editingEmpId);
				toast.success('Karyawan diperbarui.');
			} else {
				await saveWithPhoto(null);
				toast.success('Karyawan ditambahkan.');
			}
			setShowEmpForm(false);
			setEditingEmpId(null);
			setPhotoFile(null);
			setPhotoPreview('');
			await refreshEmployees();
		} catch {
			toast.error('Gagal menyimpan karyawan.');
		} finally {
			setEmpSaving(false);
		}
	};

	const deleteEmployee = async (emp: Employee) => {
		if (!window.confirm(`Hapus karyawan ${emp.name}?`)) return;
		try {
			await pb.collection('employees').delete(emp.id);
			await refreshEmployees();
			toast.success('Karyawan dihapus.');
		} catch {
			toast.error('Gagal menghapus karyawan.');
		}
	};

	const memberForEmp = (emp: Employee): CompanyMember | undefined =>
		members.find(m => m.user === emp.user && m.user);

	const openInviteEss = (emp: Employee) => {
		setInviteEmp(emp);
		const existing = memberForEmp(emp);
		setInviteEmail(existing?.email ?? '');
		setInviteResult(null);
	};

	const closeInviteEss = () => {
		setInviteEmp(null);
		setInviteEmail('');
		setInviteResult(null);
		setInviteSaving(false);
	};

	const linkEssAccount = async (employeeId: string, employeeName: string, emailRaw: string) => {
		const email = emailRaw.trim().toLowerCase();
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			toast.error('Masukkan email yang valid untuk undangan ESS.');
			return null;
		}
		const existing = members.find(m => m.email.toLowerCase() === email);
		if (existing?.user) {
			await pb.collection('employees').update(employeeId, { user: existing.user });
			setEmpForm(f => ({ ...f, user: existing.user }));
			await refreshEmployees();
			return { member: existing, email, createdUser: false, invitationSent: false };
		}
		const { member, createdUser, invitationSent } = await inviteCompanyMember({
			companyId: company.id,
			name: employeeName,
			email,
			role: 'karyawan',
		});
		await pb.collection('employees').update(employeeId, { user: member.user });
		setEmpForm(f => ({ ...f, user: member.user }));
		setMembers(prev => (prev.some(m => m.id === member.id) ? prev : [...prev, member]));
		await refreshEmployees();
		return { member, email, createdUser, invitationSent };
	};

	const submitFormEss = async () => {
		if (!editingEmpId) {
			toast.info('Simpan data karyawan dulu, lalu undang ESS dari formulir ini.');
			return;
		}
		if (!empForm.name?.trim()) {
			toast.error('Nama karyawan wajib diisi.');
			return;
		}
		setFormEssSaving(true);
		try {
			const result = await linkEssAccount(editingEmpId, empForm.name.trim(), formEssEmail);
			if (!result) return;
			if (result.createdUser && !result.invitationSent) {
				setFormEssResult({ email: result.email, emailSent: false });
				toast.error(
					'Akun ESS dibuat, tetapi email undangan gagal dikirim. Periksa pengaturan SMTP lalu kirim ulang undangan.',
				);
			} else if (result.createdUser) {
				setFormEssResult({ email: result.email, emailSent: true });
				toast.success('Undangan ESS dibuat. Tautan atur kata sandi dikirim ke email karyawan.');
			} else {
				setFormEssResult(null);
				toast.success('Akun ESS ditautkan ke karyawan ini.');
			}
		} catch (error) {
			toast.error(
				error instanceof Error && error.message
					? error.message
					: 'Gagal mengundang atau menautkan akun ESS.',
			);
		} finally {
			setFormEssSaving(false);
		}
	};

	const unlinkFormEss = async () => {
		if (!editingEmpId) return;
		setFormEssSaving(true);
		try {
			await pb.collection('employees').update(editingEmpId, { user: '' });
			setEmpForm(f => ({ ...f, user: '' }));
			setFormEssEmail('');
			setFormEssResult(null);
			await refreshEmployees();
			toast.success('Tautan akun ESS dilepas.');
		} catch {
			toast.error('Gagal melepas tautan akun ESS.');
		} finally {
			setFormEssSaving(false);
		}
	};

	const submitInviteEss = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!inviteEmp) return;
		const email = inviteEmail.trim().toLowerCase();
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			toast.error('Masukkan email yang valid.');
			return;
		}
		setInviteSaving(true);
		try {
			const { member, createdUser, invitationSent } = await inviteCompanyMember({
				companyId: company.id,
				name: inviteEmp.name,
				email,
				role: 'karyawan',
			});
			await pb.collection('employees').update(inviteEmp.id, { user: member.user });
			await refreshEmployees();
			setMembers(prev => (prev.some(m => m.id === member.id) ? prev : [...prev, member]));
			if (createdUser && invitationSent) {
				setInviteResult({ email, emailSent: true });
				toast.success('Undangan ESS dibuat. Tautan atur kata sandi dikirim ke email karyawan.');
			} else if (createdUser) {
				setInviteResult({ email, emailSent: false });
				toast.error(
					'Akun ESS dibuat, tetapi email undangan gagal dikirim. Periksa pengaturan SMTP lalu kirim ulang undangan.',
				);
			} else {
				toast.success('Karyawan ditautkan ke akun ESS yang sudah ada.');
				closeInviteEss();
			}
		} catch (error) {
			toast.error(
				error instanceof Error && error.message
					? error.message
					: 'Gagal mengundang karyawan ke ESS.',
			);
		} finally {
			setInviteSaving(false);
		}
	};

	const handleExportEmployees = () => {
		const rows = [
			EMPLOYEE_EXPORT_HEADERS,
			...employees.map(emp => [
				emp.name,
				emp.position ?? '',
				emp.level ?? '',
				emp.npwp ?? '',
				emp.bank_account ?? '',
				String(emp.basic_salary || 0),
				String(emp.meal_allowance || 0),
				String(emp.transport_allowance || 0),
				String(emp.other_allowance || 0),
				String(emp.bpjs_tk || 0),
				String(emp.bpjs_kes || 0),
				String(emp.pph21 || 0),
				EMPLOYEE_STATUS_LABELS[emp.status] ?? emp.status,
				emp.ptkp_status ?? 'TK0',
			]),
		];
		exportCsv(timestampedFilename('karyawan'), rows);
		toast.success('Data karyawan diekspor.');
	};

	const handleImportFile = async (file: File) => {
		const text = await file.text();
		const lines = text
			.split(/\r?\n/)
			.map(l => l.trim())
			.filter(Boolean);
		if (lines.length < 2) {
			toast.error('File kosong atau tidak valid.');
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
		let skipped = 0;
		for (const row of dataRows) {
			const [
				rawName,
				rawPosition,
				rawNpwp,
				rawBank,
				rawBasic,
				rawMeal,
				rawTransport,
				rawOther,
				rawBpjsTk,
				rawBpjsKes,
				rawPph,
				rawStatus,
				rawPtkp,
			] = row;
			const name = (rawName ?? '').trim();
			if (!name) {
				skipped += 1;
				continue;
			}
			try {
				await pb.collection('employees').create<Employee>(
					{
						company: company.id,
						name,
						position: (rawPosition ?? '').trim(),
						npwp: (rawNpwp ?? '').trim(),
						bank_account: (rawBank ?? '').trim(),
						basic_salary: Number(rawBasic) || 0,
						meal_allowance: Number(rawMeal) || 0,
						transport_allowance: Number(rawTransport) || 0,
						other_allowance: Number(rawOther) || 0,
						bpjs_tk: Number(rawBpjsTk) || 0,
						bpjs_kes: Number(rawBpjsKes) || 0,
						pph21: Number(rawPph) || 0,
						status: (rawStatus ?? '').toLowerCase().includes('non') ? 'nonaktif' : 'aktif',
						ptkp_status: (PTKP_OPTIONS.includes((rawPtkp ?? '').trim() as PtkpStatus)
							? (rawPtkp ?? '').trim()
							: 'TK0') as PtkpStatus,
						pph21_method: 'annual',
						tax_method: 'gross',
						auto_calc: true,
						owner: ownerId,
					},
					{ requestKey: `import-emp-${created}-${name}` },
				);
				created += 1;
			} catch {
				skipped += 1;
			}
		}
		await refreshEmployees();
		if (created === 0) toast.error('Tidak ada karyawan baru yang berhasil diimpor.');
		else toast.success(`${created} karyawan diimpor${skipped ? `, ${skipped} dilewati` : ''}.`);
	};

	const bulkSetStatus = async (status: Employee['status']) => {
		const targets = filtered.filter(e => e.status !== status);
		if (targets.length === 0) {
			toast.info('Tidak ada karyawan yang perlu diubah.');
			setBulkOpen(false);
			return;
		}
		if (!window.confirm(`Ubah status ${targets.length} karyawan menjadi ${EMPLOYEE_STATUS_LABELS[status]}?`)) {
			return;
		}
		try {
			await Promise.all(
				targets.map((emp, i) =>
					pb.collection('employees').update(
						emp.id,
						{ status },
						{ requestKey: `bulk-status-${status}-${i}` },
					),
				),
			);
			await refreshEmployees();
			toast.success('Status karyawan diperbarui.');
		} catch {
			toast.error('Gagal memperbarui status massal.');
		} finally {
			setBulkOpen(false);
		}
	};

	const bulkSetPtkp = async (ptkp: PtkpStatus) => {
		const targets = filtered;
		if (targets.length === 0) {
			toast.info('Tidak ada karyawan.');
			return;
		}
		if (!window.confirm(`Set PTKP ${PTKP_LABELS[ptkp]} untuk ${targets.length} karyawan (filter aktif)?`)) {
			return;
		}
		try {
			await Promise.all(
				targets.map((emp, i) =>
					pb.collection('employees').update(
						emp.id,
						{ ptkp_status: ptkp },
						{ requestKey: `bulk-ptkp-${i}` },
					),
				),
			);
			await refreshEmployees();
			toast.success('Status PTKP diperbarui.');
		} catch {
			toast.error('Gagal memperbarui PTKP.');
		}
	};

	const employeeName = (id: string | undefined) =>
		employees.find(emp => emp.id === id)?.name ?? '';

	const approvalLineLabel = (id: string | undefined) => {
		const line = approvalLines.find(item => item.id === id);
		if (!line) return '';
		const names = (line.approvers ?? [])
			.map(approverId => employeeName(approverId))
			.filter(Boolean);
		return names.length ? `${line.name} · ${names.join(' → ')}` : line.name;
	};

	const selectedApprovalApprover =
		approvalLines.find(line => line.id === empForm.approval_line)?.approvers?.[0] ?? '';

	const directReports = employees.filter(
		emp => editingEmpId && emp.manager === editingEmpId && emp.id !== editingEmpId,
	);

	const selectApprovalApprover = async (approverId: string) => {
		if (!approverId) {
			setEmpForm(form => ({ ...form, approval_line: '' }));
			return;
		}
		const existing = approvalLines.find(
			line => (line.approvers ?? []).length === 1 && line.approvers[0] === approverId,
		);
		if (existing) {
			setEmpForm(form => ({ ...form, approval_line: existing.id }));
			return;
		}
		const approver = employees.find(emp => emp.id === approverId);
		if (!approver) return;
		setLineSaving(true);
		try {
			const created = await pb.collection('approval_lines').create<ApprovalLine>({
				company: company.id,
				name: approver.name,
				approvers: [approverId],
				owner: ownerId,
			});
			setApprovalLines(prev =>
				[...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
			);
			setEmpForm(form => ({ ...form, approval_line: created.id }));
			toast.success(`Approval line ${created.name} ditautkan.`);
		} catch {
			setEmpForm(form => ({ ...form, approval_line: '' }));
			toast.error('Gagal menautkan approval line.');
		} finally {
			setLineSaving(false);
		}
	};

	const previewDeductionTotal = empForm.auto_calc
		? calcDeductions({
				bpjsBase: Number(empForm.basic_salary) || 0,
				monthlyBruto: grossSalary(empForm as Employee),
				ptkpStatus: (empForm.ptkp_status ?? 'TK0') as PtkpStatus,
				hasNpwp: Boolean((empForm.npwp ?? '').trim()),
				pph21Method: (empForm.pph21_method ?? 'annual') as Pph21Method,
				taxMethod: (empForm.tax_method ?? 'gross') as TaxMethod,
				employeeType: empForm.employee_type,
			}).employeeTotal
		: totalDeductions(empForm as Employee);

	// Group by position for org chart
	const byPosition = useMemo(() => {
		const map = new Map<string, Employee[]>();
		for (const emp of activeEmployees) {
			const key = emp.position?.trim() || 'Unassigned';
			const arr = map.get(key) ?? [];
			arr.push(emp);
			map.set(key, arr);
		}
		return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}, [activeEmployees]);

	return (
		<div className="employee-directory-shell flex min-h-[70vh] overflow-hidden rounded-2xl border border-[#e7ebf0] bg-[#f4f6f9] shadow-sm">
			{/* Left rail — Employee Directory + Attendance */}
			<aside className="hidden w-[210px] shrink-0 border-r border-[#e6eaf0] bg-[#eef1f6] px-3 py-4 md:block">
				<p className="mb-3 px-2 text-[10px] font-bold uppercase leading-tight tracking-[0.14em] text-emerald-600">
					Employee
					<br />
					Directory
				</p>
				<nav className="space-y-0.5">
					{allowedSideItems.map(item => (
						<button
							key={item.key}
							type="button"
							onClick={() => {
								setSideNav(item.key);
								setShowEmpForm(false);
							}}
							className={cn(
								'w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
								sideNav === item.key
									? 'bg-[#d8f5e4] font-semibold text-emerald-800'
									: 'text-slate-800 hover:bg-white/80',
							)}
						>
							{item.label}
						</button>
					))}
				</nav>

				<p className="mb-2 mt-7 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">
					Attendance
				</p>
				{allowedAttendanceItems.length > 0 ? (
				<nav className="space-y-0.5">
					{allowedAttendanceItems.map(item => (
						<button
							key={item.key}
							type="button"
							onClick={() => {
								setSideNav(item.key);
								setShowEmpForm(false);
							}}
							className={cn(
								'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
								sideNav === item.key
									? 'bg-[#d8f5e4] font-semibold text-emerald-800'
									: 'text-slate-800 hover:bg-white/80',
							)}
						>
							<span>{item.label}</span>
							{item.external ? (
								<svg
									className="size-3.5 shrink-0 opacity-60"
									viewBox="0 0 12 12"
									fill="none"
									aria-hidden
								>
									<path
										d="M4.5 2.5H2.5v7h7V7.5M6.5 2.5H9.5V5.5M5.5 6.5L9.5 2.5"
										stroke="currentColor"
										strokeWidth="1.2"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							) : null}
						</button>
					))}
				</nav>
				) : null}
			</aside>

			{/* Main */}
			<div className="min-w-0 flex-1 bg-[#f7f8fb]">
				{/* Mobile side nav */}
				<div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
					{[...allowedSideItems, ...allowedAttendanceItems].map(item => (
						<button
							key={item.key}
							type="button"
							onClick={() => {
								setSideNav(item.key as SideNav);
								setShowEmpForm(false);
							}}
							className={cn(
								'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold',
								sideNav === item.key
									? 'bg-indigo-100 text-indigo-700'
									: 'bg-slate-100 text-slate-600',
							)}
						>
							{item.label}
						</button>
					))}
				</div>

				{sideNav === 'schedule' ? (
					<WorkScheduleManager key={company.id} company={company} />
				) : isAttendanceNav(sideNav) ? (
					<AttendanceManager
						company={company}
						sideNav={sideNav}
						onSideNavChange={nav => setSideNav(nav)}
					/>
				) : (
					<>
				{/* Quota banner */}
				{showQuotaBanner && quotaAlmostFull && sideNav === 'list' ? (
					<div className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 md:mx-5">
						<Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
						<p className="flex-1">
							Kuota karyawan hampir penuh ({employees.length}/{employeeLimit} karyawan).{' '}
							<Link to="/plans" className="font-semibold text-primary hover:underline">
								Upgrade paket
							</Link>
						</p>
						<button
							type="button"
							aria-label="Tutup"
							onClick={() => setShowQuotaBanner(false)}
							className="text-sky-500 hover:text-sky-800"
						>
							<X className="size-4" />
						</button>
					</div>
				) : null}

				{/* Header */}
				<div className={cn('flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-5 md:px-5', sideNav === 'transfer' && 'hidden')}>
					<div>
						<h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
							{sideNav === 'list'
								? 'Employee list'
								: sideNav === 'transfer'
									? 'Employee transfer'
									: sideNav === 'offboarding'
										? 'Offboarding'
										: sideNav === 'import-export'
											? 'Import / export prorate'
											: 'PTKP status adjustment'}
						</h1>
						<p className="mt-0.5 text-xs text-slate-500">{company.name}</p>
					</div>
					{sideNav === 'list' && !showEmpForm ? (
						<div className="flex flex-wrap items-center gap-2">
							<div className="relative">
								<button
									type="button"
									onClick={() => {
										setBulkOpen(o => !o);
										setAddMenuOpen(false);
									}}
									className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
								>
									Bulk update data
								</button>
								{bulkOpen ? (
									<div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
										<button
											type="button"
											onClick={() => bulkSetStatus('aktif')}
											className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
										>
											Set Active
										</button>
										<button
											type="button"
											onClick={() => bulkSetStatus('nonaktif')}
											className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
										>
											Set Inactive
										</button>
										<button
											type="button"
											onClick={() => {
												handleExportEmployees();
												setBulkOpen(false);
											}}
											className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
										>
											Export CSV
										</button>
									</div>
								) : null}
							</div>
							<div className="relative">
								<button
									type="button"
									onClick={() => {
										setAddMenuOpen(o => !o);
										setBulkOpen(false);
									}}
									className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98]"
								>
									Add employee <ChevronDown className="size-3.5 opacity-90" />
								</button>
								{addMenuOpen ? (
									<div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
										<button
											type="button"
											onClick={openCreateEmployee}
											className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
										>
											<Plus className="size-3.5 text-indigo-600" /> Single employee
										</button>
										<label className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
											<Upload className="size-3.5 text-indigo-600" /> Import CSV
											<input
												type="file"
												accept=".csv,text/csv"
												className="hidden"
												onChange={e => {
													const f = e.target.files?.[0];
													setAddMenuOpen(false);
													if (f) void handleImportFile(f);
													e.target.value = '';
												}}
											/>
										</label>
									</div>
								) : null}
							</div>
						</div>
					) : null}
				</div>

				{/* LIST VIEW */}
				{sideNav === 'list' ? (
					<div className="space-y-4 px-4 pb-6 md:px-5">
						{showEmpForm ? (
							<form
								onSubmit={submitEmployee}
								className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
							>
								<div className="flex items-center justify-between">
									<h2 className="text-base font-bold text-slate-900">
										{editingEmpId ? 'Edit employee' : 'Add employee'}
									</h2>
									<button
										type="button"
										onClick={() => {
											setShowEmpForm(false);
											setEditingEmpId(null);
										}}
										className="text-slate-400 hover:text-slate-700"
										aria-label="Tutup"
									>
										<X className="size-4" />
									</button>
								</div>
								<div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
									<div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
										{photoPreview ? (
											<img src={photoPreview} alt="Foto karyawan" className="size-full object-cover" />
										) : (
											<Camera className="size-6 text-slate-300" />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-semibold text-slate-700">Foto profil</p>
										<p className="text-xs text-slate-500">JPG, PNG, atau WEBP. Maksimal 5 MB.</p>
									</div>
									<label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-600 shadow-sm hover:bg-emerald-50">
										<Upload className="size-3.5" />
										{photoPreview ? 'Ganti foto' : 'Unggah foto'}
										<input
											type="file"
											accept="image/jpeg,image/png,image/webp"
											className="hidden"
											onChange={e => {
												onPickPhoto(e.target.files?.[0]);
												e.target.value = '';
											}}
										/>
									</label>
								</div>
								<div className="grid gap-3 md:grid-cols-3">
									<div className="space-y-1.5">
										<label htmlFor="emp-name" className="text-xs font-semibold text-slate-600">
											Name <span className="text-red-500">*</span>
										</label>
										<input
											id="emp-name"
											required
											value={empForm.name ?? ''}
											onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))}
											placeholder="Budi Santoso"
											className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
										/>
									</div>
									<div className="space-y-1.5">
										<label htmlFor="emp-position" className="text-xs font-semibold text-slate-600">
											Position
										</label>
										<input
											id="emp-position"
											value={empForm.position ?? ''}
											onChange={e => setEmpForm(f => ({ ...f, position: e.target.value }))}
											placeholder="Staff Admin"
											className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
										/>
									</div>
									<div className="space-y-1.5">
										<label htmlFor="emp-level" className="text-xs font-semibold text-slate-600">
											Level Jabatan
										</label>
										<select
											id="emp-level"
											value={empForm.level ?? ''}
											onChange={e => setEmpForm(f => ({ ...f, level: e.target.value }))}
											className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
										>
											<option value="">Pilih level jabatan</option>
											{levelOptions.map(opt => (
												<option key={opt} value={opt}>{opt}</option>
											))}
										</select>
										<p className="text-[11px] text-slate-400">Kelola daftar level di Pengaturan → Kontak. Dipakai untuk batas nominal reimbursement per level.</p>
									</div>
									<div className="space-y-1.5">
										<label htmlFor="emp-status" className="text-xs font-semibold text-slate-600">
											Status
										</label>
										<select
											id="emp-status"
											value={empForm.status ?? 'aktif'}
											onChange={e =>
												setEmpForm(f => ({
													...f,
													status: e.target.value as Employee['status'],
												}))
											}
											className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
										>
											<option value="aktif">Active</option>
											<option value="nonaktif">Inactive</option>
										</select>
									</div>
									<div className="space-y-1.5">
										<label htmlFor="emp-type" className="text-xs font-semibold text-slate-600">
											Jenis Karyawan
										</label>
										<select
											id="emp-type"
											value={empForm.employee_type ?? 'permanent'}
											onChange={e =>
												setEmpForm(f => ({
													...f,
													employee_type: e.target.value as EmployeeType,
												}))
											}
											className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
										>
											{EMPLOYEE_TYPE_OPTIONS.map(opt => (
												<option key={opt} value={opt}>
													{EMPLOYEE_TYPE_LABELS[opt]}
												</option>
											))}
										</select>
									</div>
									<div className="space-y-1.5">
										<label htmlFor="emp-npwp" className="text-xs font-semibold text-slate-600">
											NPWP
										</label>
										<input
											id="emp-npwp"
											value={empForm.npwp ?? ''}
											onChange={e => setEmpForm(f => ({ ...f, npwp: e.target.value }))}
											className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
										/>
									</div>
									<div className="space-y-1.5 md:col-span-2">
										<label htmlFor="emp-bank" className="text-xs font-semibold text-slate-600">
											Bank account
										</label>
										<input
											id="emp-bank"
											value={empForm.bank_account ?? ''}
											onChange={e => setEmpForm(f => ({ ...f, bank_account: e.target.value }))}
											placeholder="BCA 1234567890"
											className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
										/>
									</div>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-1.5">
									<label htmlFor="emp-approval-line" className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
										Approval line
										<span
											title="Jalur persetujuan untuk cuti, lembur, dan perubahan data karyawan ini."
											className="inline-flex size-4 items-center justify-center rounded-full bg-slate-500 text-[10px] font-bold leading-none text-white"
										>
											i
										</span>
									</label>
									<select
										id="emp-approval-line"
										value={selectedApprovalApprover}
										disabled={lineSaving}
										onChange={e => void selectApprovalApprover(e.target.value)}
										className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none ring-indigo-200 focus:ring-2 disabled:opacity-60"
									>
										<option value="">Select approval line</option>
										{employees
											.filter(emp => emp.id !== editingEmpId)
											.map(emp => (
												<option key={emp.id} value={emp.id}>
													{emp.name}
													{emp.position ? ` — ${emp.position}` : ''}
												</option>
											))}
									</select>
									<p className="text-[11px] text-slate-400">
										Pilih karyawan lain sebagai approver langsung.
									</p>
								</div>
								<div className="space-y-1.5">
									<label htmlFor="emp-manager" className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
										Manager
										<span
											title="Atasan langsung (direct report). Karyawan ini melapor ke manajer yang dipilih."
											className="inline-flex size-4 items-center justify-center rounded-full bg-slate-500 text-[10px] font-bold leading-none text-white"
										>
											i
										</span>
									</label>
									<select
										id="emp-manager"
										value={empForm.manager ?? ''}
										onChange={e => setEmpForm(f => ({ ...f, manager: e.target.value }))}
										className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none ring-indigo-200 focus:ring-2"
									>
										<option value="">Select manager</option>
										{employees
											.filter(emp => emp.id !== editingEmpId)
											.map(emp => (
												<option key={emp.id} value={emp.id}>
													{emp.name}
													{emp.position ? ` — ${emp.position}` : ''}
												</option>
											))}
									</select>
									<p className="text-[11px] text-slate-400">
										Direct report: pilih atasan langsung karyawan ini.
									</p>
								</div>
							</div>

							{editingEmpId ? (
								<div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
										Direct reports
									</p>
									{directReports.length === 0 ? (
										<p className="mt-1 text-sm text-slate-500">
											Belum ada karyawan yang melapor langsung ke orang ini.
										</p>
									) : (
										<ul className="mt-2 flex flex-wrap gap-2">
											{directReports.map(report => (
												<li
													key={report.id}
													className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
												>
													{report.name}
													{report.position ? ` · ${report.position}` : ''}
												</li>
											))}
										</ul>
									)}
								</div>
							) : null}

							<div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
								<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
									<div>
										<p className="text-sm font-bold text-slate-900">Undang ESS</p>
										<p className="mt-0.5 text-xs text-slate-500">
											Undang akun baru atau tautkan email yang sudah terdaftar agar karyawan bisa absensi, cuti, lembur, dan pinjaman.
										</p>
									</div>
									{empForm.user ? (
										<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
											<UserPlus className="size-3" /> ESS tertaut
										</span>
									) : (
										<span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
											Belum diundang
										</span>
									)}
								</div>
								{formEssResult ? (
									<div
										className={cn(
											'mb-3 space-y-1 rounded-lg border px-3 py-2.5 text-sm',
											formEssResult.emailSent
												? 'border-emerald-200 bg-white'
												: 'border-amber-200 bg-amber-50',
										)}
									>
										<p className="font-semibold text-slate-800">
											{formEssResult.emailSent
												? 'Undangan ESS terkirim'
												: 'Akun ESS dibuat, email belum terkirim'}
										</p>
										<p className="text-slate-600">
											Email: <span className="font-semibold">{formEssResult.email}</span>
										</p>
										<p className="text-[11px] text-slate-400">
											{formEssResult.emailSent
												? 'Tautan untuk mengatur kata sandi telah dikirim ke email karyawan. Karyawan masuk lewat halaman login setelah mengatur sandinya, lalu membuka menu Karyawan.'
												: 'Periksa pengaturan SMTP lalu kirim ulang undangan agar karyawan menerima tautan atur kata sandi.'}
										</p>
									</div>
								) : null}
								{!editingEmpId ? (
									<p className="text-xs text-slate-500">
										Simpan karyawan terlebih dahulu, lalu isi email di sini untuk mengundang atau menautkan ESS.
									</p>
								) : (
									<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
										<div className="min-w-0 flex-1 space-y-1.5">
											<label htmlFor="form-ess-email" className="text-xs font-semibold text-slate-600">
												Email ESS
											</label>
											<div className="relative">
												<Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
												<input
													id="form-ess-email"
													type="email"
													value={formEssEmail}
													onChange={e => setFormEssEmail(e.target.value)}
													placeholder="nama@perusahaan.com"
													className="w-full rounded-lg border border-emerald-200 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-emerald-200 focus:ring-2"
												/>
											</div>
										</div>
										<button
											type="button"
											onClick={() => void submitFormEss()}
											disabled={formEssSaving}
											className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
										>
											<UserPlus className="size-3.5" />
											{formEssSaving ? 'Memproses…' : empForm.user ? 'Perbarui tautan' : 'Undang ESS'}
										</button>
										{empForm.user ? (
											<button
												type="button"
												onClick={() => void unlinkFormEss()}
												disabled={formEssSaving}
												className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
											>
												Lepas tautan
											</button>
										) : null}
									</div>
								)}
								{editingEmpId && members.some(m => m.role === 'karyawan') ? (
									<div className="mt-3 space-y-1.5">
										<label htmlFor="form-ess-existing" className="text-xs font-semibold text-slate-600">
											Atau hubungkan akun ESS yang sudah ada
										</label>
										<select
											id="form-ess-existing"
											value={empForm.user ?? ''}
											onChange={e => {
												const userId = e.target.value;
												const member = members.find(m => m.user === userId);
												setEmpForm(f => ({ ...f, user: userId }));
												if (member) setFormEssEmail(member.email);
											}}
											className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-200 focus:ring-2"
										>
											<option value="">Pilih akun karyawan</option>
											{members
												.filter(m => m.role === 'karyawan')
												.map(m => (
													<option key={m.id} value={m.user}>
														{m.name} — {m.email}
													</option>
												))}
										</select>
										<p className="text-[11px] text-slate-400">
											Pilihan ini hanya menandai akun. Tekan Undang ESS atau Perbarui tautan agar tersimpan.
										</p>
									</div>
								) : null}
							</div>

							<div>
								<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
									Earnings (Rp / month)
									</p>
									<div className="grid gap-3 md:grid-cols-4">
										<NumberField
											label="Basic salary"
											value={empForm.basic_salary}
											onChange={v => setEmpForm(f => ({ ...f, basic_salary: v }))}
										/>
										<NumberField
											label="Meal allowance"
											value={empForm.meal_allowance}
											onChange={v => setEmpForm(f => ({ ...f, meal_allowance: v }))}
										/>
										<NumberField
											label="Transport"
											value={empForm.transport_allowance}
											onChange={v => setEmpForm(f => ({ ...f, transport_allowance: v }))}
										/>
										<NumberField
											label="Other"
											value={empForm.other_allowance}
											onChange={v => setEmpForm(f => ({ ...f, other_allowance: v }))}
										/>
									</div>
								</div>

								<div className="grid gap-3 md:grid-cols-3">
									<div className="space-y-1.5">
										<label htmlFor="emp-ptkp" className="text-xs font-semibold text-slate-600">
											PTKP status
										</label>
										<select
											id="emp-ptkp"
											value={empForm.ptkp_status ?? 'TK0'}
											onChange={e =>
												setEmpForm(f => ({
													...f,
													ptkp_status: e.target.value as PtkpStatus,
												}))
											}
											className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
										>
											{PTKP_OPTIONS.map(opt => (
												<option key={opt} value={opt}>
													{PTKP_LABELS[opt]}
												</option>
											))}
										</select>
									</div>
									<div className="space-y-1.5">
										<label htmlFor="emp-pph21-method" className="text-xs font-semibold text-slate-600">
											PPh 21 method
										</label>
										<select
											id="emp-pph21-method"
											value={empForm.pph21_method ?? 'annual'}
											onChange={e =>
												setEmpForm(f => ({
													...f,
													pph21_method: e.target.value as Pph21Method,
												}))
											}
											className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
											disabled={empForm.employee_type === 'freelance'}
										>
											{PPH21_METHOD_OPTIONS.map(opt => (
												<option key={opt} value={opt}>
													{PPH21_METHOD_LABELS[opt]}
												</option>
											))}
										</select>
											{empForm.employee_type === 'freelance' ? (
												<p className="text-[11px] leading-relaxed text-amber-700">
													Freelance memakai PPh 21 pekerja bebas (DPP 50% × bruto, tarif Pasal 17). Metode di atas diabaikan dan BPJS tidak dipotong otomatis.
												</p>
											) : null}
									</div>
									<div className="space-y-1.5">
										<label htmlFor="emp-tax-method" className="text-xs font-semibold text-slate-600">
											Skema pajak
										</label>
										<select
											id="emp-tax-method"
											value={empForm.tax_method ?? 'gross'}
											onChange={e =>
												setEmpForm(f => ({
													...f,
													tax_method: e.target.value as TaxMethod,
												}))
											}
											className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
										>
											{TAX_METHOD_OPTIONS.map(opt => (
												<option key={opt} value={opt}>
													{TAX_METHOD_LABELS[opt]}
												</option>
											))}
										</select>
									</div>
									<div className="flex items-end">
										<label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
											<input
												type="checkbox"
												checked={Boolean(empForm.auto_calc)}
												onChange={e => setEmpForm(f => ({ ...f, auto_calc: e.target.checked }))}
												className="size-4 accent-indigo-600"
											/>
											Auto-calc BPJS &amp; PPh 21
										</label>
									</div>
								</div>

								{empForm.auto_calc ? (
									<DeductionPreview form={empForm} />
								) : (
									<div className="grid gap-3 md:grid-cols-3">
										<NumberField
											label="BPJS TK"
											value={empForm.bpjs_tk}
											onChange={v => setEmpForm(f => ({ ...f, bpjs_tk: v }))}
										/>
										<NumberField
											label="BPJS Kesehatan"
											value={empForm.bpjs_kes}
											onChange={v => setEmpForm(f => ({ ...f, bpjs_kes: v }))}
										/>
										<NumberField
											label="PPh 21"
											value={empForm.pph21}
											onChange={v => setEmpForm(f => ({ ...f, pph21: v }))}
										/>
									</div>
								)}

								<div className="grid gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm md:grid-cols-3">
									<div className="flex justify-between md:block">
										<span className="text-slate-500">Gross</span>
										<span className="font-semibold">
											{formatRupiah(grossSalary(empForm as Employee))}
										</span>
									</div>
									<div className="flex justify-between md:block">
										<span className="text-slate-500">Deductions</span>
										<span className="font-semibold">{formatRupiah(previewDeductionTotal)}</span>
									</div>
									<div className="flex justify-between md:block">
										<span className="font-bold">Net pay</span>
										<span className="font-extrabold text-indigo-600">
											{formatRupiah(
												Math.max(
													0,
													grossSalary(empForm as Employee) - previewDeductionTotal,
												),
											)}
										</span>
									</div>
								</div>

								<div className="flex flex-wrap gap-2">
									<button
										type="submit"
										disabled={empSaving}
										className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
									>
										{empSaving
											? 'Saving…'
											: editingEmpId
												? 'Save changes'
												: 'Save employee'}
									</button>
									<button
										type="button"
										onClick={() => {
											setShowEmpForm(false);
											setEditingEmpId(null);
										}}
										className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
									>
										Cancel
									</button>
								</div>
							</form>
						) : (
							<>
								{/* Toolbar: Directory / Org + filter + search */}
								<div className="flex flex-wrap items-center gap-2">
									<div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
										<button
											type="button"
											onClick={() => setViewMode('directory')}
											className={cn(
												'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
												viewMode === 'directory'
													? 'bg-[#d8f5e4] text-emerald-800'
													: 'text-slate-600 hover:bg-slate-50',
											)}
										>
											<LayoutList className="size-3.5" /> Directory
										</button>
										<button
											type="button"
											onClick={() => setViewMode('org')}
											className={cn(
												'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
												viewMode === 'org'
													? 'bg-[#d8f5e4] text-emerald-800'
													: 'text-slate-600 hover:bg-slate-50',
											)}
										>
											<Network className="size-3.5" /> Org chart
										</button>
									</div>

									<select
										value={statusFilter}
										onChange={e =>
											setStatusFilter(e.target.value as 'all' | 'aktif' | 'nonaktif')
										}
										className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none ring-indigo-200 focus:ring-2"
										aria-label="Filter"
									>
										<option value="all">Filter{filterCount ? ` (${filterCount})` : ''}</option>
										<option value="aktif">Active only</option>
										<option value="nonaktif">Inactive only</option>
									</select>
									{statusFilter !== 'all' ? (
										<span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
											Filter (1)
										</span>
									) : null}

									<div className="ml-auto flex items-center gap-1.5">
										<button
											type="button"
											className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50"
											aria-label="Columns"
											title="Columns"
										>
											<Columns3 className="size-4" />
										</button>
										<button
											type="button"
											onClick={handleExportEmployees}
											className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50"
											aria-label="Share / export"
											title="Export"
										>
											<Share2 className="size-4" />
										</button>
										<button
											type="button"
											onClick={() =>
												toast.info(
													'Kelola data karyawan: tambah, edit, filter, dan ekspor dari halaman ini.',
												)
											}
											className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50"
											aria-label="Help"
										>
											<HelpCircle className="size-4" />
										</button>
										<div className="relative">
											<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
											<input
												value={search}
												onChange={e => setSearch(e.target.value)}
												placeholder="Search..."
												className="w-36 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm outline-none ring-indigo-200 focus:ring-2 md:w-44"
											/>
										</div>
									</div>
								</div>

								{/* Summary strip */}
								<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
									<div className="border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700">
										Employee data in {monthLabel()}
									</div>
									<div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
										<div>
											<p className="text-xs text-slate-500">View company</p>
											<p className="mt-0.5 text-base font-bold text-slate-900">
												{company.name}
											</p>
										</div>
										<div>
											<p className="text-xs text-slate-500">Total employees</p>
											<p className="mt-0.5 inline-flex items-center gap-1.5 text-2xl font-bold tabular-nums text-slate-900">
												{employees.length}
												<span
													title="Semua karyawan terdaftar"
													className="inline-flex size-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-400"
												>
													i
												</span>
											</p>
										</div>
										<div>
											<p className="text-xs text-slate-500">New hires</p>
											<p className="mt-0.5 inline-flex items-center gap-1.5 text-2xl font-bold tabular-nums text-slate-900">
												{newHires}
												<span
													title="Karyawan aktif yang ditambahkan bulan ini"
													className="inline-flex size-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-400"
												>
													i
												</span>
											</p>
										</div>
										<div>
											<p className="text-xs text-slate-500">Leaving</p>
											<p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
												{leaving}
											</p>
										</div>
									</div>
								</div>

								{viewMode === 'directory' ? (
									<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
										{filtered.length === 0 ? (
											<p className="px-5 py-10 text-center text-sm text-slate-500">
												{employees.length === 0
													? 'Belum ada karyawan. Klik “Add employee” untuk mulai.'
													: 'Tidak ada karyawan yang cocok dengan filter/pencarian.'}
											</p>
										) : (
											<div className="overflow-x-auto">
												<table className="w-full min-w-[1100px] text-left text-sm">
													<thead>
														<tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
															<th className="px-4 py-3">Name</th>
															<th className="px-4 py-3">Position</th>
															<th className="px-4 py-3">Level Jabatan</th>
															<th className="px-4 py-3">Jenis</th>
															<th className="px-4 py-3">PTKP</th>
															<th className="px-4 py-3 text-right">Basic</th>
															<th className="px-4 py-3 text-right">Allowance</th>
															<th className="px-4 py-3 text-right">Gross</th>
															<th className="px-4 py-3 text-right">Deductions</th>
															<th className="px-4 py-3 text-right">Net</th>
															<th className="px-4 py-3">Status</th>
															<th className="px-4 py-3 text-right">Action</th>
														</tr>
													</thead>
													<tbody className="divide-y divide-slate-100">
														{filtered.map(emp => (
															<tr key={emp.id} className="hover:bg-slate-50/80">
																<td className="px-4 py-4 align-top">
																	<p
																		className="font-semibold text-slate-900"
																		title={[
																			emp.manager ? `Manager: ${employeeName(emp.manager)}` : '',
																			emp.approval_line ? `Approval: ${approvalLineLabel(emp.approval_line)}` : '',
																		].filter(Boolean).join(' · ')}
																	>
																		{emp.name}
																	</p>
																	{emp.npwp ? (
																		<p className="text-[11px] text-slate-400">NPWP {emp.npwp}</p>
																	) : null}
																	{empActiveComponents(components, emp.id).length > 0 ? (
																		<p
																			className="text-[11px] text-emerald-700"
																			title={empActiveComponents(components, emp.id)
																				.map(c => `${c.component_name}: ${formatRupiah(c.amount || 0)}`)
																				.join(', ')}
																		>
																			{empActiveComponents(components, emp.id)
																				.map(c => c.component_name)
																				.join(', ')}
																		</p>
																	) : null}
																	{emp.user ? (
																		<span
																			className="mt-1.5 inline-flex size-[52px] flex-col items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-center text-[9px] font-semibold leading-tight text-emerald-700"
																			title={`ESS: ${memberForEmp(emp)?.email ?? 'aktif'}`}
																		>
																			<UserPlus className="mb-0.5 size-3" />
																			ESS
																			<br />
																			aktif
																		</span>
																	) : (
																		<button
																			type="button"
																			onClick={() => openInviteEss(emp)}
																			className="mt-1.5 inline-flex size-[52px] flex-col items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-center text-[9px] font-medium leading-tight text-slate-500 hover:border-emerald-300 hover:text-emerald-700"
																			title="Undang ke ESS"
																		>
																			ESS
																			<br />
																			undang
																		</button>
																	)}
																</td>
																<td className="px-4 py-3 text-slate-600">
																	{emp.position || '—'}
																</td>
																<td className="px-4 py-3 text-slate-600">
																	{emp.level || '—'}
																</td>
																<td className="px-4 py-3 text-slate-600">
																	{emp.employee_type
																		? EMPLOYEE_TYPE_LABELS[emp.employee_type as EmployeeType] ??
																			emp.employee_type
																		: '—'}
																</td>
																<td className="px-4 py-3 text-slate-600">
																	{emp.ptkp_status
																		? PTKP_LABELS[emp.ptkp_status as PtkpStatus] ??
																			emp.ptkp_status
																		: '—'}
																</td>
																<td className="px-4 py-3 text-right tabular-nums">
																	{formatRupiah(emp.basic_salary || 0)}
																</td>
																<td className="px-4 py-3 text-right tabular-nums text-slate-500">
																	{formatRupiah(totalAllowance(emp))}
																</td>
																<td className="px-4 py-3 text-right font-semibold tabular-nums">
																	{formatRupiah(grossSalary(emp))}
																</td>
																<td className="px-4 py-3 text-right tabular-nums text-slate-500">
																	{formatRupiah(totalDeductions(emp))}
																</td>
																<td className="px-4 py-3 text-right font-semibold tabular-nums text-indigo-600">
																	{formatRupiah(netSalary(emp))}
																</td>
																<td className="px-4 py-3">
																	<span
																		className={cn(
																			'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
																			emp.status === 'aktif'
																				? 'bg-emerald-100 text-emerald-700'
																				: 'bg-slate-100 text-slate-600',
																		)}
																	>
																		{emp.status === 'aktif' ? 'Active' : 'Inactive'}
																	</span>
																</td>
																<td className="px-4 py-3">
																	<div className="flex justify-end gap-1">
																		{!emp.user ? (
																			<button
																				type="button"
																				onClick={() => openInviteEss(emp)}
																				aria-label="Undang ke ESS"
																				title="Undang ke ESS"
																				className="rounded-md border border-slate-200 p-1.5 text-emerald-600 hover:bg-emerald-50"
																			>
																				<UserPlus className="size-3.5" />
																			</button>
																		) : null}
																		<button
																			type="button"
																			onClick={() => openEditEmployee(emp)}
																			aria-label="Edit"
																			className="rounded-md border border-slate-200 p-1.5 text-indigo-600 hover:bg-indigo-50"
																		>
																			<Pencil className="size-3.5" />
																		</button>
																		<button
																			type="button"
																			onClick={() => deleteEmployee(emp)}
																			aria-label="Delete"
																			className="rounded-md border border-slate-200 p-1.5 text-red-600 hover:bg-red-50"
																		>
																			<Trash2 className="size-3.5" />
																		</button>
																	</div>
																</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
										)}
									</div>
								) : (
									<div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
										<p className="mb-4 text-sm text-slate-500">
											Org chart dikelompokkan berdasarkan jabatan (karyawan aktif).
										</p>
										{byPosition.length === 0 ? (
											<p className="py-8 text-center text-sm text-slate-500">
												Belum ada karyawan aktif.
											</p>
										) : (
											<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
												{byPosition.map(([position, emps]) => (
													<div
														key={position}
														className="rounded-xl border border-slate-200 bg-slate-50/80 p-4"
													>
														<div className="mb-3 flex items-center justify-between gap-2">
															<p className="font-bold text-slate-900">{position}</p>
															<span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
																{emps.length}
															</span>
														</div>
														<ul className="space-y-2">
															{emps.map(emp => (
																<li
																	key={emp.id}
																	className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
																>
																	<button
																		type="button"
																		onClick={() => openEditEmployee(emp)}
																		className="truncate font-medium text-indigo-600 hover:underline"
																	>
																		{emp.name}
																	</button>
																	<div className="flex shrink-0 items-center gap-2">
																		{!emp.user ? (
																			<button
																				type="button"
																				onClick={() => openInviteEss(emp)}
																				className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
																				title="Undang ke ESS"
																			>
																				<UserPlus className="size-3" /> ESS
																			</button>
																		) : (
																			<span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
																				<UserPlus className="size-3" /> ESS
																			</span>
																		)}
																		<span className="text-xs text-slate-400">
																			{formatRupiah(netSalary(emp))}
																		</span>
																	</div>
																</li>
															))}
														</ul>
													</div>
												))}
											</div>
										)}
									</div>
								)}
							</>
						)}
					</div>
				) : null}

				{sideNav === 'transfer' ? (
					<EmployeeTransfer
						company={company}
						employees={employees}
						onEmployeesChange={refreshEmployees}
					/>
				) : null}

				{/* OFFBOARDING */}
				{sideNav === 'offboarding' ? (
					<OffboardingManager company={company} employees={employees} />
				) : null}

				{/* IMPORT / EXPORT */}
				{sideNav === 'import-export' ? (
					<div className="px-5 py-8">
						<div className="mx-auto max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
							<h2 className="text-lg font-bold text-slate-900">Import / export prorate</h2>
							<p className="text-sm text-slate-600">
								Ekspor data karyawan ke CSV atau impor massal dari file CSV (kolom: Nama, Jabatan,
								NPWP, Rekening, gaji & potongan, Status, PTKP).
							</p>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									onClick={handleExportEmployees}
									className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
								>
									Export CSV
								</button>
								<label className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
									Import CSV
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
							</div>
						</div>
					</div>
				) : null}

				{/* PTKP ADJUSTMENT */}
				{sideNav === 'ptkp' ? (
					<div className="px-5 py-8">
						<div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
							<h2 className="text-lg font-bold text-slate-900">PTKP status adjustment</h2>
							<p className="mt-2 text-sm text-slate-600">
								Terapkan status PTKP ke karyawan yang sedang ditampilkan di filter Employee list (
								{filtered.length} orang).
							</p>
							<div className="mt-4 grid gap-2 sm:grid-cols-2">
								{PTKP_OPTIONS.map(opt => (
									<button
										key={opt}
										type="button"
										onClick={() => bulkSetPtkp(opt)}
										className="rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"
									>
										{PTKP_LABELS[opt]}
									</button>
								))}
							</div>
						</div>
					</div>
				) : null}
					</>
				)}
			</div>

			{/* Invite to ESS modal */}
			{inviteEmp ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
					role="dialog"
					aria-modal="true"
					onClick={closeInviteEss}
				>
					<div
						className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
						onClick={e => e.stopPropagation()}
					>
						{inviteResult ? (
							<div className="space-y-4">
								<div
									className={cn(
										'flex size-12 items-center justify-center rounded-full',
										inviteResult.emailSent ? 'bg-emerald-100' : 'bg-amber-100',
									)}
								>
									<UserPlus
										className={cn(
											'size-6',
											inviteResult.emailSent ? 'text-emerald-600' : 'text-amber-600',
										)}
									/>
								</div>
								<div>
									<h2 className="text-lg font-bold text-slate-900">
										{inviteResult.emailSent
											? 'Undangan ESS berhasil dibuat'
											: 'Akun ESS dibuat, email belum terkirim'}
									</h2>
									<p className="mt-1 text-sm text-slate-600">
										{inviteResult.emailSent ? (
											<>
												Tautan untuk mengatur kata sandi telah dikirim ke email{' '}
												<strong>{inviteEmp.name}</strong>. Setelah mengatur sandi, karyawan dapat
												masuk ke portal self-service.
											</>
										) : (
											<>
												Akun untuk <strong>{inviteEmp.name}</strong> sudah dibuat dan tertaut, tetapi
												email undangan gagal dikirim. Periksa pengaturan SMTP lalu kirim ulang
												undangan agar karyawan menerima tautan atur kata sandi.
											</>
										)}
									</p>
								</div>
								<div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
									<div className="flex items-center justify-between gap-3">
										<span className="text-slate-500">Email</span>
										<span className="font-semibold text-slate-900">{inviteResult.email}</span>
									</div>
								</div>
								<p className="text-xs text-slate-400">
									Karyawan dapat masuk di /login setelah mengatur kata sandi, lalu membuka menu
									Karyawan untuk live attendance, pengajuan lembur, dan pengajuan pinjaman.
								</p>
								<div className="flex justify-end gap-2">
									<button
										type="button"
										onClick={closeInviteEss}
										className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
									>
										Selesai
									</button>
								</div>
							</div>
						) : (
							<form onSubmit={submitInviteEss} className="space-y-4">
								<div className="flex items-center justify-between">
									<h2 className="text-base font-bold text-slate-900">Undang ke ESS</h2>
									<button
										type="button"
										onClick={closeInviteEss}
										className="text-slate-400 hover:text-slate-700"
										aria-label="Tutup"
									>
										<X className="size-4" />
									</button>
								</div>
								<p className="text-sm text-slate-600">
									Buat akun self-service untuk <strong>{inviteEmp.name}</strong>. Karyawan akan
									dapat melakukan live attendance, mengajukan lembur, dan mengajukan pinjaman.
								</p>
								<div className="space-y-1.5">
									<label htmlFor="invite-email" className="text-xs font-semibold text-slate-600">
										Email karyawan <span className="text-red-500">*</span>
									</label>
									<div className="relative">
										<Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
										<input
											id="invite-email"
											type="email"
											required
											value={inviteEmail}
											onChange={e => setInviteEmail(e.target.value)}
											placeholder="karyawan@email.com"
											className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none ring-indigo-200 focus:ring-2"
										/>
									</div>
									<p className="text-[11px] text-slate-400">
										Jika email sudah terdaftar, karyawan akan langsung ditautkan tanpa membuat akun baru.
									</p>
								</div>
								<div className="flex justify-end gap-2">
									<button
										type="button"
										onClick={closeInviteEss}
										className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
									>
										Batal
									</button>
									<button
										type="submit"
										disabled={inviteSaving}
										className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
									>
										{inviteSaving ? 'Mengundang…' : 'Kirim undangan'}
									</button>
								</div>
							</form>
						)}
					</div>
				</div>
			) : null}
		</div>
	);
}

function NumberField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number | undefined;
	onChange: (value: number) => void;
}) {
	return (
		<div className="space-y-1.5">
			<label className="text-xs font-semibold text-slate-600">{label}</label>
			<AmountInput
				value={value ?? 0}
				onValueChange={onChange}
				placeholder="0"
				className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
			/>
		</div>
	);
}

function DeductionPreview({ form }: { form: Partial<Employee> }) {
	const method = (form.pph21_method ?? 'annual') as Pph21Method;
	const taxMethod = (form.tax_method ?? 'gross') as TaxMethod;
	const isFreelance = form.employee_type === 'freelance';
	const ded = calcDeductions({
		bpjsBase: Number(form.basic_salary) || 0,
		monthlyBruto: grossSalary(form as Employee),
		ptkpStatus: (form.ptkp_status ?? 'TK0') as PtkpStatus,
		hasNpwp: Boolean((form.npwp ?? '').trim()),
		pph21Method: method,
		taxMethod,
		employeeType: form.employee_type,
	});

	return (
		<div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
			<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
				Auto deductions preview
			</p>
			{isFreelance ? (
				<p className="mb-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-700">
					Pekerja bebas: PPh 21 dihitung dengan DPP 50% × bruto dan tarif Pasal 17 (PMK 168/2023). BPJS tidak dipotong otomatis.
				</p>
			) : null}
			<div className="grid gap-2 sm:grid-cols-3">
				<div className="flex justify-between gap-2 sm:block">
					<span className="text-slate-500">BPJS TK (employee)</span>
					<span className="font-semibold">{formatRupiah(ded.bpjsTk.employeeTotal)}</span>
				</div>
				<div className="flex justify-between gap-2 sm:block">
					<span className="text-slate-500">BPJS Kesehatan</span>
					<span className="font-semibold">{formatRupiah(ded.bpjsKes.employee)}</span>
				</div>
				<div className="flex justify-between gap-2 sm:block">
					<span className="text-slate-500">PPh 21</span>
					<span className="font-semibold">{formatRupiah(ded.pph21.monthlyTax)}</span>
				</div>
			</div>
			<div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2 font-semibold">
				<span>Total potongan karyawan</span>
				<span className="text-indigo-600">{formatRupiah(ded.employeeTotal)}</span>
			</div>
		</div>
	);
}
