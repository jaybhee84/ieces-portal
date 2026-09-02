import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { orgAdviserName } from "../lib/orgAdvisers";
import { loadAdvisoryRoster } from "../lib/advisoryRosterData";
import {
  learnerAge,
  learnerBarangay,
  learnerDisplayName,
  learnerGenderLabel,
  learnerGradeLabel,
  learnerMiddleInitial,
  learnerNutrition,
  nutritionBadgeClass,
} from "../lib/learnerRoster";
import {
  ISABELA_CITY_BARANGAYS,
  WESTERN_MINDANAO_RELIGIONS,
  WESTERN_MINDANAO_TRIBES,
  optionsWithCurrentValue,
} from "../lib/demographicOptions";
import { PHILIRI_READING_CATEGORIES } from "../lib/readingOptions";

const addressWithBarangay = (address, barangay) => {
  const current = String(address || "").trim();
  if (!barangay) return current;
  if (/Brgy\.\s*[^,]+/i.test(current)) {
    return current.replace(/Brgy\.\s*[^,]+/i, `Brgy. ${barangay}`);
  }
  if (/Isabela City$/i.test(current)) {
    const prefix = current.replace(/,?\s*Isabela City$/i, "").trim();
    return `${prefix ? `${prefix}, ` : ""}Brgy. ${barangay}, Isabela City`;
  }
  return `${current ? `${current}, ` : ""}Brgy. ${barangay}, Isabela City`;
};

const GUARDIAN_TYPES = [
  "Father",
  "Mother",
  "Grandfather",
  "Grandmother",
  "Aunt",
  "Uncle",
  "Sibling",
  "Other Legal Guardian",
];

const learnerGuardianDraft = (student) => {
  if (student.guardian_type || student.guardian_contact_name) {
    const storedType = String(student.guardian_type || "").trim();
    return {
      guardian_type: GUARDIAN_TYPES.includes(storedType)
        ? storedType
        : "Other Legal Guardian",
      guardian_contact_name: String(
        student.guardian_contact_name || "",
      ).toUpperCase(),
    };
  }

  const storedGuardian = String(student.guardian_name || "").trim();
  if (storedGuardian) {
    const relationship = storedGuardian.match(/\(([^()]*)\)\s*$/)?.[1]?.trim();
    return {
      guardian_type: GUARDIAN_TYPES.includes(relationship)
        ? relationship
        : "Other Legal Guardian",
      guardian_contact_name: storedGuardian
        .replace(/\s*\([^()]*\)\s*$/, "")
        .toUpperCase(),
    };
  }
  if (student.father_name) {
    return {
      guardian_type: "Father",
      guardian_contact_name: String(student.father_name).toUpperCase(),
    };
  }
  if (student.mother_name) {
    return {
      guardian_type: "Mother",
      guardian_contact_name: String(student.mother_name).toUpperCase(),
    };
  }
  return { guardian_type: "", guardian_contact_name: "" };
};

