/// <reference path="../pb_data/types.d.ts" />

// Admin Pusat otomatis untuk akun info@catetpajak.com.
// Akun tersebut belum terdaftar saat hook ini dibuat, jadi status Admin
// Pusat diberikan otomatis begitu akun itu mendaftar (atau emailnya
// diubah ke alamat tersebut). Tidak ada kata sandi yang dibuat atau
// diubah di sini — akun tetap mendaftar lewat alur pendaftaran biasa.
//
// CATATAN: callback hook berjalan dalam scope JSVM yang terisolasi, jadi
// setiap helper dan konstanta HARUS didefinisikan di dalam callback —
// binding level file bisa bernilai undefined.

onRecordAfterCreateSuccess((e) => {
    const CENTRAL_ADMIN_EMAIL = "info@catetpajak.com";

    function grantCentralAdmin(app, userRecord) {
        const email = (userRecord.getString("email") || "").trim().toLowerCase();
        if (email !== CENTRAL_ADMIN_EMAIL) return;

        // Hindari duplikat: lewati bila sudah terdaftar sebagai admin pusat.
        const existing = app.findRecordsByFilter(
            "central_admins",
            "user = {:userId}",
            "",
            1,
            0,
            { userId: userRecord.id },
        );
        if (existing.length > 0) return;

        const collection = app.findCollectionByNameOrId("central_admins");
        const record = new Record(collection);
        record.set("user", userRecord.id);
        record.set("name", userRecord.getString("name") || "Admin Pusat Catet Pajak");
        record.set(
            "notes",
            "Admin pusat otomatis untuk akun " + CENTRAL_ADMIN_EMAIL + ".",
        );
        app.save(record);

        app.logger().info(
            "central admin granted",
            "email",
            email,
            "user",
            userRecord.id,
        );
    }

    grantCentralAdmin(e.app, e.record);
    e.next();
}, "users");

onRecordAfterUpdateSuccess((e) => {
    const CENTRAL_ADMIN_EMAIL = "info@catetpajak.com";

    function grantCentralAdmin(app, userRecord) {
        const email = (userRecord.getString("email") || "").trim().toLowerCase();
        if (email !== CENTRAL_ADMIN_EMAIL) return;

        // Hindari duplikat: lewati bila sudah terdaftar sebagai admin pusat.
        const existing = app.findRecordsByFilter(
            "central_admins",
            "user = {:userId}",
            "",
            1,
            0,
            { userId: userRecord.id },
        );
        if (existing.length > 0) return;

        const collection = app.findCollectionByNameOrId("central_admins");
        const record = new Record(collection);
        record.set("user", userRecord.id);
        record.set("name", userRecord.getString("name") || "Admin Pusat Catet Pajak");
        record.set(
            "notes",
            "Admin pusat otomatis untuk akun " + CENTRAL_ADMIN_EMAIL + ".",
        );
        app.save(record);

        app.logger().info(
            "central admin granted",
            "email",
            email,
            "user",
            userRecord.id,
        );
    }

    grantCentralAdmin(e.app, e.record);
    e.next();
}, "users");
