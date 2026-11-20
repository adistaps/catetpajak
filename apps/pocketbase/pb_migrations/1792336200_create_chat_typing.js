/// <reference path="../pb_data/types.d.ts" />

// Indikator "sedang mengetik" untuk Chat aplikasi karyawan.
// Koleksi `chat_typing` menyimpan status pengetikan per aktor per percakapan
// (langsung maupun grup). Aturan akses membatasi pembacaan kepada peserta
// percakapan yang berhak: pengirim, penerima langsung, atau anggota grup.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const parents = app.findCollectionByNameOrId("parents");
    const companies = app.findCollectionByNameOrId("companies");
    const groups = app.findCollectionByNameOrId("chat_groups");

    let typing;
    try {
      typing = app.findCollectionByNameOrId("chat_typing");
    } catch (_) {
      typing = new Collection({
        type: "base",
        name: "chat_typing",
        listRule:
          "@request.auth.id != '' && (sender = @request.auth.id || sender_parent = @request.auth.id || recipient = @request.auth.id || recipient_parent = @request.auth.id || group.members.user ?= @request.auth.id || group.members.parent ?= @request.auth.id)",
        viewRule:
          "@request.auth.id != '' && (sender = @request.auth.id || sender_parent = @request.auth.id || recipient = @request.auth.id || recipient_parent = @request.auth.id || group.members.user ?= @request.auth.id || group.members.parent ?= @request.auth.id)",
        createRule:
          "@request.auth.id != '' && (sender = @request.auth.id || sender_parent = @request.auth.id)",
        updateRule:
          "@request.auth.id != '' && (sender = @request.auth.id || sender_parent = @request.auth.id)",
        deleteRule:
          "@request.auth.id != '' && (sender = @request.auth.id || sender_parent = @request.auth.id)",
        fields: [
          {
            name: "sender",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "sender_parent",
            type: "relation",
            maxSelect: 1,
            collectionId: parents.id,
            cascadeDelete: true,
          },
          { name: "sender_name", type: "text", max: 120 },
          { name: "actor_key", type: "text", required: true, max: 80 },
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          {
            name: "recipient",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "recipient_parent",
            type: "relation",
            maxSelect: 1,
            collectionId: parents.id,
            cascadeDelete: true,
          },
          {
            name: "group",
            type: "relation",
            maxSelect: 1,
            collectionId: groups.id,
            cascadeDelete: true,
          },
          { name: "scope", type: "text", required: true, max: 160 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_chat_typing_scope ON chat_typing (scope)",
          "CREATE INDEX idx_chat_typing_actor ON chat_typing (actor_key)",
        ],
      });
      app.save(typing);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("chat_typing"));
    } catch (_) {}
  },
);
