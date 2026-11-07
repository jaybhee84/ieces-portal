export const WORK_DAYS = [
  { code: 'M', label: 'Monday' }, { code: 'T', label: 'Tuesday' },
  { code: 'W', label: 'Wednesday' }, { code: 'TH', label: 'Thursday' },
  { code: 'F', label: 'Friday' },
];
export const LOAD_LABELS = { teaching: 'Teaching', advisory: 'Advisory / Homeroom', ancillary: 'Ancillary' };

export function currentWorkloadYear() {
  const date = new Date();
  const year = date.getFullYear() - (date.getMonth() < 5 ? 1 : 0);
  return `${year}-${year + 1}`;
}

const minutes = (time) => {
  const match = String(time || '').match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60
    ? Number(match[1]) * 60 + Number(match[2]) : null;
};

export function scheduleTime(value) {
  const total = minutes(value);
  if (total == null) return '—';
  const hour = Math.floor(total / 60);
  return `${hour % 12 || 12}:${String(total % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function summarizeWorkload(entries) {
  const days = WORK_DAYS.map((day) => ({ ...day, teaching: 0, ancillary: 0 }));
  for (const entry of entries) {
    const start = minutes(entry.time_start);
    const end = minutes(entry.time_end);
    if (start == null || end == null || end <= start) continue;
    for (const day of days) {
      if (entry.days?.includes(day.code)) day[entry.load_type === 'ancillary' ? 'ancillary' : 'teaching'] += end - start;
    }
  }
  const teaching = days.reduce((sum, day) => sum + day.teaching, 0);
  const ancillary = days.reduce((sum, day) => sum + day.ancillary, 0);
  return { days, teaching, ancillary, average: Math.round((teaching + ancillary) / 5) };
}

export const workloadDuration = (total) => `${Math.floor(total / 60)}h ${total % 60}m`;
