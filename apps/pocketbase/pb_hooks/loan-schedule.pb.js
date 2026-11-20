/// <reference path="../pb_data/types.d.ts" />

// Jadwal disimpan melalui satu operasi terotorisasi, bukan update koleksi biasa.
onRecordCreateRequest((e) => {
  const body = e.requestInfo().body || {};
  if (Object.prototype.hasOwnProperty.call(body, 'installment_schedule')) throw new ForbiddenError('Jadwal cicilan harus dibuat melalui layar Penggajian.');
  e.next();
}, 'employee_loans');

onRecordUpdateRequest((e) => {
  const body = e.requestInfo().body || {};
  if (Object.prototype.hasOwnProperty.call(body, 'installment_schedule')) {
    throw new ForbiddenError('Jadwal cicilan harus diperbarui melalui layar Penggajian.');
  }
  const original = e.record.original();
  if (e.record.getString('company') !== original.getString('company') || e.record.getString('employee') !== original.getString('employee') || e.record.getString('owner') !== original.getString('owner')) throw new ForbiddenError('Perusahaan, karyawan, dan pemilik pinjaman tidak dapat diubah.');
  let schedule = [];
  try { schedule = JSON.parse(original.getString('installment_schedule') || '[]'); } catch (_) { schedule = []; }
  if (Array.isArray(schedule) && schedule.length) {
    const changed = ['principal', 'installments', 'installment_amount', 'disbursed_date'].some(key => Object.prototype.hasOwnProperty.call(body, key) && e.record.getString(key) !== original.getString(key));
    if (changed) throw new BadRequestError('Pinjaman ini memiliki jadwal cicilan. Perbarui melalui Penggajian agar jadwal tetap sesuai.');
    if (Object.prototype.hasOwnProperty.call(body, 'status') && e.record.getString('status') !== original.getString('status')) {
      const balance = Number(original.get('principal')) - Number(original.get('paid_amount'));
      const nextStatus = e.record.getString('status');
      if ((nextStatus === 'completed' && balance > 0) || (nextStatus === 'active' && balance <= 0)) throw new BadRequestError('Status pinjaman tidak sesuai dengan sisa pokok.');
      if (nextStatus === 'active') {
        const active = e.app.findRecordsByFilter('employee_loans', 'company = {:company} && employee = {:employee} && status = "active" && id != {:id}', '', 1, 0, { company: original.getString('company'), employee: original.getString('employee'), id: original.id });
        if (active.length) throw new BadRequestError('Karyawan ini sudah memiliki pinjaman aktif lain.');
      }
    }
    if ((Object.prototype.hasOwnProperty.call(body, 'paid_installments') && Number(e.record.get('paid_installments')) !== Number(original.get('paid_installments'))) || (Object.prototype.hasOwnProperty.call(body, 'paid_amount') && Number(e.record.get('paid_amount')) !== Number(original.get('paid_amount')))) {
      throw new ForbiddenError('Progres pinjaman berjadwal hanya dapat diperbarui melalui payroll.');
    }
  }
  e.next();
}, 'employee_loans');

