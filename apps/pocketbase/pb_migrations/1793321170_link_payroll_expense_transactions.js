/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const transactions = app.findCollectionByNameOrId('transactions');
    const runs = app.findCollectionByNameOrId('payroll_runs');
    if (!transactions.fields.getByName('payroll_run')) {
      transactions.fields.add(new RelationField({
        name: 'payroll_run',
        collectionId: runs.id,
        maxSelect: 1,
        cascadeDelete: true,
      }));
    }
    const index = "CREATE UNIQUE INDEX idx_transactions_payroll_run ON transactions (payroll_run) WHERE payroll_run != ''";
    if (!(transactions.indexes || []).includes(index)) {
      transactions.indexes = [...(transactions.indexes || []), index];
    }
    app.save(transactions);
  },
  (app) => {
    const transactions = app.findCollectionByNameOrId('transactions');
    transactions.indexes = (transactions.indexes || []).filter(index => !index.includes('idx_transactions_payroll_run'));
    if (transactions.fields.getByName('payroll_run')) transactions.fields.removeByName('payroll_run');
    app.save(transactions);
  },
);
