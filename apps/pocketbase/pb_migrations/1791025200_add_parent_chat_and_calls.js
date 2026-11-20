/// <reference path="../pb_data/types.d.ts" />

// Memungkinkan chat & panggilan antara pengguna perusahaan (users) dan akun
// Parent (koleksi auth `parents`). Menambahkan relasi `sender_parent` /
// `recipient_parent` pada chat_messages dan `caller_parent` / `recipient_parent`
// pada call_signals, serta memperbarui aturan akses agar Parent dapat membaca
// pesan/sinyal yang ditujukan untuknya. Parent hanya dapat menghubungi pengguna
// perusahaannya sendiri (parent.company) — pendaftaran peer dilakukan server-side.
migrate(
  (app) => {
    const parents = app.findCollectionByNameOrId("parents");

    // ---- chat_messages ----
    const messages = app.findCollectionByNameOrId("chat_messages");
    // sender/recipient kini opsional karena pesan parent memakai sender_parent/
    // recipient_parent. Setidaknya satu pasangan harus terisi (divalidasi app).
    const msgSender = messages.fields.getByName("sender");
    if (msgSender) msgSender.required = false;
    const msgRecipient = messages.fields.getByName("recipient");
    if (msgRecipient) msgRecipient.required = false;
    if (!messages.fields.getByName("sender_parent")) {
      messages.fields.add(
        new RelationField({
          name: "sender_parent",
          maxSelect: 1,
          collectionId: parents.id,
          cascadeDelete: true,
        }),
      );
    }
    if (!messages.fields.getByName("recipient_parent")) {
      messages.fields.add(
        new RelationField({
          name: "recipient_parent",
          maxSelect: 1,
          collectionId: parents.id,
          cascadeDelete: true,
        }),
      );
    }
    messages.listRule =
      "@request.auth.id != '' && (sender = @request.auth.id || recipient = @request.auth.id || sender_parent = @request.auth.id || recipient_parent = @request.auth.id)";
    messages.viewRule = messages.listRule;
    messages.createRule =
      "@request.auth.id != '' && (sender = @request.auth.id || sender_parent = @request.auth.id)";
    messages.updateRule = messages.listRule;
    messages.deleteRule = messages.listRule;
    app.save(messages);

    // ---- call_signals ----
    const signals = app.findCollectionByNameOrId("call_signals");
    const sigCaller = signals.fields.getByName("caller");
    if (sigCaller) sigCaller.required = false;
    const sigRecipient = signals.fields.getByName("recipient");
    if (sigRecipient) sigRecipient.required = false;
    if (!signals.fields.getByName("caller_parent")) {
      signals.fields.add(
        new RelationField({
          name: "caller_parent",
          maxSelect: 1,
          collectionId: parents.id,
          cascadeDelete: true,
        }),
      );
    }
    if (!signals.fields.getByName("recipient_parent")) {
      signals.fields.add(
        new RelationField({
          name: "recipient_parent",
          maxSelect: 1,
          collectionId: parents.id,
          cascadeDelete: true,
        }),
      );
    }
    signals.listRule =
      "@request.auth.id != '' && (caller = @request.auth.id || recipient = @request.auth.id || caller_parent = @request.auth.id || recipient_parent = @request.auth.id)";
    signals.viewRule = signals.listRule;
    signals.createRule =
      "@request.auth.id != '' && (caller = @request.auth.id || recipient = @request.auth.id || caller_parent = @request.auth.id || recipient_parent = @request.auth.id)";
    signals.updateRule = signals.listRule;
    signals.deleteRule = signals.listRule;
    app.save(signals);
  },
  (app) => {
    // Kembalikan aturan & hapus field parent.
    const messages = app.findCollectionByNameOrId("chat_messages");
    messages.listRule =
      "@request.auth.id != '' && (sender = @request.auth.id || recipient = @request.auth.id)";
    messages.viewRule = messages.listRule;
    messages.createRule = "@request.auth.id != '' && sender = @request.auth.id";
    messages.updateRule = messages.listRule;
    messages.deleteRule = messages.listRule;
    try { messages.fields.removeByName("recipient_parent"); } catch (_) {}
    try { messages.fields.removeByName("sender_parent"); } catch (_) {}
    const downMsgSender = messages.fields.getByName("sender");
    if (downMsgSender) downMsgSender.required = true;
    const downMsgRecipient = messages.fields.getByName("recipient");
    if (downMsgRecipient) downMsgRecipient.required = true;
    app.save(messages);

    const signals = app.findCollectionByNameOrId("call_signals");
    signals.listRule =
      "@request.auth.id != '' && (caller = @request.auth.id || recipient = @request.auth.id)";
    signals.viewRule = signals.listRule;
    signals.createRule =
      "@request.auth.id != '' && (caller = @request.auth.id || recipient = @request.auth.id)";
    signals.updateRule = signals.listRule;
    signals.deleteRule = signals.listRule;
    try { signals.fields.removeByName("recipient_parent"); } catch (_) {}
    try { signals.fields.removeByName("caller_parent"); } catch (_) {}
    const downSigCaller = signals.fields.getByName("caller");
    if (downSigCaller) downSigCaller.required = true;
    const downSigRecipient = signals.fields.getByName("recipient");
    if (downSigRecipient) downSigRecipient.required = true;
    app.save(signals);
  },
);
