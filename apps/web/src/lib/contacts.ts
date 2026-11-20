export type ContactType = 'supplier' | 'customer';

export interface Contact {
	id: string;
	company: string;
	name: string;
	type: ContactType;
	code: string;
	phone: string;
	email: string;
	address: string;
	owner: string;
	created: string;
}

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
	supplier: 'Pemasok',
	customer: 'Pelanggan',
};
