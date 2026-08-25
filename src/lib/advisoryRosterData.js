import { supabase } from "./supabase";
import {
  adviserGradeKey,
  findOrgAdviserForProfile,
  isOrgAdviser,
  learnerBelongsToOrgAdviser,
  legacyProfileIdsForOrgAdviser,
} from "./orgAdvisers";

const IECES_SCHOOL_ID = "126001";
const PAGE_SIZE = 1000;

const fetchAllSchoolLearners = async () => {
  const learners = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await supabase
      .from("students")
      .select("*")
      .eq("school_id", IECES_SCHOOL_ID)
      .order("family_name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (result.error) return { data: [], error: result.error };
    learners.push(...(result.data || []));
    if (!result.data || result.data.length < PAGE_SIZE) break;
  }
  return { data: learners, error: null };
};

export const loadAdvisoryRoster = async (profile, isGradeChairman = false) => {
  if (!profile?.id) {
    return { students: [], orgAdviser: null, orgAdvisers: [], error: null };
  }

  const [studentResult, orgResult, legacyResult, portalResult] =
    await Promise.all([
      fetchAllSchoolLearners(),
      supabase.from("org_chart").select("*"),
      supabase.from("profiles").select("*"),
      supabase.from("portal_profile").select("*"),
    ]);

  const error = studentResult.error || orgResult.error;
  const orgAdvisers = (orgResult.data || []).filter(isOrgAdviser);
  const orgAdviser = findOrgAdviserForProfile(profile, orgAdvisers);
  const schoolLearners = studentResult.data || [];

  if (error) {
    return { students: [], orgAdviser, orgAdvisers, error };
  }

  if (isGradeChairman) {
    const grade = adviserGradeKey(
      orgAdviser?.grade_level || profile.grade_level_assigned,
    );
    return {
      students: schoolLearners.filter(
        (learner) =>
          adviserGradeKey(
            learner.grade_level || learner.grade || learner.section,
          ) === grade,
      ),
      orgAdviser,
      orgAdvisers,
      error: null,
    };
  }

  if (!orgAdviser) {
    return { students: [], orgAdviser: null, orgAdvisers, error: null };
  }

  const legacyIds = [
    String(profile.id),
    ...legacyProfileIdsForOrgAdviser(orgAdviser, legacyResult.data || []),
    ...legacyProfileIdsForOrgAdviser(orgAdviser, portalResult.data || []),
  ];

  return {
    students: schoolLearners.filter((learner) =>
      learnerBelongsToOrgAdviser(learner, orgAdviser, legacyIds),
    ),
    orgAdviser,
    orgAdvisers,
    error: null,
  };
};
