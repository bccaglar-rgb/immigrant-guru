import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f5f5f7",
        surface: "#ffffff",
        ink: "#1d1d1f",
        muted: "#86868b",
        line: "rgba(0,0,0,0.08)",
        accent: "#0071e3",
        "accent-hover": "#0077ed",
        purple: "#bf5af2",
        green: "#34c759",
        orange: "#ff9f0a",
        red: "#ff3b30",
        "glass-light": "rgba(255,255,255,0.72)",
        "glass-dark": "rgba(255,255,255,0.06)"
      },
      fontFamily: {
        sans: ["var(--font-body)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["var(--font-body)", "-apple-system", "BlinkMacSystemFont", "sans-serif"]
      },
      boxShadow: {
        soft: "0 2px 40px rgba(0,0,0,0.06)",
        card: "0 4px 24px rgba(0,0,0,0.04)",
        glow: "0 0 40px rgba(0,113,227,0.15)",
        "hero-glow": "0 0 120px rgba(0,113,227,0.08), 0 0 120px rgba(191,90,242,0.06)"
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(circle at 50% 0%, rgba(0,113,227,0.08), transparent 50%), radial-gradient(circle at 80% 20%, rgba(191,90,242,0.06), transparent 40%)",
        "gradient-accent": "linear-gradient(135deg, #0071e3, #5e5ce6, #bf5af2)",
        "gradient-card": "linear-gradient(135deg, rgba(0,113,227,0.05), rgba(191,90,242,0.05))",
        "gradient-dark": "linear-gradient(180deg, #1d1d1f 0%, #000000 100%)",
        "gradient-mesh": "radial-gradient(at 27% 37%, rgba(0,113,227,0.06) 0%, transparent 50%), radial-gradient(at 97% 21%, rgba(191,90,242,0.04) 0%, transparent 50%), radial-gradient(at 52% 99%, rgba(94,92,230,0.04) 0%, transparent 50%)"
      },
      maxWidth: {
        content: "1200px"
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "20px",
        "4xl": "28px"
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out",
        "slide-up": "slideUp 0.6s ease-out",
        "gradient-shift": "gradientShift 8s ease infinite"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        gradientShift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" }
        }
      }
    }
  },
  plugins: []
};

export default config;
