import test from 'node:test';
import assert from 'node:assert/strict';

test('without credentials Neo Bank reports not configured and never succeeds', async () => {
  const m = await loadAppModule('apps/web/src/lib/neo-bank.server.ts');
  const st = m.neoBankConfigStatus();
  if (st.configured) return;
  assert.equal(st.configured, false);
  assert.ok(Array.isArray(st.missing) && st.missing.length > 0, 'missing list expected non-empty, got ' + JSON.stringify(st.missing));
  const r = await m.disburseViaNeoBank({ reference: 'REF1', sourceAccount: '111', destinationAccount: '222', destinationName: 'Budi', amount: 1000000, description: 'Gaji' });
  assert.equal(r.status, 'not_configured', 'expected not_configured, got ' + JSON.stringify(r));
});
