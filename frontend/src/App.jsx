import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import TryOn from "./pages/TryOn";

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={!session ? <Auth /> : <Navigate to="/" replace />} />
        <Route path="/" element={session ? <Dashboard session={session} /> : <Navigate to="/auth" replace />} />
        <Route path="/tryon" element={session ? <TryOn session={session} /> : <Navigate to="/auth" replace />} />
        <Route path="*" element={<Navigate to={session ? "/" : "/auth"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
