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
 * Two earlier migrations (1791014500, 1791014600) tried to fix this via the
 * Collection wrapper, but Goja does not persist computed-string assignments
 * to rule fields through `app.save(col)`. This migration uses a raw SQL bulk
 * UPDATE with REPLACE() on the _collections rule columns — the documented
 * escape hatch for bulk rule changes. Idempotent.
 */
migrate(
  (app) => {
    const sql =
      "UPDATE _collections SET " +
      "listRule = REPLACE(listRule, '@collection.company_members.status = ''active''', '@collection.company_members.status ?= ''active'''), " +
      "viewRule = REPLACE(viewRule, '@collection.company_members.status = ''active''', '@collection.company_members.status ?= ''active'''), " +
      "updateRule = REPLACE(updateRule, '@collection.company_members.status = ''active''', '@collection.company_members.status ?= ''active'''), " +
      "deleteRule = REPLACE(deleteRule, '@collection.company_members.status = ''active''', '@collection.company_members.status ?= ''active''') " +
      "WHERE type = 'base'";
    app.db().newQuery(sql).execute();
  },
  (app) => {
    const sql =
      "UPDATE _collections SET " +
      "listRule = REPLACE(listRule, '@collection.company_members.status ?= ''active''', '@collection.company_members.status = ''active'''), " +
      "viewRule = REPLACE(viewRule, '@collection.company_members.status ?= ''active''', '@collection.company_members.status = ''active'''), " +
      "updateRule = REPLACE(updateRule, '@collection.company_members.status ?= ''active''', '@collection.company_members.status = ''active'''), " +
      "deleteRule = REPLACE(deleteRule, '@collection.company_members.status ?= ''active''', '@collection.company_members.status = ''active''') " +
      "WHERE type = 'base'";
    app.db().newQuery(sql).execute();
  },
);
