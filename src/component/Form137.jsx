import { usePrintPreview } from "./PrintPreview/PrintPreviewContext";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, Printer, RotateCcw, Save } from "lucide-react";
import { loadAdvisoryRoster } from "../lib/advisoryRosterData";
import { supabase } from "../lib/supabase";
import { learnerDisplayName, learnerGenderLabel, learnerLrn } from "../lib/learnerRoster";
import educationSeal from "../image/deped.png";
import depedLogo from "../image/deped-logo.gif";
import "../styles/Form137.css";
import { Form137Grades } from "./Form137Grades";
import { withForm137Remarks } from "../lib/form137Remarks.mjs";
import { CURRICULUM_GROUPS, emptySubject, subjectsForGrade } from "../lib/elementaryLearningAreas.mjs";
import { adviserGradeKey } from "../lib/orgAdvisers";

export const adviserRecordIndex = (records, grade) => {
  const assignedGrade = adviserGradeKey(grade);
  if (!/^[1-6]$/.test(assignedGrade)) return 0;
  return Math.max(0, records.findIndex((record) => adviserGradeKey(record.grade) === assignedGrade));
};

const SCHOOL_DEFAULTS = {
  school: "ISABELA EAST CENTRAL E/S",
  schoolId: "126001",
  district: "EAST 1",
  division: "ISABELA CITY",
  region: "IX",
};

const getCurrentSchoolYear = () => {
  const today = new Date();
  const year = today.getFullYear();
  const startYear = today.getMonth() >= 5 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
};

const CURRENT_SCHOOL_YEAR = getCurrentSchoolYear();
const CURRENT_PRINCIPAL = "JOCELYN R. BUENAVENTURA";
const currentPrincipalName = () =>
  localStorage.getItem("autoid_principal_name") || CURRENT_PRINCIPAL;
const SCHOLASTIC_RECORD_SLOTS = 8;
const ELEMENTARY_GRADES = ["1", "2", "3", "4", "5", "6"];

const REGULAR_SUBJECTS = [
  "Mother Tongue",
  "Filipino",
  "English",
  "Mathematics",
  "Science",
  "Araling Panlipunan",
  "EPP / TLE",
  "MAPEH",
  "Music",
  "Arts",
  "Physical Education",
  "Health",
  "Eduk. sa Pagpapakatao",
  "*Arabic Language",
  "*Islamic Values Education",
];

const SUBJECT_OPTIONS = Array.from(new Set([
  ...CURRICULUM_GROUPS.slice(1).flatMap((group) => group.areas),
  ...REGULAR_SUBJECTS,
  "Character Education",
  "Civics and Culture",
  "Edukasyong Pantahanan at Pangkabuhayan (EPP)",
  "Heograpiya, Kasaysayan at Sibika (HEKASI)",
  "Makabayan",
  "Science and Health",
  "Sibika at Kultura",
])).filter(Boolean).sort((left, right) => left.localeCompare(right));

const emptyRecord = (grade = "") => ({
  grade: String(grade),
  ...SCHOOL_DEFAULTS,
  section: "",
  schoolYear: "",
  adviser: "",
  signature: "",
  subjects: subjectsForGrade(grade),
  generalAverage: "",
  remedialFrom: "",
  remedialTo: "",
  remedial: Array.from({ length: 2 }, () => ({ area: "", final: "", mark: "", recomputed: "", remarks: "" })),
});

const emptyCertification = () => ({ schoolName: SCHOOL_DEFAULTS.school, schoolId: SCHOOL_DEFAULTS.schoolId, division: SCHOOL_DEFAULTS.division, lastSchoolYear: "", grade: "", date: "", principal: "" });

const initialForm = () => ({
  learnerId: "",
  lastName: "",
  firstName: "",
  extension: "",
  middleName: "",
  lrn: "",
  birthdate: "",
  sex: "",
  credential: "kinder_progress",
  enrollmentSchool: SCHOOL_DEFAULTS.school,
  enrollmentSchoolId: SCHOOL_DEFAULTS.schoolId,
  enrollmentAddress: "EAST SIDE BARANGAY, ISABELA CITY",
  otherCredential: "",
  peptRating: "",
  assessmentDate: "",
  testingCenter: "",
  otherRemark: "",
  // SF10-ES has eight scholastic-entry spaces. The first six are prepared for
  // Grades 1-6; the two remaining spaces cover transfers or repeated grades.
  records: Array.from(
    { length: SCHOLASTIC_RECORD_SLOTS },
    (_, index) => emptyRecord(index < ELEMENTARY_GRADES.length ? index + 1 : ""),
  ),
  certifications: Array.from({ length: 3 }, emptyCertification),
});

