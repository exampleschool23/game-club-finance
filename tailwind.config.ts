import type { Config } from "tailwindcss";

/**
 * Design tokens. One cobalt accent for actions and the current page; slate
 * neutrals with a slight blue tint; green/red/amber reserved for meaning
 * (money in, money out, needs attention).
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        // Slate-tinted neutrals replace Tailwind's pure greys everywhere.
        gray: {
          50: "#f7f8fa",
          100: "#eff1f5",
          200: "#e3e7ee",
          300: "#cbd2dd",
          400: "#98a2b3",
          500: "#667085",
          600: "#4b5565",
          700: "#364152",
          800: "#1f2937",
          900: "#131a26",
          950: "#0b1018",
        },
        primary: {
          50: "#eef3ff",
          100: "#dce6ff",
          200: "#b9cdff",
          300: "#8eaeff",
          400: "#5f86ff",
          500: "#3b63f6",
          600: "#2f52e0",
          700: "#2542b8",
          800: "#1f378f",
          900: "#1b2f6e",
        },
        success: {
          50: "#e8f7f0",
          100: "#cdeee0",
          500: "#12a36f",
          600: "#0e8a5d",
          700: "#0b7049",
        },
        danger: {
          50: "#fdeeed",
          100: "#fbd9d6",
          400: "#ec6b66",
          500: "#e0453f",
          600: "#c73731",
          700: "#a52d28",
        },
        warning: {
          50: "#fdf5e6",
          100: "#fae8c4",
          500: "#e39a1e",
          600: "#c07f12",
          700: "#9a6410",
        },
        sidebar: "#ffffff",
        orange: {
          50: "#fff4ec",
          100: "#ffe4d0",
          500: "#f07a2b",
          600: "#d9641a",
          700: "#b24f13",
        },
        purple: {
          50: "#f3f1ff",
          100: "#e6e1ff",
          500: "#7c5cf2",
          600: "#6a48e0",
          700: "#5738bb",
        },
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(11, 16, 24, 0.04)",
        card: "0 1px 2px rgba(11, 16, 24, 0.04), 0 2px 8px rgba(11, 16, 24, 0.04)",
        pop: "0 4px 12px rgba(11, 16, 24, 0.08), 0 12px 40px rgba(11, 16, 24, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
