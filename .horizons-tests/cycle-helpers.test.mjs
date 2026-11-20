import test from 'node:test';
import assert from 'node:assert/strict';

test('cycle helpers: empty methods, deduction, active count, label keys', async () => {
  const m = await loadAppModule('apps/web/src/lib/management.ts');
  const methods = m.emptyMethods();
  assert.deepEqual(Object.keys(methods).sort(), ['360', 'manager', 'self', 'team'], 'emptyMethods keys got ' + Object.keys(methods));
  assert.equal(m.activeMethodCount(methods), 0, 'default methods should all be disabled, got ' + m.activeMethodCount(methods));
  assert.equal(m.activeMethodCount(undefined), 0, 'undefined should give 0');
  methods.manager.enabled = true;
  methods.self.enabled = true;
  assert.equal(m.activeMethodCount(methods), 2, 'expected 2 active methods, got ' + m.activeMethodCount(methods));
  const d = m.emptyDeduction();
  assert.equal(d.enabled, false, 'deduction should default disabled');
  assert.ok(Array.isArray(d.attendance_conditions));
  const keys = ['performance', 'competency', 'evaluation'].map((p) => m.cyclePurposeLabelKey(p));
  assert.equal(new Set(keys).size, 3, 'purpose keys must be distinct: ' + JSON.stringify(keys));
  const tf = ['custom', 'monthly', 'quarterly', 'half_yearly', 'yearly'].map((p) => m.cycleTimeFrameLabelKey(p));
  assert.equal(new Set(tf).size, 5, 'time frame keys must be distinct: ' + JSON.stringify(tf));
  const pk = ['complete_review', 'review_period_end', 'both'].map((p) => m.publishScoreLabelKey(p));
  assert.equal(new Set(pk).size, 3, 'publish keys must be distinct: ' + JSON.stringify(pk));
});

test('cycleTimeline phases', async () => {
  const m = await loadAppModule('apps/web/src/lib/management.ts');
  const day = 86400000;
  const iso = (o) => new Date(Date.now() + o * day).toISOString();
  const mk = (a, b, c, d) => ({ performance_start: iso(a), performance_end: iso(b), review_start: iso(c), review_end: iso(d), status: 'active' });
  const f = m.cycleTimeline(mk(10, 20, 21, 30));
  assert.equal(f.phase, 'preparing', 'future cycle phase got ' + f.phase);
  const p = m.cycleTimeline(mk(-10, 10, 11, 20));
  assert.equal(p.phase, 'performance', 'got ' + p.phase);
  const r = m.cycleTimeline(mk(-30, -20, -10, 10));
  assert.equal(r.phase, 'review', 'got ' + r.phase);
  const e = m.cycleTimeline(mk(-30, -20, -10, -1));
  assert.equal(e.phase, 'ended', 'got ' + e.phase);
  for (const x of [f, p, r, e]) assert.ok(x.progress >= 0 && x.progress <= 100, 'progress out of range ' + x.progress);
});
