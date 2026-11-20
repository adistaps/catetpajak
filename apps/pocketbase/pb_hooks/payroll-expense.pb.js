/// <reference path="../pb_data/types.d.ts" />

// Only the payroll summary is shared with Biaya. Payslips remain private to payroll.
routerAdd('GET', '/api/payroll-expense/list', (e) => {
  const lib = require(`${__hooks}/payroll-expense-lib.js`);
  e.response.header().set('Cache-Control', 'private, no-store');
  const companyId = String(e.requestInfo().query.company || '');
  lib.authorize(e.app, e.auth, companyId, 'biaya', false);
  const runs = e.app.findRecordsByFilter('payroll_runs', 'company = {:company} && status = "posted"', '-pay_date', 0, 0, { company: companyId });
  const lines = e.app.findRecordsByFilter('entries', 'company = {:company} && payroll_run != ""', 'number', 0, 0, { company: companyId });
  const accounts = e.app.findRecordsByFilter('accounts', 'company = {:company}', '', 0, 0, { company: companyId });
  const transactions = e.app.findRecordsByFilter('transactions', 'company = {:company} && payroll_run != ""', '', 0, 0, { company: companyId });
  const runIds = {};
  for (const run of runs) runIds[run.id] = true;
  return e.json(200, {
    runs: runs.map(run => ({
      id: run.id,
      period: run.getString('period'),
      pay_date: run.getString('pay_date'),
      description: run.getString('description'),
      status: 'posted',
    })),
    lines: lines.filter(line => runIds[line.getString('payroll_run')]).map(line => {
      const account = accounts.find(item => item.id === line.getString('account'));
      return {
        id: line.id,
        company: companyId,
        payroll_run: line.getString('payroll_run'),
        transaction: line.getString('transaction'),
        account: line.getString('account'),
        date: line.getString('date'),
        description: line.getString('description'),
        number: line.getString('number'),
        debit: Number(line.get('debit')) || 0,
        credit: Number(line.get('credit')) || 0,
        expand: account ? { account: { id: account.id, code: account.getString('code'), name: account.getString('name') } } : {},
      };
    }),
    transactions: transactions.filter(tx => runIds[tx.getString('payroll_run')]).map(tx => ({ id: tx.id, payroll_run: tx.getString('payroll_run') })),
  });
}, $apis.requireAuth('users'));

// Create one transaction and attach the existing journal lines in a single DB transaction.
routerAdd('POST', '/api/payroll-expense/record', (e) => {
  const lib = require(`${__hooks}/payroll-expense-lib.js`);
  const body = e.requestInfo().body;
  const companyId = String(body.company || '');
  const runId = String(body.run || '');
  lib.authorize(e.app, e.auth, companyId, 'biaya', true);
  lib.assertId(runId);
  let result = '';
  let alreadyRecorded = false;
  e.app.runInTransaction((txApp) => {
    const run = txApp.findRecordById('payroll_runs', runId);
    if (run.getString('company') !== companyId || run.getString('status') !== 'posted') {
      throw new BadRequestError('Periode payroll belum diterbitkan untuk perusahaan ini.');
    }
    const existing = txApp.findRecordsByFilter('transactions', 'payroll_run = {:run}', '', 1, 0, { run: runId });
    if (existing.length) {
      if (existing[0].getString('company') !== companyId) throw new BadRequestError('Transaksi payroll terkait tidak sesuai dengan perusahaan ini.');
      result = existing[0].id;
      alreadyRecorded = true;
      return;
    }
    const lines = txApp.findRecordsByFilter('entries', 'company = {:company} && payroll_run = {:run}', 'number', 0, 0, { company: companyId, run: runId });
    let debit = 0;
    let credit = 0;
    let firstDebit = '';
    let firstCredit = '';
    for (const line of lines) {
      if (line.getString('transaction')) throw new BadRequestError('Jurnal payroll sudah terhubung ke transaksi lain. Periksa jurnal sebelum mencatat.');
      const d = Number(line.get('debit')) || 0;
      const c = Number(line.get('credit')) || 0;
      debit += d;
      credit += c;
      if (d > 0 && !firstDebit) firstDebit = line.getString('account');
      if (c > 0 && !firstCredit) firstCredit = line.getString('account');
    }
    if (lines.length < 2 || !firstDebit || !firstCredit || debit <= 0 || Math.abs(debit - credit) >= 0.005) {
      throw new BadRequestError('Jurnal payroll belum lengkap atau belum seimbang. Periksa jurnal sebelum mencatat transaksi.');
    }
    const transaction = new Record(txApp.findCollectionByNameOrId('transactions'));
    transaction.set('company', companyId);
    transaction.set('category', 'biaya');
    transaction.set('payroll_run', runId);
    transaction.set('date', run.getString('pay_date') || lines[0].getString('date'));
    transaction.set('description', run.getString('description') || 'Penggajian ' + run.getString('period'));
    transaction.set('amount', debit);
    transaction.set('partner', 'Running Payroll');
    transaction.set('debit_account', firstDebit);
    transaction.set('credit_account', firstCredit);
    transaction.set('owner', e.auth.id);
    transaction.set('expense_detail', { kind: 'payroll', payrollRunId: runId, booked: true });
    txApp.save(transaction);
    for (const line of lines) {
      line.set('transaction', transaction.id);
      txApp.save(line);
    }
    result = transaction.id;
  });
  return e.json(200, { id: result, alreadyRecorded });
}, $apis.requireAuth('users'));

