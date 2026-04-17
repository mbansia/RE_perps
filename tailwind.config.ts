import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Mars surface palette
        mars: {
          900: "#0C0404",    // deep space void
          800: "#1A0A0A",    // Mars night sky
          700: "#2D1111",    // dark regolith
          600: "#4A1C1C",    // iron oxide shadow
          500: "#8B3A3A",    // Martian dust
          400: "#C75B3B",    // rust canyon
          300: "#E87B4A",    // sunlit terracotta
          200: "#F4A574",    // warm dust
          100: "#FDD6B8",    // pale sand
          50:  "#FFF0E5",    // frost
        },
        // Backgrounds
        bg: {
          base: "#0C0404",
          card: "rgba(26, 10, 10, 0.85)",
          elevated: "rgba(45, 17, 17, 0.7)",
          modal: "rgba(12, 4, 4, 0.92)",
          input: "#140808",
        },
        // Text
        text: {
          primary: "#F4E8E0",
          secondary: "#B89A8A",
          muted: "#6B4F43",
          accent: "#E87B4A",
          inverse: "#0C0404",
        },
        // Trading
        long: "#00E68A",       // terraforming green (profit)
        short: "#FF4057",      // danger red
        "long-muted": "rgba(0, 230, 138, 0.12)",
        "short-muted": "rgba(255, 64, 87, 0.12)",
        neutral: "#5B8DEF",    // atmosphere blue
        warning: "#FFB547",    // solar warning
        // Brand
        terra: "#E87B4A",      // primary CTA
        "terra-hover": "#F09060",
        "terra-dark": "#C75B3B",
        "terra-glow": "rgba(232, 123, 74, 0.4)",
        ember: "#FF5733",      // hot accent
        oxide: "#8B3A3A",      // muted accent
        dust: "#B89A8A",       // text color
        void: "#0C0404",       // deepest black
        atmo: "#1E3A5F",       // atmosphere blue tint
        // Borders
        border: {
          DEFAULT: "rgba(199, 91, 59, 0.15)",
          strong: "rgba(232, 123, 74, 0.3)",
          glow: "rgba(232, 123, 74, 0.5)",
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
