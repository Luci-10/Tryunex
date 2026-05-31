import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";
import { useAuth } from "../auth";

export default function Register() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"" | "male" | "female" | "other" | "prefer_not_to_say">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<{ user: User }>("/auth/complete", {
        name: name.trim(),
        dob: dob || null,
        gender: gender || null,
      });
      setUser(r.user);
      nav("/", { replace: true });
    } catch (err: any) {
      setError(err.message ?? "Could not save");
      if (String(err.message).toLowerCase().includes("verify")) {
        // Session expired — go back to login.
        setTimeout(() => nav("/login", { replace: true }), 1500);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">Welcome to TryUnex</h1>
          <p className="text-sm text-gray-600">A few details to set up your account.</p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Your name</span>
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2"
            placeholder="What should we call you?"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Date of birth</span>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Gender</span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as any)}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>

        <button
          disabled={busy || !name.trim()}
          className="w-full bg-brand-600 text-white rounded-lg py-2 font-medium disabled:opacity-60"
        >
          {busy ? "Saving…" : "Enter TryUnex"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
