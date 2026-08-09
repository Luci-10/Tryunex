import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageShell, { PageTitle } from "../components/PageShell";
import SectionHeading from "../components/ui/SectionHeading";
import Surface from "../components/ui/Surface";
import Button from "../components/ui/Button";
import IconButton from "../components/ui/IconButton";
import EmptyState from "../components/ui/EmptyState";
import { RowSkeleton } from "../components/ui/Skeleton";
import { Badge } from "../components/ui/Chip";
import { Input, Label, ErrorBanner } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/Confirm";
import { Avatar } from "../components/Nav";
import { Check, Copy, Sparkles, Trash, Users } from "../components/ui/icons";
import { api } from "../api";

type Permission = "view" | "suggest" | "edit";
type Code = { id: string; code: string; permission: Permission; allowTryon: boolean };
type WithMe = {
  id: string;
  permission: string;
  allowTryon: boolean;
  viewerId: string;
  viewerName: string;
  viewerEmail: string;
};
type ICanSee = {
  id: string;
  permission: string;
  allowTryon: boolean;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
};

const LEVELS: { value: Permission; title: string; line: string }[] = [
  { value: "view", title: "View", line: "They can browse your wardrobe. Nothing else." },
  { value: "suggest", title: "Suggest", line: "They propose outfits — you approve each one." },
  { value: "edit", title: "Edit", line: "They can plan outfits in your wardrobe directly." },
];

export function permissionTone(p: string) {
  return p === "edit" ? "peach" : p === "suggest" ? "sky" : "ink";
}