// Publish all payroll journal lines and the run status together, without
// deleting earlier entries or exposing payslips to the accounting view.
routerAdd('POST', '/api/payroll-expense/publish', (e) => {
  const lib = require(`${__hooks}/payroll-expense-lib.js`);
  const body = e.requestInfo().body;
  const companyId = String(body.company || '');
  const runId = String(body.run || '');
  const otherAccountId = String(body.otherAccount || '');
  const interestAccountId = String(body.interestAccount || '');
  lib.authorize(e.app, e.auth, companyId, 'payroll', true);
  lib.assertId(runId);
  let issue = '';
  e.app.runInTransaction((txApp) => {
    const run = txApp.findRecordById('payroll_runs', runId);
    const entries = txApp.findRecordsByFilter('entries', 'company = {:company} && payroll_run = {:run}', 'number', 0, 0, { company: companyId, run: runId });
    if (run.getString('company') !== companyId) throw new ForbiddenError('Periode bukan milik perusahaan ini.');
    if (run.getString('status') === 'posted') {
      if (!entries.length) issue = 'Jurnal tidak ditemukan. Periode sudah berstatus terbit; periksa riwayat sebelum membuat jurnal baru.';
      return;
    }
    if (entries.length) {
      let debit = 0, credit = 0, hasLinked = false;
      const actual = {};
      for (const line of entries) {
        const d = Number(line.get('debit')) || 0;
        const c = Number(line.get('credit')) || 0;
        const account = line.getString('account');
        debit += d;
        credit += c;
        actual[account] = actual[account] || { debit: 0, credit: 0 };
        actual[account].debit += d;
        actual[account].credit += c;
        if (line.getString('transaction')) hasLinked = true;
      }
      const slips = txApp.findRecordsByFilter('payslips', 'company = {:company} && run = {:run}', '', 0, 0, { company: companyId, run: runId });
      const accounts = txApp.findRecordsByFilter('accounts', 'company = {:company}', '', 0, 0, { company: companyId });
      const expected = {};
      let gross = 0, net = 0, bpjs = 0, pph = 0, loan = 0, interest = 0, other = 0;
      for (const slip of slips) {
        gross += Number(slip.get('gross')) || 0;
        net += Number(slip.get('net_pay')) || 0;
        bpjs += (Number(slip.get('bpjs_tk')) || 0) + (Number(slip.get('bpjs_kes')) || 0);
        pph += Number(slip.get('pph21')) || 0;
        loan += Number(slip.get('loan_deduction')) || 0;
        interest += Number(slip.get('loan_interest')) || 0;
        other += Number(slip.get('component_deduction')) || 0;
      }
      let comparable = slips.length > 0 && gross > 0;
      const addExpected = (id, d, c) => {
        if (!id) { comparable = false; return; }
        expected[id] = expected[id] || { debit: 0, credit: 0 };
        expected[id].debit += d;
        expected[id].credit += c;
      };
      const accountId = code => accounts.find(a => a.getString('code') === code)?.id || '';
      addExpected(accountId('501'), gross, 0);
      if (net > 0) addExpected(run.getString('cash_account'), 0, net);
      if (bpjs > 0) addExpected(accountId('204'), 0, bpjs);
      if (pph > 0) addExpected(accountId('205'), 0, pph);
      if (interest < 0 || interest > loan) comparable = false;
      if (loan - interest > 0) addExpected(accountId('206'), 0, loan - interest);
      if (interest > 0) {
        if (!accounts.some(account => account.id === interestAccountId && account.getString('type') === 'pendapatan' && !account.getBool('is_header') && !accounts.some(child => child.getString('parent') === account.id))) comparable = false;
        addExpected(interestAccountId, 0, interest);
      }
      if (other > 0) {
        if (!accounts.some(account => account.id === otherAccountId)) comparable = false;
        addExpected(otherAccountId, 0, other);
      }
      const ids = Object.keys(actual);
      const matches = comparable && ids.length === Object.keys(expected).length && ids.every(id => expected[id] && Math.abs(actual[id].debit - expected[id].debit) < 0.005 && Math.abs(actual[id].credit - expected[id].credit) < 0.005);
      if (entries.length >= 2 && debit > 0 && Math.abs(debit - credit) < 0.005 && !hasLinked && matches) {
        run.set('status', 'posted');
        txApp.save(run);
        return;
      }
      issue = 'Periode memiliki jurnal parsial atau tidak seimbang. Tidak ada jurnal yang dihapus atau dibuat ulang; periksa riwayat jurnal terlebih dahulu.';
      return;
    }
    lib.publish(txApp, companyId, runId, e.auth.id, otherAccountId, interestAccountId);
  });
  if (issue) return e.json(400, { message: issue });
  return e.json(200, { ok: true });
}, $apis.requireAuth('users'));

