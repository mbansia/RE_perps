"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/shared/ConnectButton";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export function Header() {
  return (
    <header
      className="border-b border-border sticky top-0 z-50 backdrop-blur-xl"
      style={{
        background:
          "linear-gradient(180deg, rgb(var(--c-bg-base) / 0.95), rgb(var(--c-bg-card) / 0.85))",
      }}
    >
      {/* Mission-status ticker */}
      <div
        className="border-b border-border/50"
        style={{ background: "rgb(var(--c-oxide) / 0.08)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-6 flex items-center justify-between overflow-hidden">
          <div className="flex items-center gap-4 ticker-strip">
            <span className="flex items-center gap-1.5">
              <span className="signal-dot" />
              <span className="text-long">ORBIT STABLE</span>
            </span>
            <span className="hidden sm:inline">CHAIN 26218</span>
            <span className="hidden md:inline">MISSION // TERRAFORM-01</span>
          </div>
          <div className="ticker-strip hidden md:block">
            STATUS <span className="text-terra">// NOMINAL</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-3 group">
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              xmlns="http://www.w3.org/2000/svg"
              className="group-hover:drop-shadow-[0_0_12px_rgba(232,123,74,0.55)] transition-[filter] duration-300"
            >
              <defs>
                <radialGradient id="marsSphere" cx="35%" cy="32%" r="70%">
                  <stop offset="0%" stopColor="#F4A574" />
                  <stop offset="45%" stopColor="#E87B4A" />
                  <stop offset="80%" stopColor="#C75B3B" />
                  <stop offset="100%" stopColor="#4A1C1C" />
                </radialGradient>
                <radialGradient id="marsShade" cx="50%" cy="50%" r="50%">
                  <stop offset="80%" stopColor="transparent" />
                  <stop offset="100%" stopColor="#2D1111" stopOpacity="0.75" />
                </radialGradient>
                <clipPath id="marsClip"><circle cx="16" cy="16" r="15" /></clipPath>
              </defs>
              <circle cx="16" cy="16" r="15" fill="url(#marsSphere)" />
              <g clipPath="url(#marsClip)">
                {/* Craters — dark rim + inner shadow */}
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
                <g opacity="0.7">
                  <circle cx="7" cy="18" r="1" fill="#2D1111" />
                </g>
                <g opacity="0.7">
                  <circle cx="25" cy="23" r="1.1" fill="#2D1111" />
                </g>
                {/* Dust streaks */}
                <ellipse cx="17" cy="14" rx="3.5" ry="0.6" fill="#C75B3B" opacity="0.35" />
                <ellipse cx="14" cy="17" rx="4" ry="0.5" fill="#4A1C1C" opacity="0.35" />
              </g>
              {/* Edge shade + rim highlight */}
              <circle cx="16" cy="16" r="15" fill="url(#marsShade)" />
              <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.6" />
            </svg>
            <span className="heading-display text-lg tracking-[0.2em] text-text-primary">
              TERRAFORM
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {[
              { href: "/", label: "MARKETS" },
              { href: "/portfolio", label: "PORTFOLIO" },
              { href: "/pool", label: "LP POOL" },
              { href: "/faucet", label: "FAUCET" },
              { href: "/docs", label: "DOCS" },
              { href: "/brand", label: "BRAND" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs font-semibold tracking-widest text-text-muted hover:text-terra px-3 py-2 rounded-md hover:bg-terra/5 transition-all"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
