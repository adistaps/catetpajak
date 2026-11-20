/// <reference path="../pb_data/types.d.ts" />

// Jaga riwayat jadwal tersimpan dan catat payroll dengan pinjaman secara atomik.
onRecordDeleteRequest((e) => {
  const slips = e.app.findRecordsByFilter('payslips', 'run = {:run} && loan != ""', '', 0, 0, { run: e.record.id });
  for (const slip of slips) {
    let loan;
    try { loan = e.app.findRecordById('employee_loans', slip.getString('loan')); } catch (_) { continue; }
    let schedule = [];
    try { schedule = JSON.parse(loan.getString('installment_schedule') || '[]'); } catch (_) {}
    if (Array.isArray(schedule) && schedule.length) throw new BadRequestError('Periode dengan jadwal pinjaman tersimpan tidak dapat dihapus agar riwayat cicilan tetap utuh.');
  }
  e.next();
}, 'payroll_runs');

onRecordDeleteRequest((e) => {
  const loanId = e.record.getString('loan');
  if (loanId) {
    let loan;
    try { loan = e.app.findRecordById('employee_loans', loanId); } catch (_) {}
    if (loan) {
      let schedule = [];
      try { schedule = JSON.parse(loan.getString('installment_schedule') || '[]'); } catch (_) {}
      if (Array.isArray(schedule) && schedule.length) throw new BadRequestError('Slip dengan jadwal pinjaman tersimpan tidak dapat dihapus terpisah agar riwayat tetap utuh.');
    }
  }
  e.next();
}, 'payslips');

onRecordUpdateRequest((e) => {
  const original = e.record.original();
  const loanId = original.getString('loan');
  if (loanId) {
    let loan;
    try { loan = e.app.findRecordById('employee_loans', loanId); } catch (_) {}
    if (loan) {
      let schedule = [];
      try { schedule = JSON.parse(loan.getString('installment_schedule') || '[]'); } catch (_) {}
      const changed = e.record.getString('loan') !== loanId || Number(e.record.get('loan_deduction')) !== Number(original.get('loan_deduction')) || Number(e.record.get('loan_interest')) !== Number(original.get('loan_interest')) || e.record.getString('company') !== original.getString('company') || e.record.getString('employee') !== original.getString('employee') || e.record.getString('run') !== original.getString('run');
      if (Array.isArray(schedule) && schedule.length && changed) throw new BadRequestError('Rincian pinjaman pada slip yang tercatat tidak dapat diubah.');
    }
  }
  e.next();
}, 'payslips');

