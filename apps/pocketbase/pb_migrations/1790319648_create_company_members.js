/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		const companies = app.findCollectionByNameOrId("companies");

		const members = new Collection({
			type: "base",
			name: "company_members",
			listRule:
				"@request.auth.id != '' && (owner = @request.auth.id || user = @request.auth.id || company.owner = @request.auth.id)",
			viewRule:
				"@request.auth.id != '' && (owner = @request.auth.id || user = @request.auth.id || company.owner = @request.auth.id)",
			createRule:
				"@request.auth.id != '' && (owner = @request.auth.id || @request.auth.id = @request.body.owner)",
			updateRule:
				"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id)",
			deleteRule:
				"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id)",
			fields: [
				{
					name: "company",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: companies.id,
					cascadeDelete: true,
				},
				{
					name: "user",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "name", type: "text", required: true, max: 120 },
				{ name: "email", type: "email", required: true },
				{
					name: "role",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["ultimate", "administrator", "akuntan", "pembaca", "custom"],
				},
				{
					name: "permissions",
					type: "select",
					maxSelect: 13,
					values: [
						"dasbor",
						"penjualan",
						"pembelian",
						"kas_bank",
						"aset",
						"biaya",
						"kontak",
						"produk",
						"perusahaan",
						"akun",
						"jurnal",
						"laporan",
						"pengguna",
					],
				},
				{
					name: "status",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["active", "invited", "disabled"],
				},
				{ name: "can_edit", type: "bool" },
				{ name: "access_limited", type: "bool" },
				{ name: "access_until", type: "date" },
				{
					name: "owner",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_company_members_company ON company_members (company)",
				"CREATE INDEX idx_company_members_user ON company_members (user)",
				"CREATE UNIQUE INDEX idx_company_members_unique ON company_members (company, user)",
			],
		});
		app.save(members);

		const memberAccess =
			"(@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= id && @collection.company_members.status = 'active')";
		const memberAccessViaCompany =
			"(@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active')";
		const companyOwnerViaRelation = "company.owner = @request.auth.id";

		companies.listRule =
			"@request.auth.id != '' && (owner = @request.auth.id || " + memberAccess + ")";
		companies.viewRule =
			"@request.auth.id != '' && (owner = @request.auth.id || " + memberAccess + ")";
		app.save(companies);

		const dataCollections = [
			"accounts",
			"entries",
			"transactions",
			"contacts",
			"products",
		];
		for (const name of dataCollections) {
			const col = app.findCollectionByNameOrId(name);
			const rule =
				"@request.auth.id != '' && (owner = @request.auth.id || " +
				companyOwnerViaRelation +
				" || " +
				memberAccessViaCompany +
				")";
			col.listRule = rule;
			col.viewRule = rule;
			col.updateRule = rule;
			col.deleteRule = rule;
			col.createRule = "@request.auth.id != ''";
			app.save(col);
		}
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId("company_members"));
		} catch (e) {
			if (!e.message.includes("no rows in result set")) throw e;
		}

		const ownerOnly =
			"@request.auth.id != '' && @request.auth.id = owner";
		const companies = app.findCollectionByNameOrId("companies");
		companies.listRule = ownerOnly;
		companies.viewRule = ownerOnly;
		app.save(companies);

		for (const name of ["accounts", "entries", "transactions", "contacts", "products"]) {
			try {
				const col = app.findCollectionByNameOrId(name);
				col.listRule = ownerOnly;
				col.viewRule = ownerOnly;
				col.updateRule = ownerOnly;
				col.deleteRule = ownerOnly;
				col.createRule = "@request.auth.id != ''";
				app.save(col);
			} catch (e) {
				if (!e.message.includes("no rows in result set")) throw e;
			}
		}
	},
);
