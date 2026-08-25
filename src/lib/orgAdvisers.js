const normalizedText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

const nameTokens = (value) =>
  normalizedText(value)
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1);

const normalizedName = (value) => normalizedText(value).replace(/[^A-Z0-9]/g, "");

const middleInitial = (value) => {
  const middle = String(value || "").trim();
  return middle ? `${middle.charAt(0).toUpperCase()}.` : "";
};

export const adviserGradeKey = (value) => {
  const grade = normalizedText(value);
  if (grade === "0" || grade.startsWith("KINDER")) return "0";
  if (grade.startsWith("SNED") || grade.startsWith("SPED")) return "SNED";
  const numericGrade = grade.match(/(?:^|\b)([1-6])(?:\b|$)/)?.[1];
  if (numericGrade) return numericGrade;

  const romanGrade = grade.match(/(?:^|\b)(VI|IV|V|III|II|I)(?:\b|$)/)?.[1];
  if (romanGrade) {
    return String({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 }[romanGrade]);
  }

  return grade;
};

export const orgAdviserName = (adviser) =>
  [
    adviser?.first_name,
    middleInitial(adviser?.middle_name),
    adviser?.family_name,
  ]
    .filter(Boolean)
    .join(" ") || adviser?.name || "Unnamed adviser";

export const profileName = (profile) =>
  [
    profile?.first_name,
    profile?.middle_name || profile?.middle_initial,
    profile?.family_name,
  ]
    .filter(Boolean)
    .join(" ") || profile?.full_name || profile?.name || "";

export const namesLikelyMatch = (left, right) => {
  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;
  if (leftTokens.join("") === rightTokens.join("")) return true;

  const smaller = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const larger = leftTokens.length <= rightTokens.length ? rightTokens : leftTokens;
  return smaller.length >= 2 && smaller.every((token) => larger.includes(token));
};

export const isOrgAdviser = (person) => {
  const category = normalizedText(person?.category);
  const teachingType = normalizedText(person?.teaching_type);
  return (
    category === "TEACHING" &&
    (teachingType === "ADVISER" || Boolean(person?.is_grade_chairman))
  );
};

export const findOrgAdviserForProfile = (profile, orgAdvisers) => {
  if (!profile) return null;
  const targetGrade = adviserGradeKey(profile.grade_level_assigned);
  const targetName = profileName(profile);

  return (
    orgAdvisers.find(
      (adviser) =>
        (!targetGrade || adviserGradeKey(adviser.grade_level) === targetGrade) &&
        namesLikelyMatch(targetName, orgAdviserName(adviser)),
    ) ||
    orgAdvisers.find((adviser) =>
      namesLikelyMatch(targetName, orgAdviserName(adviser)),
    ) ||
    null
  );
};

export const legacyProfileIdsForOrgAdviser = (adviser, profiles) =>
  profiles
    .filter((profile) =>
      namesLikelyMatch(orgAdviserName(adviser), profileName(profile)),
    )
    .map((profile) => String(profile.id));

const learnerGradeKey = (learner) =>
  adviserGradeKey(
    learner?.grade_level || learner?.grade || learner?.gradeLevel || learner?.section,
  );

const teacherNameFromSection = (learner) => {
  const explicitTeacher =
    learner?.adviser_name ||
    learner?.teacher_name ||
    learner?.class_adviser ||
    learner?.teacher ||
    learner?.adviser;
  if (explicitTeacher && typeof explicitTeacher === "object") {
    return (
      explicitTeacher.family_name ||
      explicitTeacher.full_name ||
      explicitTeacher.name ||
      ""
    );
  }
  if (explicitTeacher) return String(explicitTeacher).trim();

  const section = String(learner?.section || "").trim();
  if (!section) return "";

  const kinder = section.match(
    /^KINDER(?:GARTEN)?\s*[-–—]\s*(.+?)(?:\s*[-–—]\s*(?:MORNING|AFTERNOON))?$/i,
  );
  if (kinder) return kinder[1].trim();

  const graded = section.match(
    /^(?:GRADE\s*(?:[1-6]|VI|IV|V|III|II|I)|SNED|SPED)\s*[-–—]\s*(.+)$/i,
  );
  return graded?.[1]?.trim() || "";
};

export const learnerBelongsToOrgAdviser = (
  learner,
  adviser,
  legacyIds = [],
) => {
  if (!learner || !adviser) return false;

  const assignmentIds = new Set([
    String(adviser.id),
    ...legacyIds.map(String),
  ]);
  if (
    learner.adviser_id &&
    assignmentIds.has(String(learner.adviser_id))
  ) {
    return true;
  }

  const adviserGrade = adviserGradeKey(adviser.grade_level);
  if (learnerGradeKey(learner) !== adviserGrade) return false;

  const sectionTeacher = teacherNameFromSection(learner);
  if (sectionTeacher) {
    return (
      normalizedName(sectionTeacher) === normalizedName(adviser.family_name) ||
      namesLikelyMatch(sectionTeacher, orgAdviserName(adviser))
    );
  }

  const adviserSection = normalizedName(
    adviser.section || adviser.section_assigned,
  );
  return (
    !learner.adviser_id &&
    Boolean(adviserSection) &&
    normalizedName(learner.section || learner.section_assigned) === adviserSection
  );
};
