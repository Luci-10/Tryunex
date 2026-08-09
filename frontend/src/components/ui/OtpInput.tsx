import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

/**
 * Six separate boxes that behave like one field: typing advances, Backspace
 * retreats, arrows move, and a pasted code fills every box from wherever it
 * lands. Each box is a real input, so keyboard and screen-reader users get
 * the same affordances as someone tapping.
 */
export default function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  length = 6,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  length?: number;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function set(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  }

  function focusAt(i: number) {
    refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();
  }

  function handleInput(i: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    // Typing in the middle overwrites from that box onward; a multi-digit
    // value (autofill, or a fast paste into one box) fills forward.
    const chars = value.padEnd(length, " ").split("");
    for (let k = 0; k < digits.length && i + k < length; k++) chars[i + k] = digits[k];
    const merged = set(chars.join("").replace(/ /g, ""));
    focusAt(Math.min(i + digits.length, length - 1));
    return merged;
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        const chars = value.split("");
        chars.splice(i, 1);
        set(chars.join(""));
        focusAt(i - 1 >= 0 && i === value.length ? i - 1 : i);
      } else {
        set(value.slice(0, Math.max(0, i - 1)) + value.slice(i));
        focusAt(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(i + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!/\d/.test(text)) return;
    e.preventDefault();
    const merged = set(text);
    focusAt(merged.length >= length ? length - 1 : merged.length);
  }

  return (
    <div
      role="group"
      aria-label={`${length}-digit code`}
      // Tight gap so each box still clears 44px wide inside a 360px screen.
      className="flex justify-between gap-1 sm:gap-2"
    >
      {Array.from({ length }, (_, i) => {
        const char = value[i] ?? "";
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1} of ${length}`}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            value={char}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className={[
              "min-w-0 flex-1 aspect-[3/4] max-h-14 rounded-xl border bg-white text-center",
              "text-xl sm:text-2xl font-semibold tabular-nums caret-brand-500",
              "transition-[border-color,box-shadow,background-color] duration-150",
              "disabled:bg-ink/[0.04] disabled:text-ink/50",
              invalid
                ? "border-coral/60 bg-coral/[0.04]"
                : char
                  ? "border-brand-400 shadow-[0_0_0_3px_rgba(118,87,232,0.12)]"
                  : "border-ink/12",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}
