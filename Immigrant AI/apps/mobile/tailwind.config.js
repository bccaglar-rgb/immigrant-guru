/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        muted: "#6b7280",
        accent: "#0071e3",
        "accent-hover": "#0077ed",
        red: "#ff3b30",
        bg: "#f5f5f7",
        card: "#ffffff"
      }
    }
  },
  plugins: []
};
