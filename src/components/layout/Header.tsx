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
            <div className="w-8 h-8 rounded-full relative overflow-hidden group-hover:shadow-glow transition-shadow"
              style={{ background: "radial-gradient(circle at 35% 35%, #F4A574, #C75B3B, #4A1C1C)" }}>
              <div className="absolute inset-0 rounded-full border border-white/10" />
            </div>
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