routerAdd('GET', '/api/loan-schedule/history', (e) => {
  const lib = require(`${__hooks}/payroll-expense-lib.js`);
  const query = e.requestInfo().query || {};
  const companyId = String(query.company || '');
  const loanId = String(query.loan || '');
  lib.authorize(e.app, e.auth, companyId, 'payroll', false);
  lib.assertId(loanId);
  const loan = e.app.findRecordById('employee_loans', loanId);
  if (loan.getString('company') !== companyId) throw new ForbiddenError('Pinjaman bukan milik perusahaan ini.');
  const slips = e.app.findRecordsByFilter('payslips', 'company = {:company} && loan = {:loan}', 'created', 0, 0, { company: companyId, loan: loanId });
  let total = 0;
  const history = [];
  for (const slip of slips) {
    const interest = Number(slip.get('loan_interest')) || 0;
    const principal = (Number(slip.get('loan_deduction')) || 0) - interest;
    if (principal < 0) return e.json(200, { history: null });
    let date = '';
    try { date = e.app.findRecordById('payroll_runs', slip.getString('run')).getString('pay_date').slice(0, 10); } catch (_) {}
    total += principal;
    history.push({ date, principal, interest });
  }
  e.response.header().set('Cache-Control', 'private, no-store');
  if (history.length !== (Number(loan.get('paid_installments')) || 0) || total !== (Number(loan.get('paid_amount')) || 0)) return e.json(200, { history: null });
  return e.json(200, { history });
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/loan-schedule/update', (e) => {
  const lib = require(`${__hooks}/payroll-expense-lib.js`);
  const body = e.requestInfo().body || {};
  const companyId = String(body.company || '');
  const loanId = String(body.loan || '');
  lib.authorize(e.app, e.auth, companyId, 'payroll', true);
  lib.assertId(loanId);
  const principal = Number(body.principal);
  const installments = Number(body.installments);
  const date = String(body.disbursed_date || '');
  const status = String(body.status || '');
  const description = String(body.description || '').trim();
  const rows = body.schedule;
  const validDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  };
  if (!Number.isSafeInteger(principal) || principal < 1 || !Number.isSafeInteger(installments) || installments < 1 || installments > 600 || !validDate(date) || !['pending', 'active', 'completed', 'cancelled'].includes(status) || description.length > 300 || !Array.isArray(rows)) {
    throw new BadRequestError('Data pinjaman tidak valid. Periksa kembali formulir.');
  }
  e.app.runInTransaction((txApp) => {
    const loan = txApp.findRecordById('employee_loans', loanId);
    if (loan.getString('company') !== companyId) throw new ForbiddenError('Pinjaman bukan milik perusahaan ini.');
    if (String(body.updated || '') !== loan.getString('updated')) throw new BadRequestError('Pinjaman telah berubah. Kembali dan buka kembali sebelum menyimpan.');
    const paid = Number(loan.get('paid_installments')) || 0;
    const paidAmount = Number(loan.get('paid_amount')) || 0;
    if (!Number.isSafeInteger(paid) || paid < 0 || !Number.isSafeInteger(paidAmount) || paidAmount < 0 || principal < paidAmount) throw new BadRequestError('Riwayat pinjaman tidak sesuai. Periksa data pinjaman terlebih dahulu.');
    if (paid > 0 && (principal !== Number(loan.get('principal')) || date !== loan.getString('disbursed_date').slice(0, 10))) throw new BadRequestError('Pokok dan tanggal pencairan tidak dapat diubah setelah cicilan tercatat.');
    if (principal !== Number(loan.get('principal')) || date !== loan.getString('disbursed_date').slice(0, 10)) {
      const linked = txApp.findRecordsByFilter('transactions', 'company = {:company} && loan = {:loan}', '', 1, 0, { company: companyId, loan: loanId });
      if (linked.length) throw new BadRequestError('Pokok dan tanggal pencairan tidak dapat diubah karena pinjaman sudah memiliki transaksi terkait.');
    }
    const remaining = principal - paidAmount;
    if (installments < paid || rows.length !== installments - paid || (remaining > 0 && rows.length === 0) || (remaining === 0 && rows.length > 0)) throw new BadRequestError('Jumlah angsuran tidak sesuai dengan riwayat dan sisa pinjaman.');
    if ((status === 'completed' && remaining !== 0) || (status === 'active' && remaining === 0)) throw new BadRequestError('Status pinjaman tidak sesuai dengan sisa pokok.');
    if (status === 'active') {
      const active = txApp.findRecordsByFilter('employee_loans', 'company = {:company} && employee = {:employee} && status = "active" && id != {:id}', '', 1, 0, { company: companyId, employee: loan.getString('employee'), id: loanId });
      if (active.length) throw new BadRequestError('Karyawan ini sudah memiliki pinjaman aktif lain.');
    }
    let total = 0;
    let totalInterest = 0;
    let previousDate = date;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.number !== paid + i + 1 || !validDate(String(row.date || '')) || row.date <= previousDate || !Number.isSafeInteger(row.principal) || row.principal < 0 || !Number.isSafeInteger(row.interest) || row.interest < 0 || !Number.isSafeInteger(row.principal + row.interest)) throw new BadRequestError('Periksa urutan tanggal serta nominal pokok dan bunga pada jadwal.');
      total += row.principal;
      totalInterest += row.interest;
      if (!Number.isSafeInteger(total) || total > remaining) throw new BadRequestError('Total pokok cicilan melebihi sisa pinjaman.');
      if (i < rows.length - 1 && total >= remaining) throw new BadRequestError('Pokok tidak boleh lunas sebelum cicilan terakhir.');
      if (!Number.isSafeInteger(totalInterest) || !Number.isSafeInteger(total + totalInterest)) throw new BadRequestError('Total bunga cicilan terlalu besar.');
      previousDate = row.date;
    }
    if (total !== remaining) throw new BadRequestError('Total pokok cicilan harus sama dengan sisa pinjaman.');
    loan.set('principal', principal);
    loan.set('installments', installments);
    loan.set('installment_amount', rows.length ? rows[0].principal : Number(loan.get('installment_amount')) || 0);
    loan.set('disbursed_date', date);
    loan.set('description', description);
    loan.set('status', status);
    let previous = [];
    try { previous = JSON.parse(loan.getString('installment_schedule') || '[]'); } catch (_) { previous = []; }
    const recorded = Array.isArray(previous) ? previous.filter(row => row && row.number <= paid) : [];
    loan.set('installment_schedule', recorded.concat(rows.map(row => ({ number: row.number, date: row.date, principal: row.principal, interest: row.interest }))));
    txApp.save(loan);
  });
  return e.json(200, { ok: true });
}, $apis.requireAuth('users'));
