import test from 'node:test';
import assert from 'node:assert/strict';

test('management label key helpers return non-empty strings', async () => {
  const m = await loadAppModule('apps/web/src/lib/management.ts');
  for (const fn of ['ratingLabelKey','trainingCategoryLabelKey','trainingStatusLabelKey','reviewStatusLabelKey']) {
    assert.equal(typeof m[fn], 'function', fn + ' must be exported');
  }
  for (const c of ['onboarding','technical','soft_skill','compliance','leadership','other']) {
    const k = m.trainingCategoryLabelKey(c);
    assert.ok(typeof k === 'string' && k.length > 0, 'category ' + c + ' key got ' + k);
  }
  const keys = ['planned','ongoing','completed','cancelled'].map((s) => m.trainingStatusLabelKey(s));
  assert.equal(new Set(keys).size, 4, 'status keys must be distinct, got ' + JSON.stringify(keys));
  const rk = ['draft','completed'].map((s) => m.reviewStatusLabelKey(s));
  assert.equal(new Set(rk).size, 2, 'review status keys must be distinct, got ' + JSON.stringify(rk));
});
