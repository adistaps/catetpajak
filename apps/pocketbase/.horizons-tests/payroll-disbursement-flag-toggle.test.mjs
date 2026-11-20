import test from 'node:test';
import assert from 'node:assert/strict';
const B = process.env.PB_URL;
async function j(path, opts = {}, token) {
  const r = await fetch(B + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) } });
  let d = null; try { d = await r.json(); } catch {}
  return { s: r.status, d };
}
test('payroll_disbursement flag can be disabled/enabled by superuser, readable publicly, not writable by members', async () => {
  const su = await j('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: process.env.PB_SUPERUSER_EMAIL, password: process.env.PB_SUPERUSER_PASSWORD }) });
  const t = su.d.token;
  const q = '/api/collections/feature_flags/records?filter=' + encodeURIComponent("feature='payroll_disbursement'");
  let l = await j(q, {}, t);
  let id;
  if (l.d.items.length) id = l.d.items[0].id;
  else {
    const c = await j('/api/collections/feature_flags/records', { method: 'POST', body: JSON.stringify({ feature: 'payroll_disbursement', enabled: true }) }, t);
    assert.equal(c.s, 200, JSON.stringify(c.d));
    id = c.d.id;
  }
  const off = await j('/api/collections/feature_flags/records/' + id, { method: 'PATCH', body: JSON.stringify({ enabled: false }) }, t);
  assert.equal(off.s, 200, JSON.stringify(off.d));
  l = await j(q);
  assert.equal(l.d.items[0]?.enabled, false, 'disabled flag should be visible as enabled=false: ' + JSON.stringify(l.d));
  const sfx = Math.random().toString(36).slice(2, 9);
  const em = `ff${sfx}@example.com`;
  const u = await j('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email: em, password: 'Passw0rd!123', passwordConfirm: 'Passw0rd!123', name: 'T' }) });
  const a = await j('/api/collections/users/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: em, password: 'Passw0rd!123' }) });
  const bad = await j('/api/collections/feature_flags/records/' + id, { method: 'PATCH', body: JSON.stringify({ enabled: true }) }, a.d.token);
  assert.ok([400, 403, 404].includes(bad.s), 'member must not change flag, got ' + bad.s);
  const on = await j('/api/collections/feature_flags/records/' + id, { method: 'PATCH', body: JSON.stringify({ enabled: true }) }, t);
  assert.equal(on.d.enabled, true, JSON.stringify(on.d));
});
