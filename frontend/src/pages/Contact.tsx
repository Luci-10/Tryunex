import { useState } from "react";
import PageShell, { PageTitle } from "../components/PageShell";
import Button from "../components/ui/Button";
import Surface from "../components/ui/Surface";
import { Input, Label, Textarea, FieldError } from "../components/ui/Field";
import { Check, Mail, Send } from "../components/ui/icons";
import { api } from "../api";
import { useAuth } from "../auth";

const MAX = 4000;

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
      setError(err.message ?? "Could not send your message");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <PageShell width="narrow">
        <div className="surface px-6 py-10 text-center flex flex-col items-center gap-3">
          <span className="w-14 h-14 rounded-full bg-mint text-emerald-700 grid place-items-center">
            <Check className="w-7 h-7" />
          </span>
          <h1 className="text-lg font-semibold">Message sent</h1>
          <p className="text-sm text-ink/70 max-w-xs leading-relaxed">
            Thanks — we read everything. We'll reply to <strong className="text-ink">{user?.email}</strong>,
            usually within a day.
          </p>
          <Button variant="secondary" className="mt-1" onClick={() => setSent(false)}>
            Send another
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow">
      <PageTitle
        title="Contact us"
        subtitle="Bug, feature request, or just a thought — we read every message."
      />

      <Surface tone="sky" className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-white/70 grid place-items-center text-blue-700 shrink-0">
          <Mail className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] text-ink/70">We'll reply to</p>
          <p className="text-sm font-medium truncate">{user?.email}</p>
        </div>
      </Surface>

      <form onSubmit={submit} className="surface p-4 space-y-4">
        <label className="block">
          <Label hint="optional">Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="What's it about?"
          />
        </label>

        <label className="block">
          <Label hint={`${message.length}/${MAX}`}>Message</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
            required
            rows={7}
            placeholder="Tell us what's on your mind…"
          />
        </label>

        <FieldError>{error}</FieldError>

        <Button
          type="submit"
          size="lg"
          block
          loading={busy}
          disabled={!message.trim()}
          leading={<Send className="w-4 h-4" />}
        >
          {busy ? "Sending…" : "Send message"}
        </Button>
      </form>
    </PageShell>
  );
}
