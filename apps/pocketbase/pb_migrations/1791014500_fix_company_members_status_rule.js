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
 * This migration replaces `status = 'active'` with `status ?= 'active'` in
 * every rule of every affected base collection, restoring the intended
 * membership-based access. It is idempotent.
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

const RULE_KEYS = ["listRule", "viewRule", "updateRule", "deleteRule"];

function fixRules(col, from, to) {
  let changed = false;
  for (const key of RULE_KEYS) {
    const value = col[key];
    if (typeof value !== "string") continue;
    if (!value.includes(from)) continue;
    col[key] = value.split(from).join(to);
    changed = true;
  }
  return changed;
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
      if (fixRules(
        col,
        "@collection.company_members.status = 'active'",
        "@collection.company_members.status ?= 'active'",
      )) {
        app.save(col);
        touched += 1;
      }
    }
    console.log(`[fix-membership-rules] updated ${touched} collection(s)`);
  },
  (app) => {
    for (const name of AFFECTED) {
      let col;
      try {
        col = app.findCollectionByNameOrId(name);
      } catch {
        continue;
      }
      if (fixRules(
        col,
        "@collection.company_members.status ?= 'active'",
        "@collection.company_members.status = 'active'",
      )) {
        app.save(col);
      }
    }
  },
);
