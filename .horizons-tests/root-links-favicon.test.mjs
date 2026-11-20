import test from 'node:test';
import assert from 'node:assert/strict';

test('root links declare a favicon icon', async () => {
  const m = await loadAppModule('apps/web/src/root.tsx');
  const links = m.links({});
  assert.ok(Array.isArray(links), 'links() must return an array, got ' + typeof links);
  const icons = links.filter((l) => typeof l.rel === 'string' && l.rel.split(/\s+/).includes('icon'));
  assert.ok(icons.length >= 1, 'expected at least one rel="icon" link for the Catet Pajak favicon, got ' + JSON.stringify(links));
  for (const i of icons) {
    assert.ok(typeof i.href === 'string' && i.href.length > 0, 'icon link needs an href: ' + JSON.stringify(i));
  }
});
