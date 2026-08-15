import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import PageShell, { PageTitle } from "../components/PageShell";
import { useAuth } from "../auth";
import { getSummary, TIER_LABEL, type BillingSummary } from "../billing";
import {
  MOTION_OPTIONS,
  getMotionPref,
  setMotionPref,
  type MotionPref,
} from "../motion";
import {
  ChevronRight,
  Info,
  Mail,
  Settings as SettingsIcon,
  Sparkles,
  UserIcon,
  Users,
} from "../components/ui/icons";

export default function Settings() {
  const { user } = useAuth();
  const [motion, setMotion] = useState<MotionPref>(() => getMotionPref());
  const [billing, setBilling] = useState<BillingSummary | null>(null);

  useEffect(() => {
    getSummary().then(setBilling).catch(() => setBilling(null));
  }, []);

  function chooseMotion(pref: MotionPref) {
    setMotion(pref);
    setMotionPref(pref); // writes to localStorage and applies immediately
  }

  if (!user) return null;

  return (
    <PageShell width="narrow">
      <PageTitle title="Settings" subtitle="Preferences for this device, and where to manage the rest." />

      <Group icon={<SettingsIcon className="w-4 h-4" />} tone="lilac" title="Appearance">
        <div className="p-4">
          <p className="text-[13.5px] font-medium">Motion</p>
          <p className="text-[12.5px] text-ink/65 mt-0.5">
            Animations across the app. Saved on this device.
          </p>
          <div
            role="radiogroup"
            aria-label="Motion preference"
            className="mt-3 grid grid-cols-3 gap-1.5 p-1 rounded-full bg-ink/[0.05]"
          >
            {MOTION_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={motion === o.value}
                onClick={() => chooseMotion(o.value)}
                className={`h-9 rounded-full text-[13px] transition-colors ${
                  motion === o.value
                    ? "bg-white text-ink font-semibold shadow-card"
                    : "text-ink/65 hover:text-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-ink/65 mt-2.5" aria-live="polite">
            {MOTION_OPTIONS.find((o) => o.value === motion)?.hint}
          </p>
        </div>
      </Group>

      <Group icon={<Users className="w-4 h-4" />} tone="sky" title="Privacy & sharing">
        <Note>
          Nobody sees your wardrobe unless you hand them a share code, and you choose whether they
          can view, suggest, or edit. Try-on access is a separate opt-in.
        </Note>
        <RowLink to="/shared" label="Shared wardrobes" hint="Codes, people, and what they can do" />
      </Group>

      <Group icon={<Sparkles className="w-4 h-4" />} tone="mint" title="Photos & virtual try-on">
        <Note>
          You pick every photo that gets uploaded — nothing is taken from your gallery on its own.
          Your try-on photo is used to generate looks and is replaced whenever you upload a new one.
        </Note>
        <RowLink to="/tryon" label="Try-on Studio" hint="Your photo and generated looks" />
      </Group>

      <Group icon={<UserIcon className="w-4 h-4" />} tone="peach" title="Account">
        <dl className="px-4 py-3 space-y-2.5">
          <Fact label="Name" value={user.name} />
          <Fact label="Email" value={user.email} />
          {user.dob && (
            <Fact
              label="Date of birth"
              value={new Date(user.dob + "T00:00:00").toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            />
          )}
          {user.gender && <Fact label="Gender" value={user.gender.replace(/_/g, " ")} capitalize />}
        </dl>
        <p className="px-4 pb-3 text-[12px] text-ink/60">
          These were set when you joined and can't be edited here yet.
        </p>
        <RowLink to="/account" label="My profile" hint="Suggestions and signing out" />
      </Group>

      <Group icon={<Sparkles className="w-4 h-4" />} tone="mint" title="Plan & credits">
        {billing && (
          <dl className="px-4 py-3 flex gap-6">
            <Fact label="Plan" value={TIER_LABEL[billing.tier] ?? "Free"} capitalize />
            <Fact label="Credits left" value={String(billing.credits.total)} />
            {billing.renewsAt && (
              <Fact
                label="Renews"
                value={new Date(billing.renewsAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
              />
            )}
          </dl>
        )}
        <RowLink
          to="/plans"
          label="Plans & credits"
          hint={
            billing?.chat.limited
              ? `${Math.max(0, billing.chat.limit - billing.chat.used)} of ${billing.chat.limit} AI chats left this month`
              : "Credits, packs and monthly plans"
          }
        />
      </Group>

      <Group icon={<Info className="w-4 h-4" />} tone="butter" title="App">
        <RowLink to="/about" label="About TryUnex" hint="What this app is for" />
        <dl className="px-4 py-3 flex gap-6">
          <Fact label="Version" value={__APP_VERSION__} />
          <Fact label="Build" value={__BUILD_DATE__} />
        </dl>
      </Group>

      <Group icon={<Mail className="w-4 h-4" />} tone="lilac" title="Support">
        <RowLink to="/contact" label="Contact & support" hint="We read every message" />
      </Group>
    </PageShell>
  );
}

const TONES = {
  lilac: "bg-lilac text-brand-700",
  sky: "bg-sky text-blue-800",
  mint: "bg-mint text-emerald-800",
  peach: "bg-peach text-orange-800",
  butter: "bg-butter text-amber-800",
};

function Group({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon: ReactNode;
  tone: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink/65 mb-2">
        <span className={`w-6 h-6 rounded-full grid place-items-center ${TONES[tone]}`}>{icon}</span>
        {title}
      </h2>
      <div className="surface p-0 overflow-hidden divide-y divide-ink/[0.06]">{children}</div>
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-[13px] text-ink/70 leading-relaxed">{children}</p>;
}

function RowLink({ to, label, hint }: { to: string; label: string; hint: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 min-h-[52px] py-2.5 hover:bg-ink/[0.03] active:bg-ink/[0.05] transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium leading-tight">{label}</span>
        <span className="block text-[12px] text-ink/60 mt-0.5">{hint}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-ink/25 shrink-0" />
    </Link>
  );
}

function Fact({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink/55">{label}</dt>
      <dd className={`text-[13.5px] font-medium mt-0.5 break-words ${capitalize ? "capitalize" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