export default function Shared() {
  const nav = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [permission, setPermission] = useState<Permission>("suggest");
  const [allowTryon, setAllowTryon] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codes, setCodes] = useState<Code[]>([]);
  const [withMe, setWithMe] = useState<WithMe[]>([]);
  const [iCanSee, setICanSee] = useState<ICanSee[]>([]);
  const [redeem, setRedeem] = useState("");
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      const [a, b, c] = await Promise.all([
        api.get<{ codes: Code[] }>("/share/codes"),
        api.get<{ shares: WithMe[] }>("/share/with-me"),
        api.get<{ shares: ICanSee[] }>("/share/i-can-see"),
      ]);
      setCodes(a.codes);
      setWithMe(b.shares);
      setICanSee(c.shares);
    } catch (err: any) {
      setLoadError(err.message ?? "Could not load your sharing settings");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function generate() {
    setBusy(true);
    try {
      const r = await api.post<{ code: Code }>("/share/codes", { permission, allowTryon });
      setGenerated(r.code.code);
      setCopied(false);
      setCodes((p) => [r.code, ...p]);
    } catch (err: any) {
      toast(err.message ?? "Could not create a code", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast("Code copied", { tone: "success" });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("Couldn't copy — select the code and copy it manually", { tone: "error" });
    }
  }

  async function cancelCode(id: string, code: string) {
    const ok = await confirm({
      title: "Cancel this code?",
      body: `${code} stops working immediately. Anyone already connected keeps their access.`,
      confirmLabel: "Cancel code",
      cancelLabel: "Keep it",
      tone: "danger",
    });
    if (!ok) return;
    await api.delete(`/share/codes/${id}`);
    setCodes((p) => p.filter((c) => c.id !== id));
    if (generated === code) setGenerated(null);
    toast("Code cancelled", { tone: "success" });
  }

  async function doRedeem(e: React.FormEvent) {
    e.preventDefault();
    setRedeemError(null);
    setBusy(true);
    try {
      const r = await api.post<{ ownerId: string }>("/share/redeem", { code: redeem.trim() });
      setRedeem("");
      nav(`/friends/${r.ownerId}`);
    } catch (err: any) {
      setRedeemError(err.message ?? "That code didn't work");
    } finally {
      setBusy(false);
    }
  }

  async function removeViewer(s: WithMe) {
    const ok = await confirm({
      title: `Remove ${s.viewerName}?`,
      body: "They lose access to your wardrobe right away.",
      confirmLabel: "Remove access",
      tone: "danger",
    });
    if (!ok) return;
    await api.delete(`/share/${s.id}/owner`);
    setWithMe((p) => p.filter((x) => x.id !== s.id));
    toast(`${s.viewerName} removed`, { tone: "success" });
  }

  async function disconnect(s: ICanSee) {
    const ok = await confirm({
      title: `Disconnect from ${s.ownerName}?`,
      body: "You'll need a new code to see their wardrobe again.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (!ok) return;
    await api.delete(`/share/${s.id}/viewer`);
    setICanSee((p) => p.filter((x) => x.id !== s.id));
    toast("Disconnected", { tone: "success" });
  }

  return (
    <PageShell>
      <PageTitle
        title="Sharing"
        subtitle="Invite people into your wardrobe — and see the wardrobes shared with you."
      />

      {loadError && <ErrorBanner onRetry={() => load()}>{loadError}</ErrorBanner>}

      <section className="space-y-3">
        <SectionHeading title="Share your wardrobe" as="h2" />

        <div className="grid gap-2 sm:grid-cols-3">
          {LEVELS.map((l) => {
            const active = permission === l.value;
            return (
              <button
                key={l.value}
                type="button"
                onClick={() => setPermission(l.value)}
                aria-pressed={active}
                className={`text-left rounded-card border p-3.5 transition-colors ${
                  active
                    ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30"
                    : "border-ink/10 bg-white hover:border-brand-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`w-[18px] h-[18px] rounded-full border grid place-items-center shrink-0 ${
                      active ? "bg-brand-500 border-brand-500 text-white" : "border-ink/25"
                    }`}
                  >
                    {active && <Check className="w-3 h-3" />}
                  </span>
                  <span className="font-semibold text-sm">{l.title}</span>
                </span>
                <span className="block text-[13px] text-ink/70 mt-1.5 leading-snug">{l.line}</span>
              </button>
            );
          })}
        </div>

        <Surface tone="sky" className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-white/70 grid place-items-center text-blue-700 shrink-0">
            <Sparkles className="w-[18px] h-[18px]" />
          </span>
          <div className="flex-1 min-w-0">
            <label htmlFor="allow-tryon" className="text-sm font-semibold cursor-pointer">
              Let them try on your clothes
            </label>
            <p className="text-[13px] text-ink/70 leading-snug mt-0.5">
              Optional, and separate from the level above. They'd generate looks on their own selfie.
            </p>
          </div>
          <input
            id="allow-tryon"
            type="checkbox"
            checked={allowTryon}
            onChange={(e) => setAllowTryon(e.target.checked)}
            className="w-6 h-6 accent-brand-500 shrink-0 mt-0.5 cursor-pointer"
          />
        </Surface>

        <div className="surface p-4 space-y-3">
          <Button block size="lg" onClick={generate} loading={busy}>
            Generate share code
          </Button>

          {generated && (
            <div className="rounded-xl bg-lilac border border-brand-200 p-4 text-center">
              <p className="text-[12px] text-ink/65 mb-2">Send this code to your friend</p>
              <p className="font-mono text-[28px] sm:text-[32px] font-bold tracking-[0.18em] text-brand-700 break-all">
                {generated}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => copyCode(generated)}
                leading={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              >
                {copied ? "Copied" : "Copy code"}
              </Button>
            </div>
          )}
        </div>

        {codes.length > 0 && (
          <div className="surface p-4 space-y-2">
            <h3 className="text-[13px] font-semibold text-ink/70 uppercase tracking-wide">
              Unused codes
            </h3>
            <ul className="divide-y divide-ink/[0.07]">
              {codes.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <code className="font-mono text-sm bg-ink/[0.05] px-2.5 py-1 rounded-lg">
                    {c.code}
                  </code>
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={permissionTone(c.permission) as any}>{c.permission}</Badge>
                    {c.allowTryon && <Badge tone="lilac">try-on</Badge>}
                  </span>
                  <IconButton
                    label={`Cancel code ${c.code}`}
                    tone="danger"
                    className="ml-auto"
                    onClick={() => cancelCode(c.id, c.code)}
                  >
                    <Trash className="w-4 h-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="People who can see your wardrobe" count={withMe.length} as="h2" />
        {loading ? (
          <RowSkeleton count={2} />
        ) : withMe.length === 0 ? (
          <EmptyState
            icon={<Users className="w-7 h-7" />}
            title="Nobody yet"
            body="Generate a code above and send it to someone you trust."
          />
        ) : (
          <ul className="surface divide-y divide-ink/[0.07] p-0 overflow-hidden">
            {withMe.map((s) => (
              <li key={s.id} className="flex items-center gap-3 p-3.5">
                <Avatar name={s.viewerName} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{s.viewerName}</p>
                  <p className="text-xs text-ink/65 truncate">{s.viewerEmail}</p>
                  <span className="flex flex-wrap gap-1 mt-1">
                    <Badge tone={permissionTone(s.permission) as any}>{s.permission}</Badge>
                    {s.allowTryon && <Badge tone="lilac">try-on</Badge>}
                  </span>
                </div>
                <div className="pl-2 border-l border-ink/[0.07]">
                  <IconButton label={`Remove ${s.viewerName}`} tone="danger" onClick={() => removeViewer(s)}>
                    <Trash className="w-4 h-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Wardrobes shared with you" count={iCanSee.length} as="h2" />

        <form onSubmit={doRedeem} className="surface p-4 space-y-3">
          <label className="block">
            <Label>Have a code?</Label>
            <div className="flex gap-2">
              <Input
                value={redeem}
                onChange={(e) => setRedeem(e.target.value.toUpperCase())}
                placeholder="A1B2C3D4"
                className="font-mono uppercase tracking-widest"
                aria-invalid={redeemError ? true : undefined}
              />
              <Button type="submit" disabled={busy || !redeem.trim()} loading={busy}>
                Connect
              </Button>
            </div>
          </label>
          {redeemError && (
            <p role="alert" className="text-[13px] text-coral">
              {redeemError}
            </p>
          )}
        </form>

        {iCanSee.length > 0 && (
          <ul className="surface divide-y divide-ink/[0.07] p-0 overflow-hidden">
            {iCanSee.map((s) => (
              <li key={s.id} className="flex items-center gap-3 p-3.5">
                <Avatar name={s.ownerName} />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/friends/${s.ownerId}`}
                    className="font-medium text-sm text-brand-700 hover:underline truncate block"
                  >
                    {s.ownerName}'s wardrobe
                  </Link>
                  <p className="text-xs text-ink/65 truncate">{s.ownerEmail}</p>
                  <span className="flex flex-wrap gap-1 mt-1">
                    <Badge tone={permissionTone(s.permission) as any}>{s.permission}</Badge>
                    {s.allowTryon && <Badge tone="lilac">try-on</Badge>}
                  </span>
                </div>
                <div className="pl-2 border-l border-ink/[0.07]">
                  <IconButton
                    label={`Disconnect from ${s.ownerName}`}
                    tone="danger"
                    onClick={() => disconnect(s)}
                  >
                    <Trash className="w-4 h-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
