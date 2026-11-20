/// <reference path="../pb_data/types.d.ts" />

// Menambahkan chat grup: koleksi `chat_groups` dan `chat_group_members`,
// serta field `group` (relasi) dan `read_by` (json) pada `chat_messages`.
// Aturan akses membatasi grup & pesan grup kepada anggota grup saja,
// mempertahankan batas perusahaan dan relasi Parent.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const parents = app.findCollectionByNameOrId("parents");
    const companies = app.findCollectionByNameOrId("companies");

    // 1. chat_groups (tanpa field members dahulu)
    let groups;
    try {
      groups = app.findCollectionByNameOrId("chat_groups");
    } catch (_) {
      groups = new Collection({
        type: "base",
        name: "chat_groups",
        listRule: "@request.auth.id != '' && owner = @request.auth.id",
        viewRule: "@request.auth.id != '' && owner = @request.auth.id",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && owner = @request.auth.id",
        deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
        fields: [
          { name: "name", type: "text", required: true, max: 120 },
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_chat_groups_company ON chat_groups (company)",
        ],
      });
      app.save(groups);
    }

    // 2. chat_group_members
    let groupMembers;
    try {
      groupMembers = app.findCollectionByNameOrId("chat_group_members");
    } catch (_) {
      groupMembers = new Collection({
        type: "base",
        name: "chat_group_members",
        listRule:
          "@request.auth.id != '' && (user = @request.auth.id || parent = @request.auth.id || group.owner = @request.auth.id)",
        viewRule:
          "@request.auth.id != '' && (user = @request.auth.id || parent = @request.auth.id || group.owner = @request.auth.id)",
        createRule: "@request.auth.id != '' && group.owner = @request.auth.id",
        updateRule: "@request.auth.id != '' && group.owner = @request.auth.id",
        deleteRule: "@request.auth.id != '' && group.owner = @request.auth.id",
        fields: [
          {
            name: "group",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: groups.id,
            cascadeDelete: true,
          },
          {
            name: "user",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "parent",
            type: "relation",
            maxSelect: 1,
            collectionId: parents.id,
            cascadeDelete: true,
          },
          { name: "name", type: "text", required: true, max: 120 },
          {
            name: "type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["user", "parent"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
        indexes: [
          "CREATE INDEX idx_chat_group_members_group ON chat_group_members (group)",
        ],
      });
      app.save(groupMembers);
    }

    // 3. Tambah field `members` (back-reference) ke chat_groups
    if (!groups.fields.getByName("members")) {
      groups.fields.add(
        new RelationField({
          name: "members",
          maxSelect: 200,
          collectionId: groupMembers.id,
          cascadeDelete: false,
        }),
      );
    }
    // 4. Perbarui aturan chat_groups agar anggota juga dapat melihat
    groups.listRule =
      "@request.auth.id != '' && (owner = @request.auth.id || members.user ?= @request.auth.id || members.parent ?= @request.auth.id)";
    groups.viewRule = groups.listRule;
    app.save(groups);

    // 5. Tambah field `group` & `read_by` pada chat_messages, perbarui aturan
    const messages = app.findCollectionByNameOrId("chat_messages");
    if (!messages.fields.getByName("group")) {
      messages.fields.add(
        new RelationField({
          name: "group",
          maxSelect: 1,
          collectionId: groups.id,
          cascadeDelete: true,
        }),
      );
    }
    if (!messages.fields.getByName("read_by")) {
      messages.fields.add(new JSONField({ name: "read_by" }));
    }
    const groupMemberClause =
      "(group.members.user ?= @request.auth.id || group.members.parent ?= @request.auth.id)";
    messages.listRule =
      "@request.auth.id != '' && (sender = @request.auth.id || recipient = @request.auth.id || sender_parent = @request.auth.id || recipient_parent = @request.auth.id || " +
      groupMemberClause +
      ")";
    messages.viewRule = messages.listRule;
    messages.createRule =
      "@request.auth.id != '' && ((sender = @request.auth.id || sender_parent = @request.auth.id) && (group = '' || " +
      groupMemberClause +
      "))";
    messages.updateRule = messages.listRule;
    messages.deleteRule = messages.listRule;
    app.save(messages);
  },
  (app) => {
    // down: kembalikan chat_messages, hapus koleksi grup
    try {
      const messages = app.findCollectionByNameOrId("chat_messages");
      try { messages.fields.removeByName("read_by"); } catch (_) {}
      try { messages.fields.removeByName("group"); } catch (_) {}
      messages.listRule =
        "@request.auth.id != '' && (sender = @request.auth.id || recipient = @request.auth.id || sender_parent = @request.auth.id || recipient_parent = @request.auth.id)";
      messages.viewRule = messages.listRule;
      messages.createRule =
        "@request.auth.id != '' && (sender = @request.auth.id || sender_parent = @request.auth.id)";
      messages.updateRule = messages.listRule;
      messages.deleteRule = messages.listRule;
      app.save(messages);
    } catch (_) {}

    try { app.delete(app.findCollectionByNameOrId("chat_group_members")); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId("chat_groups")); } catch (_) {}
  },
);
