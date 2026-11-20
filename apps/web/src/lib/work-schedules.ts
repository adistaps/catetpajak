import pb from '@/lib/pocketbase-client';

export interface ScheduleDay {
	work: boolean;
	shift: string;
	start: string;
	end: string;
	breakStart: string;
	breakEnd: string;
}
export interface WorkSchedule {
	id: string;
	company: string;
	name: string;
	effective_date: string;
	description: string;
	is_active: boolean;
	days: ScheduleDay[];
	employees: string[];
	updated: string;
}
export interface ScheduleEmployee { id: string; name: string; position: string; status: string }
export interface ResolvedSchedule extends ScheduleDay { name: string; effectiveDate: string }
export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function emptyScheduleDay(): ScheduleDay {
	return { work: true, shift: 'Reguler', start: '08:00', end: '17:00', breakStart: '', breakEnd: '' };
}
export function resolveSchedule(items: WorkSchedule[], employeeId: string, date: string): ResolvedSchedule | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const applicable = items.filter(row => row.is_active && row.effective_date <= date && row.employees.includes(employeeId))
		.sort((a, b) => b.effective_date.localeCompare(a.effective_date));
	const schedule = applicable[0];
	if (!schedule) return null;
	const day = schedule.days[new Date(`${date}T00:00:00Z`).getUTCDay()];
	return day ? { ...day, name: schedule.name, effectiveDate: schedule.effective_date } : null;
}
export function listWorkSchedules(company: string): Promise<{ items: WorkSchedule[]; employees: ScheduleEmployee[]; canEdit: boolean }> {
	return pb.send('/api/work-schedules/list', { method: 'POST', body: { company }, requestKey: null });
}
export function saveWorkSchedule(data: WorkSchedule): Promise<{ item: WorkSchedule }> {
	return pb.send('/api/work-schedules/save', { method: 'POST', body: data, requestKey: null });
}
export async function getEmployeeSchedule(company: string, employee: string, date: string): Promise<ResolvedSchedule | null> {
	const result = await pb.send<{ schedule: ResolvedSchedule | null }>('/api/work-schedules/today', { method: 'POST', body: { company, employee, date }, requestKey: null });
	return result.schedule;
}
export function scheduleError(error: unknown, fallback: string): string {
	return (error as { response?: { message?: string } })?.response?.message || fallback;
}
