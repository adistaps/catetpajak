/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId("companies");
		const employees = app.findCollectionByNameOrId("employees");
		const users = app.findCollectionByNameOrId("users");
		const accounts = app.findCollectionByNameOrId("accounts");

		// --- Pinjaman Karyawan ------------------------------------------------
		const loans = new Collection({
			type: "base",
			name: "employee_loans",
			listRule:
				"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
			viewRule:
				"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
			createRule: "@request.auth.id != ''",
			updateRule:
				"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
			deleteRule:
				"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
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
					name: "employee",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: employees.id,
					cascadeDelete: false,
				},
				{ name: "principal", type: "number", required: true, min: 0 },
				{ name: "installments", type: "number", required: true, min: 1 },
				{ name: "installment_amount", type: "number", min: 0 },
				{ name: "disbursed_date", type: "date", required: true },
				{ name: "paid_installments", type: "number", min: 0 },
				{ name: "paid_amount", type: "number", min: 0 },
				{
					name: "status",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["active", "completed", "cancelled"],
				},
				{ name: "description", type: "text", max: 300 },
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
				"CREATE INDEX idx_employee_loans_company ON employee_loans (company)",
				"CREATE INDEX idx_employee_loans_employee ON employee_loans (employee)",
			],
		});
		app.save(loans);

		// --- Tambahkan kolom pinjaman pada slip gaji --------------------------
		const payslips = app.findCollectionByNameOrId("payslips");
		if (!payslips.fields.getByName("loan_deduction")) {
			payslips.fields.add(
				new NumberField({ name: "loan_deduction", min: 0 }),
			);
		}
		if (!payslips.fields.getByName("loan")) {
			payslips.fields.add(
				new RelationField({
					name: "loan",
					required: false,
					maxSelect: 1,
					collectionId: loans.id,
					cascadeDelete: false,
				}),
			);
		}
		app.save(payslips);

		// --- Seed akun Piutang Pinjaman Karyawan (206) -----------------------
		const loanAccounts = [
			{ code: "206", name: "Piutang Pinjaman Karyawan", type: "aset" },
		];
		const existingCompanies = app.findRecordsByFilter("companies", "id != ''", "", 0, 0);
		const accountsCollection = app.findCollectionByNameOrId("accounts");
		for (const company of existingCompanies) {
			for (const def of loanAccounts) {
				const dupes = app.findRecordsByFilter(
					"accounts",
					"company = '" + company.id + "' && code = '" + def.code + "'",
					"",
					0,
					0,
				);
				if (dupes.length > 0) continue;
				const rec = new Record(accountsCollection);
				rec.set("company", company.id);
				rec.set("code", def.code);
				rec.set("name", def.name);
				rec.set("type", def.type);
				rec.set("owner", company.get("owner"));
				app.save(rec);
			}
		}
	},
	(app) => {
		// Hapus kolom pinjaman dari payslips.
		try {
			const payslips = app.findCollectionByNameOrId("payslips");
			const loanField = payslips.fields.getByName("loan");
			if (loanField) {
				payslips.fields.remove(loanField);
			}
			const loanDedField = payslips.fields.getByName("loan_deduction");
			if (loanDedField) {
				payslips.fields.remove(loanDedField);
			}
			app.save(payslips);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) throw e;
		}
		// Hapus koleksi employee_loans.
		try {
			app.delete(app.findCollectionByNameOrId("employee_loans"));
		} catch (e) {
			if (!e.message.includes("no rows in result set")) throw e;
		}
	},
);
