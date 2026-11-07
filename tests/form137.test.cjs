const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
// Reuse the JSX compiler already shipped with electron-builder.
const ts = require(require.resolve('typescript', { paths: [require.resolve('config-file-ts')] }));

function loadComponent(file, mocks = {}) {
  const filename = resolve(file);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: filename,
    reportDiagnostics: true,
  });
  assert.deepEqual((compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error).map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')), []);
  loaded._compile(compiled.outputText, filename);
  return loaded.exports;
}

const remarks = loadComponent('src/lib/form137Remarks.mjs');
const curriculum = loadComponent('src/lib/elementaryLearningAreas.mjs');
const grades = loadComponent('src/component/Form137Grades.jsx', {
  '../lib/form137Remarks.mjs': remarks,
  '../lib/elementaryLearningAreas.mjs': curriculum,
});

test('grade entry shows labelled fields and saved grades without a paper table', () => {
  const html = renderToStaticMarkup(React.createElement(grades.Form137Grades, {
    subjects: [{ name: 'Mathematics', q1: '89', q2: '90', q3: '91', q4: '92', final: '91', remarks: 'Failed' }],
    onChange: () => {},
  }));
  for (const label of ['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4', 'Final rating', 'Remarks']) assert.ok(html.includes(label));
  assert.match(html, /value="89"/);
  assert.match(html, /value="Passed"/);
  assert.doesNotMatch(html, /<table/);
  assert.doesNotMatch(html, /list="f137-subject-options"/);
});

test('standard subjects are headings while custom learning areas retain a name field', () => {
  for (const name of ['Filipino', 'English', 'Mathematics']) {
    const html = renderToStaticMarkup(React.createElement(grades.Form137Grades, {
      subjects: [{ ...curriculum.emptySubject(name) }], onChange() {},
    }));
    assert.ok(html.includes(`<legend>${name}</legend>`));
    assert.doesNotMatch(html, /list="f137-subject-options"/);
  }
  const html = renderToStaticMarkup(React.createElement(grades.Form137Grades, {
    subjects: [curriculum.emptySubject('')], onChange() {},
  }));
  assert.match(html, /list="f137-subject-options"/);
});

