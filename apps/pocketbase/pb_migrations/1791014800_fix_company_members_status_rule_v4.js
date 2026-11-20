/// <reference path="../pb_data/types.d.ts" />

/**
 * Fixes company-scoped collection access rules so non-owner company members
 * (e.g. the Kasir role) can read company data — and updates PocketBase's
 * in-memory schema cache, which raw SQL does not.
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
 * Earlier migrations (1791014500 bracket-notation, 1791014600 guarded
 * wrapper, 1791014700 raw SQL) either did not persist or did not refresh the
 * in-memory schema cache. This migration reads each rule, rewrites the
 * operator, and ALWAYS saves the collection (no guard) so PocketBase reloads
 * the rule into its enforcement cache. Idempotent.
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

function fix(value) {
  if (typeof value !== "string") return value;
  if (value.indexOf(FROM) === -1) return value;
  return value.split(FROM).join(TO);
}

migrate(
  (app) => {
    for (const name of AFFECTED) {
      let col;
      try {
        col = app.findCollectionByNameOrId(name);
      } catch {
        continue;
      }
      col.listRule = fix(col.listRule);
      col.viewRule = fix(col.viewRule);
      col.updateRule = fix(col.updateRule);
      col.deleteRule = fix(col.deleteRule);
      app.save(col);
    }
  },
  (app) => {
    for (const name of AFFECTED) {
      let col;
      try {
        col = app.findCollectionByNameOrId(name);
      } catch {
        continue;
      }
      col.listRule = (col.listRule || "").split(TO).join(FROM);
      col.viewRule = (col.viewRule || "").split(TO).join(FROM);
      col.updateRule = (col.updateRule || "").split(TO).join(FROM);
      col.deleteRule = (col.deleteRule || "").split(TO).join(FROM);
      app.save(col);
    }
  },
);
