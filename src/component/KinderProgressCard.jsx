import React, { useEffect, useRef, useState } from 'react';
import { Printer, Save } from 'lucide-react';
import { usePrintPreview } from './PrintPreview/PrintPreviewContext';
import { loadAdvisoryRoster } from '../lib/advisoryRosterData';
import { supabase } from '../lib/supabase';
import { adviserGradeKey } from '../lib/orgAdvisers';
import { learnerDisplayName } from '../lib/learnerRoster';
import { currentWorkloadYear } from '../lib/teachingWorkload.mjs';
import { KINDER_COMPETENCIES, KINDER_RATINGS, KINDER_ATTENDANCE_MONTHS, newKinderCard, absentDays, kinderAttendanceTotals, validateKinderCard, saveKinderCard } from '../lib/kinderProgress.mjs';
import schoolLogo from '../image/ieceslogo.png';
import educationSeal from '../image/deped.png';
import '../styles/Form137.css';
import '../styles/KinderProgressCard.css';

function CompetencyTable({ group, card }) {
  return <table className="kinder-ratings-table">
    <caption>{group.title}</caption>
    <thead><tr><th scope="col">Competency</th>{[1, 2, 3].map((term) => <th scope="col" key={term}>T{term}</th>)}</tr></thead>
    <tbody>{group.skills.map((skill) => <tr key={skill.id}><td>{skill.text}</td>{[0, 1, 2].map((term) => <td key={term}>{card.ratings[skill.id]?.[term] || ''}</td>)}</tr>)}</tbody>
  </table>;
}

export function KinderCardPaper({ card }) {
  const attendanceTotals = kinderAttendanceTotals(card.attendance);
  return <div className="kinder-paper-pages">
    <article className="kinder-paper">
      <header className="kinder-paper-header"><img src={educationSeal} alt="Department of Education" /><div>Republic of the Philippines<br />Department of Education<br />Region IX · Division of Isabela City<br /><strong>ISABELA EAST CENTRAL ELEMENTARY SCHOOL</strong><h1>KINDERGARTEN PROGRESS REPORT</h1>School Year {card.schoolYear}</div><img src={schoolLogo} alt="School seal" /></header>
      <div className="kinder-paper-identity"><span>Name: <strong>{card.name}</strong></span><span>LRN: {card.lrn}</span><span>Section: {card.section}</span><span>Birthdate: {card.birthdate}</span><span>Teacher: {card.adviser}</span><span>Age at beginning of SY: {card.ageBeginning}</span><span>Age at end of SY: {card.ageEnd}</span></div>
      <p className="kinder-parent-note">This report describes your child’s learning and development based on observed performance and assessment evidence. BG — Beginning; DV — Developing; CO — Consistent. A blank cell means no rating has been recorded.</p>
      <div className="kinder-paper-columns"><div>{KINDER_COMPETENCIES.slice(0, 3).map((group) => <CompetencyTable key={group.id} group={group} card={card} />)}</div><div><CompetencyTable group={KINDER_COMPETENCIES[3]} card={card} /></div></div>
      <footer>School adaptation of Annex E, DepEd Order 015, s. 2026 · Page 1 of 2</footer>
    </article>
    <article className="kinder-paper">
      <h2>Kindergarten Progress Report · {card.name} · SY {card.schoolYear}</h2>
      <div className="kinder-paper-columns kinder-paper-back">
        <div><h3>Teacher’s comments / remarks</h3><p>Observations, strengths, areas for support, and suggested next steps.</p>{card.comments.map((comment, index) => <section className="kinder-term-comment" key={index}><h4>Term {index + 1}</h4><p>{comment}</p><div>Parent’s / Guardian’s signature: ____________________</div></section>)}</div>
        <div><h3>Attendance record</h3><table className="kinder-attendance-table"><thead><tr><th>Term</th><th>Month</th><th>Class days</th><th>Present</th><th>Absent</th></tr></thead><tbody>{KINDER_ATTENDANCE_MONTHS.map(([term, month], index) => <tr key={index}><td>{term}</td><td>{month}</td><td>{card.attendance[index].days}</td><td>{card.attendance[index].present}</td><td>{absentDays(card.attendance[index])}</td></tr>)}</tbody><tfoot><tr><th colSpan="2">Total</th><td>{attendanceTotals.days}</td><td>{attendanceTotals.present}</td><td>{attendanceTotals.absent}</td></tr></tfoot></table>
          <h3>Guide for parents / guardians</h3><dl className="kinder-rating-guide"><dt>CO — Consistent</dt><dd>Consistently demonstrates the competency and works independently.</dd><dt>DV — Developing</dt><dd>Demonstrates the competency inconsistently; progresses with practice and minimal supervision.</dd><dt>BG — Beginning</dt><dd>Needs sustained guidance, support, and close supervision to demonstrate the competency.</dd></dl>
          {card.certifyTransfer && <section className="kinder-transfer"><h3>Certificate of transfer</h3><p>This certifies that {card.name} of {card.section} has developed the general competencies based on the Kindergarten Curriculum Guide.</p><p>________________________<br />{card.adviser}<br />Adviser</p><p>________________________<br />{card.principal}<br />School Head</p></section>}
        </div>
      </div>
      <footer>School adaptation of Annex E, DepEd Order 015, s. 2026 · Page 2 of 2</footer>
    </article>
  </div>;
}

