import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import iecesLogo from "../image/ieceslogo.png";
import "../styles/DashboardPage.css";
import { EnrollmentForm } from "./EnrollmentForm";
import { EnrollmentDataTab } from "./EnrollmentDataTab";
import { AdvisoryClass } from "./AdvisoryClass";
import { TransferLearner } from "./TransferLearner";

// ── Sidebar update modal ──────────────────────────────────────────────────────
function SidebarUpdateModal({ onClose }) {
  const [status, setStatus] = useState("checking");
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!window.electronAPI) { setStatus("error"); setErrorMsg("Not running in Electron."); return; }

    const removeStatusListener = window.electronAPI.onUpdaterStatus((data) => {
      if (data.status === "checking")        { setStatus("checking"); }
      else if (data.status === "available")  { setStatus("available"); setUpdateInfo(data); }
      else if (data.status === "up-to-date") { setStatus("up-to-date"); }
      else if (data.status === "downloaded") { setStatus("downloaded"); setUpdateInfo(data); }
      else if (data.status === "error")      { setStatus("error"); setErrorMsg(data.message || "Unknown error."); }
    });
    const removeProgressListener = window.electronAPI.onUpdaterProgress((data) => {
      setStatus("downloading");
      setProgress(data.percent);
    });
    window.electronAPI.checkForUpdates().catch(() => {
      setStatus("error"); setErrorMsg("Could not reach update server.");
    });
    return () => {
      removeStatusListener?.();
      removeProgressListener?.();
    };
  }, []);

  const body = () => {
    switch (status) {
      case "checking":
        return <><div className="upd-spinner" /><p className="upd-msg">Checking for updates…</p></>;
      case "up-to-date":
        return <><div className="upd-icon upd-ok">✓</div><p className="upd-msg" style={{color:"#2e7d32"}}>You're on the latest version.</p></>;
      case "available":
        return <>
          <div className="upd-icon upd-new">↑</div>
          <p className="upd-msg"><strong>v{updateInfo?.version}</strong> is available!</p>
          {updateInfo?.releaseDate && <p className="upd-sub">Released: {new Date(updateInfo.releaseDate).toLocaleDateString()}</p>}
          <button className="lf-btn upd-btn" onClick={() => { setStatus("downloading"); setProgress(0); window.electronAPI.downloadUpdate(); }}>Download Update</button>
        </>;
      case "downloading":
        return <>
          <div className="upd-progress-wrap"><div className="upd-progress-bar" style={{width:`${progress}%`}} /></div>
          <p className="upd-msg">Downloading… {progress}%</p>
        </>;
      case "downloaded":
        return <>
          <div className="upd-icon upd-ok">✓</div>
          <p className="upd-msg" style={{color:"#2e7d32"}}>v{updateInfo?.version} ready! Restart to install.</p>
          <button className="lf-btn upd-btn" onClick={() => window.electronAPI.installUpdate()}>Restart &amp; Install</button>
        </>;
      case "error":
        return <><div className="upd-icon upd-err">✕</div><p className="upd-msg" style={{color:"#b71c1c"}}>Update check failed.</p><p className="upd-sub">{errorMsg}</p></>;
      default: return null;
    }
  };

  return (
    <div className="upd-overlay" onClick={onClose}>
      <div className="upd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="upd-modal-header">
          <h3>Check for Updates</h3>
          <button className="upd-close" onClick={onClose}>✕</button>
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
      window.electronAPI.getVersion().then(setAppVersion).catch(() => {});
    }
    if (window.electronAPI?.onMenuCheckForUpdates) {
      const removeMenuListener = window.electronAPI.onMenuCheckForUpdates(() => setShowUpdateModal(true));
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

      if (!error && data) {
        setProfile(data);
      }
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

  // ── Admin test override ──────────────────────────────────────────────────────
  // Logging in as username "admin" unlocks all role-gated features for testing.
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
              <span className="nav-icon">📝</span> Enrolment
            </button>

            {isAdviser && (
              <button
                className={`nav-item ${activeTab === "advisory" ? "active" : ""}`}
                onClick={() => setActiveTab("advisory")}
              >
                <span className="nav-icon">👨‍🏫</span> Advisory List
              </button>
            )}

            <button
              className={`nav-item ${activeTab === "data" ? "active" : ""}`}
              onClick={() => setActiveTab("data")}
            >
              <span className="nav-icon">📊</span> Enrolment Data
            </button>

            <button
              className={`nav-item ${activeTab === "advisory_class" ? "active" : ""}`}
              onClick={() => setActiveTab("advisory_class")}
            >
              <span className="nav-icon">🏫</span> Advisory Class
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
          {activeTab === "enrollment" && <EnrollmentForm />}
          {activeTab === "advisory" && isAdviser && (
            <AdvisoryListTab
              profile={profile}
              isGradeChairman={isGradeChairman}
            />
          )}
          {activeTab === "data" && <EnrollmentDataTab />}
          {activeTab === "advisory_class" && (
            <AdvisoryClass profile={profile} />
          )}
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const fetchAdvisoryStudents = async () => {
    let query = supabase.from("students").select("*");
    if (!isGradeChairman) {
      query = query.eq("adviser_id", profile?.id);
    } else {
      query = query.eq("grade_level", profile?.grade_level_assigned);
    }
    const { data } = await query.order("family_name", { ascending: true });
    if (data) setStudents(data);
  };

  const fetchGradeAdvisers = async () => {
    const { data } = await supabase
      .from("portal_profile")
      .select("id, first_name, family_name, section_assigned")
      .eq("grade_level_assigned", profile?.grade_level_assigned);
    if (data) setOtherAdvisers(data);
  };

  const handleTransfer = async (studentId, newAdviserId) => {
    await supabase
      .from("students")
      .update({ adviser_id: newAdviserId })
      .eq("id", studentId);
    fetchAdvisoryStudents();
  };

  const handleReadingCategoryChange = async (studentId, readingLevel) => {
    await supabase
      .from("students")
      .update({ reading_level: readingLevel })
      .eq("id", studentId);
    fetchAdvisoryStudents();
  };

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <h2>
          {isGradeChairman
            ? `Grade ${profile?.grade_level_assigned} Overview (Grade Chairman)`
            : "My Advisory Learners"}
        </h2>
        <p>Total Enrolled: {students.length} Learners</p>
      </div>

      <div className="dash-table-wrapper">
        <table className="dash-table">
          <thead>
            <tr>
              <th>LRN</th>
              <th>Learner Name</th>
              <th>Gender</th>
              <th>Reading Level</th>
              {isGradeChairman && <th>Transfer Advisory</th>}
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td
                  colSpan={isGradeChairman ? "5" : "4"}
                  style={{ textAlign: "center" }}
                >
                  No learners assigned yet.
                </td>
              </tr>
            ) : (
              students.map((st) => (
                <tr key={st.id}>
                  <td className="font-mono">{st.lrn}</td>
                  <td className="font-bold">
                    {st.family_name}, {st.first_name} {st.middle_name}
                  </td>
                  <td>{st.gender}</td>
                  <td>
                    <select
                      value={st.reading_level || "Non-Reader"}
                      onChange={(e) =>
                        handleReadingCategoryChange(st.id, e.target.value)
                      }
                      className="table-select"
                    >
                      <option value="Non-Reader">Non-Reader</option>
                      <option value="Frustration">Frustration</option>
                      <option value="Instructional">Instructional</option>
                      <option value="Independent">Independent</option>
                    </select>
                  </td>
                  {isGradeChairman && (
                    <td>
                      <select
                        value={st.adviser_id || ""}
                        onChange={(e) => handleTransfer(st.id, e.target.value)}
                        className="table-select highlight"
                      >
                        {otherAdvisers.map((adv) => (
                          <option key={adv.id} value={adv.id}>
                            {adv.first_name} {adv.family_name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              ))
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

    const { data } = await supabase
      .from("students")
      .select("*, portal_profile(first_name, family_name, section_assigned)")
      .or(`family_name.ilike.%${searchTerm}%,lrn.ilike.%${searchTerm}%`);

    if (data) setResults(data);
    setSearched(true);
  };

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <h2>Search Learner Placement</h2>
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
            results.map((st) => (
              <div key={st.id} className="search-item-card">
                <div className="search-item-main">
                  <h3>
                    {st.family_name}, {st.first_name} {st.middle_name}
                  </h3>
                  <p className="lrn-badge">LRN: {st.lrn}</p>
                  <p>
                    Grade:{" "}
                    <strong>
                      {st.grade_level === 0 ? "Kinder" : st.grade_level}
                    </strong>{" "}
                    | Gender: <strong>{st.gender}</strong> | Age:{" "}
                    <strong>{st.age}</strong>
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

                <div className="search-item-adviser">
                  <span className="adv-label">Assigned Adviser</span>
                  <span className="adv-name">
                    {st.portal_profile
                      ? `${st.portal_profile.first_name} ${st.portal_profile.family_name}`
                      : "Unassigned"}
                  </span>
                  <span className="adv-section">
                    {st.portal_profile?.section_assigned
                      ? `Section: ${st.portal_profile.section_assigned}`
                      : ""}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
