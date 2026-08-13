import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function TransferLearner({ profile }) {
  const gradeLevel = profile?.grade_level_assigned;

  const [advisers, setAdvisers] = useState([]);
  const [leftAdviserId, setLeftAdviserId] = useState("");
  const [rightAdviserId, setRightAdviserId] = useState("");

  const [leftStudents, setLeftStudents] = useState([]);
  const [rightStudents, setRightStudents] = useState([]);

  // Track pending transfers: { [studentId]: targetAdviserId }
  const [pendingTransfers, setPendingTransfers] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Fetch advisers for the chairman's assigned grade level
  useEffect(() => {
    if (!gradeLevel) return;

    const fetchAdvisers = async () => {
      const { data, error } = await supabase
        .from("portal_profile")
        .select("id, first_name, family_name, section_assigned")
        .eq("grade_level_assigned", gradeLevel);

      if (!error && data) {
        setAdvisers(data);
      }
    };

    fetchAdvisers();
  }, [gradeLevel]);

  // Fetch learners for Left Class
  useEffect(() => {
    if (!leftAdviserId) {
      setLeftStudents([]);
      return;
    }

    const fetchLeftStudents = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("students")
        .select("*")
        .eq("adviser_id", leftAdviserId);

      setLeftStudents(data || []);
      setLoading(false);
    };

    fetchLeftStudents();
  }, [leftAdviserId]);

  // Fetch learners for Right Class
  useEffect(() => {
    if (!rightAdviserId) {
      setRightStudents([]);
      return;
    }

    const fetchRightStudents = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("students")
        .select("*")
        .eq("adviser_id", rightAdviserId);

      setRightStudents(data || []);
      setLoading(false);
    };

    fetchRightStudents();
  }, [rightAdviserId]);

  // Helper to sort learners: Male A-Z first, Female A-Z second
  const getSortedLearners = (studentsList) => {
    const activeList = studentsList.filter(
      (s) => !pendingTransfers[s.id], // Exclude students staged to transfer out
    );

    const males = activeList
      .filter((s) => s.gender?.toLowerCase() === "male")
      .sort((a, b) => (a.family_name || "").localeCompare(b.family_name || ""));

    const females = activeList
      .filter((s) => s.gender?.toLowerCase() === "female")
      .sort((a, b) => (a.family_name || "").localeCompare(b.family_name || ""));

    return { males, females };
  };

  // Stage a transfer to the opposite side
  const handleStageTransfer = (student, targetAdviserId) => {
    setPendingTransfers((prev) => ({
      ...prev,
      [student.id]: targetAdviserId,
    }));
  };

  // Commit all pending transfers to Supabase
  const handleSaveTransfer = async () => {
    const studentIds = Object.keys(pendingTransfers);
    if (studentIds.length === 0) return;

    setSaving(true);
    setMessage("");

    try {
      for (const studentId of studentIds) {
        const targetAdviserId = pendingTransfers[studentId];
        await supabase
          .from("students")
          .update({ adviser_id: targetAdviserId })
          .eq("id", studentId);
      }

      setMessage("Transfers saved successfully!");
      setPendingTransfers({});

      // Refresh both class lists
      if (leftAdviserId) {
        const { data: leftData } = await supabase
          .from("students")
          .select("*")
          .eq("adviser_id", leftAdviserId);
        setLeftStudents(leftData || []);
      }

      if (rightAdviserId) {
        const { data: rightData } = await supabase
          .from("students")
          .select("*")
          .eq("adviser_id", rightAdviserId);
        setRightStudents(rightData || []);
      }
    } catch (err) {
      console.error("Error saving transfers:", err);
      setMessage("Failed to save transfers. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Include staged incoming learners in each list
  const stagedLeftIncoming = Object.entries(pendingTransfers)
    .filter(([_, targetId]) => targetId === leftAdviserId)
    .map(([stId]) =>
      [...rightStudents, ...leftStudents].find((s) => s.id === stId),
    )
    .filter(Boolean);

  const stagedRightIncoming = Object.entries(pendingTransfers)
    .filter(([_, targetId]) => targetId === rightAdviserId)
    .map(([stId]) =>
      [...leftStudents, ...rightStudents].find((s) => s.id === stId),
    )
    .filter(Boolean);

  const leftDisplayList = [...leftStudents, ...stagedLeftIncoming];
  const rightDisplayList = [...rightStudents, ...stagedRightIncoming];

  const leftSorted = getSortedLearners(leftDisplayList);
  const rightSorted = getSortedLearners(rightDisplayList);

  const pendingCount = Object.keys(pendingTransfers).length;

  return (
    <div className="dash-card">
      <div className="dash-card-header flex justify-between items-center">
        <div>
          <h2>Transfer Learner Portal</h2>
          <p>
            Grade {gradeLevel || "N/A"} Chairman View — Reassign learners
            between advisory sections.
          </p>
        </div>
        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1.5 rounded-full uppercase">
          Grade Level: {gradeLevel || "Not Assigned"}
        </span>
      </div>

      {message && (
        <div
          className={`p-3 mb-4 rounded text-sm font-semibold ${
            message.includes("success")
              ? "bg-green-100 text-green-800 border border-green-300"
              : "bg-red-100 text-red-800 border border-red-300"
          }`}
        >
          {message}
        </div>
      )}

      {/* Side-by-Side Class Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        {/* LEFT CLASS SECTION */}
        <ClassPanel
          title="Source / Class A"
          selectedAdviserId={leftAdviserId}
          setSelectedAdviserId={setLeftAdviserId}
          advisers={advisers}
          otherAdviserId={rightAdviserId}
          sortedLearners={leftSorted}
          targetAdviserId={rightAdviserId}
          onTransfer={handleStageTransfer}
          loading={loading}
          direction="right"
        />

        {/* RIGHT CLASS SECTION */}
        <ClassPanel
          title="Destination / Class B"
          selectedAdviserId={rightAdviserId}
          setSelectedAdviserId={setRightAdviserId}
          advisers={advisers}
          otherAdviserId={leftAdviserId}
          sortedLearners={rightSorted}
          targetAdviserId={leftAdviserId}
          onTransfer={handleStageTransfer}
          loading={loading}
          direction="left"
        />
      </div>

      {/* SAVE TRANSFERS FOOTER BAR */}
      <div className="mt-8 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-lg">
        <div>
          <span className="text-sm font-bold text-slate-700">
            Pending Transfers:{" "}
          </span>
          <span className="text-sm font-extrabold text-blue-600">
            {pendingCount} Learner(s) staged
          </span>
        </div>
        <button
          onClick={handleSaveTransfer}
          disabled={pendingCount === 0 || saving}
          className={`px-6 py-2.5 rounded-md font-bold text-sm text-white transition-all ${
            pendingCount === 0 || saving
              ? "bg-slate-300 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 shadow-md cursor-pointer"
          }`}
        >
          {saving ? "Saving Transfers..." : "Save Transfers"}
        </button>
      </div>
    </div>
  );
}

// ── REUSABLE CLASS PANEL COMPONENT ──────────────────────────────────────────
function ClassPanel({
  title,
  selectedAdviserId,
  setSelectedAdviserId,
  advisers,
  otherAdviserId,
  sortedLearners,
  targetAdviserId,
  onTransfer,
  loading,
  direction,
}) {
  const isTargetSelected = Boolean(targetAdviserId);
  const totalLearners =
    sortedLearners.males.length + sortedLearners.females.length;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col justify-between">
      <div>
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-bold text-slate-600 uppercase">
              {title} - Select Adviser:
            </label>
            {selectedAdviserId && (
              <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                Total: {totalLearners}
              </span>
            )}
          </div>
          <select
            value={selectedAdviserId}
            onChange={(e) => setSelectedAdviserId(e.target.value)}
            className="w-full p-2 border border-slate-300 rounded-md bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select Teacher / Section --</option>
            {advisers
              .filter((adv) => adv.id !== otherAdviserId)
              .map((adv) => (
                <option key={adv.id} value={adv.id}>
                  {adv.family_name}, {adv.first_name}{" "}
                  {adv.section_assigned
                    ? `(Section: ${adv.section_assigned})`
                    : ""}
                </option>
              ))}
          </select>
        </div>

        {/* Learner Roster List */}
        {!selectedAdviserId ? (
          <p className="text-xs text-slate-400 italic text-center py-10">
            Select an adviser to view class list.
          </p>
        ) : loading ? (
          <p className="text-xs text-slate-500 text-center py-10">
            Loading learners...
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded max-h-[420px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-100 shadow-xs">
                <tr className="text-slate-700 font-bold uppercase border-b border-slate-200">
                  <th className="p-2 border-r border-slate-200 text-center w-8">
                    #
                  </th>
                  <th className="p-2 border-r border-slate-200">Name</th>
                  <th className="p-2 text-center w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {/* MALE SECTION */}
                <tr className="bg-blue-50 border-b border-slate-200">
                  <td
                    colSpan="3"
                    className="p-1.5 font-bold text-blue-900 text-xs px-3"
                  >
                    MALE ({sortedLearners.males.length})
                  </td>
                </tr>
                {sortedLearners.males.length === 0 ? (
                  <tr>
                    <td
                      colSpan="3"
                      className="p-2 text-center text-slate-400 italic"
                    >
                      No male learners.
                    </td>
                  </tr>
                ) : (
                  sortedLearners.males.map((st, idx) => (
                    <tr
                      key={st.id}
                      className="hover:bg-slate-50 border-b border-slate-100"
                    >
                      <td className="p-2 text-center text-slate-500 font-semibold border-r border-slate-100">
                        {idx + 1}
                      </td>
                      <td className="p-2 font-semibold text-slate-800 border-r border-slate-100">
                        {st.family_name}, {st.first_name} {st.middle_name || ""}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => onTransfer(st, targetAdviserId)}
                          disabled={!isTargetSelected}
                          title={
                            !isTargetSelected
                              ? "Select a destination class on the other side to enable transfer"
                              : "Transfer Learner"
                          }
                          className={`px-2 py-1 rounded text-[11px] font-bold text-white transition-all ${
                            !isTargetSelected
                              ? "bg-slate-300 cursor-not-allowed"
                              : direction === "right"
                                ? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                                : "bg-purple-600 hover:bg-purple-700 cursor-pointer"
                          }`}
                        >
                          {direction === "right" ? "Transfer ➔" : "⬅ Transfer"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}

                {/* FEMALE SECTION */}
                <tr className="bg-pink-50 border-b border-slate-200">
                  <td
                    colSpan="3"
                    className="p-1.5 font-bold text-pink-900 text-xs px-3"
                  >
                    FEMALE ({sortedLearners.females.length})
                  </td>
                </tr>
                {sortedLearners.females.length === 0 ? (
                  <tr>
                    <td
                      colSpan="3"
                      className="p-2 text-center text-slate-400 italic"
                    >
                      No female learners.
                    </td>
                  </tr>
                ) : (
                  sortedLearners.females.map((st, idx) => (
                    <tr
                      key={st.id}
                      className="hover:bg-slate-50 border-b border-slate-100"
                    >
                      <td className="p-2 text-center text-slate-500 font-semibold border-r border-slate-100">
                        {sortedLearners.males.length + idx + 1}
                      </td>
                      <td className="p-2 font-semibold text-slate-800 border-r border-slate-100">
                        {st.family_name}, {st.first_name} {st.middle_name || ""}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => onTransfer(st, targetAdviserId)}
                          disabled={!isTargetSelected}
                          title={
                            !isTargetSelected
                              ? "Select a destination class on the other side to enable transfer"
                              : "Transfer Learner"
                          }
                          className={`px-2 py-1 rounded text-[11px] font-bold text-white transition-all ${
                            !isTargetSelected
                              ? "bg-slate-300 cursor-not-allowed"
                              : direction === "right"
                                ? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                                : "bg-purple-600 hover:bg-purple-700 cursor-pointer"
                          }`}
                        >
                          {direction === "right" ? "Transfer ➔" : "⬅ Transfer"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-800 border-t border-slate-300">
                  <td colSpan="2" className="p-2 text-right uppercase">
                    Total Enrolled:
                  </td>
                  <td className="p-2 text-center font-extrabold text-sm">
                    {totalLearners}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

