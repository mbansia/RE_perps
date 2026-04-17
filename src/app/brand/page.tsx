"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Color palette — sourced from globals.css + tailwind.config.ts
// ---------------------------------------------------------------------------
type Swatch = { name: string; hex: string; rgb: string; note?: string };

const palettes: { group: string; kicker: string; swatches: Swatch[] }[] = [
  {
    group: "Mars Surface",
    kicker: "01 // PLANET",
    swatches: [
      { name: "mars-900", hex: "#0C0404", rgb: "12 4 4",       note: "deep space void" },
      { name: "mars-800", hex: "#1A0A0A", rgb: "26 10 10",     note: "Mars night sky" },
      { name: "mars-700", hex: "#2D1111", rgb: "45 17 17",     note: "dark regolith" },
      { name: "mars-600", hex: "#4A1C1C", rgb: "74 28 28",     note: "iron-oxide shadow" },
      { name: "mars-500", hex: "#8B3A3A", rgb: "139 58 58",    note: "Martian dust" },
      { name: "mars-400", hex: "#C75B3B", rgb: "199 91 59",    note: "rust canyon" },
      { name: "mars-300", hex: "#E87B4A", rgb: "232 123 74",   note: "sunlit terracotta" },
      { name: "mars-200", hex: "#F4A574", rgb: "244 165 116",  note: "warm dust" },
      { name: "mars-100", hex: "#FDD6B8", rgb: "253 214 184",  note: "pale sand" },
      { name: "mars-50",  hex: "#FFF0E5", rgb: "255 240 229",  note: "frost" },
    ],
  },
  {
    group: "Brand",
    kicker: "02 // IDENTITY",
    swatches: [
      { name: "terra",        hex: "#E87B4A", rgb: "232 123 74",  note: "primary CTA" },
      { name: "terra-hover",  hex: "#F09060", rgb: "240 144 96",  note: "hover state" },
      { name: "terra-dark",   hex: "#C75B3B", rgb: "199 91 59",   note: "dark accent" },
      { name: "ember",        hex: "#FF5733", rgb: "255 87 51",   note: "hot accent" },
      { name: "oxide",        hex: "#8B3A3A", rgb: "139 58 58",   note: "muted accent" },
      { name: "atmo",         hex: "#1E3A5F", rgb: "30 58 95",    note: "visor blue" },
    ],
  },
  {
    group: "Trading",
    kicker: "03 // MARKETS",
    swatches: [
      { name: "long",    hex: "#00E68A", rgb: "0 230 138",   note: "terraforming green — profit" },
      { name: "short",   hex: "#FF4057", rgb: "255 64 87",   note: "solar red — loss" },
      { name: "neutral", hex: "#5B8DEF", rgb: "91 141 239",  note: "atmosphere blue" },
      { name: "warning", hex: "#FFB547", rgb: "255 181 71",  note: "solar warning" },
    ],
  },
];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: (v: string) => {
      navigator.clipboard?.writeText(v);
      setCopied(v);
      setTimeout(() => setCopied((c) => (c === v ? null : c)), 1100);
    },
  };
}

