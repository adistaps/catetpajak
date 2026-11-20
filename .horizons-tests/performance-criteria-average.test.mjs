import test from 'node:test';
import assert from 'node:assert/strict';

test('averageCriteriaRating averages ratings to 1 decimal', async () => {
  const m = await loadAppModule('apps/web/src/lib/management.ts');
  const r = m.averageCriteriaRating([{ key: 'a', rating: 5 }, { key: 'b', rating: 4 }, { key: 'c', rating: 4 }]);
  assert.equal(r, 4.3, 'avg of 5,4,4 expected 4.3 got ' + r);
  const e = m.averageCriteriaRating([{ key: 'a', rating: 3 }, { key: 'b', rating: 4 }]);
  assert.equal(e, 3.5, 'avg of 3,4 expected 3.5 got ' + e);
  const none = m.averageCriteriaRating([]);
  assert.equal(none, null, 'empty criteria expected null got ' + none);
  const und = m.averageCriteriaRating(undefined);
  assert.equal(und, null, 'undefined expected null got ' + und);
});

test('emptyCriteria returns a non-empty list with unique keys', async () => {
  const m = await loadAppModule('apps/web/src/lib/management.ts');
  const c = m.emptyCriteria();
  assert.ok(Array.isArray(c) && c.length > 0, 'expected non-empty criteria, got ' + JSON.stringify(c));
  assert.equal(new Set(c.map((x) => x.key)).size, c.length, 'criteria keys must be unique');
});
