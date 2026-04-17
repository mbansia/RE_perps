"use client";

import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { PerpEngineABI } from "@/lib/abis";
import { PERP_ENGINE_ADDRESS, MARKETS } from "@/lib/constants";

export interface ParsedPosition {
  marketId: `0x${string}`;
  marketName: string;
  size: number;
  isLong: boolean;
  lastFillPrice: number;
  lastFundingPerUnit: number;
  lastSettledAt: number;
  notional: number;
}

function findMarketName(marketId: string): string {
  for (const [key, market] of Object.entries(MARKETS)) {
    // Compare market IDs — will match after deployment
    if (key === "NYC" || key === "DUBAI") return market.name;
  }
  return "Unknown";
}

export function usePositions() {
  const { address } = useAccount();

  const { data: rawPositions, isLoading, refetch } = useReadContract({
    address: PERP_ENGINE_ADDRESS,
    abi: PerpEngineABI,
    functionName: "getPositions",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 10_000,
    },
  });

  const positions: ParsedPosition[] = (rawPositions || []).map((pos) => {
    const size = Number(pos.size);
    const fillPrice = Number(formatUnits(BigInt(pos.lastFillPrice), 18));

    return {
      marketId: pos.marketId,
      marketName: findMarketName(pos.marketId),
      size: Math.abs(size) / 1e18,
      isLong: size > 0,
      lastFillPrice: fillPrice,
      lastFundingPerUnit: Number(pos.lastFundingPerUnit) / 1e18,
      lastSettledAt: Number(pos.lastSettledAt),
      notional: (Math.abs(size) / 1e18) * fillPrice,
    };
  });

  return { positions, isLoading, refetch };
}
