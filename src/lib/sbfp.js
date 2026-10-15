// School-Based Feeding Program (SBFP) beneficiaries.
//
// The SDO sets who qualifies in the BMI app, which saves it to Supabase
// (table sbfp_config, row id "official"). This reads that same row and applies
// the same rule as the BMI app's isOfficialBeneficiary(), so both apps agree:
//   - every learner in a grade listed in `grades` qualifies, or
//   - a learner whose BMI-for-age or Height-for-age status is in `criteria`
//     qualifies, limited to the grades in criterionGradeRestrictions[status]
//     when that status has a restriction.
// As in the BMI app, the school year's Baseline weighing decides the list.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { learnerNutritionReport } from "./learnerRoster";
import { adviserGradeKey } from "./orgAdvisers";

const CONFIG_ROW_ID = "official";

const EMPTY_CONFIG = { grades: [], criteria: [], criterionGradeRestrictions: {} };

export async function loadSbfpConfig() {
  const { data, error } = await supabase
    .from("sbfp_config")
    .select("config")
    .eq("id", CONFIG_ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return { ...EMPTY_CONFIG, ...(data?.config || {}) };
}

// { status: "loading" | "ready" | "error", config }
export function useSbfpConfig() {
  const [state, setState] = useState({ status: "loading", config: EMPTY_CONFIG });

  useEffect(() => {
    let active = true;
    loadSbfpConfig()
      .then((config) => active && setState({ status: "ready", config }))
      .catch(() => active && setState({ status: "error", config: EMPTY_CONFIG }));
    return () => {
      active = false;
    };
  }, []);

  return state;
}

export const sbfpConfigIsSet = (config) =>
  Boolean(config?.grades?.length || config?.criteria?.length);

// Grades are compared as keys ("0" Kinder, "1"-"6", "SNED") so "Kinder",
// "KINDERGARTEN", "Grade 6" and a section like "Grade 6 - Eliot" all match.
const learnerGrade = (student) =>
  adviserGradeKey(
    student?.grade_level || student?.grade || student?.gradeLevel || student?.section,
  );

const gradeListIncludes = (grades, gradeKey) =>
  Boolean(gradeKey) && (grades || []).some((grade) => adviserGradeKey(grade) === gradeKey);

const statusQualifies = (status, gradeKey, config) => {
  if (!status || !config.criteria.includes(status)) return false;
  const allowedGrades = config.criterionGradeRestrictions?.[status];
  return allowedGrades === undefined || gradeListIncludes(allowedGrades, gradeKey);
};

// Whole grades (e.g. Kinder, Grade 1) where every learner is a beneficiary.
export const isSbfpWholeGrade = (student, config) =>
  sbfpConfigIsSet(config) && gradeListIncludes(config.grades, learnerGrade(student));

// Qualifies through the BMI / Height-for-age criteria. The report highlights
// only these learners: in whole-grade classes everyone is a beneficiary, so
// highlighting would mark every row.
export function isSbfpByStatus(student, config) {
  if (!sbfpConfigIsSet(config)) return false;
  const grade = learnerGrade(student);
  const baseline = learnerNutritionReport(student, "baseline");
  return (
    statusQualifies(baseline.bmiStatus, grade, config) ||
    statusQualifies(baseline.hfaStatus, grade, config)
  );
}
