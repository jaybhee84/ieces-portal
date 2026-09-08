import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import iecesLogo from "../image/ieceslogo.png";
import "../styles/DashboardPage.css";
import { EnrollmentForm } from "./EnrollmentForm";
import { EnrollmentDataTab } from "./EnrollmentDataTab";
import { AdvisoryClass } from "./AdvisoryClass";
import { NutritionalStatus } from "./NutritionalStatus";
import { TransferLearner } from "./TransferLearner";
import { AutoId } from "./AutoId"; // <--- IMPORT AUTO ID
import { Form137 } from "./Form137";
import { FileSpreadsheet } from "lucide-react";
import {
  adviserGradeKey,
  findOrgAdviserForProfile,
  findOrgTeacherForProfile,
  isOrgAdviser,
  learnerBelongsToOrgAdviser,
  legacyProfileIdsForOrgAdviser,
  orgAdviserName,
  orgTeachingRole,
} from "../lib/orgAdvisers";
import { loadAdvisoryRoster } from "../lib/advisoryRosterData";
import { PHILIRI_READING_CATEGORIES } from "../lib/readingOptions";
import {
  displayBirthdate,
  learnerAge,
  learnerBarangay,
  learnerDisplayName,
  learnerGenderLabel,
  learnerGradeLabel,
  learnerLrn,
  learnerNutrition,
  nutritionBadgeClass,
} from "../lib/learnerRoster";

