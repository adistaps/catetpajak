/// <reference path="../pb_data/types.d.ts" />

// Custom route: kirim dokumen bisnis (penawaran/pesanan/invoice/pembayaran) via email.
// Dipanggil oleh resource route React Router (/api/document-email) melalui
// pocketbaseAdmin.send — superuser auth, jadi bypass rule koleksi.
// Email keluar melewati hook onMailerSend (builder-mailer.pb.js) yang sudah
// merelay ke builder mailer API — tidak perlu setup SMTP tambahan.
routerAdd("POST", "/send-document-email", (e) => {
    let payload = {}
    try {
        const raw = toString(e.request.body)
        payload = raw ? JSON.parse(raw) : {}
    } catch (err) {
        return e.json(400, { error: "Body JSON tidak valid" })
    }

    const to = (payload.to || "").toString().trim()
    const subject = (payload.subject || "Dokumen dari Catet Pajak").toString()
    const html = (payload.html || "").toString()
    const fromName = (payload.fromName || "Catet Pajak").toString()
    const fromEmail = (payload.fromEmail || "").toString().trim()

    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        return e.json(422, { error: "Alamat email penerima tidak valid" })
    }
    if (!html) {
        return e.json(422, { error: "Konten email kosong" })
    }

    // Email perusahaan dipakai sebagai alamat pengirim & reply-to bila tersedia
    // dan valid; jika tidak, jatuh ke default mailer (Catet Pajak).
    const useCompanyEmail = fromEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail)
    const message = new MailerMessage({
        from: useCompanyEmail
            ? { address: fromEmail, name: fromName }
            : { name: fromName },
        to: [{ address: to }],
        subject: subject,
        html: html,
        ...(useCompanyEmail ? { replyTo: [{ address: fromEmail }] } : {}),
    })

    // Laporkan jalur pengiriman (SMTP aktif vs relay platform) dan alamat
    // pengirim agar pemanggil dapat membedakan "email diterima relay" dari
    // "terkirim via SMTP" — dan memberi umpan balik yang jelas saat SMTP belum
    // dikonfigurasi.
    const settings = $app.settings()
    const smtpEnabled = !!(settings.smtp && settings.smtp.enabled)
    const via = smtpEnabled ? "smtp" : "relay"
    const sender = smtpEnabled
        ? ((settings.meta && settings.meta.senderAddress) || "(default SMTP)")
        : ($os.getenv("BUILDER_MAILER_SENDER_ADDRESS") || "(relay platform)")

    try {
        $app.newMailClient().send(message)
    } catch (err) {
        const detail = String(err) || "kesalahan tidak diketahui"
        $app.logger().error("document email failed", "to", to, "via", via, "err", detail)
        // Teruskan pesan error asli (tanpa kredensial) agar pemanggil dapat
        // menampilkannya — jangan disembunyikan menjadi pesan generik.
        return e.json(500, { error: detail, via, sender })
    }

    return e.json(200, { ok: true, via, sender })
})
