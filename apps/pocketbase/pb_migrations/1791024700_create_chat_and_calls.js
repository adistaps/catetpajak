/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const companies = app.findCollectionByNameOrId("companies");

    // ---- chat_messages ----
    try {
      app.findCollectionByNameOrId("chat_messages");
    } catch (_) {
      const messages = new Collection({
        type: "base",
        name: "chat_messages",
        listRule:
          "@request.auth.id != '' && (sender = @request.auth.id || recipient = @request.auth.id)",
        viewRule:
          "@request.auth.id != '' && (sender = @request.auth.id || recipient = @request.auth.id)",
        createRule: "@request.auth.id != '' && sender = @request.auth.id",
        updateRule:
          "@request.auth.id != '' && (sender = @request.auth.id || recipient = @request.auth.id)",
        deleteRule:
          "@request.auth.id != '' && (sender = @request.auth.id || recipient = @request.auth.id)",
        fields: [
          {
            name: "sender",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "recipient",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          { name: "text", type: "text", required: true, max: 4000 },
          { name: "read", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_chat_messages_company ON chat_messages (company)",
          "CREATE INDEX idx_chat_messages_recipient ON chat_messages (recipient)",
          "CREATE INDEX idx_chat_messages_sender ON chat_messages (sender)",
        ],
      });
      app.save(messages);
    }

    // ---- call_signals ----
    try {
      app.findCollectionByNameOrId("call_signals");
    } catch (_) {
      const signals = new Collection({
        type: "base",
        name: "call_signals",
        listRule:
          "@request.auth.id != '' && (caller = @request.auth.id || recipient = @request.auth.id)",
        viewRule:
          "@request.auth.id != '' && (caller = @request.auth.id || recipient = @request.auth.id)",
        createRule:
          "@request.auth.id != '' && (caller = @request.auth.id || recipient = @request.auth.id)",
        updateRule:
          "@request.auth.id != '' && (caller = @request.auth.id || recipient = @request.auth.id)",
        deleteRule:
          "@request.auth.id != '' && (caller = @request.auth.id || recipient = @request.auth.id)",
        fields: [
          { name: "call_id", type: "text", required: true, max: 64 },
          {
            name: "caller",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "recipient",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          {
            name: "type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["offer", "answer", "ice", "reject", "cancel", "end", "busy"],
          },
          {
            name: "call_type",
            type: "select",
            maxSelect: 1,
            values: ["voice", "video"],
          },
          { name: "data", type: "text", max: 12000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_call_signals_recipient ON call_signals (recipient)",
          "CREATE INDEX idx_call_signals_call_id ON call_signals (call_id)",
        ],
      });
      app.save(signals);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("call_signals"));
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId("chat_messages"));
    } catch (_) {}
  },
);
