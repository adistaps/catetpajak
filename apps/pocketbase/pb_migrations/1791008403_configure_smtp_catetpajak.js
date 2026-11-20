/// <reference path="../pb_data/types.d.ts" />

// Pre-configures custom SMTP so outgoing email is sent from
// info@catetpajak.com (Hostinger mail). SMTP is left DISABLED until the real
// mailbox password is provided — with enabled=false, email still goes through
// the platform relay (generic sender), so nothing breaks. Once the password is
// set, a follow-up migration flips s.smtp.enabled = true to activate sending
// from info@catetpajak.com.
migrate(
	(app) => {
		const s = app.settings();

		// SMTP transport (Hostinger mail for info@catetpajak.com).
		s.smtp.enabled = false;
		s.smtp.host = "smtp.hostinger.com";
		s.smtp.port = 465;
		s.smtp.tls = true;
		s.smtp.username = "info@catetpajak.com";
		// GANTI placeholder ini dengan password mailbox info@catetpajak.com,
		// lalu aktifkan SMTP pada migrasi berikutnya (s.smtp.enabled = true).
		s.smtp.password = "REPLACE_WITH_MAILBOX_PASSWORD";

		// Sender identity (the "From:" the recipient sees once SMTP is enabled).
		s.meta.senderAddress = "info@catetpajak.com";
		s.meta.senderName = "Catet Pajak";

		app.save(s);
	},
	(app) => {
		const s = app.settings();
		s.smtp.enabled = false;
		app.save(s);
	},
);
