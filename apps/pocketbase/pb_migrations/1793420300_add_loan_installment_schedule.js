/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const loans = app.findCollectionByNameOrId('employee_loans');
  if (!loans.fields.getByName('installment_schedule')) {
    loans.fields.add(new JSONField({ name: 'installment_schedule', maxSize: 200000 }));
    app.save(loans);
  }
  const payslips = app.findCollectionByNameOrId('payslips');
  if (!payslips.fields.getByName('loan_interest')) {
    payslips.fields.add(new NumberField({ name: 'loan_interest', min: 0 }));
    app.save(payslips);
  }
}, (app) => {
  const payslips = app.findCollectionByNameOrId('payslips');
  payslips.fields.removeByName('loan_interest');
  app.save(payslips);
  const loans = app.findCollectionByNameOrId('employee_loans');
  loans.fields.removeByName('installment_schedule');
  app.save(loans);
});
