const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSettings, pageRanges } = require('../electron/print-settings');

test('Legal report and Folio ID defaults use the correct paper and margin units', () => {
  const legal = buildSettings({}, { paper: 'Legal', margin: 0.35 });
  assert.equal(legal.pdf.pageSize, 'Legal');
  assert.equal(legal.pdf.margins.top, 0.35);
  assert.equal(legal.print.margins.top, 34);
  const folio = buildSettings({}, { paper: 'Folio', margin: 0.3 });
  assert.deepEqual(folio.pdf.pageSize, { width: 8.5, height: 13 });
  assert.deepEqual(folio.print.pageSize, { width: 215900, height: 330200 });
  assert.match(folio.css, /size: 8.5in 13in/);
});

test('fit uses printable space, orientation and native document dimensions', () => {
  const settings = buildSettings({ paperSize: 'Letter', orientation: 'landscape', scaleMode: 'fit', margins: 'normal' }, { paper: 'Legal', margin: 0 });
  assert.equal(settings.pdf.scale, 6.5 / 14);
  assert.equal(settings.print.scaleFactor, Math.round(650 / 14));
  assert.match(settings.css, /size: 11in 8.5in/);
});

test('range selection retains original page numbers, merges overlaps and validates limits', () => {
  assert.deepEqual(pageRanges({ pageRange: 'custom', pageRangeCustom: '5, 2-3, 3-4', totalPages: 8 }), [{ from: 1, to: 4 }]);
  assert.deepEqual(pageRanges({ pageRange: 'current', currentPage: 3, totalPages: 8 }), [{ from: 2, to: 2 }]);
  for (const text of ['', '0', '3-2', '2-9', '1,', 'hello']) {
    assert.throws(() => pageRanges({ pageRange: 'custom', pageRangeCustom: text, totalPages: 8 }));
  }
});

test('preview remains complete regardless of selected print range', () => {
  const settings = buildSettings({ pageRange: 'custom', pageRangeCustom: '2-3', totalPages: 4 });
  assert.equal(settings.pdf.pageRanges, undefined);
});

test('invalid paper, scale and margin values cannot reach Electron', () => {
  for (const input of [{ paperSize: 'invalid' }, { scaleMode: 'custom', scalePercent: 0 }, { margins: 'custom', customMargins: { top: -1 } }]) {
    assert.throws(() => buildSettings(input));
  }
});
