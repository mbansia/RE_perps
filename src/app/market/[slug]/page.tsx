"use client";

import { useParams } from "next/navigation";
import { MARKETS } from "@/lib/constants";
import { useMarketData } from "@/hooks/useMarketData";
import { usePositions } from "@/hooks/usePositions";
import { TradePanel } from "@/components/trade/TradePanel";
import { PositionRow } from "@/components/trade/PositionRow";
import { PriceChart } from "@/components/trade/PriceChart";

function formatDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function findMarketBySlug(slug: string) {
  return Object.entries(MARKETS).find(([_, m]) => m.slug === slug);
}

export default function MarketPage() {
  const params = useParams();
  const slug = params.slug as string;
  const marketEntry = findMarketBySlug(slug);

  if (!marketEntry) {
    return (
      <div className="text-center py-20">
        <h1 className="heading-display text-2xl text-text-primary">MARKET NOT FOUND</h1>
        <p className="text-text-secondary mt-2">"{slug}" is not a valid market.</p>
      </div>
    );
  }

  const [marketKey, market] = marketEntry;
  const {
    price, fundingRate, skew, totalLongOIDollars, totalShortOIDollars, totalOIDollars,
    lastUpdated, marketId, isLoading, hasError,
  } = useMarketData(marketKey);
  const { positions } = usePositions();
  const marketPositions = positions.filter((p) => p.marketId === marketId);

  return (
    <div className="animate-slide-up">
      {/* Market header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="signal-dot" />
            <span className="ticker-strip text-long">SECTOR ACTIVE</span>
            <span className="ticker-strip text-text-muted">// {marketKey}-PERP</span>
          </div>
          <h1 className="heading-display text-2xl md:text-3xl text-text-primary tracking-[0.15em]">
            {market.name}
          </h1>
          <p className="text-text-muted text-xs tracking-widest mt-1 uppercase">
            Median residential {market.unit}
          </p>
        </div>
        {!isLoading && !hasError && (
          <div className="text-right">
            <div className="data-value text-4xl font-bold" style={{ textShadow: "0 0 24px rgba(232, 123, 74, 0.25)" }}>
              ${price.toFixed(2)}
            </div>
            <div className="text-[10px] text-text-muted mt-1 font-mono tracking-widest">
              LAST PING {lastUpdated > 0 ? new Date(lastUpdated * 1000).toLocaleTimeString() : "---"}
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="card hud-frame p-5 mb-8 relative overflow-hidden">
        <div className="absolute inset-0 scan-lines" />
        <div className="relative grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <span className="label">Funding Rate</span>
            <div className={`data-value text-sm mt-1 ${fundingRate >= 0 ? "text-long" : "text-short"}`}>
              {(fundingRate * 100).toFixed(4)}%<span className="text-text-muted">/day</span>
            </div>
          </div>
          <div>
            <span className="label">Open Interest</span>
            <div className="data-value text-sm mt-1">{formatDollars(totalOIDollars)}</div>
          </div>
          <div>
            <span className="label">Long OI</span>
            <div className="data-value text-sm mt-1 text-long">{formatDollars(totalLongOIDollars)}</div>
          </div>
          <div>
            <span className="label">Short OI</span>
            <div className="data-value text-sm mt-1 text-short">{formatDollars(totalShortOIDollars)}</div>
          </div>
          <div>
            <span className="label">Skew</span>
            <div className={`data-value text-sm mt-1 ${skew >= 0 ? "text-long" : "text-short"}`}>
              {skew >= 0 ? "+" : ""}{formatDollars(Math.abs(skew) * price)}
            </div>
          </div>
        </div>
      </div>

      {/* Trade panel + positions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PriceChart marketId={marketId} currentPrice={price} lastUpdated={lastUpdated} />

          {/* Open positions */}
          {marketPositions.length > 0 && (
            <div className="card p-5">
              <h3 className="label mb-4">Your Positions</h3>
              <div className="space-y-2">
                {marketPositions.map((pos, i) => (
                  <PositionRow key={i} position={pos} currentPrice={price} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <TradePanel marketId={marketId} marketName={marketKey} currentPrice={price} />
        </div>
      </div>
    </div>
  );
}