function Swatch({ s, copyHandler }: { s: Swatch; copyHandler: (v: string) => void }) {
  return (
    <button
      onClick={() => copyHandler(s.hex)}
      className="card hud-frame p-4 text-left relative overflow-hidden hover:-translate-y-0.5 transition-transform"
      title={`Copy ${s.hex}`}
    >
      <div
        className="h-16 rounded-md mb-3"
        style={{ background: s.hex, boxShadow: "inset 0 0 0 1px rgb(var(--c-border) / 0.3)" }}
      />
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-text-primary">{s.name}</span>
        <span className="font-mono text-[10px] text-text-muted">{s.hex}</span>
      </div>
      <div className="font-mono text-[10px] text-text-muted mt-0.5">rgb({s.rgb})</div>
      {s.note && <div className="text-[10px] text-text-muted mt-1 italic">{s.note}</div>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Mars planet SVG — lifted from Header.tsx, sized for brand display
// ---------------------------------------------------------------------------
function MarsLogo({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="marsBrand" cx="35%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#F4A574" />
          <stop offset="45%" stopColor="#E87B4A" />
          <stop offset="80%" stopColor="#C75B3B" />
          <stop offset="100%" stopColor="#4A1C1C" />
        </radialGradient>
        <radialGradient id="marsBrandShade" cx="50%" cy="50%" r="50%">
          <stop offset="80%" stopColor="transparent" />
          <stop offset="100%" stopColor="#2D1111" stopOpacity="0.75" />
        </radialGradient>
        <clipPath id="marsBrandClip"><circle cx="16" cy="16" r="15" /></clipPath>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#marsBrand)" />
      <g clipPath="url(#marsBrandClip)">
        <g opacity="0.85">
          <circle cx="10" cy="11" r="2" fill="#2D1111" />
          <circle cx="10.4" cy="10.6" r="1.4" fill="#8B3A3A" />
        </g>
        <g opacity="0.8">
          <circle cx="20" cy="19" r="2.6" fill="#2D1111" />
          <circle cx="20.5" cy="18.5" r="1.9" fill="#8B3A3A" />
        </g>
        <g opacity="0.85">
          <circle cx="22" cy="10" r="1.3" fill="#2D1111" />
          <circle cx="22.3" cy="9.7" r="0.85" fill="#8B3A3A" />
        </g>
        <g opacity="0.75">
          <circle cx="13" cy="22" r="1.6" fill="#2D1111" />
          <circle cx="13.3" cy="21.7" r="1" fill="#8B3A3A" />
        </g>
        <g opacity="0.7"><circle cx="7" cy="18" r="1" fill="#2D1111" /></g>
        <g opacity="0.7"><circle cx="25" cy="23" r="1.1" fill="#2D1111" /></g>
        <ellipse cx="17" cy="14" rx="3.5" ry="0.6" fill="#C75B3B" opacity="0.35" />
        <ellipse cx="14" cy="17" rx="4" ry="0.5" fill="#4A1C1C" opacity="0.35" />
      </g>
      <circle cx="16" cy="16" r="15" fill="url(#marsBrandShade)" />
      <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.6" />
    </svg>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="ticker-strip mb-3">
      <span className="signal-dot mr-2 inline-block align-middle" />
      {children}
    </div>
  );
}

export default function BrandPage() {
  const { copied, copy } = useCopy();

  return (
    <div className="animate-slide-up">
      {/* Hero */}
      <div className="mb-10">
        <Kicker><span className="text-long">TERRAFORM-01</span></Kicker>
        <h1 className="heading-display text-3xl md:text-5xl text-text-primary tracking-[0.15em]">
          BRAND KIT
        </h1>
        <p className="text-text-secondary mt-3 max-w-2xl">
          Everything needed to represent Terraform consistently — logo, colors, typography, voice.
          Tap any swatch to copy the hex.
        </p>
      </div>

      {copied && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg border border-terra/40 bg-void/90 font-mono text-xs text-terra backdrop-blur-md shadow-lg">
          copied {copied}
        </div>
      )}

      {/* Logo */}
      <section className="mb-16">
        <Kicker>LOGO</Kicker>
        <div className="card hud-frame p-8 grid grid-cols-1 md:grid-cols-3 gap-8 items-center relative overflow-hidden">
          <div className="absolute inset-0 scan-lines" />
          <div className="flex flex-col items-center relative">
            <MarsLogo size={160} />
            <p className="font-mono text-[10px] text-text-muted mt-4 tracking-widest">PRIMARY · 160px</p>
          </div>
          <div className="flex flex-col items-center relative">
            <MarsLogo size={64} />
            <p className="font-mono text-[10px] text-text-muted mt-4 tracking-widest">SMALL · 64px</p>
          </div>
          <div className="flex flex-col items-center relative">
            <MarsLogo size={32} />
            <p className="font-mono text-[10px] text-text-muted mt-4 tracking-widest">FAVICON · 32px</p>
          </div>
        </div>
      </section>

      {/* Wordmark */}
      <section className="mb-16">
        <Kicker>WORDMARK</Kicker>
        <div className="card p-10 flex items-center justify-center">
          <div className="flex items-center gap-5">
            <MarsLogo size={54} />
            <span className="heading-display text-4xl tracking-[0.25em] text-text-primary">
              TERRAFORM
            </span>
          </div>
        </div>
        <p className="text-sm text-text-muted mt-3 max-w-xl">
          The wordmark uses <span className="text-terra font-mono">Orbitron</span> at 0.25em letter-spacing,
          always in uppercase. Always pair with the Mars planet mark to the left.
        </p>
      </section>

      {/* Colors */}
      <section className="mb-16">
        <Kicker>COLOR SYSTEM</Kicker>
        <div className="space-y-10">
          {palettes.map((p) => (
            <div key={p.group}>
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="heading-display text-lg text-text-primary tracking-widest">
                  {p.group}
                </h3>
                <span className="ticker-strip">{p.kicker}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {p.swatches.map((s) => (
                  <Swatch key={s.name} s={s} copyHandler={copy} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography */}
      <section className="mb-16">
        <Kicker>TYPOGRAPHY</Kicker>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-6">
            <div className="ticker-strip mb-3">DISPLAY</div>
            <div className="heading-display text-3xl text-text-primary tracking-widest mb-3">
              ORBITRON
            </div>
            <p className="text-xs text-text-muted font-mono">
              Headings, kickers, marque. Always UPPERCASE, 0.15–0.30em tracking.
            </p>
            <div className="mt-4 space-y-1">
              <div className="heading-display text-xs text-text-primary">400 · Regular</div>
              <div className="heading-display text-xs font-semibold text-text-primary">600 · Semibold</div>
              <div className="heading-display text-xs font-bold text-text-primary">700 · Bold</div>
              <div className="heading-display text-xs font-black text-text-primary">900 · Black</div>
            </div>
          </div>
          <div className="card p-6">
            <div className="ticker-strip mb-3">BODY</div>
            <div className="font-sans text-3xl text-text-primary mb-3">Space Grotesk</div>
            <p className="text-xs text-text-muted">
              Body copy, paragraphs, UI labels. Clean, neutral, reads equally well on light and dark.
            </p>
            <div className="mt-4 space-y-1 text-xs text-text-primary">
              <div className="font-normal">400 · Regular — The quick red rover</div>
              <div className="font-medium">500 · Medium — The quick red rover</div>
              <div className="font-semibold">600 · Semibold — The quick red rover</div>
              <div className="font-bold">700 · Bold — The quick red rover</div>
            </div>
          </div>
          <div className="card p-6">
            <div className="ticker-strip mb-3">MONO</div>
            <div className="font-mono text-3xl text-text-primary mb-3">JetBrains</div>
            <p className="text-xs text-text-muted">
              Data, prices, hashes, code. Always for any value the user might read as a number.
            </p>
            <div className="mt-4 space-y-1 font-mono text-xs text-text-primary">
              <div>$870.00 /sqft</div>
              <div>0xECc3…10c7</div>
              <div>block 769914</div>
              <div>+0.0432%/day</div>
            </div>
          </div>
        </div>
      </section>

      {/* UI elements */}
      <section className="mb-16">
        <Kicker>UI ELEMENTS</Kicker>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-6 space-y-4">
            <h3 className="label">Buttons</h3>
            <div className="flex flex-wrap gap-3">
              <button className="btn-terra">Primary Action</button>
              <button className="btn-long">Go Long</button>
              <button className="btn-short">Go Short</button>
            </div>
          </div>
          <div className="card p-6 space-y-4">
            <h3 className="label">Badges</h3>
            <div className="flex flex-wrap gap-3 items-center">
              <span className="badge-long">LONG</span>
              <span className="badge-short">SHORT</span>
              <span className="ticker-strip">
                <span className="signal-dot mr-2 inline-block align-middle" />
                LIVE TELEMETRY
              </span>
            </div>
          </div>
          <div className="card p-6 space-y-3">
            <h3 className="label">Data Values</h3>
            <div className="data-value text-4xl">$870.00</div>
            <div className="pnl-positive text-2xl">+$142.50</div>
            <div className="pnl-negative text-2xl">−$88.30</div>
          </div>
          <div className="card p-6">
            <h3 className="label mb-3">Input</h3>
            <input className="input-mars" placeholder="Enter amount…" defaultValue="1000.00" />
          </div>
        </div>
      </section>

      {/* Voice */}
      <section className="mb-16">
        <Kicker>VOICE & TONE</Kicker>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-6">
            <h3 className="text-long text-sm font-bold tracking-widest mb-3">DO</h3>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>Use mission-control / sci-fi metaphors: telemetry, sector, transmission, orbit.</li>
              <li>Keep numbers in monospace with tabular-nums.</li>
              <li>Use kickers before headings: &ldquo;01 // SURFACE&rdquo;, &ldquo;MISSION BRIEFING&rdquo;.</li>
              <li>Prefer HUD framing over busy dashboards.</li>
            </ul>
          </div>
          <div className="card p-6">
            <h3 className="text-short text-sm font-bold tracking-widest mb-3">DON&apos;T</h3>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>Don&apos;t use generic DeFi blue. Terra + rust only.</li>
              <li>Don&apos;t mix sentence-case and uppercase in display type.</li>
              <li>Don&apos;t crowd the UI — negative space is part of the theme.</li>
              <li>No emojis in product UI (kickers and tickers do the heavy lifting).</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="mt-16 pt-8 border-t border-border/50">
        <p className="ticker-strip">
          BRAND KIT v1 // TERRAFORM-01 // © MMXXVI
        </p>
      </div>
    </div>
  );
}
