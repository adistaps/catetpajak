/// <reference path="../pb_data/types.d.ts" />

// Menambahkan field lampiran (attachment) pada pengumuman agar dapat menyertakan
// gambar dan PDF. Field multi-file (maks 10) mendukung JPG/PNG/WebP/PDF.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("announcements");

    if (collection.fields.getByName("attachment")) return;

    collection.fields.add(
      new FileField({
        name: "attachment",
        maxSelect: 10,
        maxSize: 5242880, // 5 MB per file
        mimeTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf",
        ],
        thumbs: ["100x100", "400x300"],
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("announcements");
      collection.fields.removeByName("attachment");
      app.save(collection);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