const EDITOR_TABS = ["Learner", "Enrollment", "Scholastic Records", "Certification"];

const formDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
};

const separateMiddleInitial = (firstName, middleName) => {
  const currentFirstName = String(firstName || "").trim();
  const currentMiddleName = String(middleName || "").trim();
  if (currentMiddleName) {
    return { firstName: currentFirstName, middleName: currentMiddleName };
  }

  const match = currentFirstName.match(/^(.*?)\s+([A-Z])\.?$/i);
  return match
    ? { firstName: match[1].trim(), middleName: `${match[2].toUpperCase()}.` }
    : { firstName: currentFirstName, middleName: "" };
};

const normalizeFormData = (savedData, learnerId) => {
  const base = initialForm();
  const saved = savedData && typeof savedData === "object" ? savedData : {};
  const names = separateMiddleInitial(saved.firstName, saved.middleName);
  const savedRecords = Array.isArray(saved.records) ? saved.records : [];
  const savedCertifications = Array.isArray(saved.certifications) ? saved.certifications : [];

  return {
    ...base,
    ...saved,
    ...names,
    learnerId,
    records: base.records.map((fallback, index) => {
      const record = savedRecords[index];
      if (!record || typeof record !== "object") return fallback;
      const savedGrade = String(record.grade || "");
      return {
        ...fallback,
        ...record,
        // Older drafts incorrectly labelled the final two entry spaces as
        // Grades 7 and 8. SF10-ES is an elementary Grades 1-6 record.
        grade: ELEMENTARY_GRADES.includes(savedGrade) ? savedGrade : fallback.grade,
        subjects: Array.isArray(record.subjects) ? record.subjects : fallback.subjects,
        remedial: Array.isArray(record.remedial) ? record.remedial : fallback.remedial,
      };
    }),
    certifications: base.certifications.map((fallback, index) => ({
      ...fallback,
      ...(savedCertifications[index] || {}),
    })),
  };
};

const fillFormFromLearner = (savedData, learner, profile) => {
  const normalized = normalizeFormData(savedData, String(learner.id));
  const names = separateMiddleInitial(learner.first_name, learner.middle_name);
  const rawLrn = String(learnerLrn(learner));
  const gradeNumber = Number(
    String(learner.grade_level || learner.grade || "").match(/\d+/)?.[0],
  );
  const adviserName = String(
    learner.adviser_name ||
      [profile?.first_name, profile?.family_name].filter(Boolean).join(" "),
  ).toUpperCase();
  const currentGradeIndex = normalized.records.findIndex(
    (record) => Number(String(record.grade).match(/\d+/)?.[0]) === gradeNumber,
  );
  const targetRecordIndex = currentGradeIndex >= 0
    ? currentGradeIndex
    : gradeNumber >= 1 && gradeNumber <= 6
      ? gradeNumber - 1
      : -1;

  return {
    ...normalized,
    // These are canonical students columns shared with Enrollment/Advisory.
    lastName: learner.family_name || normalized.lastName,
    firstName: names.firstName || normalized.firstName,
    middleName: names.middleName || normalized.middleName,
    extension: learner.suffix || learner.name_suffix || normalized.extension,
    lrn: /^\d{12,13}$/.test(rawLrn) ? rawLrn : normalized.lrn,
    birthdate: learner.birthdate
      ? String(learner.birthdate).slice(0, 10)
      : normalized.birthdate,
    sex: learnerGenderLabel(learner).toUpperCase() || normalized.sex,
    enrollmentSchool:
      learner.school_name || normalized.enrollmentSchool || SCHOOL_DEFAULTS.school,
    enrollmentSchoolId:
      String(learner.school_id || normalized.enrollmentSchoolId || SCHOOL_DEFAULTS.schoolId),
    enrollmentAddress: learner.address || normalized.enrollmentAddress,
    records: normalized.records.map((record, index) => {
      if (index !== targetRecordIndex) return record;
      return {
        ...record,
        school: learner.school_name || record.school || SCHOOL_DEFAULTS.school,
        schoolId: String(learner.school_id || record.schoolId || SCHOOL_DEFAULTS.schoolId),
        section: learner.section || record.section || "",
        schoolYear: learner.school_year || record.schoolYear || CURRENT_SCHOOL_YEAR,
        adviser: adviserName || record.adviser,
      };
    }),
    certifications: normalized.certifications.map((certification) => ({
      ...certification,
      schoolName:
        learner.school_name || certification.schoolName || SCHOOL_DEFAULTS.school,
      schoolId: String(
        learner.school_id || certification.schoolId || SCHOOL_DEFAULTS.schoolId,
      ),
      division: certification.division || SCHOOL_DEFAULTS.division,
      principal: certification.principal || currentPrincipalName().toUpperCase(),
    })),
  };
};

