import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import LoginPage from "./component/LoginPage";
import DashboardPage from "./component/DashboardPage";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch initial active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // 2. Listen to realtime auth status changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle explicit sign-out and state clear
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Signout error:", err);
    } finally {
      setSession(null);
    }
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
        <LoginPage onLoginSuccess={(sess) => setSession(sess)} />
      )}
    </div>
  );
}
