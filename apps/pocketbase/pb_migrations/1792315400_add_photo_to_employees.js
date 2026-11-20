/// <reference path="../pb_data/types.d.ts" />

// Menambahkan field `photo` (file gambar) pada koleksi `employees` untuk
// foto profil karyawan. Field tidak diproteksi agar URL file dapat
// ditampilkan langsung di antarmuka karyawan. Aturan update koleksi
// `employees` tetap owner-only; karyawan mengunggah foto melalui route
// server `/api/karyawan/photo` yang memakai superuser dan hanya memperbarui
// field `photo` pada record karyawan yang ditautkan ke akunnya.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("employees");

    const existing = collection.fields.getByName("photo");
    if (existing) {
      if (existing.type === "file") return; // sudah ada dengan tipe benar
      collection.fields.removeByName("photo");
    }

    collection.fields.add(
      new FileField({
        name: "photo",
        maxSelect: 1,
        maxSize: 5242880, // 5 MB
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        thumbs: ["200x200", "400x400"],
        protected: false,
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("employees");
      collection.fields.removeByName("photo");
      app.save(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("Collection not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);
