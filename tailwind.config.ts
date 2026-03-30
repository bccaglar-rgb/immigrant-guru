import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg: {
          900: "#04070f",
          800: "#0a1120",
          700: "#121d32"
        },
        accent: {
          cyan: "#20e6d6",
          blue: "#4f7fff",
          rose: "#ff6b8a"
        }
      },
      boxShadow: {
        soft: "0 20px 60px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: [],
} satisfies Config;
