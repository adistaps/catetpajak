import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

test('exportPph21Excel downloads a workbook with DATA, BPMP, REF sheets', async () => {
  const m = await loadAppModule('apps/web/src/lib/pph21-excel-export.ts');
  assert.equal(typeof m.exportPph21Excel, 'function', 'exportPph21Excel must be exported');
  let blobs = [];
  let clicked = 0;
  const el = () => ({ style: {}, click() { clicked++; }, remove() {}, setAttribute() {}, appendChild() {}, href: '', download: '' });
  globalThis.document = { createElement: el, body: { appendChild() {}, removeChild() {} } };
  globalThis.window = globalThis.window || globalThis;
  const origCreate = URL.createObjectURL;
  URL.createObjectURL = (b) => { blobs.push(b); return 'blob:x'; };
  URL.revokeObjectURL = () => {};
  const row = { id: 'r1', employeeId: 'e1', name: 'Tester Satu', masaPajak: '3', tahunPajak: '2025', statusPegawai: 'Pegawai Tetap', npwpNikTin: '1234567890123456', nomorPassport: '', status: 'TK0', posisi: 'Staff', sertifikatFasilitas: 'N/A', kodeObjekPajak: '21-100-01', penghasilanKotor: 10000000, tarif: 2, tarifLabel: '2%', idTku: '0000000000000000000000', tglPemotongan: '2025-03-31', pph21: 200000, ptkpStatus: 'TK0', source: 'aktual' };
  try {
    m.exportPph21Excel([row], { periodLabel: 'Maret 2025', month: 3, year: 2025, companyName: 'PT Uji', fileName: 'x' });
  } finally { URL.createObjectURL = origCreate; }
  assert.ok(blobs.length >= 1, 'export must create a downloadable file (Blob); none created');
  const buf = Buffer.from(await blobs[0].arrayBuffer());
  assert.ok(buf.length > 100, 'file is empty, size ' + buf.length);
  assert.equal(buf.slice(0, 2).toString(), 'PK', 'file must be an xlsx (zip)');
  let text = '';
  let i = 0;
  while ((i = buf.indexOf(Buffer.from([0x50, 0x4b, 3, 4]), i)) >= 0) {
    const method = buf.readUInt16LE(i + 8), csize = buf.readUInt32LE(i + 18);
    const nl = buf.readUInt16LE(i + 26), el2 = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nl).toString();
    const start = i + 30 + nl + el2;
    if (name.includes('workbook.xml') && !name.includes('rels') && csize > 0) {
      const d = buf.slice(start, start + csize);
      try { text += (method === 8 ? zlib.inflateRawSync(d) : d).toString(); } catch {}
    }
    i += 4;
  }
  for (const s of ['DATA', 'BPMP', 'REF']) assert.ok(text.includes('name="' + s + '"'), `sheet ${s} missing in workbook; workbook xml: ${text.slice(0, 400)}`);
});
