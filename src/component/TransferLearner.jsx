import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  adviserGradeKey,
  isOrgAdviser,
  orgAdviserName,
} from "../lib/orgAdvisers";
import {
  learnerDisplayName,
  learnerGenderLabel,
} from "../lib/learnerRoster";

export function TransferLearner({ profile }) {
  const gradeLevel = profile?.grade_level_assigned;

  const [advisers, setAdvisers] = useState([]);
  const [leftAdviserId, setLeftAdviserId] = useState("");
  const [rightAdviserId, setRightAdviserId] = useState("");

  const [leftStudents, setLeftStudents] = useState([]);
  const [rightStudents, setRightStudents] = useState([]);

  // Track pending transfers: { [studentId]: targetAdviserId }
  const [pendingTransfers, setPendingTransfers] = useState({});
  const [approvedTransfers, setApprovedTransfers] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const fetchAdviserStudents = async (adviserId) => {
    const adviser = advisers.find(
      (item) => String(item.id) === String(adviserId),
    );
    if (!adviser) return { data: [], error: null };

    const result = await supabase.rpc("get_chairman_advisory_learners", {
      candidate_adviser_id: String(adviser.id),
    });
    if (result.error) return result;

    // A deployed legacy RPC may still match an old section name after a
    // transfer. When adviser_id points to a current Org Chart adviser, that
    // explicit assignment is authoritative.
    const orgAdviserIds = new Set(advisers.map((item) => String(item.id)));
    const selectedAdviserId = String(adviser.id);
    const learners = (result.data || []).filter((learner) => {
      const assignedAdviserId = learner.adviser_id
        ? String(learner.adviser_id)
        : "";
      return (
        !orgAdviserIds.has(assignedAdviserId) ||
        assignedAdviserId === selectedAdviserId
      );
    });

    return { data: learners, error: null };
  };

  // Fetch advisers for the chairman's assigned grade level
  useEffect(() => {
    if (!gradeLevel) return;

    const fetchAdvisers = async () => {
      const orgResult = await supabase.from("org_chart").select("*");
      const { data, error } = orgResult;

      if (!error && data) {
        setAdvisers(
          data
            .filter(isOrgAdviser)
            .filter(
              (adviser) =>
                adviserGradeKey(adviser.grade_level) === adviserGradeKey(gradeLevel),
            )
            .sort((left, right) =>
              orgAdviserName(left).localeCompare(orgAdviserName(right)),
            )
            .map((adviser) => ({ ...adviser })),
        );
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
      const { data, error } = await fetchAdviserStudents(leftAdviserId);
      setLeftStudents(data || []);
      if (error) setMessage(`Could not load the source class: ${error.message}`);
      setLoading(false);
    };

    fetchLeftStudents();
  }, [leftAdviserId, advisers]);

  // Fetch learners for Right Class
  useEffect(() => {
    if (!rightAdviserId) {
      setRightStudents([]);
      return;
    }

    const fetchRightStudents = async () => {
      setLoading(true);
      const { data, error } = await fetchAdviserStudents(rightAdviserId);
      setRightStudents(data || []);
      if (error) setMessage(`Could not load the destination class: ${error.message}`);
      setLoading(false);
    };

    fetchRightStudents();
  }, [rightAdviserId, advisers]);

  // Helper to sort learners: Male A-Z first, Female A-Z second
  const getSortedLearners = (studentsList) => {
    const males = studentsList
      .filter((s) => learnerGenderLabel(s) === "Male")
      .sort((a, b) => (a.family_name || "").localeCompare(b.family_name || ""));

    const females = studentsList
      .filter((s) => learnerGenderLabel(s) === "Female")
      .sort((a, b) => (a.family_name || "").localeCompare(b.family_name || ""));

    return { males, females };
  };

  // Stage a transfer to the opposite side
  const handleStageTransfer = (student, targetAdviserId) => {
    setPendingTransfers((prev) => ({
      ...prev,
      [student.id]: targetAdviserId,
    }));
    setMessage("");
  };

  const handleApproveTransfer = (studentId) => {
    setApprovedTransfers((prev) => ({ ...prev, [studentId]: true }));
    setMessage("");
  };

  const handleRemoveTransfer = (studentId) => {
    setPendingTransfers((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setApprovedTransfers((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setMessage("");
  };

  // Commit all pending transfers to Supabase
  const handleSaveTransfer = async () => {
    const studentIds = Object.keys(pendingTransfers).filter(
      (studentId) => approvedTransfers[studentId],
    );
    if (studentIds.length === 0) return;

    setSaving(true);
    setMessage("");

    try {
      for (const studentId of studentIds) {
        const targetAdviserId = pendingTransfers[studentId];
        const targetAdviser = advisers.find(
          (adviser) => String(adviser.id) === String(targetAdviserId),
        );
        const targetSection =
          targetAdviser?.section || targetAdviser?.section_assigned || null;
        const { error } = await supabase
          .from("students")
          .update({
            adviser_id: targetAdviserId,
            ...(targetSection ? { section: targetSection } : {}),
          })
          .eq("id", studentId);
        if (error) throw error;
      }

      setMessage("Transfers saved successfully!");
      setPendingTransfers({});
      setApprovedTransfers({});

      // Refresh both class lists
      if (leftAdviserId) {
        const { data: leftData } = await fetchAdviserStudents(leftAdviserId);
        setLeftStudents(leftData || []);
      }

      if (rightAdviserId) {
        const { data: rightData } = await fetchAdviserStudents(rightAdviserId);
        setRightStudents(rightData || []);
      }
    } catch (err) {
      console.error("Error saving transfers:", err);
      setMessage("Failed to save transfers. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Keep the current advisory rosters unchanged until Save is confirmed.
  const leftSorted = getSortedLearners(leftStudents);
  const rightSorted = getSortedLearners(rightStudents);

  const pendingCount = Object.keys(pendingTransfers).length;
  const approvedCount = Object.keys(approvedTransfers).filter(
    (studentId) => pendingTransfers[studentId],
  ).length;
  const allTransfersApproved =
    pendingCount > 0 && approvedCount === pendingCount;
  const pendingDetails = Object.entries(pendingTransfers).map(
    ([studentId, targetAdviserId]) => {
      const learner = [...leftStudents, ...rightStudents].find(
        (student) => String(student.id) === String(studentId),
      );
      const cameFromLeft = leftStudents.some(
        (student) => String(student.id) === String(studentId),
      );
      const sourceAdviser = advisers.find(
        (adviser) =>
          String(adviser.id) ===
          String(cameFromLeft ? leftAdviserId : rightAdviserId),
      );
      const targetAdviser = advisers.find(
        (adviser) => String(adviser.id) === String(targetAdviserId),
      );

      return { studentId, learner, sourceAdviser, targetAdviser };
    },
  );

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
          pendingTransfers={pendingTransfers}
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
          pendingTransfers={pendingTransfers}
          loading={loading}
          direction="left"
        />
      </div>

      {pendingDetails.length > 0 && (
        <div className="mt-6 border border-blue-200 rounded-lg overflow-hidden">
          <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
            <h3 className="text-sm font-extrabold text-blue-900">
              Staged Learner Transfers
            </h3>
            <p className="text-xs text-blue-700 mt-0.5">
              Review each destination before saving.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 uppercase">
                <tr>
                  <th className="p-3 border-b border-slate-200">Learner</th>
                  <th className="p-3 border-b border-slate-200">
                    Current Advisory
                  </th>
                  <th className="p-3 border-b border-slate-200">
                    Transfer To
                  </th>
                  <th className="p-3 border-b border-slate-200 text-center">
                    Status
                  </th>
                  <th className="p-3 border-b border-slate-200 text-center">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendingDetails.map(
                  ({ studentId, learner, sourceAdviser, targetAdviser }) => (
                    <tr key={studentId} className="border-b border-slate-100">
                      <td className="p-3 font-bold text-slate-900">
                        {learner ? learnerDisplayName(learner) : "Unknown learner"}
                      </td>
                      <td className="p-3 text-slate-700">
                        {sourceAdviser
                          ? orgAdviserName(sourceAdviser)
                          : "Unknown advisory"}
                      </td>
                      <td className="p-3 font-bold text-blue-700">
                        {targetAdviser
                          ? orgAdviserName(targetAdviser)
                          : "Unknown advisory"}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full font-bold ${
                            approvedTransfers[studentId]
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {approvedTransfers[studentId]
                            ? "Approved"
                            : "For Approval"}
                        </span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {!approvedTransfers[studentId] && (
                          <button
                            type="button"
                            onClick={() => handleApproveTransfer(studentId)}
                            disabled={saving}
                            className="px-3 py-1.5 mr-2 rounded bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Approve Transfer
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveTransfer(studentId)}
                          disabled={saving}
                          className="px-3 py-1.5 rounded border border-red-300 bg-white text-red-700 font-bold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SAVE TRANSFERS FOOTER BAR */}
      <div className="mt-8 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-lg">
        <div>
          <span className="text-sm font-bold text-slate-700">
            Pending Transfers:{" "}
          </span>
          <span className="text-sm font-extrabold text-blue-600">
            {pendingCount} Learner(s) staged · {approvedCount} approved
          </span>
        </div>
        <button
          onClick={handleSaveTransfer}
          disabled={!allTransfersApproved || saving}
          className={`px-6 py-2.5 rounded-md font-bold text-sm text-white transition-all ${
            !allTransfersApproved || saving
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
  pendingTransfers,
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
                  {orgAdviserName(adv)}{" "}
                  {adv.section || adv.section_assigned
                    ? `(Section: ${adv.section || adv.section_assigned})`
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
                  <th className="p-2 text-center w-32">Action</th>
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
                        {learnerDisplayName(st)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => onTransfer(st, targetAdviserId)}
                          disabled={!isTargetSelected || Boolean(pendingTransfers[st.id])}
                          title={
                            !isTargetSelected
                              ? "Select a destination class on the other side to enable transfer"
                              : pendingTransfers[st.id]
                                ? "This learner is already in Staged Learner Transfers"
                                : "Add this learner to Staged Learner Transfers"
                          }
                          className={`px-2 py-1 rounded text-[11px] font-bold text-white transition-all ${
                            !isTargetSelected || pendingTransfers[st.id]
                              ? "bg-slate-300 cursor-not-allowed"
                              : direction === "right"
                                ? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                                : "bg-purple-600 hover:bg-purple-700 cursor-pointer"
                          }`}
                        >
                          Transfer
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
                        {learnerDisplayName(st)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => onTransfer(st, targetAdviserId)}
                          disabled={!isTargetSelected || Boolean(pendingTransfers[st.id])}
                          title={
                            !isTargetSelected
                              ? "Select a destination class on the other side to enable transfer"
                              : pendingTransfers[st.id]
                                ? "This learner is already in Staged Learner Transfers"
                                : "Add this learner to Staged Learner Transfers"
                          }
                          className={`px-2 py-1 rounded text-[11px] font-bold text-white transition-all ${
                            !isTargetSelected || pendingTransfers[st.id]
                              ? "bg-slate-300 cursor-not-allowed"
                              : direction === "right"
                                ? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                                : "bg-purple-600 hover:bg-purple-700 cursor-pointer"
                          }`}
                        >
                          Transfer
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

