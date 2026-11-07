const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

// Load the browser's ESM helpers without changing this CommonJS package.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let source = readFileSync('src/lib/growth/bmi.js', 'utf8');
for (const table of ['bmiTable', 'hazTable']) {
  source = source.replace(`'./${table}'`, JSON.stringify(moduleUrl(readFileSync(`src/lib/growth/${table}.js`, 'utf8'))));
}
const growth = import(moduleUrl(source));

test('invalid measurements never produce nutrition classifications', async () => {
  const { normalizeHeightCm, normalizeHeightMeters, calcBMI, getBMIStatus, getHAZStatus } = await growth;
  for (const value of [null, undefined, '', 'abc', '120abc', -1, 0, NaN, Infinity, -Infinity]) {
    assert.equal(normalizeHeightCm(value), null);
    assert.equal(normalizeHeightMeters(value), null);
    assert.equal(calcBMI(25, value), null);
    assert.equal(calcBMI(value, 120), null);
    assert.equal(getHAZStatus(value, 'M', null, 120), null);
  }
  for (const value of [null, undefined, 0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(getBMIStatus(value, 'M', null, 120), null);
  }
});

test('valid metre and centimetre records retain the same results', async () => {
  const { normalizeHeightCm, normalizeHeightMeters, calcBMI, getHAZStatus } = await growth;
  assert.equal(normalizeHeightCm('1.25'), 125);
  assert.equal(normalizeHeightMeters('125'), 1.25);
  assert.equal(calcBMI('25', '125'), 16);
  assert.equal(calcBMI('25', '1.25'), 16);
  assert.deepEqual(getHAZStatus(125, 'M', null, 120), getHAZStatus(1.25, 'M', null, 120));
  assert.ok(getHAZStatus(125, 'M', null, 120));
});
