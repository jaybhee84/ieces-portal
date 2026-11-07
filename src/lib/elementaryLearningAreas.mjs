// MATATAG: DO 010, s. 2024; Kindergarten Curriculum Guide, pp. 7–8.
// https://www.deped.gov.ph/wp-content/uploads/MATATAG-Kindergarten-CG.pdf
export const GMRC = 'Good Manners and Right Conduct (GMRC)';
export const KINDERGARTEN_DOMAINS = [
  'Literacy, Language, and Communication',
  'Socio-Emotional Development',
  'Values Development',
  'Physical Health and Motor Development',
  'Aesthetic/Creative Development',
  'Cognitive Development',
];
export const GRADE_ONE_SUBJECTS = ['Language', 'Reading and Literacy', 'Mathematics', GMRC, 'Makabansa'];
export const GRADE_TWO_SUBJECTS = ['Filipino', 'English', 'Mathematics', GMRC, 'Makabansa'];
export const GRADE_THREE_SUBJECTS = ['Filipino', 'English', 'Mathematics', 'Science', GMRC, 'Makabansa'];
export const KEY_STAGE_TWO_SUBJECTS = [
  'Filipino', 'English', 'Mathematics', 'Science', 'Araling Panlipunan',
  'EPP / TLE', GMRC, 'MAPEH', 'Music and Arts', 'Physical Education and Health',
];
export const ALIVE_SUBJECTS = ['*Arabic Language', '*Islamic Values Education'];
export const CURRICULUM_GROUPS = [
  { label: 'Kindergarten · Key Stage 1 · Developmental domains', areas: KINDERGARTEN_DOMAINS },
  { label: 'Grade 1 · Key Stage 1', areas: GRADE_ONE_SUBJECTS },
  { label: 'Grade 2 · Key Stage 1', areas: GRADE_TWO_SUBJECTS },
  { label: 'Grade 3 · Key Stage 1', areas: GRADE_THREE_SUBJECTS },
  { label: 'Grades 4–6 · Key Stage 2 · Including MAPEH components', areas: KEY_STAGE_TWO_SUBJECTS },
  { label: 'ALIVE · Madrasah implementing schools only', areas: ALIVE_SUBJECTS },
];

export function learningAreasForGrade(grade) {
  const subjects = String(grade) === '1' ? GRADE_ONE_SUBJECTS
    : String(grade) === '2' ? GRADE_TWO_SUBJECTS
    : String(grade) === '3' ? GRADE_THREE_SUBJECTS
    : ['4', '5', '6'].includes(String(grade)) ? KEY_STAGE_TWO_SUBJECTS : [];
  return subjects.length ? [...subjects, ...ALIVE_SUBJECTS] : [''];
}

export const emptySubject = (name) => ({ name, q1: '', q2: '', q3: '', q4: '', final: '', remarks: '' });

export function subjectsForGrade(grade, existing = []) {
  const names = learningAreasForGrade(grade);
  const used = new Set();
  const subjects = names.map((name) => {
    const index = existing.findIndex((subject, i) => !used.has(i) && subject.name === name);
    if (index < 0) return emptySubject(name);
    used.add(index);
    return { ...existing[index] };
  });
  // A grade change must never relabel or discard previously entered scores.
  return [...subjects, ...existing.filter((subject, index) => !used.has(index) &&
    ['q1', 'q2', 'q3', 'q4', 'final', 'remarks'].some((key) => String(subject[key] ?? '').trim() !== ''))];
}