// A payroll transaction represents existing journal lines, not an ordinary
// editable expense. Only the atomic operation above may establish that link.
onRecordCreateRequest((e) => {
  if (e.record.getString('payroll_run')) throw new ForbiddenError('Transaksi payroll harus dicatat melalui tab Payroll.');
  e.next();
}, 'transactions');

onRecordUpdateRequest((e) => {
  if (e.record.getString('payroll_run') || e.record.original().getString('payroll_run')) {
    throw new ForbiddenError('Transaksi payroll tidak dapat diubah melalui formulir biaya biasa.');
  }
  e.next();
}, 'transactions');

onRecordDeleteRequest((e) => {
  if (e.record.getString('payroll_run')) throw new ForbiddenError('Transaksi payroll tidak dapat dihapus secara terpisah dari periode penggajian.');
  e.next();
}, 'transactions');

// Only the atomic publishing route may create linked payroll lines.
onRecordCreateRequest((e) => {
  if (e.record.getString('payroll_run')) throw new ForbiddenError('Jurnal payroll harus diterbitkan melalui Penggajian.');
  e.next();
}, 'entries');

// Entries remain intact when a transaction is linked; ordinary journal forms
// must not unlink, overwrite or delete payroll lines one at a time.
onRecordUpdateRequest((e) => {
  if (e.record.getString('payroll_run') || e.record.original().getString('payroll_run')) {
    throw new ForbiddenError('Jurnal payroll tidak dapat diubah melalui jurnal umum.');
  }
  e.next();
}, 'entries');

onRecordDeleteRequest((e) => {
  if (e.record.getString('payroll_run')) throw new ForbiddenError('Jurnal payroll tidak dapat dihapus terpisah dari periode penggajian.');
  e.next();
}, 'entries');
