import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#20212A",
        canvas: "#FCFAFF",
        lilac: "#EEE9FF",
        peach: "#FFE1D2",
        mint: "#CFF4DF",
        sky: "#DCEEFF",
        butter: "#FFF1B8",
        coral: "#F36F6F",
        // Lavender is the brand anchor. `brand` is the same ramp so the
        // shorthand reads naturally in markup (brand-600 for a pressed state).
        lavender: "#7657E8",
        brand: {
          50: "#F6F3FF",
          100: "#EEE9FF", // lilac
          200: "#DCD3FF",
          300: "#C0B0F8",
          400: "#9B82F0",
          500: "#7657E8", // lavender
          600: "#6544D9",
          700: "#5334B4",
          800: "#412A8C",
        },
      },
      borderRadius: {
        card: "20px",
        sheet: "24px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(32,33,42,0.04), 0 4px 16px -8px rgba(32,33,42,0.10)",
        lift: "0 8px 30px -12px rgba(32,33,42,0.25)",
      },
      spacing: {
        // Bottom-nav clearance: 64px bar + safe area.
        nav: "calc(5rem + env(safe-area-inset-bottom))",
      },
      keyframes: {
        "sheet-up": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // Landing-page product preview.
        "rise-in": {
          from: { opacity: "0", transform: "translateY(12px) scale(0.97)" },
          to: { opacity: "1", transform: "none" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "none" },
        },
        xfade: {
          "0%, 40%": { opacity: "0" },
          "60%, 100%": { opacity: "1" },
        },
      },
      animation: {
        "sheet-up": "sheet-up 200ms ease-out",
        "fade-in": "fade-in 160ms ease-out",
        "rise-in": "rise-in 420ms cubic-bezier(0.22,1,0.36,1) both",
        "slide-in": "slide-in 460ms cubic-bezier(0.22,1,0.36,1) both",
        xfade: "xfade 5s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
} satisfies Config;
