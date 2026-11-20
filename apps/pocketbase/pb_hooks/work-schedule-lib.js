// Jadwal perusahaan disimpan dan dibaca hanya melalui endpoint terotorisasi.
function id(value) {
  if (!/^[a-z0-9]{15}$/.test(String(value || ''))) throw new BadRequestError('Identitas tidak valid.');
  return String(value);
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function authorize(app, auth, companyId, writing) {
  if (!auth || auth.collection().name !== 'users') throw new UnauthorizedError('Silakan masuk kembali.');
  id(companyId);
  let company;
  try { company = app.findRecordById('companies', companyId); } catch (_) { throw new NotFoundError('Perusahaan tidak ditemukan.'); }
  if (company.getString('access_status') === 'suspended') throw new ForbiddenError('Akses perusahaan sedang ditangguhkan.');
  const overrides = app.findRecordsByFilter('company_feature_flags', 'company = {:company} && feature = "kontak"', '', 1, 0, { company: companyId });
  const globalFlags = app.findRecordsByFilter('feature_flags', 'feature = "kontak"', '', 1, 0);
  if ((overrides.length && !overrides[0].getBool('enabled')) || (!overrides.length && globalFlags.length && !globalFlags[0].getBool('enabled'))) throw new ForbiddenError('Fitur kontak perusahaan sedang dinonaktifkan.');
  if (company.getString('owner') === auth.id) return true;
  const members = app.findRecordsByFilter('company_members', 'company = {:company} && user = {:user} && status = "active"', '', 1, 0, { company: companyId, user: auth.id });
  const member = members[0];
  if (!member) throw new ForbiddenError('Anda tidak memiliki akses perusahaan ini.');
  if (member.getBool('access_limited')) {
    const until = member.getString('access_until');
    if (until && new Date(until.replace(' ', 'T')).getTime() < Date.now()) throw new ForbiddenError('Akses perusahaan telah berakhir.');
  }
  const role = member.getString('role');
  const permissions = member.getStringSlice('permissions');
  const full = role === 'admin' || role === 'pemilik';
  const allowed = full || (['hr', 'akuntan', 'custom'].indexOf(role) !== -1 && permissions.indexOf('kontak') !== -1);
  if (!allowed) throw new ForbiddenError('Anda tidak memiliki akses jadwal absensi.');
  const canEdit = full || member.getBool('can_edit');
  if (writing && !canEdit) throw new ForbiddenError('Anda tidak memiliki izin mengubah jadwal.');
  return canEdit;
}
function validateDays(input) {
  if (!Array.isArray(input) || input.length !== 7) throw new BadRequestError('Pola harus memiliki tujuh hari.');
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  return input.map((row) => {
    if (!row || typeof row.work !== 'boolean') throw new BadRequestError('Pola hari tidak valid.');
    if (!row.work) return { work: false, shift: '', start: '', end: '', breakStart: '', breakEnd: '' };
    const shift = String(row.shift || '').trim();
    const start = String(row.start || '');
    const end = String(row.end || '');
    const breakStart = String(row.breakStart || '');
    const breakEnd = String(row.breakEnd || '');
    if (!shift || shift.length > 40 || !time.test(start) || !time.test(end) || start >= end) throw new BadRequestError('Isi nama dan jam shift yang valid. Shift melewati tengah malam belum didukung.');
    if ((breakStart || breakEnd) && (!time.test(breakStart) || !time.test(breakEnd) || breakStart >= breakEnd || breakStart < start || breakEnd > end)) throw new BadRequestError('Jam istirahat harus lengkap dan berada di dalam jam kerja.');
    return { work: true, shift, start, end, breakStart, breakEnd };
  });
}
function daysOf(record) {
  try { const result = JSON.parse(record.getString('days') || '[]'); return Array.isArray(result) ? result : []; } catch (_) { return []; }
}
function serialize(record) {
  return { id: record.id, company: record.getString('company'), name: record.getString('name'), effective_date: record.getString('effective_date'), description: record.getString('description'), is_active: record.getBool('is_active'), days: daysOf(record), employees: Array.from(record.getStringSlice('employees')), updated: record.getString('updated') };
}
function resolve(app, companyId, employeeId, date) {
  if (!validDate(date)) throw new BadRequestError('Tanggal tidak valid.');
  const rows = app.findRecordsByFilter('work_schedules', 'company = {:company} && is_active = true && effective_date <= {:date}', '-effective_date,-created', 0, 0, { company: companyId, date });
  const row = rows.find(item => Array.from(item.getStringSlice('employees')).indexOf(employeeId) !== -1);
  if (!row) return null;
  const day = daysOf(row)[new Date(date + 'T00:00:00Z').getUTCDay()];
  if (!day || typeof day.work !== 'boolean') throw new BadRequestError('Pola jadwal tidak lengkap. Hubungi admin.');
  return { name: row.getString('name'), effectiveDate: row.getString('effective_date'), ...day };
}
module.exports = { id, validDate, authorize, validateDays, serialize, resolve };
