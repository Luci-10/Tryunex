import { Link } from "react-router-dom";
import PageShell from "../components/PageShell";
import Button from "../components/ui/Button";
import { Calendar, Mail, Shirt, Sparkles, Users } from "../components/ui/icons";

const WHAT_IT_DOES = [
  { icon: Shirt, tone: "lilac", text: "Organise the clothes you already own." },
  { icon: Calendar, tone: "peach", text: "Plan outfits for today and the days ahead." },
  { icon: Users, tone: "sky", text: "Share your wardrobe with people you trust." },
  { icon: Sparkles, tone: "mint", text: "Preview looks with virtual try-on." },
] as const;

const TONES = {
  lilac: "bg-lilac text-brand-700",
  peach: "bg-peach text-orange-800",
  sky: "bg-sky text-blue-800",
  mint: "bg-mint text-emerald-800",
};

export default function About() {
  return (
    <PageShell width="narrow">
      <section className="rounded-card border border-brand-200/70 bg-gradient-to-br from-lilac via-lilac/60 to-white p-6 text-center">
        <img src="/favicon.svg" alt="" className="w-12 h-12 mx-auto" />
        <h1 className="text-[22px] font-bold tracking-tight mt-3">TryUnex</h1>
        <p className="text-[14.5px] text-ink/70 leading-relaxed mt-2 max-w-sm mx-auto">
          TryUnex helps you organise the clothes you already own, plan outfits, share your wardrobe
          with people you trust, and preview looks with virtual try-on.
        </p>
      </section>

      <section className="surface p-4">
        <ul className="space-y-3">
          {WHAT_IT_DOES.map(({ icon: Icon, tone, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className={`w-9 h-9 shrink-0 rounded-full grid place-items-center ${TONES[tone]}`}>
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <span className="text-[14px] text-ink/80">{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-card border border-mint bg-mint/40 p-4">
        <h2 className="text-[14.5px] font-semibold">Your wardrobe and photos stay under your control.</h2>
        <p className="text-[13px] text-ink/70 leading-relaxed mt-1.5">
          You choose every photo you upload, and nobody sees your wardrobe until you give them a
          share code. You can take that access back at any time from Shared wardrobes.
        </p>
      </section>

      <section className="surface p-4">
        <h2 className="text-[13px] font-semibold text-ink/65 uppercase tracking-wide">Build</h2>
        <dl className="flex gap-8 mt-2.5">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink/55">Version</dt>
            <dd className="text-[14px] font-medium mt-0.5">{__APP_VERSION__}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink/55">Built</dt>
            <dd className="text-[14px] font-medium mt-0.5">{__BUILD_DATE__}</dd>
          </div>
        </dl>
      </section>

      <div className="text-center">
        <Link to="/contact">
          <Button variant="secondary" leading={<Mail className="w-4 h-4" />}>
            Contact & support
          </Button>
        </Link>
      </div>
    </PageShell>
  );
}
