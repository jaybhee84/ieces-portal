// Numeric SF10 learning-area remarks: DepEd Order 8, s. 2015, Table 10.
// https://www.deped.gov.ph/wp-content/uploads/2015/04/DO_s2015_08.pdf
export function gradeRemark(value) {
  if (value == null || String(value).trim() === '') return '';
  const grade = Number(value);
  if (!Number.isFinite(grade) || grade < 60 || grade > 100) return '';
  return grade >= 75 ? 'Passed' : 'Failed';
}

export function withForm137Remarks(form) {
  return {
    ...form,
    records: form.records.map((record) => ({
      ...record,
      subjects: record.subjects.map((subject) => ({ ...subject, remarks: gradeRemark(subject.final) })),
      remedial: record.remedial.map((row) => ({ ...row, remarks: gradeRemark(row.recomputed) })),
    })),
  };
}