export function AdvisoryClass({ profile }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [orgAdviser, setOrgAdviser] = useState(null);
  const [demographicDrafts, setDemographicDrafts] = useState({});
  const [dirtyStudentIds, setDirtyStudentIds] = useState([]);
  const [savingDemographics, setSavingDemographics] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const loadedProfileKeyRef = useRef("");

  useEffect(() => {
    const profileKey = [
      profile?.id,
      profile?.first_name,
      profile?.family_name,
      profile?.role,
      profile?.grade_level_assigned,
      profile?.test_access_scope,
    ].join(":");
    const showInitialLoader = loadedProfileKeyRef.current !== profileKey;
    loadedProfileKeyRef.current = profileKey;
    fetchStudents(showInitialLoader);

    // Realtime sync
    const channel = supabase
      .channel("advisory_class_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students" },
        () => fetchStudents(false)
      )
      .subscribe();

    const orgChannel = supabase
      .channel("advisory_org_chart_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "org_chart" },
        () => fetchStudents(false),
      )
      .subscribe();

    const profileChannel = supabase
      .channel(`advisory_profile_sync:${profile?.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "portal_profile",
          filter: `id=eq.${profile?.id}`,
        },
        () => fetchStudents(false),
      )
      .subscribe();

    const handleStudentUpdate = () => fetchStudents(false);
    window.addEventListener("ieces:students-updated", handleStudentUpdate);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(orgChannel);
      supabase.removeChannel(profileChannel);
      window.removeEventListener("ieces:students-updated", handleStudentUpdate);
    };
  }, [
    profile?.id,
    profile?.first_name,
    profile?.family_name,
    profile?.role,
    profile?.grade_level_assigned,
    profile?.test_access_scope,
  ]);

  const fetchStudents = async (showLoader = false) => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    if (showLoader) setLoading(true);
    const result = await loadAdvisoryRoster(profile);
    setOrgAdviser(result.orgAdviser);
    const sortedStudents = [...result.students].sort((left, right) => {
      const genderRank = (student) => {
        const gender = learnerGenderLabel(student);
        if (gender === "Male") return 0;
        if (gender === "Female") return 1;
        return 2;
      };
      return (
        genderRank(left) - genderRank(right) ||
        learnerDisplayName(left).localeCompare(learnerDisplayName(right))
      );
    });
    setStudents(sortedStudents);
    setDemographicDrafts(
      Object.fromEntries(
        sortedStudents.map((student) => {
          const barangay = learnerBarangay(student);
          const guardianDraft = learnerGuardianDraft(student);
          return [
            String(student.id),
            {
              lrn:
                student.lrn && student.lrn !== "—" ? String(student.lrn) : "",
              birthdate: student.birthdate
                ? String(student.birthdate).slice(0, 10)
                : "",
              middle_initial: learnerMiddleInitial(student),
              religion: student.religion || "",
              tribe: student.tribe || "",
              barangay: barangay === "—" ? "" : barangay,
              ...guardianDraft,
              contact_number: student.contact_number || "",
              reading_category: student.reading_category || "",
            },
          ];
        }),
      ),
    );
    setDirtyStudentIds([]);
    if (result.error) {
      setMessage(`Unable to load learners: ${result.error.message}`);
    }
    setLoading(false);
  };

  const updateDemographicDraft = (studentId, field, value) => {
    const key = String(studentId);
    setDemographicDrafts((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
    setDirtyStudentIds((current) =>
      current.includes(key) ? current : [...current, key],
    );
  };

  const saveDemographicChanges = async () => {
    if (!dirtyStudentIds.length) return;
    const invalidLrn = dirtyStudentIds.find((studentId) => {
      const lrn = String(demographicDrafts[studentId]?.lrn || "").trim();
      return lrn && !/^\d{12}$/.test(lrn);
    });
    if (invalidLrn) {
      setMessage("LRN must contain exactly 12 digits, or be left blank.");
      return;
    }
    const invalidMiddleInitial = dirtyStudentIds.find((studentId) => {
      const middleInitial = String(
        demographicDrafts[studentId]?.middle_initial || "",
      ).trim();
      return middleInitial && !/^[A-Z]$/i.test(middleInitial);
    });
    if (invalidMiddleInitial) {
      setMessage("Middle initial must contain one letter, or be left blank.");
      return;
    }
    const incompleteGuardian = dirtyStudentIds.find((studentId) => {
      const draft = demographicDrafts[studentId] || {};
      return Boolean(draft.guardian_type) !==
        Boolean(String(draft.guardian_contact_name || "").trim());
    });
    if (incompleteGuardian) {
      setMessage("Select a guardian type and enter the guardian name, or leave both blank.");
      return;
    }
    setSavingDemographics(true);
    setMessage("");

    const updates = dirtyStudentIds.map((studentId) => {
        const student = students.find(
          (candidate) => String(candidate.id) === studentId,
        );
        const draft = demographicDrafts[studentId];
        return {
          id: studentId,
          lrn: draft?.lrn?.trim() || null,
          birthdate: draft?.birthdate || null,
          middle_initial: draft?.middle_initial || null,
          religion: draft?.religion || null,
          tribe: draft?.tribe || null,
          address: addressWithBarangay(student?.address, draft?.barangay),
          guardian_type: draft?.guardian_type || null,
          guardian_contact_name:
            draft?.guardian_contact_name?.trim() || null,
          contact_number: draft?.contact_number?.trim() || null,
          reading_category: draft?.reading_category || null,
        };
      });

    const lrnUpdates = updates
      .filter(({ id, lrn }) => {
        const student = students.find(
          (candidate) => String(candidate.id) === String(id),
        );
        const savedLrn = student?.lrn && student.lrn !== "—"
          ? String(student.lrn).trim()
          : "";
        return (lrn || "") !== savedLrn;
      })
      .map(({ id, lrn }) => ({ id, lrn }));

    const birthdateUpdates = updates
      .filter(({ id, birthdate }) => {
        const student = students.find(
          (candidate) => String(candidate.id) === String(id),
        );
        const savedBirthdate = student?.birthdate
          ? String(student.birthdate).slice(0, 10)
          : "";
        return (birthdate || "") !== savedBirthdate;
      })
      .map(({ id, birthdate }) => ({ id, birthdate }));

    const middleInitialUpdates = updates
      .filter(({ id, middle_initial }) => {
        const student = students.find(
          (candidate) => String(candidate.id) === String(id),
        );
        return (middle_initial || "") !== learnerMiddleInitial(student);
      })
      .map(({ id, middle_initial }) => ({ id, middle_initial }));

    if (lrnUpdates.length) {
      const { error: lrnError } = await supabase.rpc("save_advisory_lrns", {
        p_updates: lrnUpdates,
      });
      if (lrnError) {
        setMessage(`Failed to save LRN: ${lrnError.message}`);
        setSavingDemographics(false);
        return;
      }
    }

    if (birthdateUpdates.length) {
      const { error: birthdateError } = await supabase.rpc(
        "save_advisory_birthdates",
        { p_updates: birthdateUpdates },
      );
      if (birthdateError) {
        setMessage(`Failed to save birthdate: ${birthdateError.message}`);
        setSavingDemographics(false);
        return;
      }
    }

    if (middleInitialUpdates.length) {
      const { error: middleInitialError } = await supabase.rpc(
        "save_advisory_middle_initials",
        { p_updates: middleInitialUpdates },
      );
      if (middleInitialError) {
        setMessage(`Failed to save middle initial: ${middleInitialError.message}`);
        setSavingDemographics(false);
        return;
      }
    }

    const { error: contactError } = await supabase.rpc(
      "save_advisory_contacts",
      {
        p_updates: updates.map(
          ({
            id,
            guardian_type,
            guardian_contact_name,
            contact_number,
          }) => ({
            id,
            guardian_type,
            guardian_contact_name,
            contact_number,
          }),
        ),
      },
    );
    if (contactError) {
      setMessage(`Failed to save parent/guardian details: ${contactError.message}`);
      setSavingDemographics(false);
      return;
    }

    const { data: savedCount, error } = await supabase.rpc(
      "save_advisory_demographics",
      { p_updates: updates },
    );

    if (error) {
      setMessage(`Failed to save learner data: ${error.message}`);
    } else {
      setMessage("");
      setDirtyStudentIds([]);
      window.dispatchEvent(
        new CustomEvent("ieces:students-updated", {
          detail: {
            updates: updates.map(({ middle_initial, ...update }) => ({
              ...update,
              middle_name: middle_initial,
            })),
          },
        }),
      );
      await fetchStudents(false);
      setShowSuccessModal(true);
    }
    setSavingDemographics(false);
  };

  // Count breakdown
  const maleCount = students.filter(
    (student) => learnerGenderLabel(student) === "Male",
  ).length;
  const femaleCount = students.filter(
    (student) => learnerGenderLabel(student) === "Female",
  ).length;

  const readingBreakdown = Object.fromEntries(
    PHILIRI_READING_CATEGORIES.map((category) => [
      category.label,
      students.filter(
        (student) =>
          demographicDrafts[String(student.id)]?.reading_category ===
          category.value,
      ).length,
    ]),
  );

  return (
    <div className="dash-card">
      {showSuccessModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="advisory-save-success-title"
        >
          <div className="bg-white rounded-2xl p-6 md:p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3
              id="advisory-save-success-title"
              className="text-xl font-bold text-slate-800 mb-2"
            >
              Successfully Saved!
            </h3>
            <p className="text-slate-600 text-sm mb-6">
              The advisory class changes have been saved successfully.
            </p>
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="dash-card-header">
        <h2>
          Advisory Class —{" "}
          {profile?.test_access_scope === "grade"
            ? `${String(profile.grade_level_assigned) === "0" ? "All Kinder Classes" : `All Grade ${profile.grade_level_assigned} Classes`}`
            : orgAdviser
              ? orgAdviserName(orgAdviser)
              : "Not linked in Org Chart"}
        </h2>
        <p>
          Total: {students.length} Learners &nbsp;|&nbsp; Male: {maleCount}{" "}
          &nbsp;|&nbsp; Female: {femaleCount}
        </p>
      </div>

      {/* Reading Level Summary */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        {Object.entries(readingBreakdown).map(([level, count]) => (
          <div
            key={level}
            style={{
              background: "#f5f0f0",
              border: "1px solid #e0d0d0",
              borderRadius: "8px",
              padding: "8px 16px",
              textAlign: "center",
              minWidth: "100px",
            }}
          >
            <div
              style={{ fontSize: "1.4rem", fontWeight: "700", color: "#7b1a1a" }}
            >
              {count}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#666" }}>{level}</div>
          </div>
        ))}
      </div>

      {message && (
        <div
          style={{
            background: "#e8f5e9",
            border: "1px solid #a5d6a7",
            color: "#2e7d32",
            padding: "8px 14px",
            borderRadius: "6px",
            marginBottom: "12px",
            fontSize: "0.85rem",
          }}
        >
          {message}
        </div>
      )}

      <div className="mb-3 flex items-center justify-end gap-3">
        {dirtyStudentIds.length > 0 && (
          <span className="text-xs font-semibold text-amber-700">
            {dirtyStudentIds.length} learner{dirtyStudentIds.length === 1 ? "" : "s"} modified
          </span>
        )}
        <button
          type="button"
          onClick={saveDemographicChanges}
          disabled={!dirtyStudentIds.length || savingDemographics}
          className="px-5 py-2 rounded-lg bg-[#7b1a1a] text-white text-xs font-bold shadow disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-[#641414]"
        >
          {savingDemographics ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
          Loading learners…
        </div>
      ) : (
        <div className="dash-table-wrapper advisory-roster-scroll">
          <table className="dash-table" style={{ minWidth: "2040px" }}>
            <thead>
              <tr>
                <th rowSpan="2" className="sticky-roster-no">No.</th>
                <th rowSpan="2" className="sticky-roster-name">
                  Learner Name
                </th>
                <th rowSpan="2" className="sticky-roster-photo">Photo</th>
                <th rowSpan="2">Middle Initial</th>
                <th rowSpan="2">LRN</th>
                <th rowSpan="2">Grade Level</th>
                <th rowSpan="2">Gender</th>
                <th rowSpan="2">Birthdate</th>
                <th rowSpan="2">Age</th>
                <th rowSpan="2">Religion</th>
                <th rowSpan="2">Tribe</th>
                <th rowSpan="2">Barangay</th>
                <th colSpan="2">Parents / Guardian</th>
                <th rowSpan="2">Contact Number</th>
                <th rowSpan="2">BMI Status</th>
                <th rowSpan="2">HFA Status</th>
                <th rowSpan="2">Reading Level</th>
              </tr>
              <tr className="advisory-subheader-row">
                <th>Type</th>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td
                    colSpan="18"
                    style={{ textAlign: "center", padding: "24px", color: "#999" }}
                  >
                    No learners assigned to your advisory class yet.
                  </td>
                </tr>
              ) : (
                students.map((st, idx) => {
                  const photo = st.photo_url || st.photo;
                  const nutrition = learnerNutrition(st);
                  const draft = demographicDrafts[String(st.id)] || {};
                  const displayName = learnerDisplayName({
                    ...st,
                    middle_name: draft.middle_initial ?? st.middle_name,
                  });
                  return (
                    <tr key={st.id}>
                      <td className="sticky-roster-no font-bold text-center text-[#7b1a1a]">
                        {idx + 1}
                      </td>
                      <td className="sticky-roster-name font-bold">
                        {displayName}
                      </td>
                      <td className="sticky-roster-photo">
                        {photo ? (
                          <img
                            src={photo}
                            alt={`${displayName} profile`}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 grid place-items-center text-slate-400">
                            👤
                          </div>
                        )}
                      </td>
                      <td className="min-w-[105px]">
                        <input
                          type="text"
                          inputMode="text"
                          maxLength={1}
                          value={draft.middle_initial || ""}
                          onChange={(event) =>
                            updateDemographicDraft(
                              st.id,
                              "middle_initial",
                              event.target.value
                                .replace(/[^a-z]/gi, "")
                                .slice(0, 1)
                                .toUpperCase(),
                            )
                          }
                          disabled={savingDemographics}
                          placeholder="M.I."
                          aria-label={`Middle initial for ${displayName}`}
                          className="advisory-contact-input min-w-[70px] text-center uppercase"
                        />
                      </td>
                      <td>
                        <input
                          key={`${st.id}:${st.lrn || ""}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={12}
                          defaultValue={draft.lrn || ""}
                          onInput={(event) => {
                            const numericLrn = event.currentTarget.value
                              .replace(/\D/g, "")
                              .slice(0, 12);
                            event.currentTarget.value = numericLrn;
                            updateDemographicDraft(
                              st.id,
                              "lrn",
                              numericLrn,
                            );
                          }}
                          disabled={savingDemographics}
                          autoComplete="off"
                          placeholder="12-digit LRN"
                          aria-label={`LRN for ${displayName}`}
                          className="advisory-lrn-input min-w-[130px] font-mono"
                        />
                      </td>
                      <td className="whitespace-nowrap font-semibold">{learnerGradeLabel(st)}</td>
                      <td className="font-semibold">{learnerGenderLabel(st)}</td>
                      <td>
                        <input
                          type="date"
                          value={draft.birthdate || ""}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(event) =>
                            updateDemographicDraft(st.id, "birthdate", event.target.value)
                          }
                          disabled={savingDemographics}
                          aria-label={`Birthdate for ${displayName}`}
                          className="advisory-birthdate-input"
                        />
                      </td>
                      <td className="text-center">
                        {learnerAge({ ...st, birthdate: draft.birthdate })}
                      </td>
                      <td>
                        <select
                          value={draft.religion || ""}
                          onChange={(event) => updateDemographicDraft(st.id, "religion", event.target.value)}
                          className="table-select min-w-[150px]"
                        >
                          <option value="">Select religion</option>
                          {optionsWithCurrentValue(WESTERN_MINDANAO_RELIGIONS, draft.religion).map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={draft.tribe || ""}
                          onChange={(event) => updateDemographicDraft(st.id, "tribe", event.target.value)}
                          className="table-select min-w-[145px]"
                        >
                          <option value="">Select tribe</option>
                          {optionsWithCurrentValue(WESTERN_MINDANAO_TRIBES, draft.tribe).map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={draft.barangay || ""}
                          onChange={(event) => updateDemographicDraft(st.id, "barangay", event.target.value)}
                          className="table-select min-w-[150px]"
                        >
                          <option value="">Select barangay</option>
                          {optionsWithCurrentValue(ISABELA_CITY_BARANGAYS, draft.barangay).map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                      <td className="min-w-[165px]">
                        <select
                          value={draft.guardian_type || ""}
                          onChange={(event) => {
                            const guardianType = event.target.value;
                            updateDemographicDraft(
                              st.id,
                              "guardian_type",
                              guardianType,
                            );
                            if (!guardianType) {
                              updateDemographicDraft(
                                st.id,
                                "guardian_contact_name",
                                "",
                              );
                            }
                          }}
                          disabled={savingDemographics}
                          aria-label={`Guardian type for ${displayName}`}
                          className="table-select w-full min-w-[155px]"
                        >
                          <option value="">Select type</option>
                          {GUARDIAN_TYPES.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </td>
                      <td className="min-w-[220px]">
                        <input
                          type="text"
                          value={draft.guardian_contact_name || ""}
                          onChange={(event) =>
                            updateDemographicDraft(
                              st.id,
                              "guardian_contact_name",
                              event.target.value.toUpperCase(),
                            )
                          }
                          disabled={
                            savingDemographics || !draft.guardian_type
                          }
                          placeholder={
                            draft.guardian_type
                              ? "Guardian name"
                              : "Select type first"
                          }
                          aria-label={`Guardian name for ${displayName}`}
                          className="advisory-contact-input min-w-[210px]"
                        />
                      </td>
                      <td className="min-w-[145px]">
                        <input
                          type="tel"
                          value={draft.contact_number || ""}
                          onChange={(event) =>
                            updateDemographicDraft(
                              st.id,
                              "contact_number",
                              event.target.value,
                            )
                          }
                          disabled={savingDemographics}
                          placeholder="Contact number"
                          autoComplete="tel"
                          aria-label={`Contact number for ${displayName}`}
                          className="advisory-contact-input min-w-[135px]"
                        />
                      </td>
                      <td>
                        <span className={`inline-block px-2 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${nutritionBadgeClass(nutrition.bmi)}`}>
                          {nutrition.bmi}
                        </span>
                      </td>
                      <td>
                        <span className={`inline-block px-2 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${nutritionBadgeClass(nutrition.hfa)}`}>
                          {nutrition.hfa}
                        </span>
                      </td>
                      <td>
                        <select
                          value={draft.reading_category || ""}
                          onChange={(event) =>
                            updateDemographicDraft(
                              st.id,
                              "reading_category",
                              event.target.value,
                            )
                          }
                          className="table-select"
                        >
                          <option value="">Select Phil-IRI category</option>
                          {PHILIRI_READING_CATEGORIES.map((category) => (
                            <option key={category.value} value={category.value}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
