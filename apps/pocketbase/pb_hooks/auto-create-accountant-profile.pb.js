/// <reference path="../pb_data/types.d.ts" />

// Saat akun users baru dibuat dengan peran "akuntan", buat profil
// accountant_profiles awal agar langsung tampil di direktori publik
// /akuntan. Sebelumnya pendaftaran hanya membuat akun users tanpa profil,
// sehingga akuntan baru tidak pernah muncul di halaman Akuntan sampai
// mereka mengisi formulir profil secara manual di dasbor.
//
// Pengguna melengkapi foto, kota, deskripsi, dsb. nanti lewat dasbor.
// Hanya buat bila belum ada profil untuk owner ini (indeks unik owner).
// Kegagalan pembuatan profil tidak boleh menggagalkan pendaftaran akun.
//
// CATATAN: callback hook berjalan dalam scope JSVM yang terisolasi, jadi
// setiap helper dan konstanta HARUS didefinisikan di dalam callback.

onRecordAfterCreateSuccess((e) => {
    const role = e.record.getString("akuntan_role");
    if (role !== "akuntan") {
        e.next();
        return;
    }

    const ownerId = e.record.id;

    function ensureProfile(app, userRecord) {
        // Hindari duplikat: lewati bila profil untuk owner ini sudah ada.
        let existing = [];
        try {
            existing = app.findRecordsByFilter(
                "accountant_profiles",
                "owner = {:id}",
                "",
                1,
                0,
                { id: ownerId },
            );
        } catch (_) {
            existing = [];
        }
        if (existing.length > 0) return;

        const name = (userRecord.getString("name") || "").trim();
        const collection = app.findCollectionByNameOrId("accountant_profiles");
        const profile = new Record(collection);
        profile.set("owner", ownerId);
        profile.set("name", name || "Akuntan");
        // cv_name wajib diisi; pakai nama pengguna sebagai titik awal,
        // dapat diperbarui pengguna lewat dasbor.
        profile.set("cv_name", name || "Akuntan");
        app.save(profile);

        app.logger().info(
            "accountant profile auto-created",
            "owner",
            ownerId,
        );
    }

    try {
        ensureProfile(e.app, e.record);
    } catch (err) {
        e.app.logger().error(
            "auto-create accountant profile failed",
            "owner",
            ownerId,
            "err",
            String(err),
        );
    }

    e.next();
}, "users");
