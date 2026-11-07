const { test } = require('node:test');
const assert = require('node:assert/strict');

test('workload totals match the Admin Portal teaching/advisory and ancillary classification', async () => {
  const { summarizeWorkload } = await import('../src/lib/teachingWorkload.mjs');
  const entries = [
    { load_type: 'teaching', days: ['M', 'W', 'F'], time_start: '08:00:00', time_end: '08:40:00' },
    { load_type: 'advisory', days: ['M', 'T', 'W', 'TH', 'F'], time_start: '13:00', time_end: '14:00' },
    { load_type: 'ancillary', days: ['M', 'T'], time_start: '14:00', time_end: '14:30' },
  ];
  const result = summarizeWorkload(entries);
  assert.equal(result.teaching, 420);
  assert.equal(result.ancillary, 60);
  assert.equal(result.average, 96);
  assert.equal(result.days[0].teaching, 100);
  assert.equal(result.days[1].teaching, 60);
  assert.equal(result.days[0].ancillary, 30);
  assert.equal(result.days[4].ancillary, 0);
});

test('time formatting and empty schedules are safe', async () => {
  const { summarizeWorkload, scheduleTime, workloadDuration } = await import('../src/lib/teachingWorkload.mjs');
  assert.equal(scheduleTime('00:00:00'), '12:00 AM');
  assert.equal(scheduleTime('12:00:00'), '12:00 PM');
  assert.equal(scheduleTime('15:45'), '3:45 PM');
  assert.equal(scheduleTime('bad'), '—');
  assert.equal(workloadDuration(125), '2h 5m');
  assert.equal(summarizeWorkload([]).average, 0);
  assert.equal(summarizeWorkload([{ days: ['M'], time_start: 'bad', time_end: '10:00' }]).teaching, 0);
});
