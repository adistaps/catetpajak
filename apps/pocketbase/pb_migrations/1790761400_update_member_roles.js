/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const col = app.findCollectionByNameOrId("company_members");
		const roleField = col.fields.getByName("role");
		const permField = col.fields.getByName("permissions");

		// Stage 1 — widen the value lists so remapped roles/permissions validate.
		roleField.values = [
			"pemilik",
			"admin",
			"akuntan",
			"finance",
			"hr",
			"ultimate",
			"administrator",
			"pembaca",
			"custom",
			"karyawan",
		];
		permField.values = [
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
			"payroll",
			"pajak",
			"karyawan",
		];
		permField.maxSelect = 16;
		app.save(col);

		// Stage 2 — remap legacy roles and backfill the new permissions.
		const members = app.findRecordsByFilter("company_members", "id != ''");
		for (const record of members) {
			let role = record.get("role");
			let dirty = false;

			if (role === "ultimate") {
				role = "pemilik";
				record.set("role", role);
				dirty = true;
			} else if (role === "administrator") {
				role = "admin";
				record.set("role", role);
				dirty = true;
			}

			const perms = Array.from(record.get("permissions") || []).slice();
			const has = (p) => perms.indexOf(p) !== -1;

			if (role === "pemilik" || role === "admin" || role === "akuntan") {
				if (!has("pajak")) {
					perms.push("pajak");
					dirty = true;
				}
				if (role !== "akuntan" && !has("payroll")) {
					perms.push("payroll");
					dirty = true;
				}
			}
			// Akuntan must never keep the payroll permission.
			if (role === "akuntan" && has("payroll")) {
				record.set(
					"permissions",
					perms.filter((p) => p !== "payroll"),
				);
				dirty = true;
			} else if (dirty) {
				record.set("permissions", perms);
			}

			if (dirty) app.save(record);
		}

		// Stage 3 — final value lists without the legacy role names.
		roleField.values = [
			"pemilik",
			"admin",
			"akuntan",
			"finance",
			"hr",
			"pembaca",
			"custom",
			"karyawan",
		];
		app.save(col);
	},
	(app) => {
		const col = app.findCollectionByNameOrId("company_members");
		const roleField = col.fields.getByName("role");
		const permField = col.fields.getByName("permissions");

		// Stage 1 — widen so remaps validate.
		roleField.values = [
			"pemilik",
			"admin",
			"ultimate",
			"administrator",
			"akuntan",
			"finance",
			"hr",
			"pembaca",
			"custom",
			"karyawan",
		];
		app.save(col);

		// Stage 2 — remap roles back and strip the new permissions.
		const members = app.findRecordsByFilter("company_members", "id != ''");
		for (const record of members) {
			let role = record.get("role");
			let dirty = false;

			if (role === "pemilik") {
				record.set("role", "ultimate");
				dirty = true;
			} else if (role === "admin") {
				record.set("role", "administrator");
				dirty = true;
			}

			const perms = Array.from(record.get("permissions") || []);
			const kept = perms.filter((p) => p !== "payroll" && p !== "pajak");
			if (kept.length !== perms.length) {
				record.set("permissions", kept);
				dirty = true;
			}
			if (dirty) app.save(record);
		}

		// Stage 3 — restore the original value lists.
		roleField.values = [
			"ultimate",
			"administrator",
			"akuntan",
			"pembaca",
			"custom",
			"karyawan",
		];
		permField.values = [
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
			"karyawan",
		];
		permField.maxSelect = 13;
		app.save(col);
	},
);
