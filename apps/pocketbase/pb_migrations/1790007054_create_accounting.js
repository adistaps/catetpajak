/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		// Produk SaaS yang dijual kembali: pendaftaran publik dibuka.
		users.createRule = "";
		app.save(users);

		const companies = new Collection({
			type: "base",
			name: "companies",
			listRule: "@request.auth.id != '' && @request.auth.id = owner",
			viewRule: "@request.auth.id != '' && @request.auth.id = owner",
			createRule: "@request.auth.id != ''",
			updateRule: "@request.auth.id != '' && @request.auth.id = owner",
			deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
			fields: [
				{ name: "name", type: "text", required: true, max: 120 },
				{ name: "code", type: "text", max: 20 },
				{ name: "address", type: "text", max: 300 },
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
			indexes: ["CREATE INDEX idx_companies_owner ON companies (owner)"],
		});
		app.save(companies);

		const accounts = new Collection({
			type: "base",
			name: "accounts",
			listRule: "@request.auth.id != '' && @request.auth.id = owner",
			viewRule: "@request.auth.id != '' && @request.auth.id = owner",
			createRule: "@request.auth.id != ''",
			updateRule: "@request.auth.id != '' && @request.auth.id = owner",
			deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
			fields: [
				{
					name: "company",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: companies.id,
					cascadeDelete: true,
				},
				{ name: "code", type: "text", required: true, max: 20 },
				{ name: "name", type: "text", required: true, max: 120 },
				{
					name: "type",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["aset", "liabilitas", "ekuitas", "pendapatan", "beban"],
				},
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
			indexes: ["CREATE INDEX idx_accounts_company ON accounts (company)"],
		});
		app.save(accounts);

		const entries = new Collection({
			type: "base",
			name: "entries",
			listRule: "@request.auth.id != '' && @request.auth.id = owner",
			viewRule: "@request.auth.id != '' && @request.auth.id = owner",
			createRule: "@request.auth.id != ''",
			updateRule: "@request.auth.id != '' && @request.auth.id = owner",
			deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
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
					name: "account",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: accounts.id,
					cascadeDelete: true,
				},
				{ name: "date", type: "date", required: true },
				{ name: "description", type: "text", max: 300 },
				{ name: "debit", type: "number", min: 0 },
				{ name: "credit", type: "number", min: 0 },
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
				"CREATE INDEX idx_entries_company ON entries (company)",
				"CREATE INDEX idx_entries_account ON entries (account)",
			],
		});
		app.save(entries);
	},
	(app) => {
		for (const name of ["entries", "accounts", "companies"]) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (e) {
				if (e.message.includes("no rows in result set")) {
					continue;
				}
				throw e;
			}
		}
	},
);
