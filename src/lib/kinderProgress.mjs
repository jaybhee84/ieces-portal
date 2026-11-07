// Competency groups from Annex E, DO 015, s. 2026 (printed pages 41–42).
// https://www.deped.gov.ph/wp-content/uploads/DO_s2026_015r.pdf
export const KINDER_RATINGS = { BG: 'Beginning', DV: 'Developing', CO: 'Consistent' };
const group = (id, title, skills) => ({ id, title, skills: skills.map((text, index) => ({ id: `${id}-${index + 1}`, text })) });
export const KINDER_COMPETENCIES = [
  group('motor', 'Sensory Perceptual and Motor Development', [
    'Identifies external body parts and their functions',
    'Identifies ways to care for and protect the body',
    'Demonstrates gross motor skills (locomotor and non-locomotor)',
    'Moves body parts as directed',
    'Demonstrates fine motor skills (tearing, cutting, rolling, molding with playdough)',
  ]),
  group('social', 'Socio-emotional Development', [
    'Identifies and expresses feelings in appropriate ways',
    'Recognizes and respects the feelings of others',
    'Expresses needs and preferences',
    'Behaves appropriately in different situations',
    'Participates in classroom routines and activities',
    'Follows classroom and school rules',
    'Fulfills classroom responsibilities',
  ]),
  group('cognitive', 'Cognitive Development', [
    'Identifies attributes of objects (color, shape, size)',
    'Matches objects based on attributes',
    'Describes objects based on attributes (shape, color, taste, texture)',
    'Classifies objects by a single attribute (color, shape, size)',
    'Reclassifies objects according to multiple attributes',
    'Arranges objects according to specific attributes',
    'Recognizes, extends, and creates patterns using concrete objects',
    'Measures size, length, capacity, and mass using non-standard measuring tools',
    'Identifies position of objects (in, on, over, under, top, bottom)',
    'Compares quantities of objects (more / less)',
    'Counts with one-to-one correspondence',
    'Recognizes numerals',
    'Matches numerals to objects',
    'Adds and subtracts using concrete objects',
    'Recognizes the clock as a measure of time (hours and minutes)',
    'Shows awareness and care for the natural and physical environment',
    'Talks about participation in cultural and religious activities',
    'Shows awareness of caring for the environment through simple practices (sorting trash, cleaning up)',
    'Predicts outcomes in familiar stories read aloud in class',
    'Suggests solutions to problems in class activities and stories read aloud',
  ]),
  group('language', 'Language, Literacy, and Communicative Development', [
    'Identifies familiar environmental sounds',
    'Recalls what happens first, middle, and end in a story',
    'Retells a story in sequence',
    'Follows one- to two-step instructions',
    'Recognizes non-decodable words in and out of context automatically',
    'Recognizes sight words',
    'Identifies first and last name',
    'Identifies classmates, teachers, and family members',
    'Identifies familiar objects at home, in school, and in the community',
    'Uses polite greetings and courteous expressions in various situations',
    'Retells personal experiences or story events',
    'Expresses ideas and feelings using phrases and simple sentences',
    'Orally segments sounds: syllable, onset and rime, and phoneme by phoneme',
    'Identifies uppercase letters',
    'Identifies lowercase letters',
    'Matches uppercase and lowercase letters',
    'Identifies letter sounds',
    'Matches letters and their corresponding sounds',
    'Uses a variety of strategies to gain meaning from leveled texts',
    'Uses print and illustrations to make meaning',
    'Demonstrates book-handling skills',
    'Distinguishes between letters, words, and sentences',
    'Demonstrates awareness of print (left to right and top to bottom)',
    'Traces, draws, or copies shapes, designs, and pictures',
    'Traces, copies, or writes names and words',
    'Writes uppercase and lowercase letters',
    'Spells sight words',
    'Spells simple words phonetically',
  ]),
];

export const KINDER_ATTENDANCE_MONTHS = [
  [1, 'June'], [1, 'July'], [1, 'August'], [1, 'September'],
  [2, 'September'], [2, 'October'], [2, 'November'], [2, 'December'],
  [3, 'January'], [3, 'February'], [3, 'March'], [3, 'April'],
];

export function newKinderCard(learner, schoolYear, adviser) {
  return {
    learnerId: String(learner.id), schoolYear, adviser,
    name: [learner.family_name, [learner.first_name, learner.middle_name, learner.suffix].filter(Boolean).join(' ')].filter(Boolean).join(', ') || learner.name || '',
    lrn: String(learner.lrn || ''), birthdate: String(learner.birthdate || '').slice(0, 10),
    section: learner.section || '', principal: '', ageBeginning: '', ageEnd: '',
    ratings: {}, comments: ['', '', ''],
    attendance: KINDER_ATTENDANCE_MONTHS.map(() => ({ days: '', present: '' })),
    certifyTransfer: false,
  };
}

export function absentDays(row) {
  if (row.days === '' || row.present === '') return '';
  return Number(row.days) - Number(row.present);
}

export function kinderAttendanceTotals(rows) {
  const sum = (values) => values.every((value) => value === '') ? '' : values.reduce((total, value) => total + Number(value || 0), 0);
  return { days: sum(rows.map((row) => row.days)), present: sum(rows.map((row) => row.present)), absent: sum(rows.map(absentDays)) };
}

export function validateKinderCard(card) {
  if (!card || typeof card !== 'object' || !card.ratings || typeof card.ratings !== 'object' || Array.isArray(card.ratings)
    || !Array.isArray(card.comments) || card.comments.length !== 3 || card.comments.some((text) => typeof text !== 'string' || text.length > 800)
    || !Array.isArray(card.attendance) || card.attendance.length !== KINDER_ATTENDANCE_MONTHS.length) return 'The saved Kindergarten card has an invalid format.';
  if (typeof card.learnerId !== 'string' || !card.learnerId || !/^\d{4}-\d{4}$/.test(card.schoolYear)
    || typeof card.certifyTransfer !== 'boolean') return 'A learner, school year, and valid transfer confirmation are required.';
  if (['name', 'lrn', 'birthdate', 'section', 'adviser', 'principal', 'ageBeginning', 'ageEnd'].some((key) => typeof card[key] !== 'string' || card[key].length > 250)) return 'Card details must be text of at most 250 characters.';
  const ids = new Set(KINDER_COMPETENCIES.flatMap((item) => item.skills.map((skill) => skill.id)));
  for (const [id, values] of Object.entries(card.ratings || {})) {
    if (!ids.has(id) || !Array.isArray(values) || values.length !== 3 || values.some((value) => value !== '' && !Object.hasOwn(KINDER_RATINGS, value))) return 'Use only BG, DV, or CO for the three term ratings.';
  }
  for (const row of card.attendance || []) {
    if (!row || typeof row !== 'object') return 'The attendance record has an invalid format.';
    for (const value of [row.days, row.present]) {
      if (value !== '' && (!/^\d+$/.test(String(value)) || Number(value) > 31)) return 'Attendance must be a whole number from 0 to 31.';
    }
    if (row.present !== '' && (row.days === '' || Number(row.present) > Number(row.days))) return 'Days present cannot exceed the number of class days.';
  }
  return '';
}

export async function saveKinderCard(client, card) {
  const error = validateKinderCard(card);
  if (error) throw new Error(error);
  const result = await client.rpc('save_current_kinder_progress', {
    p_student_id: card.learnerId, p_card: card,
  });
  if (result.error) throw result.error;
  if (!result.data?.data) throw new Error('The server did not confirm that the card was saved.');
  return result.data.data;
}
