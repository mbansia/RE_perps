"use client";

import { useState } from "react";
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { LiquidityPoolABI, ERC20ABI } from "@/lib/abis";
import { LIQUIDITY_POOL_ADDRESS, TUSDI_ADDRESS, LP_TOKEN_ADDRESS, WITHDRAWAL_DELAY_HOURS } from "@/lib/constants";
import { useAccountHealth } from "@/hooks/useAccountHealth";

export default function PoolPage() {
  const { address, isConnected } = useAccount();
  const { tUsdiBalance } = useAccountHealth();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const { data: poolData } = useReadContracts({
    contracts: [
      { address: LIQUIDITY_POOL_ADDRESS, abi: LiquidityPoolABI, functionName: "poolValue" },
      { address: LIQUIDITY_POOL_ADDRESS, abi: LiquidityPoolABI, functionName: "totalDeposits" },
      { address: LIQUIDITY_POOL_ADDRESS, abi: LiquidityPoolABI, functionName: "accumulatedFees" },
      { address: LIQUIDITY_POOL_ADDRESS, abi: LiquidityPoolABI, functionName: "lpTokenValue" },
    ],
    query: { refetchInterval: 15_000 },
  });

  const { data: lpBalanceData } = useReadContracts({
    contracts: [
      { address: LP_TOKEN_ADDRESS, abi: ERC20ABI, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"] },
    ],
    query: { refetchInterval: 15_000, enabled: !!address },
  });

  const poolValue = poolData?.[0]?.result ? Number(formatUnits(poolData[0].result as bigint, 18)) : 0;
  const totalDeposits = poolData?.[1]?.result ? Number(formatUnits(poolData[1].result as bigint, 18)) : 0;
  const fees = poolData?.[2]?.result ? Number(formatUnits(poolData[2].result as bigint, 18)) : 0;
  const lpTokenVal = poolData?.[3]?.result ? Number(formatUnits(poolData[3].result as bigint, 18)) : 1;
  const lpBalance = lpBalanceData?.[0]?.result ? Number(formatUnits(lpBalanceData[0].result as bigint, 18)) : 0;

  const { writeContract: approve } = useWriteContract();
  const { writeContract: depositTx, data: depositHash } = useWriteContract();
  const { writeContract: requestWithdraw, data: reqHash } = useWriteContract();
  const { writeContract: executeWithdraw, data: execHash } = useWriteContract();
  const { isLoading: depositPending } = useWaitForTransactionReceipt({ hash: depositHash });
  const { isLoading: reqPending } = useWaitForTransactionReceipt({ hash: reqHash });
  const { isLoading: execPending } = useWaitForTransactionReceipt({ hash: execHash });

  const handleDeposit = () => {
    const amount = parseUnits(depositAmount, 18);
    approve({ address: TUSDI_ADDRESS as `0x${string}`, abi: ERC20ABI, functionName: "approve", args: [LIQUIDITY_POOL_ADDRESS, amount] });
    setTimeout(() => {
      depositTx({ address: LIQUIDITY_POOL_ADDRESS, abi: LiquidityPoolABI, functionName: "deposit", args: [amount] });
    }, 6000);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="heading-display text-2xl text-text-primary tracking-[0.15em]">LP POOL</h1>
        <p className="text-text-secondary mt-2 text-sm">Provide liquidity. Earn 80% of trading fees. Bear trader PnL.</p>
      </div>

      {/* Pool stats */}
      <div className="card p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <span className="label">Pool Value</span>
            <div className="data-value text-2xl mt-1">${poolValue.toFixed(2)}</div>
          </div>
          <div>
            <span className="label">Total Deposits</span>
            <div className="data-value text-2xl mt-1">${totalDeposits.toFixed(2)}</div>
          </div>
          <div>
            <span className="label">Fees Earned</span>
            <div className="data-value text-2xl mt-1 pnl-positive">${fees.toFixed(2)}</div>
          </div>
          <div>
            <span className="label">LP Token Price</span>
            <div className="data-value text-2xl mt-1">${lpTokenVal.toFixed(4)}</div>
          </div>
        </div>
      </div>

      {/* LP position */}
      {isConnected && (
        <div className="card p-6">
          <h2 className="label mb-5">Your LP Position</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <span className="label">LP Tokens</span>
              <div className="data-value text-xl mt-1">{lpBalance.toFixed(4)} <span className="text-text-muted text-sm">tfLP</span></div>
            </div>
            <div>
              <span className="label">Value</span>
              <div className="data-value text-xl mt-1">${(lpBalance * lpTokenVal).toFixed(2)}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label">Deposit tUSDI</span>
                <button
                  type="button"
                  onClick={() => setDepositAmount(tUsdiBalance.toString())}
                  disabled={tUsdiBalance === 0}
                  className="text-[10px] font-mono tracking-widest text-terra hover:text-terra-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  MAX
                </button>
              </div>
              <div className="flex gap-2">
                <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0" className="input-mars flex-1" />
                <button onClick={handleDeposit} disabled={depositPending} className="btn-terra text-sm">{depositPending ? "..." : "Deposit"}</button>
              </div>
              <p className="text-xs text-text-muted font-mono">
                Wallet: <span className="text-text-secondary">{tUsdiBalance.toFixed(2)} tUSDI</span>
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label">Withdraw LP Tokens</span>
                <button
                  type="button"
                  onClick={() => setWithdrawAmount(lpBalance.toString())}
                  disabled={lpBalance === 0}
                  className="text-[10px] font-mono tracking-widest text-terra hover:text-terra-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  MAX
                </button>
              </div>
              <div className="flex gap-2">
                <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0" className="input-mars flex-1" />
                <button onClick={() => requestWithdraw({ address: LIQUIDITY_POOL_ADDRESS, abi: LiquidityPoolABI, functionName: "requestWithdrawal", args: [parseUnits(withdrawAmount || "0", 18)] })} disabled={reqPending} className="btn-terra text-sm">{reqPending ? "..." : "Request"}</button>
                <button onClick={() => executeWithdraw({ address: LIQUIDITY_POOL_ADDRESS, abi: LiquidityPoolABI, functionName: "executeWithdrawal", args: [] })} disabled={execPending} className="text-sm text-terra hover:text-terra-hover">{execPending ? "..." : "Execute"}</button>
              </div>
              <p className="text-xs text-text-muted font-mono">
                You hold: <span className="text-text-secondary">{lpBalance.toFixed(4)} tfLP</span>
                <span className="mx-2">·</span>
                {WITHDRAWAL_DELAY_HOURS}h delay
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
