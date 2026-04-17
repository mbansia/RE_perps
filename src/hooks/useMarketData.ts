"use client";

import { useReadContract, useBlockNumber } from "wagmi";
import { keccak256, toBytes, formatUnits } from "viem";
import { PriceOracleABI, PerpEngineABI, MarketManagerABI } from "@/lib/abis";
import {
  PRICE_ORACLE_ADDRESS,
  PERP_ENGINE_ADDRESS,
  MARKET_MANAGER_ADDRESS,
} from "@/lib/constants";

export function getMarketId(name: string): `0x${string}` {
  return keccak256(toBytes(name));
}

/**
 * Client-side reproduction of FundingLib.currentFundingRate.
 * Mirrors the on-chain formula so the UI shows the live accrued rate
 * instead of the stored (often-stale) value. Numbers kept in plain JS
 * Number since we only need display precision.
 */
function computeLiveFundingRate(params: {
  storedRate: number; // WAD → float (/day)
  skew: number; // WAD → float (sqft)
  skewScale: number; // WAD → float (sqft)
  maxVelocity: number; // WAD → float (/day²)
  lastFundingTime: number; // unix seconds
  now: number; // unix seconds
}): number {
  const { storedRate, skew, skewScale, maxVelocity, lastFundingTime, now } = params;
  if (lastFundingTime === 0 || skewScale === 0) return storedRate;
  const propSkew = Math.max(-1, Math.min(1, skew / skewScale));
  const velocity = propSkew * maxVelocity;
  const elapsedDays = Math.max(0, (now - lastFundingTime)) / 86400;
  return storedRate + velocity * elapsedDays;
}

export function useMarketData(marketName: string) {
  const marketId = getMarketId(marketName);

  // Block number drives the "now" used in live-funding math so the value
  // refreshes every block instead of being frozen at render time.
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const { data: priceData, isLoading: priceLoading, error: priceError } = useReadContract({
    address: PRICE_ORACLE_ADDRESS,
    abi: PriceOracleABI,
    functionName: "getPrice",
    args: [marketId],
    query: { refetchInterval: 15_000, retry: 2 },
  });

  const { data: marketState, isLoading: stateLoading, error: stateError } = useReadContract({
    address: PERP_ENGINE_ADDRESS,
    abi: PerpEngineABI,
    functionName: "getMarketState",
    args: [marketId],
    query: { refetchInterval: 15_000, retry: 2 },
  });

  const { data: marketConfig, isLoading: configLoading } = useReadContract({
    address: MARKET_MANAGER_ADDRESS,
    abi: MarketManagerABI,
    functionName: "getMarket",
    args: [marketId],
    query: { refetchInterval: 60_000, retry: 2 },
  });

  const price = priceData ? Number(formatUnits(priceData[0], 18)) : 0;
  const lastUpdated = priceData ? Number(priceData[1]) : 0;

  const skew = marketState ? Number(formatUnits(marketState.skew, 18)) : 0;
  const totalLongOI = marketState ? Number(formatUnits(marketState.totalLongOI, 18)) : 0;
  const totalShortOI = marketState ? Number(formatUnits(marketState.totalShortOI, 18)) : 0;
  const storedFundingRate = marketState ? Number(formatUnits(marketState.lastFundingRate, 18)) : 0;
  const lastFundingTime = marketState ? Number(marketState.lastFundingTime) : 0;

  const skewScale = marketConfig ? Number(formatUnits(marketConfig.skewScale, 18)) : 0;
  const maxFundingVelocity = marketConfig
    ? Number(formatUnits(marketConfig.maxFundingVelocity, 18))
    : 0;

  // Live funding rate — recomputed each block. Falls back to stored value
  // if config hasn't loaded yet.
  const now = Math.floor(Date.now() / 1000);
  const fundingRate = marketConfig
    ? computeLiveFundingRate({
        storedRate: storedFundingRate,
        skew,
        skewScale,
        maxVelocity: maxFundingVelocity,
        lastFundingTime,
        now,
      })
    : storedFundingRate;

  const totalLongOIDollars = totalLongOI * price;
  const totalShortOIDollars = totalShortOI * price;
  const totalOIDollars = (totalLongOI + totalShortOI) * price;

  return {
    marketId,
    price,
    lastUpdated,
    skew,
    totalLongOI,
    totalShortOI,
    totalLongOIDollars,
    totalShortOIDollars,
    totalOIDollars,
    fundingRate,
    fundingRateStored: storedFundingRate,
    fundingRateLive: fundingRate,
    lastFundingTime,
    skewScale,
    maxFundingVelocity,
    totalOI: totalLongOI + totalShortOI,
    isLoading: priceLoading || stateLoading || configLoading,
    hasError: !!priceError || !!stateError,
    priceError,
    // Keep blockNumber in the return so React re-renders when it ticks.
    _blockNumber: blockNumber,
  };
}
