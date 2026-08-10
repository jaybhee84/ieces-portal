import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import LoginPage from "./component/LoginPage";
import DashboardPage from "./component/DashboardPage";

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
