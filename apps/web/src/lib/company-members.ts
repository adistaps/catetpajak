import pb from '@/lib/pocketbase-client';
import {
	type AppPermission,
	type MemberRole,
	canEditForRole,
	permissionsForRole,
} from '@/data/user-roles';
import type { Company } from '@/lib/accounting';

export interface CompanyMember {
	id: string;
	company: string;
	user: string;
	name: string;
	email: string;
	role: MemberRole;
	permissions: AppPermission[];
	status: 'active' | 'invited' | 'disabled';
	can_edit: boolean;
	access_limited: boolean;
	access_until?: string;
	owner: string;
	created: string;
	updated: string;
}

export async function listCompanyMembers(companyId: string): Promise<CompanyMember[]> {
	return pb.collection('company_members').getFullList<CompanyMember>({
		filter: pb.filter('company = {:id}', { id: companyId }),
		sort: 'name',
		requestKey: null,
	});
}

export async function listMyMemberships(userId: string): Promise<CompanyMember[]> {
	return pb.collection('company_members').getFullList<CompanyMember>({
		filter: pb.filter('user = {:id} && status = "active"', { id: userId }),
		// Avoid SDK auto-cancel when layout mounts twice (Strict Mode / redirects).
		requestKey: null,
	});
}

export type AccessibleCompaniesResult = {
	companies: Company[];
	memberships: CompanyMember[];
	isKaryawan: boolean;
};

/**
 * Companies the signed-in user can access: owned + active memberships.
 * Prefers a server endpoint (superuser) so ESS members are not blocked by
 * companies @collection list/view rules; falls back to direct SDK calls.
 */
export async function listAccessibleCompanies(userId: string): Promise<AccessibleCompaniesResult> {
	const token = pb.authStore.token;
	if (token) {
		try {
			const res = await fetch('/api/my-companies', {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}` },
				credentials: 'same-origin',
			});
			if (res.ok) {
				const data = (await res.json()) as {
					companies?: Company[];
					memberships?: CompanyMember[];
					isKaryawan?: boolean;
				};
				return {
					companies: data.companies ?? [],
					memberships: data.memberships ?? [],
					isKaryawan: Boolean(data.isKaryawan),
				};
			}
		} catch {
			// fall through to client SDK
		}
	}

	const byId = new Map<string, Company>();
	let memberships: CompanyMember[] = [];

	try {
		memberships = await pb.collection('company_members').getFullList<
			CompanyMember & { expand?: { company?: Company } }
		>({
			filter: pb.filter('user = {:id} && status = "active"', { id: userId }),
			expand: 'company',
			requestKey: null,
		});

		for (const member of memberships) {
			const expanded = (member as CompanyMember & { expand?: { company?: Company } }).expand
				?.company;
			if (expanded?.id) {
				byId.set(expanded.id, expanded);
				continue;
			}
			if (!member.company) continue;
			try {
				const company = await pb.collection('companies').getOne<Company>(member.company, {
					requestKey: `company-${member.company}`,
				});
				byId.set(company.id, company);
			} catch {
				// view rule denied or missing — skip
			}
		}
	} catch {
		memberships = [];
	}

	try {
		const owned = await pb.collection('companies').getFullList<Company>({
			filter: pb.filter('owner = {:id}', { id: userId }),
			sort: 'name',
			requestKey: null,
		});
		for (const company of owned) byId.set(company.id, company);
	} catch {
		// non-owners may not list via owner filter; memberships cover ESS
	}

	const companies = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));
	const ownsAny = companies.some(c => c.owner === userId);
	const hasKaryawanRole = memberships.some(item => item.role === 'karyawan');
	const karyawanOnly =
		memberships.length > 0 && memberships.every(item => item.role === 'karyawan');

	return {
		companies,
		memberships,
		isKaryawan: karyawanOnly || (hasKaryawanRole && !ownsAny),
	};
}

export type InviteCompanyMemberResult = {
	member: CompanyMember;
	createdUser: boolean;
	alreadyMember: boolean;
	invitationSent: boolean;
};

/**
 * Invites a person to a company through the server route, which performs the
 * user lookup, membership check and invitation email with superuser rights.
 *
 * The browser client cannot do this itself: the `users` list/view rules only
 * expose the caller's own record, so an email lookup from the browser always
 * misses and a new account creation fails with a duplicate email error.
 *
 * The actor is derived server-side from the PocketBase session token, which is
 * why this must only be called while signed in.
 */
export async function inviteCompanyMember(input: {
	companyId: string;
	name: string;
	email: string;
	role: MemberRole;
	permissions?: AppPermission[];
	canEdit?: boolean;
	accessLimited?: boolean;
	accessUntil?: string;
}): Promise<InviteCompanyMemberResult> {
	const email = input.email.trim().toLowerCase();

	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new Error('Masukkan email yang valid.');
	}

	const token = pb.authStore.token;

	if (!token) {
		throw new Error('Sesi tidak ditemukan. Silakan masuk kembali lalu coba lagi.');
	}

	const res = await fetch('/api/company-members', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			action: 'invite',
			companyId: input.companyId,
			name: input.name.trim(),
			email,
			role: input.role,
			permissions: permissionsForRole(input.role, input.permissions),
			canEdit: canEditForRole(input.role, input.canEdit),
			accessLimited: Boolean(input.accessLimited),
			accessUntil: input.accessUntil ?? null,
		}),
	});

	const data = (await res.json().catch(() => ({}))) as Partial<InviteCompanyMemberResult> & {
		error?: string;
		message?: string;
	};

	if (!res.ok) {
		throw new Error(
			data.error || data.message || 'Undangan gagal dikirim. Coba lagi sebentar lagi.',
		);
	}

	if (!data.member) {
		throw new Error('Undangan gagal diproses. Coba lagi sebentar lagi.');
	}

	return {
		member: data.member,
		createdUser: Boolean(data.createdUser),
		alreadyMember: Boolean(data.alreadyMember),
		invitationSent: Boolean(data.invitationSent),
	};
}

export async function updateCompanyMember(
	id: string,
	data: Partial<{
		name: string;
		role: MemberRole;
		permissions: AppPermission[];
		can_edit: boolean;
		status: CompanyMember['status'];
		access_limited: boolean;
		access_until: string | null;
	}>,
): Promise<CompanyMember> {
	const payload: Record<string, unknown> = { ...data };
	if (data.role) {
		payload.permissions = permissionsForRole(data.role, data.permissions);
		if (data.can_edit === undefined) {
			payload.can_edit = canEditForRole(data.role);
		}
	}
	return pb.collection('company_members').update<CompanyMember>(id, payload);
}

export async function deleteCompanyMember(id: string): Promise<void> {
	await pb.collection('company_members').delete(id);
}

export function memberHasPermission(
	member: CompanyMember | null | undefined,
	permission: AppPermission,
	isCompanyOwner: boolean,
): boolean {
	if (isCompanyOwner) return true;
	if (!member || member.status === 'disabled') return false;
	if (member.access_limited && member.access_until) {
		const until = new Date(member.access_until);
		if (!Number.isNaN(until.getTime()) && until < new Date()) return false;
	}
	return (member.permissions ?? []).includes(permission);
}

export function memberCanEdit(
	member: CompanyMember | null | undefined,
	isCompanyOwner: boolean,
): boolean {
	if (isCompanyOwner) return true;
	if (!member || member.status === 'disabled') return false;
	return Boolean(member.can_edit);
}
