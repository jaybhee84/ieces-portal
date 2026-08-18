import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import iecesLogo from "../image/ieceslogo.png";
import "../styles/LoginPage.css";

// ── Update status modal ───────────────────────────────────────────────────────
function UpdateModal({ onClose }) {
  const [status, setStatus] = useState("checking");
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!window.electronAPI) return;

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

    // Trigger the check
    window.electronAPI.checkForUpdates().catch(() => {
      setStatus("error");
      setErrorMsg("Could not reach update server.");
    });

    return () => {
      removeStatusListener?.();
      removeProgressListener?.();
    };
  }, []);

  const handleDownload = async () => {
    setStatus("downloading");
    setProgress(0);
    await window.electronAPI.downloadUpdate();
  };

  const handleInstall = () => {
    window.electronAPI.installUpdate();
  };

  const statusContent = () => {
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
            <button className="lf-btn upd-btn" onClick={handleDownload}>
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
            <button className="lf-btn upd-btn" onClick={handleInstall}>
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
        <div className="upd-modal-body">{statusContent()}</div>
      </div>
    </div>
  );
}

// ── Main LoginPage ────────────────────────────────────────────────────────────
export default function LoginPage({ onLoginSuccess }) {
  const [view, setView] = useState("login");
  const [appVersion, setAppVersion] = useState("");
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    // Get version from Electron
    if (window.electronAPI?.getVersion) {
      window.electronAPI
        .getVersion()
        .then(setAppVersion)
        .catch(() => {});
    }

    // Listen for native Help → Check for Updates menu click
    if (window.electronAPI?.onMenuCheckForUpdates) {
      const removeMenuListener = window.electronAPI.onMenuCheckForUpdates(
        () => {
          setShowUpdateModal(true);
        },
      );
      return removeMenuListener;
    }
  }, []);

  return (
    <div className="login-root">
      {/* Left panel — branding */}
      <div className="login-left">
        <div className="login-brand">
          <div className="login-seal-wrapper">
            <div className="pulse-ring ring-1" />
            <div className="pulse-ring ring-2" />
            <div className="pulse-ring ring-3" />
            <div className="login-seal">
              <img src={iecesLogo} alt="IECES Logo" />
            </div>
          </div>

          <h1 className="login-school">
            Isabela East Central Elementary School
          </h1>
          <p className="login-sub">Division of Isabela City</p>
        </div>

        {/* Version badge only — no button */}
        {appVersion && (
          <div className="login-version-row">
            <span className="login-version">v{appVersion}</span>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="login-right">
        {view === "login" ? (
          <LoginForm
            onGoRegister={() => setView("register")}
            onLoginSuccess={onLoginSuccess}
          />
        ) : (
          <RegisterForm onGoLogin={() => setView("login")} />
        )}
      </div>

      {/* Update modal — triggered by Help menu */}
      {showUpdateModal && (
        <UpdateModal onClose={() => setShowUpdateModal(false)} />
      )}
    </div>
  );
}

// ── Login Form ────────────────────────────────────────────────────────────────
function LoginForm({ onGoRegister, onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data: profile, error: profileErr } = await supabase
        .from("portal_profile")
        .select("email")
        .eq("username", username.trim())
        .single();

      if (profileErr || !profile) {
        setError("Username not found.");
        setLoading(false);
        return;
      }

      const { data: authData, error: authErr } =
        await supabase.auth.signInWithPassword({
          email: profile.email,
          password,
        });

      if (authErr) {
        setError(authErr.message);
        setLoading(false);
        return;
      }

      if (onLoginSuccess) onLoginSuccess(authData.session);
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-card">
      <div className="lc-header">
        <h1>Sign In</h1>
        <p>Enter your credentials to access reports</p>
      </div>

      <form onSubmit={handleLogin}>
        <div className="lf-group">
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_username"
            required
          />
        </div>

        <div className="lf-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {error && <div className="lf-error">{error}</div>}

        <button type="submit" disabled={loading} className="lf-btn">
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <div className="lc-footer">
        <p>
          Don't have an account?{" "}
          <button
            type="button"
            onClick={onGoRegister}
            className="lc-footer-btn"
          >
            Register here
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Register Form ─────────────────────────────────────────────────────────────
function RegisterForm({ onGoLogin }) {
  const [form, setForm] = useState({
    familyName: "",
    firstName: "",
    middleInitial: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const setUppercase = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value.toUpperCase() }));

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { data: allowed, error: allowErr } = await supabase
      .from("portal_allowed_users")
      .select("email")
      .eq("email", form.email.trim().toLowerCase())
      .single();

    if (allowErr || !allowed) {
      setError("Email not authorized to register. Contact your administrator.");
      setLoading(false);
      return;
    }

    const { data: existingUser } = await supabase
      .from("portal_profile")
      .select("username")
      .eq("username", form.username.trim())
      .single();

    if (existingUser) {
      setError("Username is already taken.");
      setLoading(false);
      return;
    }

    const { error: authErr } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        data: {
          app_source: "ieces_portal",
          username: form.username.trim(),
          family_name: form.familyName.trim().toUpperCase(),
          first_name: form.firstName.trim().toUpperCase(),
          middle_initial: form.middleInitial.trim().toUpperCase() || null,
        },
      },
    });

    if (authErr) {
      if (authErr.message?.toLowerCase().includes("already registered")) {
        setError("This email is already registered. Please sign in instead.");
      } else {
        setError(authErr.message);
      }
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="login-card" style={{ textAlign: "center" }}>
        <h1
          style={{ fontSize: "1.2rem", color: "#7b1a1a", marginBottom: "8px" }}
        >
          Account Created!
        </h1>
        <p
          style={{ fontSize: "0.8rem", color: "#7a6060", marginBottom: "20px" }}
        >
          You can now sign in with your account.
        </p>
        <button type="button" onClick={onGoLogin} className="lf-btn">
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="lc-header">
        <h1>Create Account</h1>
        <p>Email must be pre-approved by administrator</p>
      </div>

      <form onSubmit={handleRegister}>
        <div className="lf-row">
          <div className="lf-group">
            <label>Family Name *</label>
            <input
              type="text"
              value={form.familyName}
              onChange={setUppercase("familyName")}
              placeholder="DELA CRUZ"
              required
            />
          </div>
          <div className="lf-group">
            <label>First Name *</label>
            <input
              type="text"
              value={form.firstName}
              onChange={setUppercase("firstName")}
              placeholder="JUAN"
              required
            />
          </div>
        </div>
        <div className="lf-group">
          <label>Middle Initial</label>
          <input
            type="text"
            value={form.middleInitial}
            onChange={setUppercase("middleInitial")}
            placeholder="B."
            maxLength={3}
          />
        </div>
        <div className="lf-group">
          <label>Username *</label>
          <input
            type="text"
            value={form.username}
            onChange={set("username")}
            placeholder="juan_delacruz"
            required
          />
        </div>
        <div className="lf-group">
          <label>Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@deped.gov.ph"
            required
          />
        </div>
        <div className="lf-group">
          <label>Password *</label>
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            placeholder="Min. 6 characters"
            required
          />
        </div>
        <div className="lf-group">
          <label>Confirm Password *</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={set("confirmPassword")}
            placeholder="Re-enter password"
            required
          />
        </div>

        {error && <div className="lf-error">{error}</div>}

        <button type="submit" disabled={loading} className="lf-btn">
          {loading ? "Registering…" : "Create Account"}
        </button>
      </form>

      <div className="lc-footer">
        <p>
          Already have an account?{" "}
          <button type="button" onClick={onGoLogin} className="lc-footer-btn">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