routerAdd('POST', '/api/loan-schedule/run', (e) => {
  const lib = require(`${__hooks}/payroll-expense-lib.js`);
  const body = e.requestInfo().body || {};
  const companyId = String(body.company || '');
  const data = body.run || {};
  const slips = body.slips;
  lib.authorize(e.app, e.auth, companyId, 'payroll', true);
  if (!Array.isArray(slips) || !slips.length || slips.length > 2000 || !/^\d{4}-\d{2}$/.test(String(data.period || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.pay_date || ''))) throw new BadRequestError('Data periode payroll tidak valid.');
  let runId = '';
  e.app.runInTransaction((app) => {
    const account = app.findRecordById('accounts', String(data.cash_account || ''));
    if (account.getString('company') !== companyId) throw new ForbiddenError('Akun pembayaran bukan milik perusahaan ini.');
    const seenEmployees = {};
    const pending = [];
    let grossTotal = 0, dedTotal = 0;
    const number = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) throw new BadRequestError('Nominal slip gaji tidak valid.');
      return n;
    };
    for (const s of slips) {
      const employeeId = String(s.employee || '');
      lib.assertId(employeeId);
      if (seenEmployees[employeeId]) throw new BadRequestError('Karyawan terdaftar lebih dari sekali.');
      seenEmployees[employeeId] = true;
      const employee = app.findRecordById('employees', employeeId);
      if (employee.getString('company') !== companyId) throw new ForbiddenError('Karyawan bukan milik perusahaan ini.');
      const fields = ['basic_salary', 'meal_allowance', 'transport_allowance', 'other_allowance', 'bpjs_tk', 'bpjs_kes', 'pph21', 'component_allowance', 'component_deduction', 'tax_allowance', 'gross', 'total_deductions', 'net_pay', 'loan_deduction', 'loan_interest'];
      const values = {};
      for (const field of fields) values[field] = number(s[field] || 0);
      if (values.total_deductions > values.gross || Math.abs(values.gross - (values.basic_salary + values.meal_allowance + values.transport_allowance + values.other_allowance + values.component_allowance + values.tax_allowance)) > 0.001 || Math.abs(values.total_deductions - (values.bpjs_tk + values.bpjs_kes + values.pph21 + values.component_deduction + values.loan_deduction)) > 0.001 || Math.abs(values.net_pay - (values.gross - values.total_deductions)) > 0.001) throw new BadRequestError('Perhitungan slip gaji tidak sesuai.');
      const loanId = String(s.loan || '');
      if (loanId) {
        lib.assertId(loanId);
        const loan = app.findRecordById('employee_loans', loanId);
        if (loan.getString('company') !== companyId || loan.getString('employee') !== employeeId || loan.getString('status') !== 'active' || loan.getString('updated') !== String(s.loan_updated || '')) throw new BadRequestError('Pinjaman berubah sejak tinjauan. Kembali dan periksa jadwal.');
        const paid = Number(loan.get('paid_installments')) || 0;
        const paidAmount = Number(loan.get('paid_amount')) || 0;
        const principal = Number(loan.get('principal')) || 0;
        const terms = Number(loan.get('installments')) || 1;
        let schedule = [];
        try { schedule = JSON.parse(loan.getString('installment_schedule') || '[]'); } catch (_) { throw new BadRequestError('Jadwal pinjaman tidak valid.'); }
        let principalDue, interestDue = 0;
        if (Array.isArray(schedule) && schedule.length) {
          const future = schedule.filter(row => row.number > paid).sort((a, b) => a.number - b.number);
          if (!future.length || future.length !== terms - paid || future.some((row, i) => row.number !== paid + i + 1 || !Number.isSafeInteger(row.principal) || row.principal < 0 || !Number.isSafeInteger(row.interest) || row.interest < 0) || future.reduce((sum, row) => sum + row.principal, 0) !== principal - paidAmount) throw new BadRequestError('Jadwal pinjaman tidak sesuai dengan sisa pokok.');
          principalDue = future[0].principal;
          interestDue = future[0].interest;
        } else {
          const regular = Number(loan.get('installment_amount')) || Math.round(principal / terms);
          principalDue = Math.min(Math.max(0, principal - paidAmount), paid + 1 >= terms ? Math.max(0, principal - paidAmount) : regular);
        }
        if (Math.abs(values.loan_deduction - principalDue - interestDue) > 0.001 || values.loan_interest !== interestDue) throw new BadRequestError('Potongan pinjaman berubah. Kembali dan periksa jadwal.');
        if (principalDue < 0 || principal - paidAmount <= 0) throw new BadRequestError('Pinjaman aktif tidak memiliki sisa pokok untuk dipotong. Periksa status pinjaman.');
        pending.push({ loan, paid: paid + 1, amount: paidAmount + principalDue, completed: paid + 1 >= terms || paidAmount + principalDue >= principal });
      } else if (values.loan_deduction || values.loan_interest) throw new BadRequestError('Pinjaman pada slip tidak ditemukan.');
      grossTotal += values.gross;
      dedTotal += values.total_deductions;
      s.values = values;
    }
    if (dedTotal > grossTotal || Math.abs(grossTotal - Number(data.total_gross)) > 0.001 || Math.abs(dedTotal - Number(data.total_deductions)) > 0.001 || Math.abs(grossTotal - dedTotal - Number(data.total_net)) > 0.001) throw new BadRequestError('Total payroll tidak sesuai.');
    const run = new Record(app.findCollectionByNameOrId('payroll_runs'));
    for (const key of ['period', 'pay_date', 'description', 'cash_account', 'cutoff_start', 'cutoff_end', 'total_gross', 'total_deductions', 'total_net']) run.set(key, data[key]);
    run.set('company', companyId); run.set('owner', e.auth.id); run.set('status', 'draft');
    app.save(run);
    for (const s of slips) {
      const slip = new Record(app.findCollectionByNameOrId('payslips'));
      slip.set('company', companyId); slip.set('run', run.id); slip.set('employee', s.employee); slip.set('owner', e.auth.id);
      if (s.loan) slip.set('loan', s.loan);
      const taxMethod = String(s.tax_method || 'gross');
      if (taxMethod === 'gross' || taxMethod === 'gross_up' || taxMethod === 'netto') slip.set('tax_method', taxMethod);
      for (const key of Object.keys(s.values)) slip.set(key, s.values[key]);
      app.save(slip);
    }
    for (const item of pending) {
      item.loan.set('paid_installments', item.paid); item.loan.set('paid_amount', item.amount);
      item.loan.set('status', item.completed ? 'completed' : 'active'); app.save(item.loan);
    }
    runId = run.id;
  });
  return e.json(200, { runId });
}, $apis.requireAuth('users'));
