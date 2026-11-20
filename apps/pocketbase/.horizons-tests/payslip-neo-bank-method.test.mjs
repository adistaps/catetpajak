import test from 'node:test';
import assert from 'node:assert/strict';
const B = process.env.PB_URL;
async function j(path, opts = {}, token) {
  const r = await fetch(B + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) } });
  let d = null; try { d = await r.json(); } catch {}
  return { s: r.status, d };
}
test('payslip accepts neo_bank method and reference', async () => {
  const su = await j('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: process.env.PB_SUPERUSER_EMAIL, password: process.env.PB_SUPERUSER_PASSWORD }) });
  const t = su.d.token;
  const sfx = Math.random().toString(36).slice(2, 9);
  const u = await j('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email: `nb${sfx}@example.com`, password: 'Passw0rd!123', passwordConfirm: 'Passw0rd!123', name: 'T' }) });
  const c = await j('/api/collections/companies/records', { method: 'POST', body: JSON.stringify({ name: 'C' + sfx, owner: u.d.id }) }, t);
  const e = await j('/api/collections/employees/records', { method: 'POST', body: JSON.stringify({ company: c.d.id, owner: u.d.id, name: 'E', position: 'x', status: 'aktif', basic_salary: 1000 }) }, t);
  const run = await j('/api/collections/payroll_runs/records', { method: 'POST', body: JSON.stringify({ company: c.d.id, owner: u.d.id, period: '2026-01', status: 'posted', pay_date: '2026-01-25 00:00:00.000Z' }) }, t);
  const p = await j('/api/collections/payslips/records', { method: 'POST', body: JSON.stringify({ company: c.d.id, owner: u.d.id, run: run.d.id, employee: e.d.id, net_pay: 1000, disbursement_status: 'pending', disbursement_method: 'neo_bank', disbursement_reference: 'NEO123' }) }, t);
  assert.equal(p.s, 200, 'neo_bank method rejected: ' + JSON.stringify(p.d));
  assert.equal(p.d.disbursement_method, 'neo_bank');
  assert.equal(p.d.disbursement_reference, 'NEO123');
});
