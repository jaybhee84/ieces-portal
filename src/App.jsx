import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { SUPERADMIN_MODE_KEY, validatePortalSession } from "./lib/portalAuth";
import LoginPage from "./component/LoginPage";
import DashboardPage from "./component/DashboardPage";
import { Capacitor } from "@capacitor/core";
import { clearOfflineData, rememberOfflineSession, restoreOfflineSession } from "./lib/offline.mjs";

async function setPresence(session, status) {
  if (!session?.user?.id) return;
  await supabase.from("user_presence").upsert(
    {
      user_id: session.user.id,
      app_id: "portal",
      email: session.user.email || null,
      status,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "user_id,app_id" },
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initAuth = async () => {
      if (!navigator.onLine) {
        supabase.auth.stopAutoRefresh();
        const saved = restoreOfflineSession();
        if (saved) sessionStorage.setItem('is_logged_in', 'true');
        setSession(saved);
        setLoading(false);
        return;
      }
      // Check if the user had an active session flag in the current tab/window session
      const isSessionActive = sessionStorage.getItem("is_logged_in");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      // If a Supabase session exists but the session flag is missing, force sign out
      if (session && !isSessionActive && !Capacitor.isNativePlatform()) {
        await supabase.auth.signOut();
        setSession(null);
      } else if (session) {
        const access = await validatePortalSession(session);
        if (cancelled) return;
        if (!access.valid) {
          await clearOfflineData();
          sessionStorage.removeItem("is_logged_in");
          await supabase.auth.signOut();
          setSession(null);
        } else {
          rememberOfflineSession(session);
          setSession(session);
        }
      } else {
        setSession(null);
      }

      setLoading(false);
    };

    initAuth().catch((error) => {
      console.error('Could not restore session:', error);
      if (!cancelled) { setSession(null); setLoading(false); }
    });
    if (!navigator.onLine) return () => { cancelled = true; };
    supabase.auth.startAutoRefresh();

    // Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled || !navigator.onLine) return;
      setSession((current) => session && current?.user?.id !== session.user.id ? current : session);
      if (session) {
        sessionStorage.setItem("is_logged_in", "true");
      } else {
        clearOfflineData().catch(console.error);
        sessionStorage.removeItem("is_logged_in");
        sessionStorage.removeItem(SUPERADMIN_MODE_KEY);
      }
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [online]);

  useEffect(() => {
    if (!session) return undefined;
    setPresence(session, "online");
    const heartbeat = setInterval(() => setPresence(session, "online"), 60000);
    const updateVisibility = () =>
      setPresence(session, document.hidden ? "offline" : "online");
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", updateVisibility);
      setPresence(session, "offline");
    };
  }, [session]);

  // Handle explicit sign-out and state clear
  const handleLogout = async () => {
    try {
      try { await clearOfflineData(); }
      catch (error) { console.error('Could not clear offline storage:', error); }
      sessionStorage.removeItem("is_logged_in");
      sessionStorage.removeItem(SUPERADMIN_MODE_KEY);
      if (navigator.onLine) await supabase.auth.signOut({ scope: 'local' });
      else localStorage.removeItem('ieces-portal-auth');
    } catch (err) {
      console.error("Signout error:", err);
    } finally {
      setSession(null);
      if (!navigator.onLine) window.location.reload();
    }
  };

  const handleLoginSuccess = (sess) => {
    rememberOfflineSession(sess);
    sessionStorage.setItem("is_logged_in", "true");
    setSession(sess);
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <p>Loading IECES Portal...</p>
      </div>
    );
  }

  return (
    <div className="portal-app">
      {!online && <div className="offline-banner" role="status">Offline · Saved records only. Connect to save changes. Sign in online at least every 7 days.</div>}
      {session ? (
        <DashboardPage session={session} onLogout={handleLogout} />
      ) : (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
}
