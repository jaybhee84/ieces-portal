import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import LoginPage from "./component/LoginPage";
import DashboardPage from "./component/DashboardPage";

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

  useEffect(() => {
    const initAuth = async () => {
      // Check if the user had an active session flag in the current tab/window session
      const isSessionActive = sessionStorage.getItem("is_logged_in");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      // If a Supabase session exists but the session flag is missing, force sign out
      if (session && !isSessionActive) {
        await supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(session);
      }

      setLoading(false);
    };

    initAuth();

    // Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        sessionStorage.setItem("is_logged_in", "true");
      } else {
        sessionStorage.removeItem("is_logged_in");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
      sessionStorage.removeItem("is_logged_in");
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Signout error:", err);
    } finally {
      setSession(null);
    }
  };

  const handleLoginSuccess = (sess) => {
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
    <div>
      {session ? (
        <DashboardPage session={session} onLogout={handleLogout} />
      ) : (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
}
