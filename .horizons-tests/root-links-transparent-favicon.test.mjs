import test from 'node:test';
import assert from 'node:assert/strict';

test('root links expose a PNG/SVG/ICO favicon with an href', async () => {
  const m = await loadAppModule('apps/web/src/root.tsx');
  const links = m.links({});
  const icons = links.filter((l) => typeof l.rel === 'string' && l.rel.split(/\s+/).includes('icon'));
  assert.ok(icons.length >= 1, 'expected rel=icon link, got ' + JSON.stringify(links));
  for (const i of icons) {
    assert.ok(typeof i.href === 'string' && i.href.length > 0, 'icon needs href: ' + JSON.stringify(i));
    assert.ok(/\.(png|svg|ico|webp)(\?|$)/i.test(i.href) || /^data:image\//.test(i.href), 'favicon href should be an image file, got ' + i.href);
    if (i.type) assert.ok(/^image\//.test(i.type), 'icon type should be image/*, got ' + i.type);
  }
});
