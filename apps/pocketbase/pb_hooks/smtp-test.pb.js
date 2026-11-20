/// <reference path="../pb_data/types.d.ts" />

// Custom route: kirim email uji coba untuk memverifikasi pengaturan SMTP.
// Dipanggil oleh /api/central-admin/smtp (action=test) melalui pocketbaseAdmin.send
// — superuser auth, jadi bypass rule koleksi. Email keluar melewati hook
// onMailerSend (builder-mailer.pb.js): saat SMTP aktif dikirim via server SMTP
// yang dikonfigurasi, saat nonaktif direlay melalui platform.
//
// Mengembalikan jalur pengiriman (via) dan alamat pengirim (sender) agar Admin
// Pusat tahu lewat jalur mana email terkirim — bukan hanya "berhasil/tidak".
// Saat gagal, pesan error asli dari server SMTP/relay diteruskan apa adanya
// (tanpa kredensial) agar dapat ditindaklanjuti di panel pengaturan.
routerAdd("POST", "/smtp-test", (e) => {
    let payload = {}
    try {
        const raw = toString(e.request.body)
        payload = raw ? JSON.parse(raw) : {}
    } catch (err) {
        return e.json(400, { error: "Body JSON tidak valid" })
    }

    const to = (payload.to || "").toString().trim()
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        return e.json(422, { error: "Alamat email penerima tidak valid" })
    }

    const settings = $app.settings()
    const smtpEnabled = !!(settings.smtp && settings.smtp.enabled)
    const senderName = (settings.meta.senderName || "Catet Pajak").toString()
    const configuredSender = (settings.meta.senderAddress || "").toString()
    const relaySender = $os.getenv("BUILDER_MAILER_SENDER_ADDRESS") || ""

    // Best-effort: render the configured email profile image (logo) at the top
    // of the test email so Admin Pusat can verify it appears correctly. A missing
    // or failing logo never blocks the test email from sending.
    let logoHtml = ""
    try {
        const records = $app.findRecordsByFilter("email_branding", "id != ''", "-updated", 1, 0)
        if (records.length > 0) {
            const rec = records[0]
            const filename = rec.getString("logo")
            if (filename) {
                const appUrl = settings.meta.appURL
                const url = `${appUrl}/api/files/email_branding/${rec.id}/${filename}`
                const alt = rec.getString("alt_text") || "Catet Pajak"
                logoHtml = `<img src="${url}" alt="${alt}" width="120" style="display:block;max-width:120px;height:auto;margin:0 0 16px;border:0;outline:none;text-decoration:none;"/>`
            }
        }
    } catch (err) {
        logoHtml = ""
    }

    const message = new MailerMessage({
        from: { name: senderName },
        to: [{ address: to }],
        subject: "Tes Pengaturan SMTP — Catet Pajak",
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#0f2744;">
            ${logoHtml}
            <h1 style="font-size:18px;margin:0 0 12px;">Tes Pengaturan SMTP</h1>
            <p style="font-size:14px;line-height:1.6;color:#334155;">
                Email uji coba ini dikirim dari pengaturan SMTP Catet Pajak.
                Jika Anda menerima email ini, konfigurasi SMTP berfungsi dengan baik.
            </p>
            <p style="font-size:12px;color:#94a3b8;margin-top:20px;">Pengirim: ${configuredSender || "(default)"}</p>
        </div>`,
    })

    try {
        $app.newMailClient().send(message)
    } catch (err) {
        const detail = String(err) || "kesalahan tidak diketahui"
        $app.logger().error("smtp test email failed", "to", to, "smtpEnabled", smtpEnabled, "err", detail)
        return e.json(502, { error: detail })
    }

    return e.json(200, {
        ok: true,
        via: smtpEnabled ? "smtp" : "relay",
        sender: smtpEnabled ? (configuredSender || "(default SMTP)") : (relaySender || "(relay platform)"),
    })
})
