import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { orgAdviserName } from "../lib/orgAdvisers";
import { loadAdvisoryRoster } from "../lib/advisoryRosterData";
import {
  displayBirthdate,
  learnerAge,
  learnerBarangay,
  learnerDisplayName,
  learnerGenderLabel,
  learnerGradeLabel,
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

export function AdvisoryClass({ profile }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [orgAdviser, setOrgAdviser] = useState(null);
  const [demographicDrafts, setDemographicDrafts] = useState({});
  const [dirtyStudentIds, setDirtyStudentIds] = useState([]);
  const [savingDemographics, setSavingDemographics] = useState(false);

  useEffect(() => {
    fetchStudents();

    // Realtime sync
    const channel = supabase
      .channel("advisory_class_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students" },
        () => fetchStudents()
      )
      .subscribe();

    const orgChannel = supabase
      .channel("advisory_org_chart_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "org_chart" },
        () => fetchStudents(),
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
        () => fetchStudents(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(orgChannel);
      supabase.removeChannel(profileChannel);
    };
  }, [profile]);

  const fetchStudents = async () => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
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
          return [
            String(student.id),
            {
              lrn:
                student.lrn && student.lrn !== "—" ? String(student.lrn) : "",
              religion: student.religion || "",
              tribe: student.tribe || "",
              barangay: barangay === "—" ? "" : barangay,
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
          religion: draft?.religion || null,
          tribe: draft?.tribe || null,
          address: addressWithBarangay(student?.address, draft?.barangay),
          reading_category: draft?.reading_category || null,
        };
      });

    const { error: lrnError } = await supabase.rpc("save_advisory_lrns", {
      p_updates: updates.map(({ id, lrn }) => ({ id, lrn })),
    });
    if (lrnError) {
      setMessage(`Failed to save LRN: ${lrnError.message}`);
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
      setMessage(`${savedCount} learner record${savedCount === 1 ? "" : "s"} saved to Supabase.`);
      setDirtyStudentIds([]);
      await fetchStudents();
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
      <div className="dash-card-header">
        <h2>
          Advisory Class —{" "}
          {orgAdviser ? orgAdviserName(orgAdviser) : "Not linked in Org Chart"}
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
          <table className="dash-table" style={{ minWidth: "1420px" }}>
            <thead>
              <tr>
                <th className="sticky-roster-no">No.</th>
                <th className="sticky-roster-name">
                  Learner Name
                </th>
                <th className="sticky-roster-photo">Photo</th>
                <th>LRN</th>
                <th>Grade Level</th>
                <th>Gender</th>
                <th>Birthdate</th>
                <th>Age</th>
                <th>Religion</th>
                <th>Tribe</th>
                <th>Barangay</th>
                <th>BMI Status</th>
                <th>HFA Status</th>
                <th>Reading Level</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td
                    colSpan="14"
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
                  return (
                    <tr key={st.id}>
                      <td className="sticky-roster-no font-bold text-center text-[#7b1a1a]">
                        {idx + 1}
                      </td>
                      <td className="sticky-roster-name font-bold">
                        {learnerDisplayName(st)}
                      </td>
                      <td className="sticky-roster-photo">
                        {photo ? (
                          <img
                            src={photo}
                            alt={`${learnerDisplayName(st)} profile`}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 grid place-items-center text-slate-400">
                            👤
                          </div>
                        )}
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
                          aria-label={`LRN for ${learnerDisplayName(st)}`}
                          className="advisory-lrn-input min-w-[130px] font-mono"
                        />
                      </td>
                      <td className="whitespace-nowrap font-semibold">{learnerGradeLabel(st)}</td>
                      <td className="font-semibold">{learnerGenderLabel(st)}</td>
                      <td className="whitespace-nowrap">{displayBirthdate(st.birthdate)}</td>
                      <td className="text-center">{learnerAge(st)}</td>
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