const Input = ({ label, value, onChange, type = "text", className = "", readOnly = false }) => (
  <label className={`f137-field ${className}`}>
    <span>{label}</span>
    <input type={type} value={value} readOnly={readOnly || !navigator.onLine} onChange={(event) => onChange(event.target.value)} />
  </label>
);

const printedValue = (value) => <span className="f137-line-value">{value || "\u00a0"}</span>;

function RecordBlock({ record }) {
  return (
    <section className="f137-record">
      <div className="f137-record-meta">
        <div>School: {printedValue(record.school)}</div><div>School ID: {printedValue(record.schoolId)}</div>
        <div>District: {printedValue(record.district)} Division: {printedValue(record.division)}</div><div>Region: {printedValue(record.region)}</div>
        <div>Classified as Grade: {printedValue(record.grade)} &nbsp; Section: {printedValue(record.section)}</div><div>School Year: {printedValue(record.schoolYear)}</div>
        <div>Name of Adviser/Teacher: {printedValue(record.adviser)}</div><div>Signature: {printedValue(record.signature)}</div>
      </div>
      <table className="f137-grade-table">
        <thead><tr><th rowSpan="2">LEARNING AREAS</th><th colSpan="4">Quarterly Rating</th><th rowSpan="2">Final<br />Rating</th><th rowSpan="2">Remarks</th></tr><tr><th>1</th><th>2</th><th>3</th><th>4</th></tr></thead>
        <tbody>
          {record.subjects.map((subject, index) => (
            <tr key={`${subject.name}-${index}`} className={["Music", "Arts", "Physical Education", "Health", "Music and Arts", "Physical Education and Health"].includes(subject.name) ? "f137-subject-child" : ""}>
              <td>{subject.name || "\u00a0"}</td><td>{subject.q1}</td><td>{subject.q2}</td><td>{subject.q3}</td><td>{subject.q4}</td><td>{subject.final}</td><td>{subject.remarks}</td>
            </tr>
          ))}
          <tr className="f137-average"><td>General Average</td><td colSpan="4" /><td>{record.generalAverage}</td><td /></tr>
        </tbody>
      </table>
      <table className="f137-remedial">
        <thead><tr><th>Remedial Classes</th><th colSpan="2">Conducted from: {record.remedialFrom}</th><th colSpan="2">to {record.remedialTo}</th></tr><tr><th>Learning Areas</th><th>Final Rating</th><th>Remedial Class Mark</th><th>Recomputed Final Grade</th><th>Remarks</th></tr></thead>
        <tbody>{record.remedial.map((row, index) => <tr key={index}><td>{row.area}</td><td>{row.final}</td><td>{row.mark}</td><td>{row.recomputed}</td><td>{row.remarks}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function CertificationBlock({ form, item }) {
  return (
    <section className="f137-certification">
      <div className="f137-section-title">CERTIFICATION</div>
      <p><strong>I CERTIFY</strong> that this is a true record of {printedValue(`${form.firstName} ${form.middleName} ${form.lastName}`.trim())} with LRN {printedValue(form.lrn)} and that he/she is eligible for admission to Grade {printedValue(item.grade)}.</p>
      <p>School Name: {printedValue(item.schoolName)} School ID {printedValue(item.schoolId)} Division: {printedValue(item.division)} Last School Year Attended: {printedValue(item.lastSchoolYear)}</p>
      <div className="f137-cert-sign"><span>{printedValue(formDate(item.date))}<small>Date</small></span><span>{printedValue(item.principal)}<small>Signature of Principal/School Head over Printed Name</small></span><span><small>(Affix School Seal here)</small></span></div>
    </section>
  );
}

function FormPages({ form }) {
  return (
    <div className="f137-pages">
      <article className="f137-page">
        <header className="f137-form-header">
          <span className="f137-code">SF10-ES</span><img src={educationSeal} alt="Department of Education seal" />
          <div><p>Republic of the Philippines<br />Department of Education</p><h1>Learner Permanent Record for Elementary School (SF10-ES)</h1><em>(Formerly Form 137)</em></div>
          <img src={depedLogo} alt="DepEd" className="f137-deped-logo" />
        </header>
        <div className="f137-section-title">LEARNER'S PERSONAL INFORMATION</div>
        <div className="f137-personal-grid">
          <div>LAST NAME: {printedValue(form.lastName)}</div><div>FIRST NAME: {printedValue(form.firstName)}</div><div>NAME EXTN. (Jr.,II,III): {printedValue(form.extension)}</div><div>MIDDLE NAME: {printedValue(form.middleName)}</div>
          <div className="f137-span-2">Learner Reference Number (LRN): {printedValue(form.lrn)}</div><div>Birthdate (mm/dd/yyyy): {printedValue(formDate(form.birthdate))}</div><div>Sex: {printedValue(form.sex)}</div>
        </div>
        <div className="f137-section-title">ELIGIBILITY FOR ELEMENTARY SCHOOL ENROLLMENT</div>
        <div className="f137-enrollment-preview">
          <div>Credential Presented for Grade 1: <span>{form.credential === "kinder_progress" ? "\u2611" : "\u2610"} Kinder Progress Report</span><span>{form.credential === "eccd" ? "\u2611" : "\u2610"} ECCD Checklist</span><span>{form.credential === "kinder_certificate" ? "\u2611" : "\u2610"} Kindergarten Certificate of Completion</span></div>
          <div>Name of School: {printedValue(form.enrollmentSchool)} School ID: {printedValue(form.enrollmentSchoolId)} Address of School: {printedValue(form.enrollmentAddress)}</div>
          <div>Other Credential Presented: {printedValue(form.otherCredential)} PEPT Passer Rating: {printedValue(form.peptRating)} Date of Examination/Assessment: {printedValue(formDate(form.assessmentDate))}</div>
          <div>Name and Address of Testing Center: {printedValue(form.testingCenter)} Remark: {printedValue(form.otherRemark)}</div>
        </div>
        <div className="f137-section-title">SCHOLASTIC RECORD</div>
        <div className="f137-record-grid">{form.records.slice(0, 4).map((record, index) => <RecordBlock key={`front-${index}`} record={record} />)}</div>
        <span className="f137-revision">SFRT 2017</span>
      </article>
      <article className="f137-page f137-page-back">
        <div className="f137-back-top"><strong>SF10-ES</strong><span>Page 2 of ______</span></div>
        <div className="f137-section-title">SCHOLASTIC RECORD</div>
        <div className="f137-record-grid">{form.records.slice(4, 8).map((record, index) => <RecordBlock key={`back-${index}`} record={record} />)}</div>
        <strong className="f137-transfer-label">For Transfer Out / Elementary School Completer Only</strong>
        {form.certifications.map((item, index) => <CertificationBlock key={index} form={form} item={item} />)}
        <span className="f137-revision">SFRT Revised 2017</span>
      </article>
    </div>
  );
}

export function Form137({ profile }) {
  const { requestPrint } = usePrintPreview();
  const [form, setForm] = useState(initialForm);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editorTab, setEditorTab] = useState(EDITOR_TABS[0]);
  const [recordIndex, setRecordIndex] = useState(() => adviserRecordIndex(form.records, profile?.grade_level_assigned));
  const [certIndex, setCertIndex] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [learnerLoading, setLearnerLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const learnerRequest = useRef(0);
  useEffect(() => () => { learnerRequest.current += 1; }, []);
  const [showOutput, setShowOutput] = useState(false);
  const completedForm = useMemo(() => withForm137Remarks(form), [form]);

  useEffect(() => {
    // Select the assigned grade when changing learners, without interrupting manual navigation.
    setRecordIndex(adviserRecordIndex(form.records, profile?.grade_level_assigned));
  }, [profile?.id, profile?.grade_level_assigned, form.learnerId]);

  const draftKey = useMemo(() => `ieces:form137:${CURRENT_SCHOOL_YEAR}:${profile?.id || "user"}:${form.learnerId || "new"}`, [profile?.id, form.learnerId]);

  useEffect(() => {
    let active = true;
    loadAdvisoryRoster(profile).then((result) => {
      if (!active) return;
      const genderRank = (learner) => {
        const gender = learnerGenderLabel(learner);
        if (gender === "Male") return 0;
        if (gender === "Female") return 1;
        return 2;
      };
      const sortedStudents = [...(result.students || [])].sort(
        (left, right) =>
          genderRank(left) - genderRank(right) ||
          learnerDisplayName(left).localeCompare(learnerDisplayName(right)),
      );
      setStudents(sortedStudents);
      setLoading(false);
      if (result.error) setMessage(`Unable to load advisory learners: ${result.error.message}`);
    });
    return () => { active = false; };
  }, [profile]);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const selectLearner = async (learnerId) => {
    const requestId = ++learnerRequest.current;
    const learner = students.find((item) => String(item.id) === learnerId);
    if (!learner) { setForm(initialForm()); setLoadFailed(false); setLearnerLoading(false); setMessage(""); return; }
    setLearnerLoading(true);
    setLoadFailed(false);
    setMessage("Loading the learner's cumulative Form 137 record...");
    try {
    const { data: savedRecord, error: loadError } = await supabase.rpc(
      "get_current_student_form_137",
      { p_student_id: learnerId },
    );
    if (requestId !== learnerRequest.current) return;
    if (loadError && navigator.onLine) setLoadFailed(true);
    if (!loadError && savedRecord?.data) {
      setForm(fillFormFromLearner(savedRecord.data, learner, profile));
      setMessage("The learner's cumulative Form 137 record was loaded.");
      return;
    }

    // At the start of a new school year, carry forward the latest cumulative
    // permanent record instead of starting the learner again with a blank form.
    if (!loadError) {
      const { data: history, error: historyError } = await supabase.rpc(
        "get_student_form_137_history",
        { p_student_id: learnerId },
      );
      if (requestId !== learnerRequest.current) return;
      if (historyError) throw historyError;
      const latestEntry = Object.entries(history || {})
        .filter(([, entry]) => entry?.data)
        .sort(([left], [right]) => right.localeCompare(left))[0];
      if (latestEntry) {
        setForm(fillFormFromLearner(latestEntry[1].data, learner, profile));
        setMessage(`Cumulative Form 137 carried forward from SY ${latestEntry[0]}.`);
        return;
      }
    }

    let saved;
    try { saved = localStorage.getItem(
      `ieces:form137:${CURRENT_SCHOOL_YEAR}:${profile?.id || "user"}:${learnerId}`,
    ) || localStorage.getItem(`ieces:form137:${profile?.id || "user"}:${learnerId}`); }
    catch { /* Online records do not depend on offline storage. */ }
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setForm(fillFormFromLearner(draft, learner, profile));
        setMessage(loadError
          ? "Local backup loaded. Deploy the Form 137 SQL migration to enable database saving."
          : `Local backup for SY ${CURRENT_SCHOOL_YEAR} loaded.`);
        return;
      } catch { /* Use roster values below. */ }
    }
    setForm(fillFormFromLearner(initialForm(), learner, profile));
    setMessage(loadError
      ? "The saved record could not be loaded. Reload the learner after restoring the database connection before saving."
      : `New Form 137 started for SY ${CURRENT_SCHOOL_YEAR}.`);
    } catch (error) {
      if (requestId === learnerRequest.current) { setForm(fillFormFromLearner(initialForm(), learner, profile)); setLoadFailed(true); setMessage(`Could not load Form 137: ${error.message}. Saving is blocked to protect the existing record.`); }
    } finally {
      if (requestId === learnerRequest.current) setLearnerLoading(false);
    }
  };

  const updateRecord = (field, value) => setForm((current) => ({ ...current, records: current.records.map((record, index) => index === recordIndex ? { ...record, [field]: value } : record) }));
  const updateRecordGrade = (grade) => setForm((current) => ({
    ...current,
    records: current.records.map((record, index) => index === recordIndex
      ? {
          ...record,
          grade,
          subjects: subjectsForGrade(grade, record.subjects),
        }
      : record),
  }));
  const updateSubject = (subjectIndex, field, value) => setForm((current) => ({ ...current, records: current.records.map((record, index) => index === recordIndex ? { ...record, subjects: record.subjects.map((subject, rowIndex) => rowIndex === subjectIndex ? { ...subject, [field]: value } : subject) } : record) }));
  const updateRemedial = (rowIndex, field, value) => setForm((current) => ({ ...current, records: current.records.map((record, index) => index === recordIndex ? { ...record, remedial: record.remedial.map((row, indexOfRow) => indexOfRow === rowIndex ? { ...row, [field]: value } : row) } : record) }));
  const updateCertification = (field, value) => setForm((current) => ({ ...current, certifications: current.certifications.map((item, index) => index === certIndex ? { ...item, [field]: value } : item) }));

  const saveDraft = async () => {
    if (learnerLoading || loadFailed || !navigator.onLine) {
      setMessage('Load the learner successfully while online before saving.');
      return;
    }
    if (!form.learnerId) {
      setMessage("Select a learner before saving Form 137.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
    const { data, error } = await supabase.rpc("save_current_student_form_137", {
      p_student_id: form.learnerId,
      p_form_data: completedForm,
    });
    if (error) throw error;
    if (!data?.data) throw new Error('The server did not confirm that the record was saved.');
      let backupAvailable = true;
      try { localStorage.setItem(draftKey, JSON.stringify(completedForm)); }
      catch { backupAvailable = false; }
      window.dispatchEvent(
        new CustomEvent("ieces:students-updated", {
          detail: {
            updates: [
              {
                id: form.learnerId,
                first_name: form.firstName,
                middle_name: form.middleName,
                family_name: form.lastName,
              },
            ],
          },
        }),
      );
      setMessage(`Cumulative Form 137 saved to Supabase, including its Grades 1-6 history (snapshot: SY ${CURRENT_SCHOOL_YEAR}).${backupAvailable ? "" : " The offline backup could not be stored on this device."}`);
    } catch (error) { setMessage(`Form 137 was not saved: ${error.message}`); }
    finally { setSaving(false); }
  };

  const clearDraft = () => {
    learnerRequest.current += 1;
    try { localStorage.removeItem(draftKey); } catch { /* Clearing the editor does not depend on offline storage. */ }
    setLoadFailed(false);
    setLearnerLoading(false);
    setForm(initialForm());
    setMessage("Form cleared.");
  };

  const currentRecord = completedForm.records[recordIndex];
  const currentCert = form.certifications[certIndex];
  const changeZoom = (direction) => setPreviewZoom((current) => {
    const next = Math.round((current + direction * 0.1) * 10) / 10;
    return Math.min(1.5, Math.max(0.4, next));
  });

  const handlePreviewWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 1 : -1);
  };

  return (
    <div className="f137-root" data-print-paper="Legal" data-print-margin="0">
      <div className="f137-toolbar">
        <div><h2>Form 137</h2><p>SF10-ES cumulative elementary permanent record • Grades 1-6</p></div>
        <div className="f137-actions"><button type="button" title="Clear form" onClick={clearDraft} disabled={saving || learnerLoading}><RotateCcw size={16} /> Clear</button><button type="button" onClick={saveDraft} disabled={saving || learnerLoading || loadFailed || !form.learnerId || !navigator.onLine}><Save size={16} /> {saving ? "Saving..." : "Save Information"}</button><button type="button" className="primary" onClick={() => requestPrint()}><Printer size={16} /> Print</button></div>
      </div>
      {message && <div className="f137-message" role="status">{message}</div>}
      {loadFailed && <button type="button" onClick={() => selectLearner(form.learnerId)}>Reload saved record</button>}
      <div className="f137-view-switch" aria-label="Form 137 view">
        <button type="button" aria-pressed={!showOutput} onClick={() => setShowOutput(false)}>Enter information</button>
        <button type="button" aria-pressed={showOutput} onClick={() => setShowOutput(true)}>View Form 137</button>
      </div>
      {!showOutput && <details className="f137-curriculum-reference">
        <summary>DepEd learning areas: Kindergarten to Grade 6</summary>
        <p>Key Stage 1 includes Kindergarten to Grade 3. Key Stage 2 covers Grades 4–6. Kindergarten uses developmental assessment; its eligibility documents are entered under Enrollment, not as numeric SF10 grades.</p>
        <div>{CURRICULUM_GROUPS.map((group) => <section key={group.label}><h3>{group.label}</h3><ul>{group.areas.map((area) => <li key={area}>{area}</li>)}</ul></section>)}</div>
        <p>MAPEH includes Music and Arts, and Physical Education and Health. Legacy subjects remain available for historical records.</p>
      </details>}
      <section className="f137-editor" hidden={showOutput}>
        <div className="f137-editor-tabs">{EDITOR_TABS.map((tab) => <button key={tab} type="button" aria-pressed={editorTab === tab} className={editorTab === tab ? "active" : ""} onClick={() => setEditorTab(tab)}>{tab}</button>)}</div>
        <fieldset className="f137-editor-fields" disabled={saving || learnerLoading || loadFailed}>
        {editorTab === "Learner" && <div className="f137-input-grid">
          <label className="f137-field f137-wide"><span>Advisory learner</span><select value={form.learnerId} disabled={loading || learnerLoading || saving} onChange={(event) => selectLearner(event.target.value)}><option value="">{loading ? "Loading learners..." : "Select a learner"}</option>{students.map((student) => <option key={student.id} value={String(student.id)}>{learnerDisplayName(student)} - {learnerLrn(student)}</option>)}</select></label>
          <Input label="Last name" value={form.lastName} onChange={(value) => updateField("lastName", value.toUpperCase())} /><Input label="First name" value={form.firstName} onChange={(value) => updateField("firstName", value.toUpperCase())} /><Input label="Middle name" value={form.middleName} onChange={(value) => updateField("middleName", value.toUpperCase())} /><Input label="Name extension" value={form.extension} onChange={(value) => updateField("extension", value.toUpperCase())} />
          <Input label="LRN" value={form.lrn} onChange={(value) => updateField("lrn", value.replace(/\D/g, "").slice(0, 13))} /><Input label="Birthdate" type="date" value={form.birthdate} onChange={(value) => updateField("birthdate", value)} />
          <label className="f137-field"><span>Sex</span><select disabled={!navigator.onLine} value={form.sex} onChange={(event) => updateField("sex", event.target.value)}><option value="">Select</option><option>MALE</option><option>FEMALE</option></select></label>
        </div>}
        {editorTab === "Enrollment" && <div className="f137-input-grid">
          <label className="f137-field f137-wide"><span>Credential presented</span><select disabled={!navigator.onLine} value={form.credential} onChange={(event) => updateField("credential", event.target.value)}><option value="kinder_progress">Kinder Progress Report</option><option value="eccd">ECCD Checklist</option><option value="kinder_certificate">Kindergarten Certificate of Completion</option><option value="other">Other credential</option></select></label>
          <Input label="Name of school" value={form.enrollmentSchool} onChange={(value) => updateField("enrollmentSchool", value)} /><Input label="School ID" value={form.enrollmentSchoolId} onChange={(value) => updateField("enrollmentSchoolId", value)} /><Input className="f137-wide" label="School address" value={form.enrollmentAddress} onChange={(value) => updateField("enrollmentAddress", value)} />
          <Input label="Other credential" value={form.otherCredential} onChange={(value) => updateField("otherCredential", value)} /><Input label="PEPT rating" value={form.peptRating} onChange={(value) => updateField("peptRating", value)} /><Input label="Assessment date" type="date" value={form.assessmentDate} onChange={(value) => updateField("assessmentDate", value)} /><Input label="Testing center" value={form.testingCenter} onChange={(value) => updateField("testingCenter", value)} /><Input label="Remark" value={form.otherRemark} onChange={(value) => updateField("otherRemark", value)} />
        </div>}
        {editorTab === "Scholastic Records" && <>
          <div className="f137-record-note"><strong>How this section works:</strong> Kindergarten is documented under Enrollment Eligibility above. Enter final academic records for Grades 1-6 here. The extra entry spaces are for transfers or repeated grade levels.</div>
          <div className="f137-record-selector"><button type="button" title="Previous scholastic record" onClick={() => setRecordIndex((index) => Math.max(0, index - 1))} disabled={recordIndex === 0}><ChevronLeft size={16} /></button><strong>Record {recordIndex + 1} of {form.records.length}{currentRecord.grade ? ` • Grade ${currentRecord.grade}` : " • Additional entry"}</strong><button type="button" title="Next scholastic record" onClick={() => setRecordIndex((index) => Math.min(form.records.length - 1, index + 1))} disabled={recordIndex === form.records.length - 1}><ChevronRight size={16} /></button></div>
          <div className="f137-input-grid f137-record-fields"><label className="f137-field"><span>Classified as grade</span><select disabled={!navigator.onLine} value={currentRecord.grade} onChange={(event) => updateRecordGrade(event.target.value)}><option value="">Select grade</option>{ELEMENTARY_GRADES.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label><Input label="School" value={currentRecord.school} onChange={(value) => updateRecord("school", value)} /><Input label="School ID" value={currentRecord.schoolId} onChange={(value) => updateRecord("schoolId", value)} /><Input label="District" value={currentRecord.district} onChange={(value) => updateRecord("district", value)} /><Input label="Division" value={currentRecord.division} onChange={(value) => updateRecord("division", value)} /><Input label="Region" value={currentRecord.region} onChange={(value) => updateRecord("region", value)} /><Input label="Section" value={currentRecord.section} onChange={(value) => updateRecord("section", value)} /><Input label="School year" value={currentRecord.schoolYear} onChange={(value) => updateRecord("schoolYear", value)} /><Input label="Adviser/teacher" value={currentRecord.adviser} onChange={(value) => updateRecord("adviser", value)} /></div>
          <p className="f137-subject-help">Select a learning area from the list or type the exact subject name used in the learner's curriculum.</p>
          <div className="f137-learning-area-actions">
            <button type="button" disabled={!currentRecord.grade || !navigator.onLine} onClick={() => updateRecord("subjects", subjectsForGrade(currentRecord.grade, currentRecord.subjects))}>Use current learning areas</button>
            <button type="button" disabled={!navigator.onLine} onClick={() => updateRecord("subjects", [...currentRecord.subjects, emptySubject("")])}>Add learning area</button>
          </div>
          <datalist id="f137-subject-options">{SUBJECT_OPTIONS.map((subject) => <option key={subject} value={subject} />)}</datalist>
          <Form137Grades key={`${recordIndex}-${currentRecord.grade}`} subjects={currentRecord.subjects} onChange={updateSubject} />
          <div className="f137-input-grid f137-record-footer"><Input label="General average" value={currentRecord.generalAverage} onChange={(value) => updateRecord("generalAverage", value)} /><Input label="Remedial conducted from" type="date" value={currentRecord.remedialFrom} onChange={(value) => updateRecord("remedialFrom", value)} /><Input label="To" type="date" value={currentRecord.remedialTo} onChange={(value) => updateRecord("remedialTo", value)} /></div>
          <div className="f137-remedial-cards">{currentRecord.remedial.map((row, index) => <fieldset key={index} className="f137-remedial-card"><legend>Remedial class {index + 1}</legend><div className="f137-input-grid">{[["area", "Learning area"], ["final", "Final rating"], ["mark", "Remedial mark"], ["recomputed", "Recomputed grade"], ["remarks", "Remarks"]].map(([field, label]) => <Input key={field} label={label} value={row[field]} readOnly={field === "remarks"} onChange={(value) => updateRemedial(index, field, value)} />)}</div></fieldset>)}</div>
        </>}
        {editorTab === "Certification" && <>
          <div className="f137-record-selector"><button type="button" title="Previous certification" onClick={() => setCertIndex((index) => Math.max(0, index - 1))} disabled={certIndex === 0}><ChevronLeft size={16} /></button><strong>Certification {certIndex + 1}</strong><button type="button" title="Next certification" onClick={() => setCertIndex((index) => Math.min(2, index + 1))} disabled={certIndex === 2}><ChevronRight size={16} /></button></div>
          <div className="f137-input-grid"><Input label="Eligible for Grade" value={currentCert.grade} onChange={(value) => updateCertification("grade", value)} /><Input label="School name" value={currentCert.schoolName} onChange={(value) => updateCertification("schoolName", value)} /><Input label="School ID" value={currentCert.schoolId} onChange={(value) => updateCertification("schoolId", value)} /><Input label="Division" value={currentCert.division} onChange={(value) => updateCertification("division", value)} /><Input label="Last school year attended" value={currentCert.lastSchoolYear} onChange={(value) => updateCertification("lastSchoolYear", value)} /><Input label="Date" type="date" value={currentCert.date} onChange={(value) => updateCertification("date", value)} /><Input className="f137-wide" label="Principal/School Head" value={currentCert.principal} onChange={(value) => updateCertification("principal", value)} /></div>
        </>}
        </fieldset>
      </section>
      <div className="f137-output" hidden={!showOutput}>
      <div className="f137-preview-heading">
        <div><h3>Form 137 output</h3><span>Read-only · Legal size, portrait · 2 pages</span></div>
        <div className="f137-zoom-controls" aria-label="Preview zoom controls">
          <button type="button" title="Zoom out" onClick={() => changeZoom(-1)} disabled={previewZoom <= 0.4}><Minus size={15} /></button>
          <button type="button" className="f137-zoom-value" title="Reset zoom" onClick={() => setPreviewZoom(1)}>{Math.round(previewZoom * 100)}%</button>
          <button type="button" title="Zoom in" onClick={() => changeZoom(1)} disabled={previewZoom >= 1.5}><Plus size={15} /></button>
        </div>
      </div>
      <div className="f137-preview-scroll" onWheel={handlePreviewWheel}>
        <div className="f137-zoom-stage" style={{ zoom: previewZoom }}><FormPages form={completedForm} /></div>
      </div>
      </div>
    </div>
  );
}
