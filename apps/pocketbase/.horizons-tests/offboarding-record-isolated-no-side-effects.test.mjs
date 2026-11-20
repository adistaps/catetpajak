import test from 'node:test';
import assert from 'node:assert/strict';
const B = process.env.PB_URL;
async function j(path, opts = {}, token) {
  const r = await fetch(B + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) } });
  let d = null; try { d = await r.json(); } catch {}
  return { s: r.status, d };
}
test('offboarding collection stores resign process, isolated per company, employee untouched', async () => {
  const su = await j('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: process.env.PB_SUPERUSER_EMAIL, password: process.env.PB_SUPERUSER_PASSWORD }) });
  const t = su.d.token;
  const sfx = Math.random().toString(36).slice(2, 9);
  const mk = async (n) => {
    const em = `of${n}${sfx}@example.com`;
    const u = await j('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email: em, password: 'Passw0rd!123', passwordConfirm: 'Passw0rd!123', name: 'T' }) });
    const a = await j('/api/collections/users/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: em, password: 'Passw0rd!123' }) });
    return { id: u.d.id, token: a.d.token };
  };
  const u1 = await mk('a'), u2 = await mk('b');
  const c = await j('/api/collections/companies/records', { method: 'POST', body: JSON.stringify({ name: 'C' + sfx, owner: u1.id }) }, t);
  assert.equal(c.s, 200, JSON.stringify(c.d));
  const e = await j('/api/collections/employees/records', { method: 'POST', body: JSON.stringify({ company: c.d.id, owner: u1.id, name: 'E', position: 'x', status: 'aktif', basic_salary: 1000 }) }, t);
  assert.equal(e.s, 200, JSON.stringify(e.d));
  const o = await j('/api/collections/employee_offboardings/records', { method: 'POST', body: JSON.stringify({ company: c.d.id, owner: u1.id, employee: e.d.id }) }, u1.token);
  assert.equal(o.s, 200, 'offboarding collection employee_offboardings must exist and let company owner create records: ' + o.s + ' ' + JSON.stringify(o.d));
  const mine = await j('/api/collections/employee_offboardings/records', {}, u1.token);
  assert.equal(mine.d.totalItems, 1, 'owner should see 1 offboarding, got ' + JSON.stringify(mine.d));
  const other = await j('/api/collections/employee_offboardings/records', {}, u2.token);
  assert.equal(other.d.totalItems, 0, 'other company user must see none, got ' + JSON.stringify(other.d));
  const emp = await j('/api/collections/employees/records/' + e.d.id, {}, t);
  assert.equal(emp.s, 200, 'employee must not be deleted: ' + emp.s);
});
