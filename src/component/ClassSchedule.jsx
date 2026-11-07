import React, { useEffect, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { findOrgTeacherForProfile, orgAdviserName } from '../lib/orgAdvisers';
import { WORK_DAYS, LOAD_LABELS, currentWorkloadYear, scheduleTime, summarizeWorkload, workloadDuration } from '../lib/teachingWorkload.mjs';
import '../styles/ClassSchedule.css';

export function ClassSchedule({ profile }) {
  const [schoolYear, setSchoolYear] = useState(currentWorkloadYear);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, entries: [], teacher: null, error: '' });
  const startYear = Number(currentWorkloadYear().slice(0, 4));

  useEffect(() => {
    const refresh = () => { if (!document.hidden) setRevision((value) => value + 1); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  useEffect(() => {
    let active = true;
    setState({ loading: true, entries: [], teacher: null, error: '' });
    const load = async () => {
      const teachers = await supabase.from('org_chart').select('*');
      if (teachers.error) throw teachers.error;
      const teacher = findOrgTeacherForProfile(profile, teachers.data);
      if (!teacher) throw new Error('Your teaching assignment could not be matched to the Org Chart. Ask the administrator to check your teacher profile.');
      const result = await supabase.from('teaching_loads').select('*')
        .eq('school_year', schoolYear).eq('teacher_id', String(teacher.id)).order('time_start');
      if (result.error) throw result.error;
      if (active) setState({ loading: false, teacher, entries: result.data || [], error: '' });
    };
    load().catch((error) => {
      if (active) setState({ loading: false, teacher: null, entries: [], error: `Could not load your schedule: ${error.message}` });
    });
    return () => { active = false; };
  }, [profile?.id, profile?.first_name, profile?.family_name, profile?.full_name, schoolYear, revision]);

  const summary = summarizeWorkload(state.entries);
  return <div className="dash-card schedule-page">
    <div className="dash-card-header schedule-heading">
      <div><h2><CalendarDays size={20} aria-hidden="true" /> Class Schedule &amp; Workload</h2><p>Your assignments from the Admin Portal’s Teaching Load module. Changes are maintained by the administrator.</p></div>
      <div className="schedule-controls">
        <label>School year<select value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)}>{[startYear + 1, startYear, startYear - 1].map((year) => <option key={year}>{year}-{year + 1}</option>)}</select></label>
        <button type="button" disabled={state.loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Refresh</button>
      </div>
    </div>
    {state.loading ? <p role="status">Loading your schedule…</p> : state.error ? <p className="schedule-error" role="alert">{state.error}</p> : <>
      <p className="schedule-teacher">{orgAdviserName(state.teacher)}</p>
      {!state.entries.length ? <p>No schedule or workload has been assigned for SY {schoolYear}. If the administrator has already assigned one, ask them to check your teacher link and Portal access.</p> : <>
        <dl className="schedule-totals">
          <div><dt>Teaching &amp; advisory / week</dt><dd>{workloadDuration(summary.teaching)}</dd></div>
          <div><dt>Ancillary / week</dt><dd>{workloadDuration(summary.ancillary)}</dd></div>
          <div><dt>Average total / weekday</dt><dd>{workloadDuration(summary.average)}</dd></div>
        </dl>
        {WORK_DAYS.map((day, index) => {
          const entries = state.entries.filter((entry) => entry.days?.includes(day.code));
          const totals = summary.days[index];
          return <section className="schedule-day" key={day.code} aria-labelledby={`schedule-${day.code}`}>
            <h3 id={`schedule-${day.code}`}>{day.label}</h3>
            <p>{workloadDuration(totals.teaching)} teaching / advisory · {workloadDuration(totals.ancillary)} ancillary</p>
            {!entries.length ? <p>No scheduled assignments.</p> : <div className="schedule-table-scroll"><table>
              <caption className="sr-only">{day.label} assignments</caption>
              <thead><tr><th scope="col">Time</th><th scope="col">Subject / assignment</th><th scope="col">Class</th><th scope="col">Type</th><th scope="col">Remarks</th></tr></thead>
              <tbody>{entries.map((entry) => <tr key={entry.id}><td>{scheduleTime(entry.time_start)} – {scheduleTime(entry.time_end)}</td><td>{entry.subject}</td><td>{[entry.grade_level, entry.section].filter(Boolean).join(' · ') || '—'}</td><td>{LOAD_LABELS[entry.load_type] || entry.load_type}</td><td>{entry.remarks || '—'}</td></tr>)}</tbody>
            </table></div>}
          </section>;
        })}
      </>}
    </>}
  </div>;
}
