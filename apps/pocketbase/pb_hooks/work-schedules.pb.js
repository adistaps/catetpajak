/// <reference path="../pb_data/types.d.ts" />

routerAdd('POST', '/api/work-schedules/list', (e) => {
  const lib = require(`${__hooks}/work-schedule-lib.js`);
  const company = String((e.requestInfo().body || {}).company || '');
  const canEdit = lib.authorize(e.app, e.auth, company, false);
  const schedules = e.app.findRecordsByFilter('work_schedules', 'company = {:company}', '-effective_date,name', 0, 0, { company });
  const employees = e.app.findRecordsByFilter('employees', 'company = {:company}', 'name', 0, 0, { company });
  e.response.header().set('Cache-Control', 'private, no-store');
  return e.json(200, { items: schedules.map(lib.serialize), employees: employees.map(item => ({ id: item.id, name: item.getString('name'), position: item.getString('position'), status: item.getString('status') })), canEdit });
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/work-schedules/save', (e) => {
  const lib = require(`${__hooks}/work-schedule-lib.js`);
  const body = e.requestInfo().body || {};
  const company = String(body.company || '');
  lib.authorize(e.app, e.auth, company, true);
  const name = String(body.name || '').trim();
  const effectiveDate = String(body.effective_date || '');
  const description = String(body.description || '').trim();
  if (!name || name.length > 120 || !lib.validDate(effectiveDate) || description.length > 500 || typeof body.is_active !== 'boolean') throw new BadRequestError('Periksa nama, tanggal, status, dan deskripsi jadwal.');
  const days = lib.validateDays(body.days);
  if (!Array.isArray(body.employees) || body.employees.length > 2000) throw new BadRequestError('Penugasan maksimal 2.000 karyawan per jadwal.');
  const employees = body.employees.map(lib.id);
  if (new Set(employees).size !== employees.length) throw new BadRequestError('Karyawan tercantum lebih dari satu kali.');
  const scheduleId = body.id ? lib.id(body.id) : '';
  let saved = null;
  e.app.runInTransaction((app) => {
    let record;
    if (scheduleId) {
      record = app.findRecordById('work_schedules', scheduleId);
      if (record.getString('company') !== company) throw new ForbiddenError('Jadwal bukan milik perusahaan ini.');
      if (record.getString('updated') !== String(body.updated || '')) throw new BadRequestError('Jadwal telah berubah. Muat ulang sebelum menyimpan.');
    } else {
      record = new Record(app.findCollectionByNameOrId('work_schedules'));
      record.set('company', company);
      record.set('owner', e.auth.id);
    }
    for (const employeeId of employees) {
      let employee;
      try { employee = app.findRecordById('employees', employeeId); } catch (_) { throw new BadRequestError('Karyawan tidak ditemukan.'); }
      if (employee.getString('company') !== company) throw new BadRequestError('Karyawan harus berasal dari perusahaan yang sama.');
    }
    if (body.is_active && employees.length) {
      const others = app.findRecordsByFilter('work_schedules', 'company = {:company} && effective_date = {:date} && is_active = true', '', 0, 0, { company, date: effectiveDate });
      for (const other of others) {
        if (other.id === scheduleId) continue;
        if (Array.from(other.getStringSlice('employees')).some(employeeId => employees.indexOf(employeeId) !== -1)) throw new BadRequestError('Karyawan sudah memiliki jadwal aktif lain dengan tanggal berlaku yang sama.');
      }
    }
    record.set('name', name);
    record.set('effective_date', effectiveDate);
    record.set('description', description);
    record.set('is_active', body.is_active);
    record.set('days', days);
    record.set('employees', employees);
    app.save(record);
    saved = lib.serialize(record);
  });
  return e.json(200, { item: saved });
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/work-schedules/today', (e) => {
  const lib = require(`${__hooks}/work-schedule-lib.js`);
  const body = e.requestInfo().body || {};
  const company = lib.id(body.company);
  const employeeId = lib.id(body.employee);
  const date = String(body.date || '');
  const employee = e.app.findRecordById('employees', employeeId);
  if (employee.getString('company') !== company || employee.getString('user') !== e.auth.id) throw new ForbiddenError('Jadwal hanya tersedia untuk karyawan yang bersangkutan.');
  const companyRecord = e.app.findRecordById('companies', company);
  if (companyRecord.getString('access_status') === 'suspended') throw new ForbiddenError('Akses perusahaan sedang ditangguhkan.');
  const overrides = e.app.findRecordsByFilter('company_feature_flags', 'company = {:company} && feature = "karyawan"', '', 1, 0, { company });
  const globalFlags = e.app.findRecordsByFilter('feature_flags', 'feature = "karyawan"', '', 1, 0);
  if ((overrides.length && !overrides[0].getBool('enabled')) || (!overrides.length && globalFlags.length && !globalFlags[0].getBool('enabled'))) throw new ForbiddenError('Fitur karyawan perusahaan sedang dinonaktifkan.');
  if (companyRecord.getString('owner') !== e.auth.id) {
    const members = e.app.findRecordsByFilter('company_members', 'company = {:company} && user = {:user} && status = "active"', '', 1, 0, { company, user: e.auth.id });
    if (!members.length) throw new ForbiddenError('Akses perusahaan tidak aktif.');
    const member = members[0];
    const until = member.getString('access_until');
    if (member.getBool('access_limited') && until && new Date(until.replace(' ', 'T')).getTime() < Date.now()) throw new ForbiddenError('Akses perusahaan telah berakhir.');
  }
  e.response.header().set('Cache-Control', 'private, no-store');
  return e.json(200, { schedule: lib.resolve(e.app, company, employeeId, date) });
}, $apis.requireAuth('users'));
