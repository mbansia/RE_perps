import type { Config } from "tailwindcss";

// Colors use CSS variables (space-separated RGB channels) so Tailwind opacity
// modifiers like `bg-terra/20` keep working, and swapping .dark on <html>
// flips the whole palette. See src/app/globals.css for the variable values.
const withOpacity = (varName: string) => `rgb(var(${varName}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Mars surface palette — stable across themes (tonal planets)
        mars: {
          900: "#0C0404",
          800: "#1A0A0A",
          700: "#2D1111",
          600: "#4A1C1C",
          500: "#8B3A3A",
          400: "#C75B3B",
          300: "#E87B4A",
          200: "#F4A574",
          100: "#FDD6B8",
          50:  "#FFF0E5",
        },
        // Surfaces
        bg: {
          base:     withOpacity("--c-bg-base"),
          card:     withOpacity("--c-bg-card"),
          elevated: withOpacity("--c-bg-elevated"),
          modal:    withOpacity("--c-bg-modal"),
          input:    withOpacity("--c-bg-input"),
        },
        // Text
        text: {
          primary:   withOpacity("--c-text-primary"),
          secondary: withOpacity("--c-text-secondary"),
          muted:     withOpacity("--c-text-muted"),
          accent:    withOpacity("--c-text-accent"),
          inverse:   withOpacity("--c-text-inverse"),
        },
        // Trading semantic (same hue across themes, we adjust alpha via muted tokens)
        long:          withOpacity("--c-long"),
        short:         withOpacity("--c-short"),
        "long-muted":  withOpacity("--c-long-muted"),
        "short-muted": withOpacity("--c-short-muted"),
        neutral:       withOpacity("--c-neutral"),
        warning:       withOpacity("--c-warning"),
        // Brand
        terra:          withOpacity("--c-terra"),
        "terra-hover":  withOpacity("--c-terra-hover"),
        "terra-dark":   withOpacity("--c-terra-dark"),
        ember:          withOpacity("--c-ember"),
        oxide:          withOpacity("--c-oxide"),
        dust:           withOpacity("--c-dust"),
        void:           withOpacity("--c-void"),
        atmo:           withOpacity("--c-atmo"),
        // Borders
        border: {
          DEFAULT: withOpacity("--c-border"),
          strong:  withOpacity("--c-border-strong"),
          glow:    withOpacity("--c-border-glow"),
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Geist Mono"', "ui-monospace", "monospace"],
        display: ['"Orbitron"', '"Space Grotesk"', "sans-serif"],
      },
      borderRadius: {
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      backdropBlur: {
        glass: "16px",
      },
      boxShadow: {
        glass: "0 4px 24px rgba(232, 123, 74, 0.06), 0 1px 2px rgba(0, 0, 0, 0.2)",
        glow: "0 0 30px rgba(232, 123, 74, 0.2)",
        "glow-lg": "0 0 60px rgba(232, 123, 74, 0.15), 0 0 120px rgba(232, 123, 74, 0.05)",
        "inner-glow": "inset 0 1px 0 rgba(232, 123, 74, 0.1)",
      },
      animation: {
        "pulse-slow": "pulse 4s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "dust-float": "dust-float 20s ease-in-out infinite",
        "slide-up": "slide-up 0.5s ease-out",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(232, 123, 74, 0.1)" },
          "50%": { boxShadow: "0 0 40px rgba(232, 123, 74, 0.25)" },
        },
        "dust-float": {
          "0%, 100%": { transform: "translateY(0) translateX(0)", opacity: "0.3" },
          "25%": { transform: "translateY(-20px) translateX(10px)", opacity: "0.6" },
          "50%": { transform: "translateY(-10px) translateX(-5px)", opacity: "0.4" },
          "75%": { transform: "translateY(-30px) translateX(15px)", opacity: "0.5" },
        },
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      backgroundImage: {
        "mars-gradient": "linear-gradient(135deg, #1A0A0A 0%, #2D1111 30%, #4A1C1C 70%, #1A0A0A 100%)",
        "mars-radial": "radial-gradient(ellipse at center, rgba(232, 123, 74, 0.08) 0%, transparent 70%)",
        "terra-gradient": "linear-gradient(135deg, #C75B3B, #E87B4A, #FF5733)",
        "terra-btn": "linear-gradient(135deg, #C75B3B 0%, #E87B4A 100%)",
        "long-gradient": "linear-gradient(135deg, #00B368, #00E68A)",
        "short-gradient": "linear-gradient(135deg, #CC3347, #FF4057)",
      },
    },
  },
  plugins: [],
};

export default config;
