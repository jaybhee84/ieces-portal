import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, Printer, RotateCcw, Save } from "lucide-react";
import { loadAdvisoryRoster } from "../lib/advisoryRosterData";
import { supabase } from "../lib/supabase";
import { learnerDisplayName, learnerGenderLabel, learnerLrn } from "../lib/learnerRoster";
import educationSeal from "../image/deped-education-seal.png";
import depedLogo from "../image/deped-logo.gif";
import "../styles/Form137.css";

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

const GRADE_ONE_SUBJECTS = [
  "Good Manners and Right Conduct (GMRC)",
  "Language",
  "Mathematics",
  "Reading and Literacy",
  "Makabansa",
  "",
  "",
  "",
  "",
  "*Arabic Language",
  "*Islamic Values Education",
];

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
  ...GRADE_ONE_SUBJECTS,
  ...REGULAR_SUBJECTS,
  "Character Education",
  "Civics and Culture",
  "Edukasyong Pantahanan at Pangkabuhayan (EPP)",
  "Heograpiya, Kasaysayan at Sibika (HEKASI)",
  "Makabayan",
  "Science and Health",
  "Sibika at Kultura",
])).filter(Boolean).sort((left, right) => left.localeCompare(right));

const emptySubject = (name) => ({ name, q1: "", q2: "", q3: "", q4: "", final: "", remarks: "" });

