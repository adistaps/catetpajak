/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId("companies");
		const accounts = app.findCollectionByNameOrId("accounts");
		const users = app.findCollectionByNameOrId("users");

		const transactions = new Collection({
			type: "base",
			name: "transactions",
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
					name: "category",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["penjualan", "pembelian", "kas_bank", "aset", "biaya"],
				},
				{ name: "date", type: "date", required: true },
				{ name: "description", type: "text", max: 300 },
				{ name: "amount", type: "number", required: true, min: 0 },
				{ name: "partner", type: "text", max: 120 },
				{
					name: "debit_account",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: accounts.id,
					cascadeDelete: false,
				},
				{
					name: "credit_account",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: accounts.id,
					cascadeDelete: false,
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
			indexes: [
				"CREATE INDEX idx_transactions_company ON transactions (company)",
				"CREATE INDEX idx_transactions_category ON transactions (category)",
			],
		});
		app.save(transactions);

		// Tautkan setiap baris jurnal ke transaksi yang membuatnya (boleh kosong
		// untuk jurnal umum). cascadeDelete: menghapus transaksi => menghapus barisnya.
		const entries = app.findCollectionByNameOrId("entries");
		entries.fields.add(
			new RelationField({
				name: "transaction",
				required: false,
				maxSelect: 1,
				collectionId: transactions.id,
				cascadeDelete: true,
			}),
		);
		app.save(entries);
	},
	(app) => {
		try {
			const entries = app.findCollectionByNameOrId("entries");
			const field = entries.fields.getByName("transaction");
			if (field) {
				entries.fields.remove(field);
				app.save(entries);
			}
		} catch (e) {
			if (!e.message.includes("no rows in result set")) {
				throw e;
			}
		}
		try {
			app.delete(app.findCollectionByNameOrId("transactions"));
		} catch (e) {
			if (!e.message.includes("no rows in result set")) {
				throw e;
			}
		}
	},
);
