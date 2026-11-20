/// <reference path="../pb_data/types.d.ts" />

// Keamanan: pendaftar event tidak boleh lagi meng-update record langsung
// (sebelumnya updateRule = "" sehingga siapa pun bisa mengisi payment_status = "lunas").
// Upload bukti bayar kini lewat route server /api/event-registration-proof.
// createRule tetap publik, tetapi field verifikasi tidak boleh diisi saat membuat,
// dan status "lunas" hanya diterima untuk event gratis (amount = 0).
migrate(
	(app) => {
		const c = app.findCollectionByNameOrId("event_registrations");
		c.updateRule = null;
		c.createRule =
			"@request.body.verification_notes:isset = false" +
			" && @request.body.payment_date:isset = false" +
			" && @request.body.proof:isset = false" +
			" && @request.body.expected_amount:isset = false" +
			" && (@request.body.payment_status:isset = false" +
			" || @request.body.payment_status = 'menunggu_pembayaran'" +
			" || (@request.body.payment_status = 'lunas' && @request.body.amount = 0))";
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId("event_registrations");
		c.updateRule = "";
		c.createRule = "";
		app.save(c);
	},
);
