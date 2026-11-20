// Loaded within PocketBase hook callbacks. Never trust a company id from the request.
function assertId(id) {
  if (!/^[a-z0-9]{15}$/.test(id)) throw new BadRequestError('Identitas perusahaan atau periode tidak valid.');
}

function authorize(app, auth, companyId, permission, writing) {
  if (!auth) throw new UnauthorizedError('Silakan masuk kembali.');
  assertId(companyId);
  let company;
  try { company = app.findRecordById('companies', companyId); }
  catch (_) { throw new NotFoundError('Perusahaan tidak ditemukan.'); }
  if (company.getString('owner') === auth.id) return;
  const members = app.findRecordsByFilter('company_members', 'company = {:company} && user = {:user} && status = "active"', '', 1, 0, { company: companyId, user: auth.id });
  const member = members[0];
  if (!member) throw new ForbiddenError('Anda tidak memiliki akses ke perusahaan ini.');
  if (member.getBool('access_limited')) {
    const until = member.getString('access_until');
    if (until && new Date(until.replace(' ', 'T')).getTime() < Date.now()) throw new ForbiddenError('Akses Anda ke perusahaan ini telah berakhir.');
  }
  const role = member.getString('role');
  if (permission === 'payroll' && role !== 'pemilik' && role !== 'admin' && role !== 'finance' && role !== 'custom') throw new ForbiddenError('Peran Anda tidak dapat menerbitkan jurnal payroll.');
  if (permission === 'biaya' && role !== 'pemilik' && role !== 'admin' && role !== 'akuntan' && role !== 'custom') throw new ForbiddenError('Peran Anda tidak dapat membuka transaksi biaya.');
  const permissions = member.getStringSlice('permissions');
  const allowed = role === 'pemilik' || role === 'admin' || permissions.indexOf(permission) !== -1;
  if (!allowed || (writing && role !== 'pemilik' && role !== 'admin' && !member.getBool('can_edit'))) {
    throw new ForbiddenError('Anda tidak memiliki izin untuk tindakan ini.');
  }
}

function publish(app, companyId, runId, actorId, otherAccountId, interestAccountId) {
  const run = app.findRecordById('payroll_runs', runId);
  if (run.getString('company') !== companyId) throw new ForbiddenError('Periode bukan milik perusahaan ini.');
  if (run.getString('status') === 'posted') return;
  if (run.getString('status') !== 'draft') throw new BadRequestError('Status periode payroll tidak valid.');

  const existing = app.findRecordsByFilter('entries', 'company = {:company} && payroll_run = {:run}', '', 0, 0, { company: companyId, run: runId });
  if (existing.length) throw new BadRequestError('Periode memiliki jurnal sebelumnya atau jurnal parsial. Periksa jurnal terlebih dahulu; tidak ada jurnal yang dihapus atau dibuat ulang.');
  const slips = app.findRecordsByFilter('payslips', 'company = {:company} && run = {:run}', '', 0, 0, { company: companyId, run: runId });
  if (!slips.length) throw new BadRequestError('Periode ini belum memiliki slip gaji.');
  const accounts = app.findRecordsByFilter('accounts', 'company = {:company}', 'code', 0, 0, { company: companyId });
  const byCode = code => accounts.find(account => account.getString('code') === code);
  const salary = byCode('501');
  const cash = accounts.find(account => account.id === run.getString('cash_account'));
  if (!salary) throw new BadRequestError('Akun Beban Gaji (501) tidak ditemukan di bagan akun.');
  if (!cash) throw new BadRequestError('Akun kas/bank pembayaran tidak ditemukan.');
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
  if (gross <= 0) throw new BadRequestError('Jumlah bruto payroll harus lebih dari nol.');
  if (Math.abs(gross - net - bpjs - pph - loan - other) >= 0.005) {
    throw new BadRequestError('Jumlah bruto dan potongan slip gaji tidak seimbang. Periksa slip gaji sebelum menerbitkan.');
  }
  const lines = [{ account: salary.id, debit: gross, credit: 0 }];
  if (net > 0) lines.push({ account: cash.id, debit: 0, credit: net });
  const addCredit = (amount, code, label) => {
    if (amount <= 0) return;
    const account = byCode(code);
    if (!account) throw new BadRequestError('Akun ' + label + ' (' + code + ') tidak ditemukan di bagan akun.');
    lines.push({ account: account.id, debit: 0, credit: amount });
  };
  addCredit(bpjs, '204', 'Utang BPJS');
  addCredit(pph, '205', 'Utang PPh 21');
  if (interest < 0 || interest > loan) throw new BadRequestError('Bunga pinjaman pada slip tidak valid.');
  addCredit(loan - interest, '206', 'Piutang Pinjaman Karyawan');
  if (interest > 0) {
    const interestAccount = accounts.find(account => account.id === interestAccountId);
    if (!interestAccount || interestAccount.getString('type') !== 'pendapatan' || interestAccount.getBool('is_header') || accounts.some(account => account.getString('parent') === interestAccountId)) throw new BadRequestError('Pilih akun kredit yang dapat digunakan untuk bunga pinjaman.');
    lines.push({ account: interestAccount.id, debit: 0, credit: interest });
  }
  if (other > 0) {
    const otherAccount = accounts.find(account => account.id === otherAccountId);
    if (!otherAccount || otherAccount.getBool('is_header') || accounts.some(account => account.getString('parent') === otherAccountId)) {
      throw new BadRequestError('Pilih akun kredit yang dapat digunakan untuk potongan komponen lain.');
    }
    lines.push({ account: otherAccount.id, debit: 0, credit: other });
  }

  const date = run.getString('pay_date');
  const year = date.slice(0, 4);
  if (!/^\d{4}$/.test(year)) throw new BadRequestError('Tanggal pembayaran payroll tidak valid.');
  const prefix = 'JU-' + year + '-';
  const all = app.findRecordsByFilter('entries', 'company = {:company}', '', 0, 0, { company: companyId });
  let max = 0, width = 3;
  for (const entry of all) {
    const number = entry.getString('number');
    if (number.indexOf(prefix) !== 0) continue;
    const suffix = number.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    max = Math.max(max, parseInt(suffix, 10));
    width = Math.max(width, suffix.length);
  }
  const collection = app.findCollectionByNameOrId('entries');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const entry = new Record(collection);
    entry.set('company', companyId);
    entry.set('date', date);
    entry.set('description', run.getString('description') || 'Penggajian ' + run.getString('period'));
    entry.set('owner', actorId);
    entry.set('payroll_run', runId);
    entry.set('group', runId);
    entry.set('account', line.account);
    entry.set('debit', line.debit);
    entry.set('credit', line.credit);
    entry.set('number', prefix + String(max + i + 1).padStart(width, '0'));
    app.save(entry);
  }
  run.set('status', 'posted');
  app.save(run);
}

module.exports = { assertId, authorize, publish };
