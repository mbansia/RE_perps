"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type Time,
} from "lightweight-charts";
import { usePriceHistory } from "@/hooks/usePriceHistory";

interface Props {
  marketId: `0x${string}` | undefined;
  currentPrice: number;
  lastUpdated: number;
}

export function PriceChart({ marketId, currentPrice, lastUpdated }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);

  const { data: history, isLoading, isError } = usePriceHistory(marketId);

  // Initialize chart once
  useEffect(() => {
    if (!containerRef.current) return;

    // Read CSS variables so chart colors match the active theme. lightweight-charts
    // takes string literals, so we sample the vars at init and re-apply on theme flips.
    const sample = () => {
      const s = getComputedStyle(document.documentElement);
      const rgb = (v: string) => {
        const parts = s.getPropertyValue(v).trim().split(/\s+/);
        return parts.length === 3 ? `rgb(${parts.join(",")})` : null;
      };
      const rgba = (v: string, a: number) => {
        const parts = s.getPropertyValue(v).trim().split(/\s+/);
        return parts.length === 3 ? `rgba(${parts.join(",")},${a})` : null;
      };
      return {
        text: rgb("--c-text-secondary") ?? "#CDB4A5",
        grid: rgba("--c-oxide", 0.12) ?? "rgba(199,91,59,0.12)",
        border: rgba("--c-oxide", 0.3) ?? "rgba(199,91,59,0.3)",
        line: rgb("--c-terra") ?? "#E87B4A",
        priceLine: rgb("--c-ember") ?? "#FF5733",
        crosshair: rgb("--c-terra") ?? "#E87B4A",
        crosshairLabel: rgb("--c-terra-dark") ?? "#C75B3B",
      };
    };

    const buildOptions = (t: ReturnType<typeof sample>) => ({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: t.text,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: t.grid, style: LineStyle.Dotted },
        horzLines: { color: t.grid, style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderColor: t.border,
        textColor: t.text,
        scaleMargins: { top: 0.15, bottom: 0.1 },
      },
      timeScale: {
        borderColor: t.border,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: t.crosshair,
          width: 1 as const,
          style: LineStyle.Dashed,
          labelBackgroundColor: t.crosshairLabel,
        },
        horzLine: {
          color: t.crosshair,
          width: 1 as const,
          style: LineStyle.Dashed,
          labelBackgroundColor: t.crosshairLabel,
        },
      },
    });

    const themeColors = sample();
    const chart = createChart(containerRef.current, {
      autoSize: true,
      ...buildOptions(themeColors),
    });

    // Re-apply options when the .dark class on <html> toggles
    const observer = new MutationObserver(() => {
      chart.applyOptions(buildOptions(sample()));
      const next = sample();
      seriesRef.current?.applyOptions({
        lineColor: next.line,
        topColor: `rgba(232, 123, 74, 0.4)`,
        bottomColor: `rgba(232, 123, 74, 0.01)`,
        priceLineColor: next.priceLine,
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const series = chart.addAreaSeries({
      lineColor: "#E87B4A",
      topColor: "rgba(232, 123, 74, 0.4)",
      bottomColor: "rgba(232, 123, 74, 0.01)",
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: "#FF5733",
      priceLineStyle: LineStyle.Dashed,
      priceLineWidth: 1,
      lastValueVisible: true,
      priceFormat: {
        type: "price",
        precision: 2,
        minMove: 0.01,
      },
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !seriesRef.current) {
        setHoverPrice(null);
        return;
      }
      const data = param.seriesData.get(seriesRef.current);
      if (data && "value" in data) {
        setHoverPrice(data.value as number);
      }
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Feed data
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    const points = (history ?? []).map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.price,
    }));

    // If we have a fresh current price newer than the last event, append it
    if (currentPrice > 0 && lastUpdated > 0) {
      const last = points[points.length - 1];
      if (!last || lastUpdated > (last.time as number)) {
        points.push({ time: lastUpdated as UTCTimestamp, value: currentPrice });
      }
    }

    seriesRef.current.setData(points);
    if (points.length > 1) {
      chartRef.current.timeScale().fitContent();
    }
  }, [history, currentPrice, lastUpdated]);

  const pointCount = history?.length ?? 0;
  const firstPoint = history?.[0];
  const change = firstPoint ? currentPrice - firstPoint.price : 0;
  const changePct = firstPoint && firstPoint.price > 0 ? (change / firstPoint.price) * 100 : 0;

  return (
    <div className="card p-0 overflow-hidden relative">
      {/* HUD frame corners */}
      <div className="absolute top-3 left-3 w-4 h-4 border-l border-t border-terra/40 pointer-events-none z-10" />
      <div className="absolute top-3 right-3 w-4 h-4 border-r border-t border-terra/40 pointer-events-none z-10" />
      <div className="absolute bottom-3 left-3 w-4 h-4 border-l border-b border-terra/40 pointer-events-none z-10" />
      <div className="absolute bottom-3 right-3 w-4 h-4 border-r border-b border-terra/40 pointer-events-none z-10" />

      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-long animate-pulse" />
            <span className="text-[10px] tracking-[0.25em] text-long font-mono">LIVE TELEMETRY</span>
          </div>
          <span className="text-text-muted text-[10px] tracking-widest font-mono">
            {pointCount} SIGNALS
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs">
          <div className="text-text-muted tracking-widest">
            {hoverPrice !== null ? `$${hoverPrice.toFixed(2)}` : currentPrice > 0 ? `$${currentPrice.toFixed(2)}` : "---"}
          </div>
          {firstPoint && Math.abs(changePct) > 0.01 && (
            <div className={`tracking-widest ${change >= 0 ? "text-long" : "text-short"}`}>
              {change >= 0 ? "▲" : "▼"} {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* Chart canvas container */}
      <div className="relative">
        <div ref={containerRef} className="w-full h-[320px]" />

        {/* Overlay states */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-void/40 pointer-events-none">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-2 border-terra/30 border-t-terra rounded-full animate-spin mb-3" />
              <p className="text-terra text-xs tracking-[0.3em] font-mono">PARSING SIGNALS</p>
            </div>
          </div>
        )}

        {!isLoading && !isError && pointCount === 0 && currentPrice === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-terra text-2xl mb-2">◬</div>
              <p className="text-text-muted text-xs tracking-widest font-mono">AWAITING TELEMETRY</p>
              <p className="text-text-muted/70 text-[10px] mt-1 font-mono">
                Oracle has not reported this market
              </p>
            </div>
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-short text-xs tracking-widest font-mono">SIGNAL LOST</p>
              <p className="text-text-muted text-[10px] mt-1 font-mono">
                Could not reach oracle event log
              </p>
            </div>
          </div>
        )}

        {/* Scan line effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.04]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent 0px, transparent 3px, #E87B4A 3px, #E87B4A 4px)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
