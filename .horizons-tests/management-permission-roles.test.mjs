import test from 'node:test';
import assert from 'node:assert/strict';

test('full-access roles get management permission', async () => {
  const m = await loadAppModule('apps/web/src/data/user-roles.ts');
  for (const r of ['pemilik','admin']) {
    const p = m.permissionsForRole(r);
    assert.ok(p.includes('management'), r + ' should include management, got ' + JSON.stringify(p));
  }
  const k = m.permissionsForRole('kasir');
  assert.ok(!k.includes('management'), 'kasir must not have management, got ' + JSON.stringify(k));
});
