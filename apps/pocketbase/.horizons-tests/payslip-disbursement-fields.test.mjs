import test from 'node:test';
import assert from 'node:assert/strict';
const B = process.env.PB_URL;
async function j(path, opts = {}, token) {
  const r = await fetch(B + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) } });
  let d = null; try { d = await r.json(); } catch {}
  return { s: r.status, d };
}
test('payslips store disbursement status, method and reject invalid values', async () => {
  const su = await j('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: process.env.PB_SUPERUSER_EMAIL, password: process.env.PB_SUPERUSER_PASSWORD }) });
  const t = su.d.token;
  const sfx = Math.random().toString(36).slice(2, 9);
  const u = await j('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email: `d${sfx}@example.com`, password: 'Passw0rd!123', passwordConfirm: 'Passw0rd!123', name: 'T' }) });
  assert.equal(u.s, 200, JSON.stringify(u.d));
  const c = await j('/api/collections/companies/records', { method: 'POST', body: JSON.stringify({ name: 'C' + sfx, owner: u.d.id }) }, t);
  assert.equal(c.s, 200, JSON.stringify(c.d));
  const e = await j('/api/collections/employees/records', { method: 'POST', body: JSON.stringify({ company: c.d.id, owner: u.d.id, name: 'E', position: 'x', status: 'aktif', basic_salary: 1000 }) }, t);
  assert.equal(e.s, 200, JSON.stringify(e.d));
  const run = await j('/api/collections/payroll_runs/records', { method: 'POST', body: JSON.stringify({ company: c.d.id, owner: u.d.id, period: '2026-01', status: 'posted', pay_date: '2026-01-25 00:00:00.000Z' }) }, t);
  assert.equal(run.s, 200, 'run ' + JSON.stringify(run.d));
  const p = await j('/api/collections/payslips/records', { method: 'POST', body: JSON.stringify({ company: c.d.id, owner: u.d.id, run: run.d.id, employee: e.d.id, net_pay: 1000, disbursement_status: 'pending', disbursement_method: 'transfer_bank' }) }, t);
  assert.equal(p.s, 200, 'payslip ' + JSON.stringify(p.d));
  assert.equal(p.d.disbursement_method, 'transfer_bank');
  const up = await j('/api/collections/payslips/records/' + p.d.id, { method: 'PATCH', body: JSON.stringify({ disbursement_status: 'paid', disbursement_method: 'tunai' }) }, t);
  assert.equal(up.s, 200, JSON.stringify(up.d));
  assert.equal(up.d.disbursement_status, 'paid');
  const bad = await j('/api/collections/payslips/records/' + p.d.id, { method: 'PATCH', body: JSON.stringify({ disbursement_method: 'bogus' }) }, t);
  assert.equal(bad.s, 400, 'invalid method should be rejected, got ' + bad.s);
});
