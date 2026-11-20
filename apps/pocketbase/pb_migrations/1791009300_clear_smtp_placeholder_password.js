/// <reference path="../pb_data/types.d.ts" />

// Clears the placeholder SMTP password left by the earlier configure_smtp
// migration (1791008403). SMTP is still disabled, so no real credential exists
// yet — clearing the placeholder lets the Admin Pusat SMTP panel accurately
// report "no password saved" until a real one is entered through the UI.
// Only clears when the stored value is still the placeholder, so a real
// password set via the settings API is never wiped.
migrate(
	(app) => {
		const s = app.settings();
		if (s.smtp.password === "REPLACE_WITH_MAILBOX_PASSWORD") {
			s.smtp.password = "";
			app.save(s);
		}
	},
	(app) => {
		// no-op rollback
	},
);
