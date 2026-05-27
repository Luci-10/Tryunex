import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Wardrobe from "./pages/Wardrobe";
import Worn from "./pages/Worn";
import Plan from "./pages/Plan";
import Shared from "./pages/Shared";
import Friend from "./pages/Friend";
import History from "./pages/History";
import Account from "./pages/Account";

function Private({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user && !loading ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user && !loading ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/" element={<Private><Wardrobe /></Private>} />
      <Route path="/worn" element={<Private><Worn /></Private>} />
      <Route path="/plan" element={<Private><Plan /></Private>} />
      <Route path="/shared" element={<Private><Shared /></Private>} />
      <Route path="/friends/:ownerId" element={<Private><Friend /></Private>} />
      <Route path="/history" element={<Private><History /></Private>} />
      <Route path="/account" element={<Private><Account /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
