const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

test('transfer visibility requires the effective chairman role even for superadmin tests', () => {
  const source = readFileSync('src/component/DashboardPage.jsx', 'utf8');
  const expression = source.match(/const isGradeChairman =\s*([\s\S]*?);/)[1];
  for (const isSuperadmin of [false, true]) {
    for (const role of ['adviser', 'subject_teacher', 'admin', undefined, 'grade_chairman']) {
      assert.equal(runInNewContext(expression, { isSuperadmin, effectiveProfile: { role } }), role === 'grade_chairman');
    }
  }
});
