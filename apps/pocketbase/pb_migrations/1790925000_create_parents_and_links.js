/// <reference path="../pb_data/types.d.ts" />

// Fitur Akun Parent: koleksi auth `parents` terpisah (orang tua/wali siswa),
// relasi `parent` pada `students`, dan relasi `student` pada `documents`
// (invoice/pembayaran) agar parent hanya dapat melihat tagihan & pembayaran
// milik siswa yang terhubung dengannya. Admin perusahaan membuat/mengelola
// akun parent melalui route server (superuser); parent tidak dapat mendaftar
// sendiri. Aturan koleksi memastikan isolasi data berdasarkan relasi parent.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		const companies = app.findCollectionByNameOrId("companies");
		const students = app.findCollectionByNameOrId("students");
		const documents = app.findCollectionByNameOrId("documents");

		// 1. Buat koleksi auth `parents`.
		let parents;
		try {
			parents = app.findCollectionByNameOrId("parents");
		} catch (_) {
			parents = new Collection({
				type: "auth",
				name: "parents",
				// Parent hanya melihat/mengubah record miliknya sendiri.
				// Pembuatan/penghapusan hanya lewat superuser (route server admin).
				listRule: "id = @request.auth.id",
				viewRule: "id = @request.auth.id",
				createRule: null,
				updateRule: "id = @request.auth.id",
				deleteRule: null,
				fields: [
					{ name: "name", type: "text", max: 160 },
					{ name: "phone", type: "text", max: 40 },
					{
						name: "company",
						type: "relation",
						required: true,
						maxSelect: 1,
						collectionId: companies.id,
						cascadeDelete: false,
					},
				],
			});
			app.save(parents);
		}

		// 2. Tambah relasi `parent` pada students (orang tua/wali akun).
		if (!students.fields.getByName("parent")) {
			students.fields.add(
				new RelationField({
					name: "parent",
					maxSelect: 1,
					collectionId: parents.id,
					cascadeDelete: false,
				}),
			);
		}
		// Parent dapat melihat siswa yang terhubung dengannya.
		students.listRule =
			"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active') || parent = @request.auth.id)";
		students.viewRule = students.listRule;
		app.save(students);

		// 3. Tambah relasi `student` pada documents (tagihan/pembayaran siswa).
		if (!documents.fields.getByName("student")) {
			documents.fields.add(
				new RelationField({
					name: "student",
					maxSelect: 1,
					collectionId: students.id,
					cascadeDelete: false,
				}),
			);
		}
		// Parent dapat melihat dokumen (invoice/pembayaran) siswa yang terhubung.
		// Tetap hanya baca; tulis hapus tetap lingkup perusahaan.
		const docCompanyRule =
			"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";
		documents.listRule =
			docCompanyRule + " || (student != '' && student.parent = @request.auth.id)";
		documents.viewRule = documents.listRule;
		app.save(documents);
	},
	(app) => {
		// Kembalikan aturan documents & students, hapus field relasi, lalu hapus koleksi.
		const documents = app.findCollectionByNameOrId("documents");
		const docCompanyRule =
			"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";
		documents.listRule = docCompanyRule;
		documents.viewRule = docCompanyRule;
		try {
			documents.fields.removeByName("student");
		} catch (_) {
			/* already gone */
		}
		app.save(documents);

		const students = app.findCollectionByNameOrId("students");
		const studentRule =
			"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";
		students.listRule = studentRule;
		students.viewRule = studentRule;
		try {
			students.fields.removeByName("parent");
		} catch (_) {
			/* already gone */
		}
		app.save(students);

		try {
			app.delete(app.findCollectionByNameOrId("parents"));
		} catch (e) {
			if (!e.message.includes("no rows in result set")) throw e;
		}
	},
);
