/// <reference path="../pb_data/types.d.ts" />

// Menambahkan field `attachment` (file PDF/PNG) pada chat_messages dan
// menjadikan `text` opsional agar pesan dapat berisi lampiran saja.
// Aturan akses tidak diubah — pemisahan perusahaan dan keanggotaan tetap berlaku.
migrate(
  (app) => {
    const messages = app.findCollectionByNameOrId("chat_messages");

    // Jadikan text opsional (sebelumnya required) untuk mendukung pesan lampiran saja.
    const textField = messages.fields.getByName("text");
    if (textField) {
      textField.required = false;
    }

    // Tambah field attachment jika belum ada.
    if (!messages.fields.getByName("attachment")) {
      messages.fields.add(
        new FileField({
          name: "attachment",
          maxSelect: 1,
          maxSize: 5242880, // 5 MB
          mimeTypes: ["image/png", "application/pdf"],
          protected: false,
        }),
      );
    }

    app.save(messages);
  },
  (app) => {
    const messages = app.findCollectionByNameOrId("chat_messages");
    try {
      messages.fields.removeByName("attachment");
    } catch (_) {}
    const textField = messages.fields.getByName("text");
    if (textField) {
      textField.required = true;
    }
    app.save(messages);
  },
);
