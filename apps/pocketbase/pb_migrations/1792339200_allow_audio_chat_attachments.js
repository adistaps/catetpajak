/// <reference path="../pb_data/types.d.ts" />

// Memperluas tipe MIME field `attachment` pada chat_messages agar mendukung
// pesan suara (rekaman audio) selain PNG dan PDF. Ukuran maksimum tetap 5 MB.
migrate(
  (app) => {
    const messages = app.findCollectionByNameOrId("chat_messages");
    const field = messages.fields.getByName("attachment");
    if (field) {
      field.mimeTypes = [
        "image/png",
        "application/pdf",
        "audio/webm",
        "audio/ogg",
        "audio/mpeg",
        "audio/mp4",
        "audio/wav",
        "audio/x-wav",
      ];
    }
    app.save(messages);
  },
  (app) => {
    const messages = app.findCollectionByNameOrId("chat_messages");
    const field = messages.fields.getByName("attachment");
    if (field) {
      field.mimeTypes = ["image/png", "application/pdf"];
    }
    app.save(messages);
  },
);
