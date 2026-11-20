/// <reference path="../pb_data/types.d.ts" />

// Brand password-reset emails as a Catet Pajak "atur kata sandi" email.
// Fires for both the `users` and `parents` auth collections, so company member
// invites, central-admin invites, ESS invites, and parent invites all share
// the same branded password-setup flow. The text is neutral so it also fits
// the regular "forgot password" flow triggered from /login.
//
// When Admin Pusat has uploaded a profile image (email_branding collection),
// it is shown at the top of the email as a remote <img>. The lookup is
// best-effort: a missing or failing logo never blocks the email from sending.

const brandPasswordResetEmail = (e) => {
	// Helper must live inside the callback: PocketBase's JSVM runs each hook
	// in an isolated scope where file-level bindings are undefined.
	const buildLogoHtml = () => {
		try {
			const records = $app.findRecordsByFilter("email_branding", "id != ''", "-updated", 1, 0);
			if (records.length === 0) return "";
			const rec = records[0];
			const filename = rec.getString("logo");
			if (!filename) return "";
			const appUrl = $app.settings().meta.appURL;
			const url = `${appUrl}/api/files/email_branding/${rec.id}/${filename}`;
			const alt = rec.getString("alt_text") || "Catet Pajak";
			return `<img src="${url}" alt="${alt}" width="120" style="display:block;max-width:120px;height:auto;margin:0 0 16px;border:0;outline:none;text-decoration:none;"/>`;
		} catch (err) {
			return "";
		}
	};

	const appUrl = String($app.settings().meta.appURL || "").replace(/\/$/, "");
	// The built-in confirm page and its API live behind the platform prefix.
	// Dropping it makes the themed page load, then the save request miss PocketBase.
	const prefix = appUrl.indexOf("/hcgi/platform") === -1 ? "/hcgi/platform" : "";
	const link = `${appUrl}${prefix}/_/#/auth/confirm-password-reset/${e.meta.token}`;
	const logoHtml = buildLogoHtml();

	e.message.from.name = "Catet Pajak";
	e.message.subject = "Atur kata sandi akun Catet Pajak Anda";
	e.message.html = `
		<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f2744;">
			${logoHtml}
			<h1 style="font-size:20px;margin:0 0 12px;">Atur kata sandi akun Catet Pajak Anda</h1>
			<p style="font-size:14px;line-height:1.6;color:#334155;">
				Anda menerima email ini karena baru saja diundang ke Catet Pajak atau meminta
				atur ulang kata sandi. Atur kata sandi akun Anda dengan menekan tombol di bawah.
				Tautan ini berlaku 30 menit.
			</p>
			<p style="margin:24px 0;">
				<a href="${link}" style="display:inline-block;background:#059669;color:#ffffff;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;text-decoration:none;">Atur kata sandi</a>
			</p>
			<p style="font-size:12px;color:#64748b;word-break:break-all;">
				Jika tombol tidak berfungsi, salin tautan berikut:<br/>
				${link}
			</p>
			<p style="font-size:12px;color:#94a3b8;margin-top:24px;">
				Jika Anda tidak merasa meminta email ini, abaikan pesan ini dan kata sandi Anda tidak akan berubah.
			</p>
		</div>
	`;

	e.next();
};

onMailerRecordPasswordResetSend(brandPasswordResetEmail, "users");
onMailerRecordPasswordResetSend(brandPasswordResetEmail, "parents");
