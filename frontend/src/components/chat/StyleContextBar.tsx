import { useState } from "react";
import { useChat, type StyleContext } from "../../chat";
import { ChevronDown, Close } from "../ui/icons";

const OCCASIONS = ["Casual", "Work", "Date", "Party", "Travel"];
const MOODS = ["Minimal", "Bold", "Smart", "Comfortable"];

function countSet(c: StyleContext) {
  return [c.occasion, c.mood, c.date, c.weather].filter(Boolean).length;
}

/**
 * Optional styling hints sent alongside the next message. Collapsed by
 * default — the assistant works fine without any of it.
 */
export default function StyleContextBar() {
  const { styleContext, setStyleContext } = useChat();
  const [open, setOpen] = useState(false);
  const active = countSet(styleContext);
  const today = new Date().toISOString().slice(0, 10);

  function toggle<K extends keyof StyleContext>(key: K, value: string) {
    setStyleContext({
      ...styleContext,
      [key]: styleContext[key] === value ? undefined : value,
    });
  }

  return (
    <div className="border-t border-ink/[0.07]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="tap-44 inline-flex items-center gap-1 text-[12px] font-medium text-ink/70 hover:text-ink"
        >
          Style context
          {active > 0 && (
            <span className="ml-0.5 px-1.5 rounded-full bg-brand-500 text-white text-[10px] leading-4">
              {active}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {active > 0 && (
          <button
            type="button"
            onClick={() => setStyleContext({})}
            className="tap-44 ml-auto inline-flex items-center gap-1 text-[12px] text-ink/60 hover:text-ink"
          >
            <Close className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="px-3 pb-2.5 space-y-2.5">
          <Row label="Occasion">
            {OCCASIONS.map((o) => (
              <Pill key={o} active={styleContext.occasion === o} onClick={() => toggle("occasion", o)}>
                {o}
              </Pill>
            ))}
          </Row>

          <Row label="Mood">
            {MOODS.map((m) => (
              <Pill key={m} active={styleContext.mood === m} onClick={() => toggle("mood", m)}>
                {m}
              </Pill>
            ))}
          </Row>

          <div className="flex gap-2">
            <label className="flex-1 min-w-0">
              <span className="block text-[11px] font-medium text-ink/60 mb-1">For (optional)</span>
              <input
                type="date"
                min={today}
                value={styleContext.date ?? ""}
                onChange={(e) => setStyleContext({ ...styleContext, date: e.target.value || undefined })}
                className="w-full h-9 border border-ink/12 rounded-lg px-2 text-[16px] bg-white"
              />
            </label>
            <label className="flex-1 min-w-0">
              <span className="block text-[11px] font-medium text-ink/60 mb-1">Weather (optional)</span>
              <input
                type="text"
                inputMode="text"
                maxLength={40}
                placeholder="e.g. 18°C and rainy"
                value={styleContext.weather ?? ""}
                onChange={(e) =>
                  setStyleContext({ ...styleContext, weather: e.target.value || undefined })
                }
                className="w-full h-9 border border-ink/12 rounded-lg px-2 text-[16px] bg-white placeholder:text-ink/35"
              />
            </label>
          </div>
          <p className="text-[11px] text-ink/55">
            TryUnex can't check the forecast — whatever you type here is what it goes on.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-[11px] font-medium text-ink/60 mb-1">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 px-3 rounded-full text-[12px] border transition-colors ${
        active
          ? "bg-brand-500 text-white border-brand-500 font-medium"
          : "bg-white text-ink/70 border-ink/12 hover:bg-brand-50 hover:text-brand-700"
      }`}
    >
      {children}
    </button>
  );
}
