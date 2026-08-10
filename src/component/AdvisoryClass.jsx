import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function AdvisoryClass({ profile }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // studentId being saved
  const [message, setMessage] = useState("");

  const isGradeChairman = profile?.role === "grade_chairman";

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

    return () => supabase.removeChannel(channel);
  }, [profile]);

  const fetchStudents = async () => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let query = supabase.from("students").select("*");

    if (isGradeChairman) {
      query = query.eq("grade_level", profile.grade_level_assigned);
    } else {
      query = query.eq("adviser_id", profile.id);
    }

    const { data, error } = await query.order("family_name", {
      ascending: true,
    });

    if (!error && data) setStudents(data);
    setLoading(false);
  };

  const handleReadingLevelChange = async (studentId, readingLevel) => {
    setSaving(studentId);
    setMessage("");

    const { error } = await supabase
      .from("students")
      .update({ reading_level: readingLevel })
      .eq("id", studentId);

    if (error) {
      setMessage("Failed to update reading level. Please try again.");
    } else {
      setMessage("Reading level updated.");
      setTimeout(() => setMessage(""), 2500);
      fetchStudents();
    }

    setSaving(null);
  };

  // Count breakdown
  const maleCount = students.filter((s) => s.gender === "Male").length;
  const femaleCount = students.filter((s) => s.gender === "Female").length;

  const readingBreakdown = {
    "Non-Reader": students.filter((s) => (s.reading_level || "Non-Reader") === "Non-Reader").length,
    Frustration: students.filter((s) => s.reading_level === "Frustration").length,
    Instructional: students.filter((s) => s.reading_level === "Instructional").length,
    Independent: students.filter((s) => s.reading_level === "Independent").length,
  };

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <h2>
          {isGradeChairman
            ? `Grade ${profile?.grade_level_assigned} — All Sections`
            : `Advisory Class — ${profile?.section_assigned || "My Section"}`}
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

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
          Loading learners…
        </div>
      ) : (
        <div className="dash-table-wrapper">
          <table className="dash-table">
            <thead>
              <tr>
                <th>#</th>
                <th>LRN</th>
                <th>Learner Name</th>
                <th>Gender</th>
                {isGradeChairman && <th>Grade</th>}
                <th>Reading Level</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td
                    colSpan={isGradeChairman ? 6 : 5}
                    style={{ textAlign: "center", padding: "24px", color: "#999" }}
                  >
                    No learners assigned to your advisory class yet.
                  </td>
                </tr>
              ) : (
                students.map((st, idx) => (
                  <tr key={st.id}>
                    <td style={{ color: "#aaa", fontSize: "0.8rem" }}>
                      {idx + 1}
                    </td>
                    <td className="font-mono">{st.lrn}</td>
                    <td className="font-bold">
                      {st.family_name}, {st.first_name}{" "}
                      {st.middle_name ? st.middle_name.charAt(0) + "." : ""}
                    </td>
                    <td>{st.gender}</td>
                    {isGradeChairman && (
                      <td>
                        {st.grade_level === 0 ? "Kinder" : `Grade ${st.grade_level}`}
                      </td>
                    )}
                    <td>
                      <select
                        value={st.reading_level || "Non-Reader"}
                        onChange={(e) =>
                          handleReadingLevelChange(st.id, e.target.value)
                        }
                        disabled={saving === st.id}
                        className="table-select"
                      >
                        <option value="Non-Reader">Non-Reader</option>
                        <option value="Frustration">Frustration</option>
                        <option value="Instructional">Instructional</option>
                        <option value="Independent">Independent</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