const emptyRecord = (grade = "") => ({
  grade: String(grade),
  ...SCHOOL_DEFAULTS,
  section: "",
  schoolYear: "",
  adviser: "",
  signature: "",
  subjects: (String(grade) === "1" ? GRADE_ONE_SUBJECTS : REGULAR_SUBJECTS).map(emptySubject),
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

const Input = ({ label, value, onChange, type = "text", className = "" }) => (
  <label className={`f137-field ${className}`}>
    <span>{label}</span>
    <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
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
            <tr key={`${subject.name}-${index}`} className={index >= 8 && index <= 11 && record.grade !== "1" ? "f137-subject-child" : ""}>
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
  const [form, setForm] = useState(initialForm);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editorTab, setEditorTab] = useState(EDITOR_TABS[0]);
  const [recordIndex, setRecordIndex] = useState(0);
  const [certIndex, setCertIndex] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1.5);
  const [saving, setSaving] = useState(false);

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
    const learner = students.find((item) => String(item.id) === learnerId);
    if (!learner) { setForm(initialForm()); setMessage(""); return; }
    setMessage("Loading the learner's cumulative Form 137 record...");

    const { data: savedRecord, error: loadError } = await supabase.rpc(
      "get_current_student_form_137",
      { p_student_id: learnerId },
    );
    if (!loadError && savedRecord?.data) {
      setForm(fillFormFromLearner(savedRecord.data, learner, profile));
      setMessage("The learner's cumulative Form 137 record was loaded.");
      return;
    }

    // At the start of a new school year, carry forward the latest cumulative
    // permanent record instead of starting the learner again with a blank form.
    if (!loadError) {
      const { data: history } = await supabase.rpc(
        "get_student_form_137_history",
        { p_student_id: learnerId },
      );
      const latestEntry = Object.entries(history || {})
        .filter(([, entry]) => entry?.data)
        .sort(([left], [right]) => right.localeCompare(left))[0];
      if (latestEntry) {
        setForm(fillFormFromLearner(latestEntry[1].data, learner, profile));
        setMessage(`Cumulative Form 137 carried forward from SY ${latestEntry[0]}.`);
        return;
      }
    }

    const saved = localStorage.getItem(
      `ieces:form137:${CURRENT_SCHOOL_YEAR}:${profile?.id || "user"}:${learnerId}`,
    ) || localStorage.getItem(`ieces:form137:${profile?.id || "user"}:${learnerId}`);
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
      ? "New form started. Deploy the Form 137 SQL migration to enable database saving."
      : `New Form 137 started for SY ${CURRENT_SCHOOL_YEAR}.`);
  };

  const updateRecord = (field, value) => setForm((current) => ({ ...current, records: current.records.map((record, index) => index === recordIndex ? { ...record, [field]: value } : record) }));
  const updateRecordGrade = (grade) => setForm((current) => ({
    ...current,
    records: current.records.map((record, index) => index === recordIndex
      ? {
          ...record,
          grade,
          subjects: (grade === "1" ? GRADE_ONE_SUBJECTS : REGULAR_SUBJECTS).map((name, subjectIndex) => ({
            ...emptySubject(name),
            ...(record.subjects?.[subjectIndex] || {}),
            name,
          })),
        }
      : record),
  }));
  const updateSubject = (subjectIndex, field, value) => setForm((current) => ({ ...current, records: current.records.map((record, index) => index === recordIndex ? { ...record, subjects: record.subjects.map((subject, rowIndex) => rowIndex === subjectIndex ? { ...subject, [field]: value } : subject) } : record) }));
  const updateRemedial = (rowIndex, field, value) => setForm((current) => ({ ...current, records: current.records.map((record, index) => index === recordIndex ? { ...record, remedial: record.remedial.map((row, indexOfRow) => indexOfRow === rowIndex ? { ...row, [field]: value } : row) } : record) }));
  const updateCertification = (field, value) => setForm((current) => ({ ...current, certifications: current.certifications.map((item, index) => index === certIndex ? { ...item, [field]: value } : item) }));

  const saveDraft = async () => {
    if (!form.learnerId) {
      setMessage("Select a learner before saving Form 137.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("save_current_student_form_137", {
      p_student_id: form.learnerId,
      p_form_data: form,
    });
    if (error) {
      setMessage(`Form 137 was not saved: ${error.message}`);
    } else {
      localStorage.setItem(draftKey, JSON.stringify(form));
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
      setMessage(`Cumulative Form 137 saved, including its Grades 1-6 history (snapshot: SY ${CURRENT_SCHOOL_YEAR}).`);
    }
    setSaving(false);
  };

  const clearDraft = () => {
    localStorage.removeItem(draftKey);
    setForm(initialForm());
    setMessage("Form cleared.");
  };

  const currentRecord = form.records[recordIndex];
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
    <div className="f137-root">
      <div className="f137-toolbar">
        <div><h2>Form 137</h2><p>SF10-ES cumulative elementary permanent record • Grades 1-6</p></div>
        <div className="f137-actions"><button type="button" title="Clear form" onClick={clearDraft} disabled={saving}><RotateCcw size={16} /> Clear</button><button type="button" onClick={saveDraft} disabled={saving || !form.learnerId}><Save size={16} /> {saving ? "Saving..." : "Save Information"}</button><button type="button" className="primary" onClick={() => window.print()}><Printer size={16} /> Print</button></div>
      </div>
      {message && <div className="f137-message">{message}</div>}
      <section className="f137-editor">
        <div className="f137-editor-tabs" role="tablist">{EDITOR_TABS.map((tab) => <button key={tab} type="button" className={editorTab === tab ? "active" : ""} onClick={() => setEditorTab(tab)}>{tab}</button>)}</div>
        {editorTab === "Learner" && <div className="f137-input-grid">
          <label className="f137-field f137-wide"><span>Advisory learner</span><select value={form.learnerId} disabled={loading} onChange={(event) => selectLearner(event.target.value)}><option value="">{loading ? "Loading learners..." : "Select a learner"}</option>{students.map((student) => <option key={student.id} value={String(student.id)}>{learnerDisplayName(student)} - {learnerLrn(student)}</option>)}</select></label>
          <Input label="Last name" value={form.lastName} onChange={(value) => updateField("lastName", value.toUpperCase())} /><Input label="First name" value={form.firstName} onChange={(value) => updateField("firstName", value.toUpperCase())} /><Input label="Middle name" value={form.middleName} onChange={(value) => updateField("middleName", value.toUpperCase())} /><Input label="Name extension" value={form.extension} onChange={(value) => updateField("extension", value.toUpperCase())} />
          <Input label="LRN" value={form.lrn} onChange={(value) => updateField("lrn", value.replace(/\D/g, "").slice(0, 13))} /><Input label="Birthdate" type="date" value={form.birthdate} onChange={(value) => updateField("birthdate", value)} />
          <label className="f137-field"><span>Sex</span><select value={form.sex} onChange={(event) => updateField("sex", event.target.value)}><option value="">Select</option><option>MALE</option><option>FEMALE</option></select></label>
        </div>}
        {editorTab === "Enrollment" && <div className="f137-input-grid">
          <label className="f137-field f137-wide"><span>Credential presented</span><select value={form.credential} onChange={(event) => updateField("credential", event.target.value)}><option value="kinder_progress">Kinder Progress Report</option><option value="eccd">ECCD Checklist</option><option value="kinder_certificate">Kindergarten Certificate of Completion</option><option value="other">Other credential</option></select></label>
          <Input label="Name of school" value={form.enrollmentSchool} onChange={(value) => updateField("enrollmentSchool", value)} /><Input label="School ID" value={form.enrollmentSchoolId} onChange={(value) => updateField("enrollmentSchoolId", value)} /><Input className="f137-wide" label="School address" value={form.enrollmentAddress} onChange={(value) => updateField("enrollmentAddress", value)} />
          <Input label="Other credential" value={form.otherCredential} onChange={(value) => updateField("otherCredential", value)} /><Input label="PEPT rating" value={form.peptRating} onChange={(value) => updateField("peptRating", value)} /><Input label="Assessment date" type="date" value={form.assessmentDate} onChange={(value) => updateField("assessmentDate", value)} /><Input label="Testing center" value={form.testingCenter} onChange={(value) => updateField("testingCenter", value)} /><Input label="Remark" value={form.otherRemark} onChange={(value) => updateField("otherRemark", value)} />
        </div>}
        {editorTab === "Scholastic Records" && <>
          <div className="f137-record-note"><strong>How this section works:</strong> Kindergarten is documented under Enrollment Eligibility above. Enter final academic records for Grades 1-6 here. The extra entry spaces are for transfers or repeated grade levels.</div>
          <div className="f137-record-selector"><button type="button" title="Previous scholastic record" onClick={() => setRecordIndex((index) => Math.max(0, index - 1))} disabled={recordIndex === 0}><ChevronLeft size={16} /></button><strong>Record {recordIndex + 1} of {form.records.length}{currentRecord.grade ? ` • Grade ${currentRecord.grade}` : " • Additional entry"}</strong><button type="button" title="Next scholastic record" onClick={() => setRecordIndex((index) => Math.min(form.records.length - 1, index + 1))} disabled={recordIndex === form.records.length - 1}><ChevronRight size={16} /></button></div>
          <div className="f137-input-grid f137-record-fields"><label className="f137-field"><span>Classified as grade</span><select value={currentRecord.grade} onChange={(event) => updateRecordGrade(event.target.value)}><option value="">Select grade</option>{ELEMENTARY_GRADES.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label><Input label="School" value={currentRecord.school} onChange={(value) => updateRecord("school", value)} /><Input label="School ID" value={currentRecord.schoolId} onChange={(value) => updateRecord("schoolId", value)} /><Input label="District" value={currentRecord.district} onChange={(value) => updateRecord("district", value)} /><Input label="Division" value={currentRecord.division} onChange={(value) => updateRecord("division", value)} /><Input label="Region" value={currentRecord.region} onChange={(value) => updateRecord("region", value)} /><Input label="Section" value={currentRecord.section} onChange={(value) => updateRecord("section", value)} /><Input label="School year" value={currentRecord.schoolYear} onChange={(value) => updateRecord("schoolYear", value)} /><Input label="Adviser/teacher" value={currentRecord.adviser} onChange={(value) => updateRecord("adviser", value)} /></div>
          <p className="f137-subject-help">Select a learning area from the list or type the exact subject name used in the learner's curriculum.</p>
          <datalist id="f137-subject-options">{SUBJECT_OPTIONS.map((subject) => <option key={subject} value={subject} />)}</datalist>
          <div className="f137-grade-entry-wrap"><table className="f137-grade-entry"><thead><tr><th>Learning area</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Final</th><th>Remarks</th></tr></thead><tbody>{currentRecord.subjects.map((subject, index) => <tr key={index}><td><input list="f137-subject-options" value={subject.name} placeholder="Select or type a subject" aria-label={`Learning area ${index + 1}`} onChange={(event) => updateSubject(index, "name", event.target.value)} /></td>{["q1", "q2", "q3", "q4", "final"].map((field) => <td key={field}><input inputMode="numeric" value={subject[field]} aria-label={`${subject.name || `Row ${index + 1}`} ${field}`} onChange={(event) => updateSubject(index, field, event.target.value.replace(/[^0-9.]/g, "").slice(0, 5))} /></td>)}<td><input value={subject.remarks} aria-label={`${subject.name || `Row ${index + 1}`} remarks`} onChange={(event) => updateSubject(index, "remarks", event.target.value)} /></td></tr>)}</tbody></table></div>
          <div className="f137-input-grid f137-record-footer"><Input label="General average" value={currentRecord.generalAverage} onChange={(value) => updateRecord("generalAverage", value)} /><Input label="Remedial conducted from" type="date" value={currentRecord.remedialFrom} onChange={(value) => updateRecord("remedialFrom", value)} /><Input label="To" type="date" value={currentRecord.remedialTo} onChange={(value) => updateRecord("remedialTo", value)} /></div>
          <div className="f137-grade-entry-wrap f137-remedial-entry"><table className="f137-grade-entry"><thead><tr><th>Remedial learning area</th><th>Final rating</th><th>Remedial mark</th><th>Recomputed grade</th><th>Remarks</th></tr></thead><tbody>{currentRecord.remedial.map((row, index) => <tr key={index}>{["area", "final", "mark", "recomputed", "remarks"].map((field) => <td key={field}><input value={row[field]} aria-label={`Remedial row ${index + 1} ${field}`} onChange={(event) => updateRemedial(index, field, event.target.value)} /></td>)}</tr>)}</tbody></table></div>
        </>}
        {editorTab === "Certification" && <>
          <div className="f137-record-selector"><button type="button" title="Previous certification" onClick={() => setCertIndex((index) => Math.max(0, index - 1))} disabled={certIndex === 0}><ChevronLeft size={16} /></button><strong>Certification {certIndex + 1}</strong><button type="button" title="Next certification" onClick={() => setCertIndex((index) => Math.min(2, index + 1))} disabled={certIndex === 2}><ChevronRight size={16} /></button></div>
          <div className="f137-input-grid"><Input label="Eligible for Grade" value={currentCert.grade} onChange={(value) => updateCertification("grade", value)} /><Input label="School name" value={currentCert.schoolName} onChange={(value) => updateCertification("schoolName", value)} /><Input label="School ID" value={currentCert.schoolId} onChange={(value) => updateCertification("schoolId", value)} /><Input label="Division" value={currentCert.division} onChange={(value) => updateCertification("division", value)} /><Input label="Last school year attended" value={currentCert.lastSchoolYear} onChange={(value) => updateCertification("lastSchoolYear", value)} /><Input label="Date" type="date" value={currentCert.date} onChange={(value) => updateCertification("date", value)} /><Input className="f137-wide" label="Principal/School Head" value={currentCert.principal} onChange={(value) => updateCertification("principal", value)} /></div>
        </>}
      </section>
      <div className="f137-preview-heading">
        <div><h3>Form Preview</h3><span>Legal size, portrait - 2 pages</span></div>
        <div className="f137-zoom-controls" aria-label="Preview zoom controls">
          <button type="button" title="Zoom out" onClick={() => changeZoom(-1)} disabled={previewZoom <= 0.4}><Minus size={15} /></button>
          <button type="button" className="f137-zoom-value" title="Reset zoom" onClick={() => setPreviewZoom(1.5)}>{Math.round(previewZoom * 100)}%</button>
          <button type="button" title="Zoom in" onClick={() => changeZoom(1)} disabled={previewZoom >= 1.5}><Plus size={15} /></button>
        </div>
      </div>
      <div className="f137-preview-scroll" onWheel={handlePreviewWheel}>
        <div className="f137-zoom-stage" style={{ zoom: previewZoom }}><FormPages form={form} /></div>
      </div>
    </div>
  );
}