// ── Sidebar update modal ──────────────────────────────────────────────────────
function SidebarUpdateModal({ onClose }) {
  const [status, setStatus] = useState("checking");
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!window.electronAPI) {
      setStatus("error");
      setErrorMsg("Not running in Electron.");
      return;
    }

    const removeStatusListener = window.electronAPI.onUpdaterStatus((data) => {
      if (data.status === "checking") {
        setStatus("checking");
      } else if (data.status === "available") {
        setStatus("available");
        setUpdateInfo(data);
      } else if (data.status === "up-to-date") {
        setStatus("up-to-date");
      } else if (data.status === "downloaded") {
        setStatus("downloaded");
        setUpdateInfo(data);
      } else if (data.status === "error") {
        setStatus("error");
        setErrorMsg(data.message || "Unknown error.");
      }
    });
    const removeProgressListener = window.electronAPI.onUpdaterProgress(
      (data) => {
        setStatus("downloading");
        setProgress(data.percent);
      },
    );
    window.electronAPI.checkForUpdates().catch(() => {
      setStatus("error");
      setErrorMsg("Could not reach update server.");
    });
    return () => {
      removeStatusListener?.();
      removeProgressListener?.();
    };
  }, []);

  const body = () => {
    switch (status) {
      case "checking":
        return (
          <>
            <div className="upd-spinner" />
            <p className="upd-msg">Checking for updates…</p>
          </>
        );
      case "up-to-date":
        return (
          <>
            <div className="upd-icon upd-ok">✓</div>
            <p className="upd-msg" style={{ color: "#2e7d32" }}>
              You're on the latest version.
            </p>
          </>
        );
      case "available":
        return (
          <>
            <div className="upd-icon upd-new">↑</div>
            <p className="upd-msg">
              <strong>v{updateInfo?.version}</strong> is available!
            </p>
            {updateInfo?.releaseDate && (
              <p className="upd-sub">
                Released:{" "}
                {new Date(updateInfo.releaseDate).toLocaleDateString()}
              </p>
            )}
            <button
              className="lf-btn upd-btn"
              onClick={() => {
                setStatus("downloading");
                setProgress(0);
                window.electronAPI.downloadUpdate();
              }}
            >
              Download Update
            </button>
          </>
        );
      case "downloading":
        return (
          <>
            <div className="upd-progress-wrap">
              <div
                className="upd-progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="upd-msg">Downloading… {progress}%</p>
          </>
        );
      case "downloaded":
        return (
          <>
            <div className="upd-icon upd-ok">✓</div>
            <p className="upd-msg" style={{ color: "#2e7d32" }}>
              v{updateInfo?.version} ready! Restart to install.
            </p>
            <button
              className="lf-btn upd-btn"
              onClick={() => window.electronAPI.installUpdate()}
            >
              Restart &amp; Install
            </button>
          </>
        );
      case "error":
        return (
          <>
            <div className="upd-icon upd-err">✕</div>
            <p className="upd-msg" style={{ color: "#b71c1c" }}>
              Update check failed.
            </p>
            <p className="upd-sub">{errorMsg}</p>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="upd-overlay" onClick={onClose}>
      <div className="upd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="upd-modal-header">
          <h3>Check for Updates</h3>
          <button className="upd-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="upd-modal-body">{body()}</div>
      </div>
    </div>
  );
}

export default function DashboardPage({ session, userSession, onLogout }) {
  const [activeTab, setActiveTab] = useState("enrollment");
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appVersion, setAppVersion] = useState("");
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [orgAdvisers, setOrgAdvisers] = useState([]);
  const [testGrade, setTestGrade] = useState("");
  const [testAdviserId, setTestAdviserId] = useState("");
  const [testRole, setTestRole] = useState("adviser");
  const [testScope, setTestScope] = useState("specific");
  const [showTestSelector, setShowTestSelector] = useState(true);
  const [isCreatorAccount, setIsCreatorAccount] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.getVersion) {
      window.electronAPI
        .getVersion()
        .then(setAppVersion)
        .catch(() => {});
    }
    if (window.electronAPI?.onMenuCheckForUpdates) {
      const removeMenuListener = window.electronAPI.onMenuCheckForUpdates(() =>
        setShowUpdateModal(true),
      );
      return removeMenuListener;
    }
  }, []);

  const activeSession = session || userSession;

  useEffect(() => {
    fetchProfile();
  }, [activeSession]);

  const fetchProfile = async () => {
    try {
      const currentUserId = activeSession?.user?.id;
      if (!currentUserId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("portal_profile")
        .select("*")
        .eq("id", currentUserId)
        .single();

      if (error || !data) {
        // A valid Supabase session from another IECES app is authentication,
        // but it is not authorization to use Portal.
        if (typeof onLogout === "function") {
          await onLogout();
        }
        return;
      }

      const { data: allowed, error: allowError } = await supabase.rpc(
        "is_app_email_allowed",
        {
          app_key: "portal",
          candidate_email: (data.real_email || data.email).trim().toLowerCase(),
        },
      );

      if (allowError || !allowed) {
        if (typeof onLogout === "function") {
          await onLogout();
        }
        return;
      }

      const { data: ownerEmail } = await supabase.rpc(
        "dashboard_login_email",
        { candidate_username: "admin" },
      );
      setIsCreatorAccount(
        Boolean(ownerEmail) &&
          String(ownerEmail).toLowerCase() ===
            String(activeSession?.user?.email || data.auth_email || "").toLowerCase(),
      );

      // Dashboard Manager's Org Chart is authoritative for chairmanship. A
      // Portal profile may still carry the older "adviser" role after someone
      // is appointed chairman, so derive the effective role at sign-in.
      const { data: orgRows, error: orgError } = await supabase
        .from("org_chart")
        .select("*");
      const availableOrgAdvisers = !orgError
        ? (orgRows || []).filter(isOrgAdviser)
        : [];
      setOrgAdvisers(availableOrgAdvisers);
      const orgTeacher = !orgError
        ? findOrgTeacherForProfile(data, orgRows || [])
        : null;
      const resolvedTeachingRole = orgTeachingRole(orgTeacher);
      setProfile(
        orgTeacher && data.role !== "admin"
          ? {
              ...data,
              role: resolvedTeachingRole,
              grade_level_assigned:
                resolvedTeachingRole === "subject_teacher"
                  ? null
                  : data.grade_level_assigned ||
                    adviserGradeKey(orgTeacher.grade_level),
            }
          : data,
      );
    } catch (err) {
      console.error("Error fetching user profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutClick = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error during sign out:", err);
    } finally {
      if (typeof onLogout === "function") {
        onLogout();
      }
    }
  };

  if (loading) {
    return (
      <div className="dash-loading-screen">
        <div className="dash-spinner"></div>
        <p>Loading IECES Portal...</p>
      </div>
    );
  }

  const isAdminAccount =
    isCreatorAccount || profile?.role === "admin" || profile?.username === "admin";
  const selectedTestAdviser = isAdminAccount
    ? orgAdvisers.find(
        (adviser) => String(adviser.id) === String(testAdviserId),
      )
    : null;
  const hasTestSelection = Boolean(
    isAdminAccount &&
      (testRole === "subject_teacher"
        ? true
        : testRole === "adviser"
          ? selectedTestAdviser
          : testGrade && (testScope === "grade" || selectedTestAdviser)),
  );
  const effectiveProfile = hasTestSelection
    ? {
        ...profile,
        ...(selectedTestAdviser
          ? {
              first_name: selectedTestAdviser.first_name,
              middle_name: selectedTestAdviser.middle_name,
              family_name: selectedTestAdviser.family_name,
            }
          : {}),
        grade_level_assigned:
          testRole === "subject_teacher"
            ? null
            : selectedTestAdviser
              ? adviserGradeKey(selectedTestAdviser.grade_level)
              : testGrade,
        section_assigned:
          selectedTestAdviser?.section || selectedTestAdviser?.section_assigned || "",
        role: testRole,
        test_access_scope: testScope,
      }
    : profile;
  const testGrades = Array.from(
    new Set(orgAdvisers.map((adviser) => adviserGradeKey(adviser.grade_level))),
  ).filter(Boolean).sort((left, right) => {
    if (left === "SNED") return 1;
    if (right === "SNED") return -1;
    return Number(left) - Number(right);
  });
  const gradeTestAdvisers = orgAdvisers
    .filter(
      (adviser) =>
        testRole === "adviser" ||
        adviserGradeKey(adviser.grade_level) === testGrade,
    )
    .sort((left, right) => {
      const leftGrade = adviserGradeKey(left.grade_level);
      const rightGrade = adviserGradeKey(right.grade_level);
      const gradeRank = (grade) =>
        grade === "0" ? 0 : grade === "SNED" ? 7 : Number(grade) || 8;
      return (
        gradeRank(leftGrade) - gradeRank(rightGrade) ||
        orgAdviserName(left).localeCompare(orgAdviserName(right))
      );
    });
  const isAdviser =
    effectiveProfile?.role === "adviser" ||
    effectiveProfile?.role === "grade_chairman";
  const isGradeChairman = effectiveProfile?.role === "grade_chairman";
  const isSubjectTeacher = effectiveProfile?.role === "subject_teacher";
  const gradeLabel = (grade) =>
    grade === "0" ? "Kinder" : grade === "SNED" ? "SNED" : `Grade ${grade}`;
  const testViewKey = hasTestSelection
    ? `${testGrade}:${testAdviserId}:${testRole}:${testScope}`
    : "account";

  return (
    <div className="dash-root">
      {/* Top Header */}
      <header className="dash-header">
        <div className="dash-header-brand">
          <img src={iecesLogo} alt="IECES Logo" className="dash-logo" />
          <div>
            <h1>IECES PORTAL</h1>
            <p>Isabela East Central Elementary School</p>
          </div>
        </div>

        <div className="dash-header-user">
          <div className="user-details">
            <span className="user-name">
              {effectiveProfile?.first_name || effectiveProfile?.full_name || "User"}{" "}
              {effectiveProfile?.family_name || ""}
            </span>
            <span className="user-role">
              {hasTestSelection
                ? testRole === "subject_teacher"
                  ? "Admin test · subject teacher"
                  : `Admin test · ${effectiveProfile.role.replace("_", " ")} · ${gradeLabel(testGrade)} · ${testScope === "grade" ? "All classes" : "Specific class"}`
                : effectiveProfile?.role
                  ? effectiveProfile.role.replace("_", " ")
                  : "Teacher"}
            </span>
          </div>
          {isAdminAccount && hasTestSelection && (
            <button
              type="button"
              className="dash-switch-user-btn"
              onClick={() => setShowTestSelector(true)}
            >
              Switch test user
            </button>
          )}
          <button onClick={handleSignOutClick} className="dash-logout-btn">
            Sign Out
          </button>
        </div>
      </header>

      <div className="dash-body">
        {/* Navigation Sidebar */}
        <nav className="dash-sidebar">
          <div className="sidebar-menu">
            <button
              className={`nav-item ${activeTab === "enrollment" ? "active" : ""}`}
              onClick={() => setActiveTab("enrollment")}
            >
              <span className="nav-icon">📝</span> Enrollment
            </button>

            {isAdviser && (
              <button
                className={`nav-item ${activeTab === "advisory" ? "active" : ""}`}
                onClick={() => setActiveTab("advisory")}
              >
                <span className="nav-icon">🏫</span> Advisory Class
              </button>
            )}

            {isAdviser && (
              <button
                className={`nav-item ${activeTab === "form137" ? "active" : ""}`}
                onClick={() => setActiveTab("form137")}
              >
                <FileSpreadsheet className="nav-icon" size={18} /> Form 137
              </button>
            )}

            {isAdviser && (
              <button
                className={`nav-item ${activeTab === "nutrition" ? "active" : ""}`}
                onClick={() => setActiveTab("nutrition")}
              >
                <span className="nav-icon">🥗</span> Nutritional Status
              </button>
            )}

            <button
              className={`nav-item ${activeTab === "data" ? "active" : ""}`}
              onClick={() => setActiveTab("data")}
            >
              <span className="nav-icon">📊</span> Enrollment Information
            </button>

            {/* AUTO ID TAB */}
            {!isSubjectTeacher && (
            <button
              className={`nav-item ${activeTab === "autoid" ? "active" : ""}`}
              onClick={() => setActiveTab("autoid")}
            >
              <span className="nav-icon">🪪</span> AutoID
            </button>
            )}

            {/* TRANSFER LEARNER TAB - VISIBLE ONLY TO GRADE CHAIRMAN */}
            {isGradeChairman && (
              <button
                className={`nav-item ${
                  activeTab === "transfer_learner" ? "active" : ""
                }`}
                onClick={() => setActiveTab("transfer_learner")}
              >
                <span className="nav-icon">🔄</span> Transfer Learner
              </button>
            )}

            <button
              className={`nav-item ${activeTab === "search" ? "active" : ""}`}
              onClick={() => setActiveTab("search")}
            >
              <span className="nav-icon">🔍</span> Search Learner
            </button>
          </div>

          {/* Sidebar footer — Check for Updates + version */}
          <div className="sidebar-footer">
            <button
              className="sidebar-update-btn"
              onClick={() => setShowUpdateModal(true)}
            >
              <span className="sidebar-update-icon">↑</span> Check for Updates
            </button>
            {appVersion && (
              <span className="sidebar-version">v{appVersion}</span>
            )}
          </div>
        </nav>

        {/* Update modal */}
        {showUpdateModal && (
          <SidebarUpdateModal onClose={() => setShowUpdateModal(false)} />
        )}

        {/* Content Panel Area */}
        <main className="dash-content" key={testViewKey}>
          {activeTab === "enrollment" && <EnrollmentForm profile={effectiveProfile} />}
          {isAdviser && (
            <div style={{ display: activeTab === "advisory" ? "block" : "none" }}>
              <AdvisoryClass profile={effectiveProfile} />
            </div>
          )}
          {activeTab === "form137" && isAdviser && <Form137 profile={effectiveProfile} />}
          {isAdviser && (
            <div style={{ display: activeTab === "nutrition" ? "block" : "none" }}>
              <NutritionalStatus profile={effectiveProfile} />
            </div>
          )}
          <div style={{ display: activeTab === "data" ? "block" : "none" }}>
            <EnrollmentDataTab />
          </div>
          {!isSubjectTeacher && (
            <div style={{ display: activeTab === "autoid" ? "block" : "none" }}>
              <AutoId profile={effectiveProfile} />
            </div>
          )}
          {activeTab === "transfer_learner" && isGradeChairman && (
            <TransferLearner profile={effectiveProfile} />
          )}
          {activeTab === "search" && <SearchTab />}
        </main>
      </div>
      {isAdminAccount && showTestSelector && (
        <div
          className="admin-test-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-test-title"
        >
          <div className="admin-test-card">
            <h2 id="admin-test-title">Choose a test user</h2>
            <p>
              Select a role and the grade or class you want to test. The
              teacher's account and password are not used.
            </p>
            <label>
              <span>Act as</span>
              <select
                value={testRole}
                onChange={(event) => {
                  const role = event.target.value;
                  setTestRole(role);
                  setTestAdviserId("");
                  if (role === "adviser" || role === "subject_teacher") {
                    setTestGrade("");
                    setTestScope("specific");
                  }
                }}
              >
                <option value="adviser">Regular adviser</option>
                <option value="grade_chairman">Grade chairman</option>
                <option value="subject_teacher">Subject teacher</option>
              </select>
            </label>
            {testRole === "grade_chairman" && (
              <label>
                <span>Grade level</span>
                <select
                  value={testGrade}
                  onChange={(event) => {
                    setTestGrade(event.target.value);
                    setTestAdviserId("");
                  }}
                >
                  <option value="">Select grade level</option>
                  {testGrades.map((grade) => (
                    <option key={grade} value={grade}>{gradeLabel(grade)}</option>
                  ))}
                </select>
              </label>
            )}
            {testRole === "grade_chairman" && (
            <label>
              <span>Class access</span>
              <select
                value={testScope}
                onChange={(event) => {
                  const scope = event.target.value;
                  setTestScope(scope);
                  if (scope === "grade") setTestAdviserId("");
                }}
              >
                <option value="specific">Specific adviser's class</option>
                <option value="grade">
                  All classes in selected grade
                </option>
              </select>
            </label>
            )}
            {(testRole === "adviser" ||
              (testRole === "grade_chairman" && testScope === "specific")) && (
              <label>
                <span>{testRole === "adviser" ? "Adviser from any grade level" : "Adviser / class assignment"}</span>
                <select
                  value={testAdviserId}
                  disabled={testRole === "grade_chairman" && !testGrade}
                  onChange={(event) => {
                    const adviserId = event.target.value;
                    setTestAdviserId(adviserId);
                    if (testRole === "adviser") {
                      const adviser = orgAdvisers.find(
                        (item) => String(item.id) === adviserId,
                      );
                      setTestGrade(
                        adviser ? adviserGradeKey(adviser.grade_level) : "",
                      );
                    }
                  }}
                >
                  <option value="">
                    {testRole === "adviser"
                      ? "Select an adviser"
                      : testGrade
                        ? "Select an adviser"
                        : "Select a grade first"}
                  </option>
                  {gradeTestAdvisers.map((adviser) => (
                    <option key={adviser.id} value={String(adviser.id)}>
                      {testRole === "adviser"
                        ? `${gradeLabel(adviserGradeKey(adviser.grade_level))} — `
                        : ""}
                      {orgAdviserName(adviser)}
                      {adviser.is_grade_chairman ? " (Grade Chairman)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="admin-test-actions">
              {hasTestSelection && (
                <button
                  type="button"
                  className="admin-test-cancel"
                  onClick={() => setShowTestSelector(false)}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="admin-test-continue"
                disabled={
                  testRole === "subject_teacher"
                    ? false
                    : testRole === "adviser"
                      ? !testAdviserId
                      : !testGrade ||
                        (testScope === "specific" && !testAdviserId)
                }
                onClick={() => {
                  setActiveTab("enrollment");
                  setShowTestSelector(false);
                }}
              >
                Continue as selected user
              </button>
            </div>
            <small>
              Your admin account remains signed in underneath this temporary test view.
            </small>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MY ADVISORY LIST TAB (FOR ASSIGNED TEACHERS) ──────────────────────────
function AdvisoryListTab({ profile, isGradeChairman }) {
  const [students, setStudents] = useState([]);
  const [otherAdvisers, setOtherAdvisers] = useState([]);
  const [linkedOrgAdviser, setLinkedOrgAdviser] = useState(null);

  useEffect(() => {
    fetchAdvisoryStudents();
    if (isGradeChairman) fetchGradeAdvisers();

    const channel = supabase
      .channel("students_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students" },
        () => {
          fetchAdvisoryStudents();
        },
      )
      .subscribe();

    const orgChannel = supabase
      .channel("advisory_list_org_chart_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "org_chart" },
        () => {
          fetchAdvisoryStudents();
          if (isGradeChairman) fetchGradeAdvisers();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(orgChannel);
    };
  }, [profile]);

  const fetchAdvisoryStudents = async () => {
    const result = await loadAdvisoryRoster(profile);
    setLinkedOrgAdviser(result.orgAdviser);
    setStudents(result.students);
  };

  const fetchGradeAdvisers = async () => {
    const [orgResult, profileResult, legacyProfileResult] = await Promise.all([
      supabase.from("org_chart").select("*"),
      supabase.from("portal_profile").select("*"),
      supabase.from("profiles").select("*"),
    ]);
    const { data } = orgResult;
    if (data) {
      setOtherAdvisers(
        data
          .filter(isOrgAdviser)
          .filter(
            (adviser) =>
              adviserGradeKey(adviser.grade_level) ===
              adviserGradeKey(profile?.grade_level_assigned),
          )
          .sort((left, right) =>
            orgAdviserName(left).localeCompare(orgAdviserName(right)),
          )
          .map((adviser) => ({
            ...adviser,
            assignment_ids: [
              String(adviser.id),
              ...legacyProfileIdsForOrgAdviser(
                adviser,
                profileResult.data || [],
              ),
              ...legacyProfileIdsForOrgAdviser(
                adviser,
                legacyProfileResult.data || [],
              ),
            ],
          })),
      );
    }
  };

  const handleTransfer = async (studentId, newAdviserId) => {
    await supabase
      .from("students")
      .update({ adviser_id: newAdviserId })
      .eq("id", studentId);
    fetchAdvisoryStudents();
  };

  const handleReadingCategoryChange = async (studentId, readingCategory) => {
    await supabase
      .from("students")
      .update({ reading_category: readingCategory })
      .eq("id", studentId);
    fetchAdvisoryStudents();
  };

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <h2>
          {isGradeChairman
            ? `Grade ${profile?.grade_level_assigned} Overview (Grade Chairman)`
            : linkedOrgAdviser
              ? `${orgAdviserName(linkedOrgAdviser)} — Advisory Learners`
              : "Adviser not linked in Org Chart"}
        </h2>
        <p>Total Enrolled: {students.length} Learners</p>
      </div>

      <div className="dash-table-wrapper">
        <table className="dash-table" style={{ minWidth: "1320px" }}>
          <thead>
            <tr>
              <th>No.</th>
              <th>Photo</th>
              <th>LRN</th>
              <th>Learner Name</th>
              <th>Birthdate</th>
              <th>Age</th>
              <th>Religion</th>
              <th>Tribe</th>
              <th>Barangay</th>
              <th>BMI Status</th>
              <th>HFA Status</th>
              <th>Reading Level</th>
              {isGradeChairman && <th>Transfer Advisory</th>}
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td
                  colSpan={isGradeChairman ? "13" : "12"}
                  style={{ textAlign: "center" }}
                >
                  No learners assigned yet.
                </td>
              </tr>
            ) : (
              students.map((st, index) => {
                const nutrition = learnerNutrition(st);
                const photo = st.photo_url || st.photo;
                return <tr key={st.id}>
                  <td className="font-bold text-center text-[#7b1a1a]">{index + 1}</td>
                  <td>{photo ? <img src={photo} alt={`${learnerDisplayName(st)} profile`} className="w-10 h-10 rounded-full object-cover border border-slate-200" /> : <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 grid place-items-center text-slate-400">👤</div>}</td>
                  <td className="font-mono whitespace-nowrap">{learnerLrn(st)}</td>
                  <td className="font-bold min-w-[180px]">{learnerDisplayName(st)}</td>
                  <td className="whitespace-nowrap">{displayBirthdate(st.birthdate)}</td>
                  <td className="text-center">{learnerAge(st)}</td>
                  <td>{st.religion || "—"}</td>
                  <td>{st.tribe || "—"}</td>
                  <td>{learnerBarangay(st)}</td>
                  <td><span className={`inline-block px-2 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${nutritionBadgeClass(nutrition.bmi)}`}>{nutrition.bmi}</span></td>
                  <td><span className={`inline-block px-2 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${nutritionBadgeClass(nutrition.hfa)}`}>{nutrition.hfa}</span></td>
                  <td>
                    <select
                      value={st.reading_category || ""}
                      onChange={(e) =>
                        handleReadingCategoryChange(st.id, e.target.value)
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
                  {isGradeChairman && (
                    <td>
                      <select
                        value={
                          otherAdvisers.find((adviser) =>
                            adviser.assignment_ids.includes(String(st.adviser_id)),
                          )?.id || st.adviser_id || ""
                        }
                        onChange={(e) => handleTransfer(st.id, e.target.value)}
                        className="table-select highlight"
                      >
                        {otherAdvisers.map((adv) => (
                          <option key={adv.id} value={adv.id}>
                            {orgAdviserName(adv)}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── SEARCH TAB ──────────────────────────────────────────────────────────────
function SearchTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const searchColumns =
    "id,family_name,first_name,middle_name,name,lrn,grade_level,section,adviser_id";
  const cleanSearchTerm = (value) =>
    String(value || "").replace(/[,()%_*]/g, " ").trim();

  useEffect(() => {
    const term = cleanSearchTerm(searchTerm);
    if (term.length < 2 || /^\d+$/.test(term)) {
      setSuggestions([]);
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("students")
        .select(searchColumns)
        .eq("school_id", "126001")
        .ilike("family_name", `${term}%`)
        .order("family_name", { ascending: true })
        .order("first_name", { ascending: true })
        .limit(8);
      if (active) setSuggestions(error ? [] : data || []);
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchTerm]);

  const withAdvisory = async (students) => {
    const { data: orgRows } = await supabase.from("org_chart").select("*");
    const advisers = (orgRows || []).filter(isOrgAdviser);
    const adviserIds = advisers.map((adviser) => adviser.id);
    return students.map((student) => {
      const adviser = advisers.find((candidate) =>
        learnerBelongsToOrgAdviser(student, candidate, [], adviserIds),
      );
      const grade = learnerGradeLabel(student);
      const section =
        adviser?.section ||
        adviser?.section_assigned ||
        student.section ||
        "";
      return {
        ...student,
        advisory: adviser
          ? `${grade}${section ? ` - ${section}` : ""} · ${orgAdviserName(adviser)}`
          : section
            ? `${grade} - ${section}`
            : `${grade} - Unassigned`,
      };
    });
  };

  const runSearch = async (rawTerm) => {
    const term = cleanSearchTerm(rawTerm);
    if (!term) return;
    setSearching(true);
    setErrorMessage("");
    setSuggestions([]);

    let query = supabase
      .from("students")
      .select(searchColumns)
      .eq("school_id", "126001")
      .limit(50);
    query = /^\d+$/.test(term)
      ? query.eq("lrn", term)
      : query.ilike("family_name", `%${term}%`);

    const { data, error } = await query;
    if (error) {
      setResults([]);
      setErrorMessage(`Search failed: ${error.message}`);
    } else {
      setResults(await withAdvisory(data || []));
    }
    setSearched(true);
    setSearching(false);
  };

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <h2>Search Learner</h2>
        <p>Search all IECES learners by exact LRN or Family Name.</p>
      </div>

      <div className="relative max-w-3xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runSearch(searchTerm);
          }}
          className="search-box"
        >
          <input
            type="text"
            placeholder="Enter Family Name or 12-digit LRN..."
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setSearched(false);
            }}
            autoComplete="off"
            required
          />
          <button type="submit" className="lf-btn search-btn" disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </button>
        </form>

        {suggestions.length > 0 && (
          <div className="absolute left-0 right-24 top-full z-40 -mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            {suggestions.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => {
                  const familyName = student.family_name || "";
                  setSearchTerm(familyName);
                  runSearch(familyName);
                }}
                className="flex w-full items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 last:border-b-0"
              >
                <span className="font-semibold text-slate-800">
                  {learnerDisplayName(student)}
                </span>
                <span className="whitespace-nowrap text-xs font-semibold text-[#7b1a1a]">
                  {learnerGradeLabel(student)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {searched && !errorMessage && (
        <div className="mt-5 space-y-3">
          {results.length === 0 ? (
            <p className="no-results">No learner records matching your search.</p>
          ) : (
            results.map((student) => (
              <div
                key={student.id}
                className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-bold text-slate-800">
                  {learnerDisplayName(student)}
                </span>
                <span className="text-sm font-semibold text-[#7b1a1a]">
                  {student.advisory}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LegacySearchTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    const [studentResult, orgResult, portalResult, profileResult] = await Promise.all([
      supabase
        .from("students")
        .select("*")
        .or(`family_name.ilike.%${searchTerm}%,lrn.ilike.%${searchTerm}%`),
      supabase.from("org_chart").select("*"),
      supabase.from("portal_profile").select("*"),
      supabase.from("profiles").select("*"),
    ]);

    const orgAdvisers = (orgResult.data || []).filter(isOrgAdviser);
    const portalProfiles = portalResult.data || [];
    const legacyProfiles = profileResult.data || [];
    const data = (studentResult.data || []).map((student) => {
      const matchedAdviser = orgAdvisers.find((adviser) => {
        const legacyIds = [
          ...legacyProfileIdsForOrgAdviser(adviser, portalProfiles),
          ...legacyProfileIdsForOrgAdviser(adviser, legacyProfiles),
        ];
        return learnerBelongsToOrgAdviser(
          student,
          adviser,
          legacyIds,
          orgAdvisers.map((item) => item.id),
        );
      });
      const adviserProfile = matchedAdviser
        ? [...portalProfiles, ...legacyProfiles].find(
            (candidate) =>
              findOrgAdviserForProfile(candidate, [matchedAdviser])?.id ===
              matchedAdviser.id,
          )
        : null;
      return {
        ...student,
        org_adviser: matchedAdviser,
        org_adviser_photo:
          matchedAdviser?.photo_url ||
          matchedAdviser?.photo ||
          matchedAdviser?.avatar_url ||
          matchedAdviser?.profile_picture ||
          matchedAdviser?.profile_picture_url ||
          matchedAdviser?.image_url ||
          matchedAdviser?.image ||
          adviserProfile?.photo_url ||
          adviserProfile?.photo ||
          adviserProfile?.avatar_url ||
          adviserProfile?.profile_picture ||
          adviserProfile?.profile_picture_url ||
          adviserProfile?.image_url ||
          adviserProfile?.image ||
          "",
      };
    });

    setResults(data);
    setSearched(true);
  };

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <h2>Search Learner</h2>
        <p>
          Locate learner information and assigned adviser by Family Name or LRN.
        </p>
      </div>

      <form onSubmit={handleSearch} className="search-box">
        <input
          type="text"
          placeholder="Search by Family Name or 12-digit LRN..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          required
        />
        <button type="submit" className="lf-btn search-btn">
          Search
        </button>
      </form>

      {searched && (
        <div className="search-results">
          {results.length === 0 ? (
            <p className="no-results">
              No learner records matching your search.
            </p>
          ) : (
            results.map((st) => {
              const photo =
                st.photo_url ||
                st.photo ||
                st.profile_picture ||
                st.profile_picture_url ||
                st.avatar_url ||
                st.image_url ||
                st.image;
              const adviserPhoto = st.org_adviser_photo;
              const adviserGrade = adviserGradeKey(st.org_adviser?.grade_level);
              const grade = st.org_adviser
                ? adviserGrade === "0"
                  ? "Kinder"
                  : adviserGrade === "SNED"
                    ? "SNED"
                    : `Grade ${adviserGrade}`
                : learnerGradeLabel(st);
              return (
              <div key={st.id} className="search-item-card">
                <div className="search-learner-summary">
                  {photo ? (
                    <img
                      src={photo}
                      alt={`${learnerDisplayName(st)} profile`}
                      className="search-learner-photo"
                    />
                  ) : (
                    <div
                      className="search-learner-photo search-learner-photo-empty"
                      aria-label="No profile photo"
                    >
                      👤
                    </div>
                  )}
                  <div className="search-item-main">
                  <h3>
                    {learnerDisplayName(st)}
                  </h3>
                  <p className="lrn-badge">LRN: {learnerLrn(st)}</p>
                  <p>
                    Grade: <strong>{grade}</strong> | Gender:{" "}
                    <strong>{learnerGenderLabel(st)}</strong> | Age:{" "}
                    <strong>{learnerAge(st)}</strong>
                  </p>
                  <p className="sub-detail">
                    Address: {st.address} | Contact: {st.contact_number}
                  </p>
                  <p className="sub-detail">
                    Parents:{" "}
                    {st.father_name ||
                      st.mother_name ||
                      st.guardian_name ||
                      "N/A"}
                  </p>
                  </div>
                </div>

                <div className="search-item-adviser">
                  {adviserPhoto ? (
                    <img
                      src={adviserPhoto}
                      alt={`${orgAdviserName(st.org_adviser)} profile`}
                      className="search-adviser-photo"
                    />
                  ) : (
                    <div
                      className="search-adviser-photo search-adviser-photo-empty"
                      aria-label="No adviser profile photo"
                    >
                      👤
                    </div>
                  )}
                  <span className="adv-label">Adviser</span>
                  <span className="adv-name">
                    {st.org_adviser
                      ? orgAdviserName(st.org_adviser)
                      : "Unassigned in Org Chart"}
                  </span>
                  <span className="adv-section">
                    {st.org_adviser?.section || st.org_adviser?.section_assigned
                      ? `Section: ${st.org_adviser.section || st.org_adviser.section_assigned}`
                      : ""}
                  </span>
                </div>
              </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
