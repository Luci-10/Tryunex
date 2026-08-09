import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";
import { useAuth } from "../auth";
import AuthShell from "../components/AuthShell";
import Button from "../components/ui/Button";
import { Input, Label, Select, FieldError } from "../components/ui/Field";

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
        // Pending token expired — send them back to the start.
        setTimeout(() => nav("/login", { replace: true }), 1800);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Nice to meet you" subtitle="Two quick details and your wardrobe is ready.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <Label>Your name</Label>
          <Input
            required
            autoFocus
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should we call you?"
          />
        </label>

        <label className="block">
          <Label hint="optional">Date of birth</Label>
          <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>

        <label className="block">
          <Label hint="optional">Gender</Label>
          <Select value={gender} onChange={(e) => setGender(e.target.value as any)}>
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </Select>
        </label>

        <FieldError>{error}</FieldError>

        <Button type="submit" size="lg" block loading={busy} disabled={!name.trim()}>
          {busy ? "Setting up…" : "Enter TryUnex"}
        </Button>
      </form>
      <p aria-live="polite" className="sr-only">
        {error ?? ""}
      </p>
    </AuthShell>
  );
}
