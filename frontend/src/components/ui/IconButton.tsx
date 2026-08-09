import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required — an icon alone never communicates its action to a screen reader. */
  label: string;
  tone?: "neutral" | "brand" | "danger" | "onImage";
  size?: "sm" | "md";
  children: ReactNode;
};

const TONES = {
  neutral: "bg-white/90 text-ink/70 hover:text-ink hover:bg-white border border-ink/10",
  brand: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  danger: "bg-white/90 text-ink/70 hover:text-coral hover:bg-coral/10 border border-ink/10",
  onImage: "bg-ink/55 text-white hover:bg-ink/70 backdrop-blur-sm",
};

const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, tone = "neutral", size = "md", className = "", children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={[
        "tap-44 inline-flex items-center justify-center rounded-full shrink-0",
        "transition-colors duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "w-7 h-7" : "w-9 h-9",
        TONES[tone],
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
});

export default IconButton;
