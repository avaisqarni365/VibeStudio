/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          50:  "rgb(var(--accent-50)  / <alpha-value>)",
          100: "rgb(var(--accent-100) / <alpha-value>)",
          200: "rgb(var(--accent-200) / <alpha-value>)",
          300: "rgb(var(--accent-300) / <alpha-value>)",
          400: "rgb(var(--accent-400) / <alpha-value>)",
          500: "rgb(var(--accent-500) / <alpha-value>)",
          600: "rgb(var(--accent-600) / <alpha-value>)",
          700: "rgb(var(--accent-700) / <alpha-value>)",
          800: "rgb(var(--accent-800) / <alpha-value>)",
          900: "rgb(var(--accent-900) / <alpha-value>)",
        },
        sand: {
          50:  "#faf9f7",
          100: "#f5f3ef",
          200: "#eeebe5",
          300: "#e3dfd6",
          400: "#d4cec3",
          500: "#b8b0a2",
          600: "#9a9184",
          700: "#7d7568",
          800: "#5c564c",
          900: "#3d3930",
        },
        primary: {
          50:  "#fdf8f3",
          100: "#f9efe4",
          500: "#d18d4e",
          600: "#c47a3a",
          700: "#a36230",
          900: "#6b4127",
        },
        success: { 500: "#2d9d5c", 600: "#1f7f48" },
        warning: { 500: "#e8862a", 600: "#d96c1e" },
        error:   { 500: "#ef4444", 600: "#dc2626" },
        info:    { 500: "#3b9af5", 600: "#257cea" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", '"SF Mono"', "Menlo", "Consolas", "monospace"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1rem", "3xl": "1.25rem" },
      boxShadow: {
        soft: "0 1px 2px 0 rgba(0,0,0,0.03)",
        card: "0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.03)",
        elevated: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.03)",
      },
    },
  },
  plugins: [],
};
