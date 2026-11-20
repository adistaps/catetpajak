import type { Company } from '@/lib/accounting';
import type { TrialStatus } from '@/lib/subscription-access';
import type { EcommerceSubscription } from '@/api/ecommerce-subscriptions-api';
import type { AppPermission, MemberRole } from '@/data/user-roles';

export interface AppOutletContext {
	companies: Company[];
	activeCompany: Company | null;
	setActiveCompanyId: (id: string) => void;
	refreshCompanies: () => Promise<void>;
	updateCompanyName: (id: string, name: string) => void;
	trial: TrialStatus | null;
	activeSubscription: EcommerceSubscription | null;
	/** True when the signed-in user holds the `karyawan` (ESS) role in the active company. */
	isKaryawan: boolean;
	/** Role of the signed-in user in the active company (pemilik for the company owner). */
	memberRole: MemberRole | null;
	/** Whether the user may open the menu guarded by the given permission. */
	canAccessMenu: (permission: AppPermission) => boolean;
}
