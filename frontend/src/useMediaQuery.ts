import { useEffect, useState } from "react";

/**
 * Breakpoint check in JS, for the cases where CSS can't do the job — notably
 * choosing between two components when one of them renders through a portal
 * (a portal escapes `display: none` on its wrapper, so `md:hidden` won't
 * hide it).
 */
export default function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
