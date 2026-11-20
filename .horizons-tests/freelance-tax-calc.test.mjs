import test from 'node:test';
import assert from 'node:assert/strict';

test('freelance PPh21 uses 50% DPP, PTKP, progressive rates', async () => {
  const m = await loadAppModule('apps/web/src/lib/payroll-calc.ts');
  // bruto 10jt/month => 120jt/yr; DPP 60jt; TK0 PTKP 54jt; PKP 6jt; tax 5% = 300000/yr; 25000/month
  const r = m.calcFreelancePph21({ monthlyBruto: 10000000, ptkpStatus: 'TK0', hasNpwp: true });
  assert.equal(r.annualDpp, 60000000, 'annualDpp expected 60000000 got ' + r.annualDpp);
  assert.equal(r.annualPkp, 6000000, 'annualPkp expected 6000000 got ' + r.annualPkp);
  assert.equal(r.annualTax, 300000, 'annualTax expected 300000 got ' + r.annualTax);
  assert.equal(Math.round(r.monthlyTax), 25000, 'monthlyTax expected 25000 got ' + r.monthlyTax);
  // no NPWP: +20%
  const n = m.calcFreelancePph21({ monthlyBruto: 10000000, ptkpStatus: 'TK0', hasNpwp: false });
  assert.equal(Math.round(n.annualTax), 360000, 'no-NPWP annualTax expected 360000 got ' + n.annualTax);
});

test('calcDeductions: freelance differs, other types unchanged', async () => {
  const m = await loadAppModule('apps/web/src/lib/payroll-calc.ts');
  const base = { bpjsBase: 10000000, monthlyBruto: 10000000, ptkpStatus: 'TK0', hasNpwp: true, pph21Method: 'ter' };
  const f = m.calcDeductions({ ...base, employeeType: 'freelance' });
  assert.equal(Math.round(f.pph21.monthlyTax), 25000, 'freelance monthly tax expected 25000 got ' + f.pph21.monthlyTax);
  const none = m.calcDeductions(base);
  for (const t of ['permanent', 'kontrak', 'probation', 'magang']) {
    const d = m.calcDeductions({ ...base, employeeType: t });
    assert.equal(d.pph21.monthlyTax, none.pph21.monthlyTax, `${t} tax must equal default: got ${d.pph21.monthlyTax} expected ${none.pph21.monthlyTax}`);
  }
});
