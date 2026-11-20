/// <reference path="../pb_data/types.d.ts" />

/**
 * Fixes company-scoped collection access rules so non-owner company members
 * (e.g. the Kasir role) can read company data.
 *
 * The membership branch of list/view/update/delete rules used
 * `@collection.company_members.status = 'active'`. In PocketBase, an
 * `@collection.*` reference resolves to a multi-value set, and `=` compares
 * the whole set against the scalar (always false). The "any element matches"
 * operator is `?=`. Because of this typo the entire membership branch
 * evaluated to false, so only record owners and company owners could read
 * these collections — Kasir and other non-owner members saw empty lists
 * (notably products in POS).
 *
 * A previous migration (1791014500) attempted this fix with bracket-notation
 * assignment (`col[key] = ...`), which does not mutate the Go-backed
 * Collection struct in the JSVM, so it had no effect. This migration uses
 * explicit dot-notation assignment per rule. Idempotent.
 */
const AFFECTED = [
  "accounts",
  "announcements",
  "approval_lines",
  "asset_revaluations",
  "attendance_records",
  "bupot_records",
  "contacts",
  "depreciations",
  "documents",
  "employee_loans",
  "employee_transfers",
  "entries",
  "fixed_assets",
  "invoice_payments",
  "late_penalty_settings",
  "leave_balances",
  "leave_requests",
  "leave_settings",
  "overtime_requests",
  "overtime_settings",
  "payment_terms_settings",
  "payroll_settings",
  "product_stocks",
  "products",
  "stock_opnames",
  "students",
  "tables",
  "tax_settings",
  "tax_types",
  "transactions",
  "warehouse_transfers",
  "warehouses",
  "warning_letter_settings",
];

const FROM = "@collection.company_members.status = 'active'";
const TO = "@collection.company_members.status ?= 'active'";

function transform(value) {
  if (typeof value !== "string" || value.indexOf(FROM) === -1) return value;
  return value.split(FROM).join(TO);
}

migrate(
  (app) => {
    let touched = 0;
    for (const name of AFFECTED) {
      let col;
      try {
        col = app.findCollectionByNameOrId(name);
      } catch {
        continue;
      }
      const before = col.listRule;
      col.listRule = transform(col.listRule);
      col.viewRule = transform(col.viewRule);
      col.updateRule = transform(col.updateRule);
      col.deleteRule = transform(col.deleteRule);
      if (col.listRule !== before) {
        app.save(col);
        touched += 1;
      }
    }
    console.log("[fix-membership-rules-v2] updated " + touched + " collection(s)");
  },
  (app) => {
    for (const name of AFFECTED) {
      let col;
      try {
        col = app.findCollectionByNameOrId(name);
      } catch {
        continue;
      }
      const before = col.listRule;
      col.listRule = (col.listRule || "").split(TO).join(FROM);
      col.viewRule = (col.viewRule || "").split(TO).join(FROM);
      col.updateRule = (col.updateRule || "").split(TO).join(FROM);
      col.deleteRule = (col.deleteRule || "").split(TO).join(FROM);
      if (col.listRule !== before) app.save(col);
    }
  },
);