test('output is read-only and retained for printing while the editor is visible', () => {
  const { Form137, adviserRecordIndex } = loadComponent('src/component/Form137.jsx', {
    './PrintPreview/PrintPreviewContext': { usePrintPreview: () => ({ requestPrint() {} }) },
    '../lib/advisoryRosterData': {}, '../lib/supabase': {}, '../lib/learnerRoster': {},
    '../image/deped.png': '', '../image/deped-logo.gif': '', '../styles/Form137.css': {},
    './Form137Grades': grades,
    '../lib/form137Remarks.mjs': remarks,
    '../lib/elementaryLearningAreas.mjs': curriculum,
    '../lib/orgAdvisers': loadComponent('src/lib/orgAdvisers.js'),
  });
  const records = ['1', '2', '3', '4', '5', '6', '', ''].map((grade) => ({ grade }));
  assert.equal(adviserRecordIndex(records, 'Grade 4'), 3);
  assert.equal(adviserRecordIndex(records, 6), 5);
  assert.equal(adviserRecordIndex(records, 'Kinder'), 0);
  assert.equal(adviserRecordIndex(records, undefined), 0);
  const html = renderToStaticMarkup(React.createElement(Form137, { profile: { id: 'test' } }));
  assert.match(html, /View Form 137/);
  assert.match(html, /class="f137-output" hidden=""/);
  const paper = html.slice(html.indexOf('<div class="f137-pages">'));
  assert.equal((paper.match(/<article/g) || []).length, 2);
  assert.doesNotMatch(paper, /<input|<select|<textarea|contenteditable/i);
  assert.match(readFileSync('src/styles/Form137.css', 'utf8'), /\.f137-output\[hidden\]\s*\{\s*display: block !important/);
});

test('current learning areas match each elementary grade and retain scored legacy subjects', () => {
  assert.equal(curriculum.KINDERGARTEN_DOMAINS.length, 6);
  assert.ok(curriculum.learningAreasForGrade(1).includes('Language'));
  assert.ok(!curriculum.learningAreasForGrade(2).includes('Science'));
  assert.ok(curriculum.learningAreasForGrade(2).includes('Makabansa'));
  assert.ok(curriculum.learningAreasForGrade(3).includes('Science'));
  for (const grade of [4, 5, 6]) {
    const areas = curriculum.learningAreasForGrade(grade);
    for (const name of ['Araling Panlipunan', curriculum.GMRC, 'MAPEH', 'Music and Arts', 'Physical Education and Health', ...curriculum.ALIVE_SUBJECTS]) assert.ok(areas.includes(name));
    assert.ok(!areas.includes('Mother Tongue'));
  }
  const saved = [{ name: 'Mathematics', q1: '87', final: '88' }, { name: 'Mother Tongue', q1: '90' }];
  const changed = curriculum.subjectsForGrade('1', saved);
  assert.equal(changed.find((subject) => subject.name === 'Mathematics').q1, '87');
  assert.equal(changed.find((subject) => subject.name === 'Language').q1, '');
  assert.equal(changed.find((subject) => subject.name === 'Mother Tongue').q1, '90');
  assert.deepEqual(curriculum.subjectsForGrade('1', changed), changed);
  assert.equal(saved.length, 2);
});

test('numeric remarks follow the passing boundary and stay consistent in saved output', () => {
  for (const value of ['75', 75, 100, '89']) assert.equal(remarks.gradeRemark(value), 'Passed');
  for (const value of [60, 74, '74']) assert.equal(remarks.gradeRemark(value), 'Failed');
  for (const value of ['', ' ', null, undefined, 'abc', '75abc', NaN, Infinity, 59, 101]) assert.equal(remarks.gradeRemark(value), '');
  const original = { learnerId: 'a', records: [{ grade: '4', subjects: [{ name: 'Math', final: '74', remarks: 'Passed', q1: '80' }], remedial: [{ recomputed: '75', remarks: 'Failed' }] }] };
  const result = remarks.withForm137Remarks(original);
  assert.equal(result.records[0].subjects[0].remarks, 'Failed');
  assert.equal(result.records[0].remedial[0].remarks, 'Passed');
  assert.equal(result.records[0].subjects[0].q1, '80');
  assert.equal(original.records[0].subjects[0].remarks, 'Passed');
});

test('Kindergarten has 60 competencies, three descriptive terms, and read-only card output', () => {
  const kinder = loadComponent('src/lib/kinderProgress.mjs');
  const skills = kinder.KINDER_COMPETENCIES.flatMap((group) => group.skills);
  assert.equal(skills.length, 60);
  assert.equal(new Set(skills.map((skill) => skill.id)).size, 60);
  const card = kinder.newKinderCard({ id: 'test', first_name: 'Sample', family_name: 'Learner', grade_level: 'Kinder' }, '2026-2027', 'Sample Teacher');
  card.ratings[skills[0].id] = ['BG', 'DV', 'CO'];
  assert.equal(kinder.validateKinderCard(card), '');
  assert.equal(kinder.absentDays({ days: '20', present: '18' }), 2);
  assert.equal(kinder.absentDays({ days: '', present: '' }), '');
  assert.deepEqual(kinder.kinderAttendanceTotals(card.attendance), { days: '', present: '', absent: '' });
  assert.deepEqual(kinder.kinderAttendanceTotals([{ days: '20', present: '18' }, { days: '10', present: '9' }]), { days: 30, present: 27, absent: 3 });
  const { KinderCardPaper } = loadComponent('src/component/KinderProgressCard.jsx', {
    './PrintPreview/PrintPreviewContext': {}, '../lib/advisoryRosterData': {},
    '../lib/supabase': {},
    '../lib/orgAdvisers': {}, '../lib/learnerRoster': {}, '../lib/teachingWorkload.mjs': {},
    '../lib/kinderProgress.mjs': kinder,
    '../image/ieceslogo.png': '', '../image/deped.png': '',
    '../styles/Form137.css': {}, '../styles/KinderProgressCard.css': {},
  });
  const html = renderToStaticMarkup(React.createElement(KinderCardPaper, { card }));
  assert.equal((html.match(/<article/g) || []).length, 2);
  for (const code of ['BG', 'DV', 'CO']) assert.ok(html.includes(`<td>${code}</td>`));
  assert.doesNotMatch(html, /<input|<select|<textarea|Passed|Failed|Certificate of transfer/);
  card.certifyTransfer = true;
  assert.match(renderToStaticMarkup(React.createElement(KinderCardPaper, { card })), /Certificate of transfer/);
  card.ratings[skills[0].id][0] = '75';
  assert.match(kinder.validateKinderCard(card), /BG, DV, or CO/);
  card.ratings = {};
  card.attendance[0] = { days: '20', present: '21' };
  assert.match(kinder.validateKinderCard(card), /cannot exceed/);
});

test('Kindergarten saves require a Supabase confirmation and reject invalid ratings before writing', async () => {
  const kinder = loadComponent('src/lib/kinderProgress.mjs');
  const card = kinder.newKinderCard({ id: 'a', first_name: 'Sample', family_name: 'Learner' }, '2026-2027', 'Teacher');
  let calls = 0;
  const client = { rpc: async (name, args) => {
    calls++;
    assert.equal(name, 'save_current_kinder_progress');
    assert.equal(args.p_student_id, 'a');
    assert.equal(args.p_card, card);
    return { data: { data: card }, error: null };
  } };
  assert.equal(await kinder.saveKinderCard(client, card), card);
  await assert.rejects(() => kinder.saveKinderCard({ rpc: async () => ({ error: new Error('Permission denied') }) }, card), /Permission denied/);
  await assert.rejects(() => kinder.saveKinderCard({ rpc: async () => ({ data: null }) }, card), /did not confirm/);
  card.ratings['motor-1'] = ['90', '', ''];
  await assert.rejects(() => kinder.saveKinderCard(client, card), /BG, DV, or CO/);
  assert.equal(calls, 1);
});
