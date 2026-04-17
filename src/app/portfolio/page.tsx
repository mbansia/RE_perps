"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { usePositions } from "@/hooks/usePositions";
import { useAccountHealth } from "@/hooks/useAccountHealth";
import { useMarketData } from "@/hooks/useMarketData";
import { PositionRow } from "@/components/trade/PositionRow";
import { PerpEngineABI, ERC20ABI } from "@/lib/abis";
import { PERP_ENGINE_ADDRESS, TUSDI_ADDRESS, WITHDRAWAL_DELAY_HOURS } from "@/lib/constants";

function CollateralManager() {
  const { collateral, totalValue, marginRequired, availableMargin, healthFactor, tUsdiBalance } = useAccountHealth();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const { writeContract: approve } = useWriteContract();
  const { writeContract: depositTx, data: depositHash } = useWriteContract();
  const { writeContract: withdrawTx, data: withdrawHash } = useWriteContract();
  const { isLoading: depositPending } = useWaitForTransactionReceipt({ hash: depositHash });
  const { isLoading: withdrawPending } = useWaitForTransactionReceipt({ hash: withdrawHash });

  const handleDeposit = () => {
    const amount = parseUnits(depositAmount, 18);
    approve({ address: TUSDI_ADDRESS as `0x${string}`, abi: ERC20ABI, functionName: "approve", args: [PERP_ENGINE_ADDRESS, amount] });
    setTimeout(() => {
      depositTx({ address: PERP_ENGINE_ADDRESS, abi: PerpEngineABI, functionName: "depositCollateral", args: [amount] });
    }, 6000);
  };

  const handleWithdraw = () => {
    withdrawTx({ address: PERP_ENGINE_ADDRESS, abi: PerpEngineABI, functionName: "withdrawCollateral", args: [parseUnits(withdrawAmount, 18)] });
  };

  return (
    <div className="card p-6">
      <h2 className="label mb-5">Account Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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
          <span className="label">Margin Used</span>
          <div className="data-value text-xl mt-1">${marginRequired.toFixed(2)}</div>
        </div>
        <div>
          <span className="label">Available</span>
          <div className="data-value text-xl mt-1">${availableMargin.toFixed(2)}</div>
        </div>
        <div>
          <span className="label">Health</span>
          <div className={`data-value text-xl mt-1 ${healthFactor > 2 ? "text-long" : healthFactor > 1.2 ? "text-warning" : "text-short"}`}>
            {healthFactor === Infinity ? "---" : healthFactor.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <span className="label">Deposit tUSDI</span>
          <div className="flex gap-2">
            <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0" className="input-mars flex-1" />
            <button onClick={handleDeposit} disabled={depositPending} className="btn-terra text-sm">{depositPending ? "..." : "Deposit"}</button>
          </div>
          <p className="text-xs text-text-muted font-mono">Wallet: {tUsdiBalance.toFixed(2)} tUSDI</p>
        </div>
        <div className="space-y-2">
          <span className="label">Withdraw tUSDI</span>
          <div className="flex gap-2">
            <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0" className="input-mars flex-1" />
            <button onClick={handleWithdraw} disabled={withdrawPending} className="btn-terra text-sm">{withdrawPending ? "..." : "Withdraw"}</button>
          </div>
          <p className="text-xs text-text-muted font-mono">{WITHDRAWAL_DELAY_HOURS}h delay on withdrawals</p>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const { isConnected } = useAccount();
  const { positions, isLoading } = usePositions();
  const nycData = useMarketData("NYC");
  const dubaiData = useMarketData("DUBAI");

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <div className="text-terra text-4xl mb-4">&#9737;</div>
        <h1 className="heading-display text-2xl text-text-primary tracking-[0.15em]">PORTFOLIO</h1>
        <p className="text-text-secondary mt-3 text-sm">Connect your wallet to view positions</p>
      </div>
    );
  }

  const getPriceForPosition = (mktId: string) => {
    if (mktId === nycData.marketId) return nycData.price;
    if (mktId === dubaiData.marketId) return dubaiData.price;
    return 0;
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <h1 className="heading-display text-2xl text-text-primary tracking-[0.15em]">PORTFOLIO</h1>
      <CollateralManager />
      <div className="card p-6">
        <h2 className="label mb-4">Open Positions ({positions.length})</h2>
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(74, 28, 28, 0.3)" }} />
            <div className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(74, 28, 28, 0.2)" }} />
          </div>
        ) : positions.length === 0 ? (
          <p className="text-text-muted text-sm py-10 text-center">No open positions. Trade a market to get started.</p>
        ) : (
          <div className="space-y-2">
            {positions.map((pos, i) => (
              <PositionRow key={i} position={pos} currentPrice={getPriceForPosition(pos.marketId)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
