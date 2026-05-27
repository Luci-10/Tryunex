import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f3ff",
          200: "#ddd6fe",
          500: "#7c3aed",
          600: "#6d28d9",
          700: "#5b21b6",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
