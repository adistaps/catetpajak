/// <reference path="../pb_data/types.d.ts" />

// Bagikan hanya informasi periode dari run terkait kepada pemilik slip yang sudah terbit.
// Ringkasan payroll seluruh karyawan dan aturan akses payroll_runs tetap privat.
onRecordEnrich((e) => {
  const auth = e.requestInfo && e.requestInfo.auth;
  if (auth && e.record.getBool('published')) {
    try {
      const employee = $app.findRecordById('employees', e.record.getString('employee'));
      if (employee.getString('user') === auth.id && employee.getString('company') === e.record.getString('company')) {
        const run = $app.findRecordById('payroll_runs', e.record.getString('run'));
        if (run.getString('company') === e.record.getString('company')) {
          e.record.withCustomData(true);
          e.record.set('payroll_period_info', {
            period: run.getString('period'),
            pay_date: run.getString('pay_date'),
            cutoff_start: run.getString('cutoff_start'),
            cutoff_end: run.getString('cutoff_end'),
          });
        }
      }
    } catch (_) {
      // Jika data periode tidak tersedia, slip tetap dapat dibuka tanpa data tambahan.
    }
  }
  e.next();
}, 'payslips');
