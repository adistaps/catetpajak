import test from 'node:test';
import assert from 'node:assert/strict';
const B = process.env.PB_URL;
async function j(path, opts = {}, token) {
  const r = await fetch(B + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) } , body: opts.body });
  let d = null; try { d = await r.json(); } catch {}
  return { s: r.status, d };
}
test('employees accept the 5 employee_type values', async () => {
  const su = await j('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: process.env.PB_SUPERUSER_EMAIL, password: process.env.PB_SUPERUSER_PASSWORD }) });
  const t = su.d.token;
  const sfx = Math.random().toString(36).slice(2, 9);
  const u = await j('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email: `emp${sfx}@example.com`, password: 'Passw0rd!123', passwordConfirm: 'Passw0rd!123', name: 'T' }) });
  assert.equal(u.s, 200, JSON.stringify(u.d));
  const c = await j('/api/collections/companies/records', { method: 'POST', body: JSON.stringify({ name: 'C' + sfx, owner: u.d.id }) }, t);
  assert.equal(c.s, 200, 'company create ' + JSON.stringify(c.d));
  for (const type of ['probation', 'kontrak', 'permanent', 'magang', 'freelance']) {
    const r = await j('/api/collections/employees/records', { method: 'POST', body: JSON.stringify({ company: c.d.id, owner: u.d.id, name: 'E' + type, position: 'x', status: 'aktif', basic_salary: 1000, employee_type: type }) }, t);
    assert.equal(r.s, 200, `type ${type} rejected: ${r.s} ${JSON.stringify(r.d)}`);
    assert.equal(r.d.employee_type, type, `stored employee_type expected ${type} got ${r.d.employee_type}`);
  }
  const bad = await j('/api/collections/employees/records', { method: 'POST', body: JSON.stringify({ company: c.d.id, owner: u.d.id, name: 'Bad', position: 'x', status: 'aktif', employee_type: 'bogus' }) }, t);
  assert.equal(bad.s, 400, 'invalid type should be rejected, got ' + bad.s);
});
