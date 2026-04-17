"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { PerpEngineABI, ERC20ABI } from "@/lib/abis";
import { PERP_ENGINE_ADDRESS, TUSDI_ADDRESS, MAX_LEVERAGE, INITIAL_MARGIN_RATIO } from "@/lib/constants";
import { useAccountHealth } from "@/hooks/useAccountHealth";

interface TradePanelProps {
  marketId: `0x${string}`;
  marketName: string;
  currentPrice: number;
}

export function TradePanel({ marketId, marketName, currentPrice }: TradePanelProps) {
  const { isConnected } = useAccount();
  const { availableMargin, tUsdiBalance, collateral } = useAccountHealth();
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [sizeInput, setSizeInput] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [depositAmount, setDepositAmount] = useState("");

  const { writeContract: approve } = useWriteContract();
  const { writeContract: deposit, data: depositHash } = useWriteContract();
  const { writeContract: openPos, data: openHash } = useWriteContract();

  const { isLoading: depositPending } = useWaitForTransactionReceipt({ hash: depositHash });
  const { isLoading: openPending } = useWaitForTransactionReceipt({ hash: openHash });

  const size = parseFloat(sizeInput) || 0;
  const notional = size * currentPrice;
  const requiredMargin = notional * INITIAL_MARGIN_RATIO;

  const handleDeposit = () => {
    const amount = parseUnits(depositAmount, 18);
    approve({
      address: TUSDI_ADDRESS as `0x${string}`,
      abi: ERC20ABI,
      functionName: "approve",
      args: [PERP_ENGINE_ADDRESS, amount],
    });
  };

  const handleDepositConfirm = () => {
    const amount = parseUnits(depositAmount, 18);
    deposit({
      address: PERP_ENGINE_ADDRESS,
      abi: PerpEngineABI,
      functionName: "depositCollateral",
      args: [amount],
    });
  };

  const handleTrade = () => {
    const sizeDelta = parseUnits(sizeInput, 18);
    const signedSize = direction === "long" ? sizeDelta : -sizeDelta;
    openPos({
      address: PERP_ENGINE_ADDRESS,
      abi: PerpEngineABI,
      functionName: "openPosition",
      args: [marketId, signedSize],
    });
  };

  if (!isConnected) {
    return (
      <div className="card p-8 text-center">
        <div className="text-terra text-3xl mb-3">&#9737;</div>
        <p className="text-text-secondary text-sm">Connect wallet to trade</p>
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-5">
      <h3 className="label">Trade {marketName}</h3>

      {/* Deposit section */}
      {collateral === 0 && (
        <div className="space-y-3 pb-5 border-b border-border">
          <p className="text-sm text-text-secondary">Deposit tUSDI collateral first</p>
          <div className="flex items-center justify-between">
            <span className="label">Amount</span>
            <button
              type="button"
              onClick={() => setDepositAmount(tUsdiBalance.toString())}
              disabled={tUsdiBalance === 0}
              className="text-[10px] font-mono tracking-widest text-terra hover:text-terra-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              MAX
            </button>
          </div>
          <input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="Amount"
            className="input-mars"
          />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleDeposit} className="btn-terra text-sm">Approve</button>
            <button onClick={handleDepositConfirm} disabled={depositPending} className="btn-terra text-sm">
              {depositPending ? "..." : "Deposit"}
            </button>
          </div>
          <p className="text-xs text-text-muted font-mono">
            Wallet: <span className="text-text-secondary">{tUsdiBalance.toFixed(2)} tUSDI</span>
          </p>
        </div>
      )}

      {/* Show balances even when already deposited */}
      {collateral > 0 && (
        <div className="flex items-center justify-between text-xs font-mono pb-3 border-b border-border">
          <span className="text-text-muted">
            Wallet <span className="text-text-secondary">{tUsdiBalance.toFixed(2)} tUSDI</span>
          </span>
          <span className="text-text-muted">
            Deposited <span className="text-text-secondary">${collateral.toFixed(2)}</span>
          </span>
        </div>
      )}

      {/* Direction */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setDirection("long")}
          className={direction === "long" ? "btn-long text-sm" : "card p-2.5 text-center text-sm text-text-muted hover:text-long transition-colors"}
        >
          LONG
        </button>
        <button
          onClick={() => setDirection("short")}
          className={direction === "short" ? "btn-short text-sm" : "card p-2.5 text-center text-sm text-text-muted hover:text-short transition-colors"}
        >
          SHORT
        </button>
      </div>

      {/* Size */}
      <div>
        <span className="label block mb-2">Size (sqft)</span>
        <input
          type="number"
          value={sizeInput}
          onChange={(e) => setSizeInput(e.target.value)}
          placeholder="0"
          className="input-mars text-xl"
        />
      </div>

      {/* Leverage */}
      <div>
        <div className="flex justify-between mb-2">
          <span className="label">Leverage</span>
          <span className="data-value text-sm text-terra">{leverage}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={MAX_LEVERAGE}
          step={1}
          value={leverage}
          onChange={(e) => setLeverage(parseInt(e.target.value))}
          className="w-full accent-terra h-1.5"
        />
        <div className="flex justify-between text-xs text-text-muted mt-1">
          <span>1x</span>
          <span>{MAX_LEVERAGE}x</span>
        </div>
      </div>

      {/* Order summary */}
      {size > 0 && (
        <div className="space-y-2 text-sm p-4 rounded-xl" style={{ background: "rgb(var(--c-oxide) / 0.1)" }}>
          <div className="flex justify-between">
            <span className="text-text-muted">Notional</span>
            <span className="data-value">${notional.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Required Margin</span>
            <span className="data-value">${requiredMargin.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Entry Price</span>
            <span className="data-value">${currentPrice.toFixed(2)}/sqft</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Available</span>
            <span className={`data-value ${availableMargin < requiredMargin ? "text-short" : "text-long"}`}>
              ${availableMargin.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleTrade}
        disabled={size === 0 || availableMargin < requiredMargin || openPending}
        className={`w-full py-3.5 rounded-xl font-bold text-white transition-all tracking-wider uppercase text-sm ${
          direction === "long"
            ? "bg-long-gradient hover:shadow-[0_0_30px_rgba(0,230,138,0.2)]"
            : "bg-short-gradient hover:shadow-[0_0_30px_rgba(255,64,87,0.2)]"
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        style={{
          background: direction === "long"
            ? "linear-gradient(135deg, #00B368, #00E68A)"
            : "linear-gradient(135deg, #CC3347, #FF4057)",
        }}
      >
        {openPending ? "Opening..." : `${direction === "long" ? "Long" : "Short"} ${marketName}`}
      </button>
    </div>
  );
}
