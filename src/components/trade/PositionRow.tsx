"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { PerpEngineABI } from "@/lib/abis";
import { PERP_ENGINE_ADDRESS } from "@/lib/constants";
import type { ParsedPosition } from "@/hooks/usePositions";

interface PositionRowProps {
  position: ParsedPosition;
  currentPrice: number;
}

export function PositionRow({ position, currentPrice }: PositionRowProps) {
  const { writeContract: closePos, data: closeHash } = useWriteContract();
  const { isLoading: closePending } = useWaitForTransactionReceipt({ hash: closeHash });

  const pricePnL = position.isLong
    ? position.size * (currentPrice - position.lastFillPrice)
    : position.size * (position.lastFillPrice - currentPrice);

  const pnlPercent = position.notional > 0 ? (pricePnL / position.notional) * 100 : 0;

  const handleClose = () => {
    closePos({
      address: PERP_ENGINE_ADDRESS,
      abi: PerpEngineABI,
      functionName: "closePosition",
      args: [position.marketId],
    });
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-xl transition-all hover:border-border-strong"
      style={{ background: "rgb(var(--c-bg-elevated) / 0.5)", border: "1px solid rgb(var(--c-border) / var(--border-alpha))" }}>
      <div className="flex items-center gap-4">
        <span className={position.isLong ? "badge-long" : "badge-short"}>
          {position.isLong ? "LONG" : "SHORT"}
        </span>
        <div>
          <div className="text-sm font-mono text-text-primary">
            {position.size.toFixed(0)} sqft
            <span className="text-text-muted ml-2">(${(position.size * currentPrice).toFixed(0)})</span>
          </div>
          <div className="text-xs text-text-muted font-mono">
            Entry: ${position.lastFillPrice.toFixed(2)}/sqft
          </div>
        </div>
      </div>

      <div className="text-right flex items-center gap-5">
        <div>
          <div className={pricePnL >= 0 ? "pnl-positive text-sm" : "pnl-negative text-sm"}>
            {pricePnL >= 0 ? "+" : ""}${pricePnL.toFixed(2)}
          </div>
          <div className={`text-xs font-mono ${pnlPercent >= 0 ? "text-long" : "text-short"}`}>
            {pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%
          </div>
        </div>
        <button
          onClick={handleClose}
          disabled={closePending}
          className="text-xs text-text-muted hover:text-short transition-colors px-3 py-1.5 rounded-md hover:bg-short/10"
        >
          {closePending ? "..." : "CLOSE"}
        </button>
      </div>
    </div>
  );
}
