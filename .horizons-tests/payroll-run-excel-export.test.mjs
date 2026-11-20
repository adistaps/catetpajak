import test from 'node:test';
import assert from 'node:assert/strict';

test('exportPayrollRunExcel triggers an xlsx download with payroll data', async () => {
  const m = await loadAppModule('apps/web/src/lib/payroll-excel-export.ts');
  assert.equal(typeof m.exportPayrollRunExcel, 'function', 'exportPayrollRunExcel must be exported');
  const blobs = [];
  let clicked = 0;
  const el = () => ({ style: {}, click() { clicked++; }, remove() {}, setAttribute() {}, appendChild() {}, href: '', download: '' });
  globalThis.document = { createElement: el, body: { appendChild() {}, removeChild() {} } };
  globalThis.window = globalThis.window || globalThis;
  const orig = URL.createObjectURL;
  URL.createObjectURL = (b) => { blobs.push(b); return 'blob:x'; };
  URL.revokeObjectURL = () => {};
  const run = { id: 'r1', period: '2026-01', status: 'draft', company: 'c1' };
  const slips = [{ id: 'p1', run: 'r1', employee: 'e1', net_pay: 1234567, expand: { employee: { name: 'Budi Uji' } } }];
  try {
    m.exportPayrollRunExcel(run, slips);
  } finally { URL.createObjectURL = orig; }
  assert.ok(blobs.length >= 1, 'export must create a Blob download; none created');
  const buf = Buffer.from(await blobs[0].arrayBuffer());
  assert.equal(buf.slice(0, 2).toString(), 'PK', 'file must be an xlsx (zip), size ' + buf.length);
  assert.ok(clicked >= 1, 'download link must be clicked, clicks=' + clicked);
});
