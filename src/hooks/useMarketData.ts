"use client";

import { useReadContract } from "wagmi";
import { keccak256, toBytes, formatUnits } from "viem";
import { PriceOracleABI, PerpEngineABI } from "@/lib/abis";
import { PRICE_ORACLE_ADDRESS, PERP_ENGINE_ADDRESS } from "@/lib/constants";

export function getMarketId(name: string): `0x${string}` {
  return keccak256(toBytes(name));
}

export function useMarketData(marketName: string) {
  const marketId = getMarketId(marketName);

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

  const price = priceData ? Number(formatUnits(priceData[0], 18)) : 0;
  const lastUpdated = priceData ? Number(priceData[1]) : 0;

  const skew = marketState ? Number(formatUnits(marketState.skew, 18)) : 0;
  const totalLongOI = marketState ? Number(formatUnits(marketState.totalLongOI, 18)) : 0;
  const totalShortOI = marketState ? Number(formatUnits(marketState.totalShortOI, 18)) : 0;
  const fundingRate = marketState ? Number(formatUnits(marketState.lastFundingRate, 18)) : 0;

  // OI in dollar terms
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
    totalOI: totalLongOI + totalShortOI,
    isLoading: priceLoading || stateLoading,
    hasError: !!priceError || !!stateError,
    priceError,
  };
}
