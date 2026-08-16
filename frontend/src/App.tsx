import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { ChatProvider } from "./chat";
import { TryOnProvider } from "./tryon";
import { ToastProvider } from "./components/ui/Toast";
import { ConfirmProvider } from "./components/ui/Confirm";
import { OnboardingProvider } from "./tour/OnboardingProvider";
import { Skeleton } from "./components/ui/Skeleton";
import ChatFab from "./components/ChatFab";
import ChatPanel from "./components/ChatPanel";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Wardrobe from "./pages/Wardrobe";
import Worn from "./pages/Worn";
import Plan from "./pages/Plan";
import Tryon from "./pages/Tryon";
import Shared from "./pages/Shared";
import Friend from "./pages/Friend";
import History from "./pages/History";
import Contact from "./pages/Contact";
import Account from "./pages/Account";
import SettingsPage from "./pages/Settings";
import About from "./pages/About";
import { Privacy, Terms, Refunds } from "./pages/Legal";
import Plans from "./pages/Plans";
import Thrift from "./pages/Thrift";
import ThriftListing from "./pages/ThriftListing";
import MyListings from "./pages/MyListings";
import SavedThrift from "./pages/SavedThrift";
import { ThriftMessages, ThriftConversation } from "./pages/ThriftMessages";

function Private({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  // A skeleton, not a "Loading…" string — the session check is fast and a
  // flash of text reads as a broken page.
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <ToastProvider>
      <ConfirmProvider>
        <ChatProvider>
          <TryOnProvider>
            <OnboardingProvider>
            <Routes>
              <Route path="/login" element={user && !loading ? <Navigate to="/" replace /> : <Login />} />
              <Route path="/register" element={user && !loading ? <Navigate to="/" replace /> : <Register />} />
              <Route path="/" element={<Private><Wardrobe /></Private>} />
              <Route path="/worn" element={<Private><Worn /></Private>} />
              <Route path="/plan" element={<Private><Plan /></Private>} />
              <Route path="/tryon" element={<Private><Tryon /></Private>} />
              <Route path="/shared" element={<Private><Shared /></Private>} />
              <Route path="/friends/:ownerId" element={<Private><Friend /></Private>} />
              <Route path="/history" element={<Private><History /></Private>} />
              {/* Public: linked from the landing footer, and neither page
                  renders anything user-specific. */}
              <Route path="/contact" element={<Contact />} />
              <Route path="/account" element={<Private><Account /></Private>} />
              <Route path="/settings" element={<Private><SettingsPage /></Private>} />
              <Route path="/about" element={<About />} />
              {/* Policy pages are public: they are linked from the landing
                  footer and from the sign-in consent line. */}
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/refunds" element={<Refunds />} />
              <Route path="/plans" element={<Private><Plans /></Private>} />
              {/* Static thrift routes are declared before /thrift/:listingId so
                  "messages" and "saved" are never read as a listing id. */}
              <Route path="/thrift" element={<Private><Thrift /></Private>} />
              <Route path="/thrift/messages" element={<Private><ThriftMessages /></Private>} />
              <Route path="/thrift/messages/:conversationId" element={<Private><ThriftConversation /></Private>} />
              <Route path="/thrift/saved" element={<Private><SavedThrift /></Private>} />
              <Route path="/thrift/:listingId" element={<Private><ThriftListing /></Private>} />
              <Route path="/my-listings" element={<Private><MyListings /></Private>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ChatFab />
            <ChatPanel />
            </OnboardingProvider>
          </TryOnProvider>
        </ChatProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
