/// <reference path="../pb_data/types.d.ts" />

// ESS/karyawan members were created with status 'invited', which blocks the
// companies list rule (requires status = 'active') and traps the user on the
// empty admin dashboard instead of the self-service portal. Flip all existing
// invited karyawan members to 'active' so they can see their employer company
// and be redirected to /app/karyawan.
migrate(
	(app) => {
		const members = app.findRecordsByFilter(
			'company_members',
			"role = 'karyawan' && status = 'invited'",
		);
		for (const member of members) {
			member.set('status', 'active');
			app.save(member);
		}
	},
	(app) => {
		// Non-destructive down: no reliable way to know which were originally
		// 'invited' vs flipped, so leave them active.
	},
);