export function KinderProgressCard({ profile }) {
  const { requestPrint } = usePrintPreview();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadId = useRef(0);
  const [card, setCard] = useState(null);
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [term, setTerm] = useState(0);
  const [groupIndex, setGroupIndex] = useState(0);
  const [showOutput, setShowOutput] = useState(false);
  const [schoolYear] = useState(currentWorkloadYear);
  const draftKey = (id) => `ieces:kinder-progress:${profile?.id}:${schoolYear}:${id}`;

  useEffect(() => () => { loadId.current += 1; }, []);
  useEffect(() => {
    const reconnect = () => {
      if (!card) return;
      setLoadFailed(true);
      setMessage('Connection restored. Reload the saved card before editing or saving so you use the latest Supabase record.');
    };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [card]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadAdvisoryRoster(profile).then((result) => {
      if (!active) return;
      if (result.error) setMessage(`Could not load Kindergarten learners: ${result.error.message}`);
      setStudents((result.students || []).filter((learner) => adviserGradeKey(learner.grade_level === 0 ? '0' : learner.grade_level || learner.grade || learner.gradeLevel || learner.section) === '0').sort((a, b) => learnerDisplayName(a).localeCompare(learnerDisplayName(b))));
      setLoading(false);
    }).catch((error) => { if (active) { setMessage(error.message); setLoading(false); } });
    return () => { active = false; };
  }, [profile]);

  const mayDiscard = () => !dirty || window.confirm('Discard the unsaved changes to this Kindergarten card?');
  const selectLearner = async (id) => {
    if (!mayDiscard()) return;
    const requestId = ++loadId.current;
    const learner = students.find((item) => String(item.id) === id);
    if (!learner) { setCard(null); setDirty(false); return; }
    setSelecting(true);
    setDirty(false);
    setLoadFailed(false);
    setCard(null);
    setMessage('Loading the saved Kindergarten card…');
    const initial = newKinderCard(learner, schoolYear, [profile?.first_name, profile?.family_name].filter(Boolean).join(' '));
    try {
      const result = await supabase.from('kindergarten_progress_cards').select('data,updated_at')
        .eq('student_id', id).eq('school_year', schoolYear).maybeSingle();
      if (requestId !== loadId.current) return;
      setLoadFailed(Boolean(result.error) && navigator.onLine);
      let local;
      if (!result.data?.data) {
        try { local = localStorage.getItem(draftKey(id)); } catch { /* Server access does not depend on local storage. */ }
      }
      const loaded = result.data?.data || (local ? JSON.parse(local) : initial);
      if (loaded.learnerId !== id || loaded.schoolYear !== schoolYear || validateKinderCard(loaded)) throw new Error('Invalid local card');
      setCard(loaded);
      setDirty(Boolean(local));
      setMessage(result.data?.data
        ? navigator.onLine ? 'Kindergarten card loaded from Supabase.' : 'Previously loaded card opened offline. Connect to save changes.'
        : local ? 'Local copy loaded. Use Save Information while online to upload it to Supabase.'
        : result.error ? `Could not load the saved card: ${result.error.message}. A blank card is shown; saving requires a working database connection.`
        : 'New Kindergarten card. Use Save Information to save it to Supabase.');
    } catch (error) {
      if (requestId !== loadId.current) return;
      setCard(initial);
      setLoadFailed(true);
      setMessage(`Could not read the saved card: ${error.message}. Existing records have not been overwritten.`);
    } finally {
      if (requestId === loadId.current) setSelecting(false);
    }
    setShowOutput(false);
  };
  const edit = (key, value) => { if (!navigator.onLine) return; setCard((current) => ({ ...current, [key]: value })); setDirty(true); setMessage(''); };
  const rate = (id, value) => {
    const values = [...(card.ratings[id] || ['', '', ''])];
    values[term] = value;
    edit('ratings', { ...card.ratings, [id]: values });
  };
  const save = async () => {
    if (loadFailed) { setMessage('Load the saved card successfully before saving, to avoid overwriting an existing record.'); return; }
    setSaving(true);
    try {
      const saved = await saveKinderCard(supabase, card);
      setCard(saved);
      setDirty(false);
      setMessage('Kindergarten card saved to Supabase.');
      try { localStorage.setItem(draftKey(saved.learnerId), JSON.stringify(saved)); }
      catch { setMessage('Saved to Supabase. An offline backup could not be stored on this device.'); }
    } catch (error) { setMessage(`Card was not saved to Supabase: ${error.message}`); }
    finally { setSaving(false); }
  };
  const print = () => {
    const error = validateKinderCard(card);
    if (error) { setMessage(error); return; }
    requestPrint();
  };
  const group = KINDER_COMPETENCIES[groupIndex];
  return <div className="kinder-root" data-print-paper="Legal" data-print-margin="0">
    <div className="f137-toolbar"><div><h2>Kinder Class Card</h2><p>Developmental assessment · Three terms · Annex E, DO 015, s. 2026</p></div><div className="f137-actions"><button disabled={!card || saving || loadFailed || !navigator.onLine} onClick={save}><Save size={16} /> {saving ? 'Saving…' : 'Save Information'}</button><button disabled={!card || selecting || loadFailed} aria-pressed={showOutput} onClick={() => setShowOutput(!showOutput)}>{showOutput ? 'Back to assessment' : 'View Class Card'}</button><button disabled={!card || saving || loadFailed} className="primary" onClick={print}><Printer size={16} /> Print card</button></div></div>
    <p className="kinder-storage-note">Save Information stores this card in Supabase. Previously saved copies can be viewed offline; saving requires internet. This report is separate from Form 137 and the ECCD checklist.</p>
    {dirty && <p className="kinder-unsaved" role="status">Unsaved changes — save to Supabase before leaving this tab.</p>}
    {message && <p className="f137-message" role="status">{message}</p>}
    {loadFailed && card && <div className="f137-actions"><button disabled={selecting || saving} onClick={() => selectLearner(card.learnerId)}>Reload saved card</button></div>}
    <div className="kinder-selector"><label className="f137-field"><span>Kindergarten learner</span><select disabled={loading || selecting || saving} value={card?.learnerId || ''} onChange={(event) => selectLearner(event.target.value)}><option value="">{loading ? 'Loading learners…' : selecting ? 'Loading saved card…' : 'Select a learner'}</option>{students.map((learner) => <option key={learner.id} value={String(learner.id)}>{learnerDisplayName(learner)}</option>)}</select></label><label className="f137-field"><span>School year</span><input value={schoolYear} readOnly /></label></div>
    {!loading && !students.length && <p>No Kindergarten learners are assigned to this class.</p>}
    {card && <>
      <section className="f137-editor" hidden={showOutput}>
        <fieldset disabled={saving || loadFailed} className="kinder-editor-fields">
        <div className="f137-input-grid">{[['section', 'Section'], ['adviser', 'Adviser'], ['principal', 'School head'], ['ageBeginning', 'Age at beginning of SY (years / months)'], ['ageEnd', 'Age at end of SY (years / months)']].map(([key, label]) => <label key={key} className="f137-field"><span>{label}</span><input readOnly={!navigator.onLine} maxLength={120} value={card[key]} onChange={(event) => edit(key, event.target.value)} /></label>)}</div>
        <div className="kinder-term-picker" aria-label="Assessment term">{[0, 1, 2].map((index) => <button key={index} aria-pressed={term === index} onClick={() => setTerm(index)}>Term {index + 1}</button>)}</div>
        <p>BG — Beginning · DV — Developing · CO — Consistent. Rate from observed evidence; leave unassessed competencies blank.</p>
        <label className="f137-field"><span>Developmental group</span><select value={groupIndex} onChange={(event) => setGroupIndex(Number(event.target.value))}>{KINDER_COMPETENCIES.map((item, index) => <option key={item.id} value={index}>{item.title}</option>)}</select></label>
        <div className="kinder-competency-editor">{group.skills.map((skill) => <label key={skill.id}><span>{skill.text}</span><select disabled={!navigator.onLine} aria-label={`${skill.text}, Term ${term + 1}`} value={card.ratings[skill.id]?.[term] || ''} onChange={(event) => rate(skill.id, event.target.value)}><option value="">Not assessed</option>{Object.entries(KINDER_RATINGS).map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}</select></label>)}</div>
        <label className="f137-field kinder-comments"><span>Term {term + 1}: observations, strengths, support needed, and next steps</span><textarea readOnly={!navigator.onLine} maxLength={800} rows={5} value={card.comments[term]} onChange={(event) => { const comments = [...card.comments]; comments[term] = event.target.value; edit('comments', comments); }} /></label>
        <h3 className="kinder-attendance-heading">Term {term + 1} attendance</h3><p>September is split between Terms 1 and 2 in Annex E. Enter only the days belonging to each term.</p>
        <div className="kinder-attendance-editor">{KINDER_ATTENDANCE_MONTHS.map(([rowTerm, month], index) => rowTerm === term + 1 && <fieldset key={index}><legend>{month}</legend>{[['days', 'Class days'], ['present', 'Days present']].map(([key, label]) => <label className="f137-field" key={key}><span>{label}</span><input readOnly={!navigator.onLine} type="number" min="0" max="31" step="1" value={card.attendance[index][key]} onChange={(event) => { const attendance = card.attendance.map((row, i) => i === index ? { ...row, [key]: event.target.value } : row); edit('attendance', attendance); }} /></label>)}<span>Absent: {absentDays(card.attendance[index])}</span></fieldset>)}</div>
        <label className="kinder-transfer-option"><input disabled={!navigator.onLine} type="checkbox" checked={card.certifyTransfer} onChange={(event) => edit('certifyTransfer', event.target.checked)} /> Include certificate of transfer (teacher confirms the learner has developed the required competencies)</label>
        </fieldset>
      </section>
      <div className="kinder-output" hidden={!showOutput}><KinderCardPaper card={card} /></div>
    </>}
  </div>;
}
