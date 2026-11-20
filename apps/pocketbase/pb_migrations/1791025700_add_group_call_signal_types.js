/// <reference path="../pb_data/types.d.ts" />

// Menambahkan tipe sinyal untuk panggilan grup (mesh) dan share screen:
// invite, join, leave, screen_start, screen_stop. Memperluas nilai select
// `type` pada call_signals tanpa menghapus nilai yang ada.
migrate(
  (app) => {
    const signals = app.findCollectionByNameOrId("call_signals");
    const typeField = signals.fields.getByName("type");
    if (typeField) {
      const existing = Array.isArray(typeField.values) ? typeField.values.slice() : [];
      const additions = ["invite", "join", "leave", "screen_start", "screen_stop"];
      for (const v of additions) {
        if (!existing.includes(v)) existing.push(v);
      }
      typeField.values = existing;
    }
    app.save(signals);
  },
  (app) => {
    const signals = app.findCollectionByNameOrId("call_signals");
    const typeField = signals.fields.getByName("type");
    if (typeField) {
      typeField.values = [
        "offer",
        "answer",
        "ice",
        "reject",
        "cancel",
        "end",
        "busy",
      ];
    }
    app.save(signals);
  },
);
