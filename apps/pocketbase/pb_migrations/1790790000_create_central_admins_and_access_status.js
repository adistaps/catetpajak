/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");

		// 1) Koleksi admin pusat. Aturan create/update/delete null: hanya
		//    rute server (superuser) yang boleh mengubah daftar admin pusat.
		//    list/view dibatasi agar pengguna hanya dapat memeriksa status
		//    admin pusat miliknya sendiri.
		const centralAdmins = new Collection({
			type: "base",
			name: "central_admins",
			listRule: "@request.auth.id != '' && user = @request.auth.id",
			viewRule: "@request.auth.id != '' && user = @request.auth.id",
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{
					name: "user",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "name", type: "text", max: 120 },
				{ name: "notes", type: "text", max: 300 },
				{ name: "created", type: "autodate", onCreate: true },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
		});
		app.save(centralAdmins);

		// 2) Status akses perusahaan: active (default) atau suspended.
		//    Perusahaan lama tanpa nilai dianggap aktif.
		const companies = app.findCollectionByNameOrId("companies");
		let hasAccessStatus = null;
		try {
			hasAccessStatus = companies.fields.getByName("access_status");
		} catch (_) {
			hasAccessStatus = null;
		}
		if (!hasAccessStatus) {
			companies.fields.add(
				new SelectField({
					name: "access_status",
					maxSelect: 1,
					values: ["active", "suspended"],
				}),
			);
			app.save(companies);
		}

		// 3) Seed admin pusat pertama: pengguna terdaftar paling awal
		//    (pemilik akun pertama aplikasi). Hanya diisi bila belum ada
		//    admin pusat sama sekali.
		const existingAdmins = app.findRecordsByFilter(
			"central_admins",
			"id != ''",
			"created",
			1,
			0,
		);
		if (existingAdmins.length === 0) {
			const earliestUsers = app.findRecordsByFilter(
				"users",
				"id != ''",
				"created",
				1,
				0,
			);
			if (earliestUsers.length > 0) {
				let label = "";
				try {
					label = earliestUsers[0].getString("name");
				} catch (_) {
					label = "";
				}
				if (!label) {
					try {
						label = earliestUsers[0].getString("email");
					} catch (_) {
						label = "";
					}
				}
				const record = new Record(centralAdmins);
				record.set("user", earliestUsers[0].id);
				record.set("name", label || "Admin Pusat");
				record.set("notes", "Admin pusat pertama (akun terdaftar paling awal).");
				app.save(record);
			}
		}
	},
	(app) => {
		const companies = app.findCollectionByNameOrId("companies");
		try {
			companies.fields.removeByName("access_status");
			app.save(companies);
		} catch (_) {
			// field tidak ada — tidak ada yang perlu dipulihkan
		}

		const centralAdmins = app.findCollectionByNameOrId("central_admins");
		app.delete(centralAdmins);
	},
);
