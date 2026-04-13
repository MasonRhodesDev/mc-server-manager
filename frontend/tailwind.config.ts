import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{vue,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Minecraft-inspired accent palette
        emerald: {
          DEFAULT: "#50fa7b",
        },
        coal: {
          50: "#f7f7f8",
          100: "#eeeef0",
          200: "#d9d9dd",
          300: "#b9b9c0",
          400: "#92929e",
          500: "#74747f",
          600: "#5e5e68",
          700: "#4d4d56",
          800: "#3f3f46",
          900: "#27272a",
          950: "#18181b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
  ],
} satisfies Config;
