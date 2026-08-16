import { useEffect, useState } from "react";
import Sheet from "../ui/Sheet";
import Button from "../ui/Button";
import { Label, Textarea, FieldError } from "../ui/Field";
import { useToast } from "../ui/Toast";

/**
 * Shared reporting sheet for both listings and conversations — same shape,
 * different reason list. Reporting never changes what the reporter sees; a
 * human decides what happens next.
 */
export default function ReportSheet({
  open,
  onClose,
  title,
  reasons,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  reasons: { value: string; label: string }[];
  onSubmit: (reason: string, note: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState(reasons[0]?.value ?? "other");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason(reasons[0]?.value ?? "other");
    setNote("");
    setError(null);
  }, [open, reasons]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason, note.trim());
      toast("Thanks — our team will take a look", { tone: "success" });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Could not send the report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button block loading={busy} onClick={send}>
          Send report
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>What's wrong?</Label>
          <div role="radiogroup" aria-label="Reason" className="space-y-1.5">
            {reasons.map((r) => {
              const active = reason === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setReason(r.value)}
                  className={`w-full text-left min-h-[44px] px-3.5 rounded-xl border text-[14px] transition-colors ${
                    active
                      ? "bg-brand-50 border-brand-400 text-brand-800 font-medium"
                      : "bg-white border-ink/12 hover:bg-ink/[0.03]"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <Label hint="Optional">Anything else?</Label>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Add any detail that would help."
          />
        </label>

        <FieldError>{error}</FieldError>
      </div>
    </Sheet>
  );
}
