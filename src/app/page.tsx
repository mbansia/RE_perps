"use client";

import Link from "next/link";
import { useMarketData } from "@/hooks/useMarketData";
import { useAccountHealth } from "@/hooks/useAccountHealth";
import { MARKETS } from "@/lib/constants";

function formatDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function MarketCard({ id, name, slug }: { id: string; name: string; slug: string }) {
  const { price, fundingRate, skew, totalOIDollars, totalLongOIDollars, totalShortOIDollars, isLoading, hasError } = useMarketData(id);

  return (
    <Link href={`/market/${slug}`}>
      <div className="card p-6 group cursor-pointer transition-all duration-300 hover:-translate-y-1 animate-slide-up relative overflow-hidden">
        {/* Glow accent on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-terra/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="relative">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(232, 123, 74, 0.15), rgba(139, 58, 58, 0.1))" }}>
                <span className="text-lg">{id === "NYC" ? "🗽" : "🏗️"}</span>
              </div>
              <div>
                <h3 className="font-semibold text-text-primary text-lg">{name}</h3>
                <span className="text-xs text-text-muted tracking-wide">MEDIAN $/SQFT</span>
              </div>
            </div>
            <div className="text-xs text-text-muted font-mono">PERP</div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <div className="h-10 rounded-lg animate-pulse" style={{ background: "rgb(var(--c-oxide) / 0.18)" }} />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-14 rounded-lg animate-pulse" style={{ background: "rgb(var(--c-oxide) / 0.12)" }} />
                <div className="h-14 rounded-lg animate-pulse" style={{ background: "rgb(var(--c-oxide) / 0.12)" }} />
              </div>
            </div>
          ) : hasError ? (
            <div className="py-4 text-center text-text-muted text-sm">
              Oracle data unavailable
            </div>
          ) : (
            <>
              <div className="data-value text-4xl font-bold mb-6 tracking-tight">
                ${price.toFixed(2)}
                <span className="text-sm text-text-muted font-normal ml-2">/sqft</span>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <span className="label">Open Interest</span>
                  <div className="data-value text-sm mt-0.5">{formatDollars(totalOIDollars)}</div>
                </div>
                <div>
                  <span className="label">Funding Rate</span>
                  <div className={`data-value text-sm mt-0.5 ${fundingRate >= 0 ? "text-long" : "text-short"}`}>
                    {(fundingRate * 100).toFixed(4)}%<span className="text-text-muted">/day</span>
                  </div>
                </div>
                <div>
                  <span className="label">Longs</span>
                  <div className="data-value text-sm mt-0.5 text-long">{formatDollars(totalLongOIDollars)}</div>
                </div>
                <div>
                  <span className="label">Shorts</span>
                  <div className="data-value text-sm mt-0.5 text-short">{formatDollars(totalShortOIDollars)}</div>
                </div>
              </div>

              {/* Skew bar */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-long font-mono">LONG</span>
                  <span className="text-short font-mono">SHORT</span>
                </div>
                <div className="h-1.5 rounded-full bg-mars-700 overflow-hidden flex">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${totalOIDollars > 0 ? Math.max(5, (totalLongOIDollars / totalOIDollars) * 100) : 50}%`,
                      background: "linear-gradient(90deg, #00B368, #00E68A)",
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function AccountBar() {
  const { collateral, totalValue, availableMargin, healthFactor, isLoading } =
    useAccountHealth();

  if (isLoading || collateral === 0) return null;

  return (
    <div className="card p-5 mb-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <span className="label">Collateral</span>
          <div className="data-value text-xl mt-1">${collateral.toFixed(2)}</div>
        </div>
        <div>
          <span className="label">Account Value</span>
          <div className={`data-value text-xl mt-1 ${totalValue >= collateral ? "pnl-positive" : "pnl-negative"}`}>
            ${totalValue.toFixed(2)}
          </div>
        </div>
        <div>
          <span className="label">Available</span>
          <div className="data-value text-xl mt-1">${availableMargin.toFixed(2)}</div>
        </div>
        <div>
          <span className="label">Health</span>
          <div className={`data-value text-xl mt-1 ${
            healthFactor > 2 ? "text-long" : healthFactor > 1.2 ? "text-warning" : "text-short"
          }`}>
            {healthFactor === Infinity ? "---" : healthFactor.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div>
      {/* Hero */}
      <div className="mb-10">
        <h1 className="heading-display text-3xl md:text-4xl text-text-primary tracking-[0.15em]">
          MARKETS
        </h1>
        <p className="text-text-secondary mt-2 text-sm tracking-wide">
          Trade city-level real estate indices with up to 10x leverage on Integra
        </p>
      </div>

      <AccountBar />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(MARKETS).map(([key, market]) => (
          <MarketCard key={key} id={key} name={market.name} slug={market.slug} />
        ))}
      </div>
    </div>
  );
}
