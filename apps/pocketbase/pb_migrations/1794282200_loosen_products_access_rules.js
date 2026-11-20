/// <reference path="../pb_data/types.d.ts" />

/**
 * Melonggarkan aturan akses koleksi `products` agar seluruh anggota
 * perusahaan aktif (bukan hanya pembuat produk) dapat membaca dan mengubah
 * produk — termasuk menyesuaikan stok lewat stock opname. Sebelumnya aturan
 * hanya memperbolehkan `owner` (pembuat) memperbarui, sehingga penyesuaian
 * stok opname oleh anggota lain gagal dengan 403 dan stok produk tidak
 * pernah bertambah. Tetap menghormati isolasi data antarperusahaan.
 */
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('products');
		const memberAware =
			"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";
		collection.listRule = memberAware;
		collection.viewRule = memberAware;
		collection.createRule = "@request.auth.id != ''";
		collection.updateRule = memberAware;
		collection.deleteRule = memberAware;
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('products');
		collection.listRule = "@request.auth.id != '' && @request.auth.id = owner";
		collection.viewRule = "@request.auth.id != '' && @request.auth.id = owner";
		collection.createRule = "@request.auth.id != ''";
		collection.updateRule = "@request.auth.id != '' && @request.auth.id = owner";
		collection.deleteRule = "@request.auth.id != '' && @request.auth.id = owner";
		app.save(collection);
	},
);
