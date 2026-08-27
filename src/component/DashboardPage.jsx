import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import iecesLogo from "../image/ieceslogo.png";
import "../styles/DashboardPage.css";
import { EnrollmentForm } from "./EnrollmentForm";
import { EnrollmentDataTab } from "./EnrollmentDataTab";
import { AdvisoryClass } from "./AdvisoryClass";
import { TransferLearner } from "./TransferLearner";
import { AutoId } from "./AutoId"; // <--- IMPORT AUTO ID
import {
  adviserGradeKey,
  findOrgAdviserForProfile,
  isOrgAdviser,
  learnerBelongsToOrgAdviser,
  legacyProfileIdsForOrgAdviser,
  orgAdviserName,
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

      // Dashboard Manager's Org Chart is authoritative for chairmanship. A
      // Portal profile may still carry the older "adviser" role after someone
      // is appointed chairman, so derive the effective role at sign-in.
      const { data: orgRows, error: orgError } = await supabase
        .from("org_chart")
        .select("*");
      const orgAdviser = !orgError
        ? findOrgAdviserForProfile(
            data,
            (orgRows || []).filter(isOrgAdviser),
          )
        : null;
      setProfile(
        orgAdviser
          ? {
              ...data,
              role: orgAdviser.is_grade_chairman
                ? "grade_chairman"
                : data.role,
              grade_level_assigned:
                data.grade_level_assigned ||
                adviserGradeKey(orgAdviser.grade_level),
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

  const isAdminTest = profile?.username === "admin";
  const isAdviser =
    isAdminTest ||
    profile?.role === "adviser" ||
    profile?.role === "grade_chairman";
  const isGradeChairman = isAdminTest || profile?.role === "grade_chairman";

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
              {profile?.first_name || profile?.full_name || "User"}{" "}
              {profile?.family_name || ""}
            </span>
            <span className="user-role">
              {isAdminTest
                ? "⚙ ADMIN TEST — All Features"
                : profile?.role
                  ? profile.role.replace("_", " ")
                  : "Teacher"}
            </span>
          </div>
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

            <button
              className={`nav-item ${activeTab === "data" ? "active" : ""}`}
              onClick={() => setActiveTab("data")}
            >
              <span className="nav-icon">📊</span> Enrollment Information
            </button>

            {/* AUTO ID TAB */}
            <button
              className={`nav-item ${activeTab === "autoid" ? "active" : ""}`}
              onClick={() => setActiveTab("autoid")}
            >
              <span className="nav-icon">🪪</span> AutoID
            </button>

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
        <main className="dash-content">
          {activeTab === "enrollment" && <EnrollmentForm profile={profile} />}
          {isAdviser && (
            <div style={{ display: activeTab === "advisory" ? "block" : "none" }}>
              <AdvisoryClass profile={profile} />
            </div>
          )}
          <div style={{ display: activeTab === "data" ? "block" : "none" }}>
            <EnrollmentDataTab />
          </div>
          {activeTab === "autoid" && <AutoId profile={profile} />}
          {activeTab === "transfer_learner" && isGradeChairman && (
            <TransferLearner profile={profile} />
          )}
          {activeTab === "search" && <SearchTab />}
        </main>
      </div>
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
        return learnerBelongsToOrgAdviser(student, adviser, legacyIds);
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
