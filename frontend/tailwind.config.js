/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["Plus Jakarta Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"]
      },
      colors: {
        slate: {
          100: "#0f172a",
          200: "#1e293b",
          300: "#334155",
          400: "#64748b",
          500: "#94a3b8"
        },
        cyber: {
          base: "#eef4ff",
          panel: "#ffffff",
          panelSoft: "#dbe8ff",
          safe: "#14835f",
          warn: "#b7791f",
          threat: "#d94a55",
          accent: "#2563eb"
        }
      },
      boxShadow: {
        cyber: "0 20px 48px rgba(37, 99, 235, 0.14)",
        panel: "0 10px 26px rgba(37, 99, 235, 0.18)"
      },
      backgroundImage: {
        "cyber-grid":
          "radial-gradient(circle at 1px 1px, rgba(37,99,235,0.14) 1px, transparent 0)",
        "cyber-glow":
          "linear-gradient(125deg, rgba(37,99,235,0.2) 0%, rgba(20,131,95,0.14) 58%, rgba(217,74,85,0.1) 100%)"
      },
      keyframes: {
        floatY: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-7px)" }
        },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(59,183,255,0.45)" },
          "100%": { boxShadow: "0 0 0 16px rgba(59,183,255,0)" }
        }
      },
      animation: {
        "float-y": "floatY 4.5s ease-in-out infinite",
        "pulse-ring": "pulseRing 2.2s ease-out infinite"
      }
    }
  },
  plugins: []
};
