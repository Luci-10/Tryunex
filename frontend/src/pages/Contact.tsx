import { useState } from "react";
import Nav from "../components/Nav";
import { api } from "../api";
import { useAuth } from "../auth";

export default function Contact() {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api.post("/contact", { subject: subject.trim() || undefined, message });
      setSent(true);
      setSubject("");
      setMessage("");
    } catch (err: any) {
      setError(err.message ?? "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="max-w-xl mx-auto px-4 py-6 space-y-5 pb-24">
        <div>
          <h1 className="text-xl font-bold">Contact us</h1>
          <p className="text-sm text-gray-600 mt-1">
            Bug, feature request, or just a thought — we read everything. Usually reply within a day.
          </p>
        </div>

        {sent && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-3 py-2.5">
            ✓ Thanks — we got your message. We'll reply to <strong>{user?.email}</strong>.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Your email</span>
            <input
              value={user?.email ?? ""}
              disabled
              className="mt-1 w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-600"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Subject (optional)</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="What's it about?"
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={4000}
              rows={6}
              placeholder="Tell us what's on your mind…"
              className="mt-1 w-full border rounded-lg px-3 py-2 resize-y"
            />
            <span className="text-xs text-gray-400 mt-1 block">{message.length}/4000</span>
          </label>

          <button
            disabled={busy || !message.trim()}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2.5 font-medium disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
      </main>
    </>
  );
}
