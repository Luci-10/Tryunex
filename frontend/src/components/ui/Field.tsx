import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const BASE =
  "w-full bg-white border border-ink/12 rounded-xl px-3.5 text-[15px] placeholder:text-ink/55 " +
  "transition-colors focus:border-brand-400 disabled:bg-ink/[0.04] disabled:text-ink/65";

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="flex items-baseline justify-between gap-2 mb-1.5">
      <span className="text-[13px] font-medium text-ink/75">{children}</span>
      {hint && <span className="text-[11px] text-ink/60">{hint}</span>}
    </span>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...p }, ref) {
    return <input ref={ref} className={`${BASE} h-11 ${className}`} {...p} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", ...p }, ref) {
    return <select ref={ref} className={`${BASE} h-11 pr-8 ${className}`} {...p} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...p }, ref) {
    return <textarea ref={ref} className={`${BASE} py-2.5 resize-y ${className}`} {...p} />;
  },
);

/** Inline error tied to the control that failed, not a page-level banner. */
export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-[13px] text-coral flex items-start gap-1.5">
      <span aria-hidden>⚠</span>
      <span>{children}</span>
    </p>
  );
}

export function ErrorBanner({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl bg-coral/10 border border-coral/25 px-3.5 py-3 text-sm text-ink flex items-start gap-2"
    >
      <span aria-hidden className="text-coral">
        ⚠
      </span>
      <div className="flex-1 min-w-0">
        <div className="leading-snug">{children}</div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 text-[13px] font-semibold text-coral underline underline-offset-2"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
