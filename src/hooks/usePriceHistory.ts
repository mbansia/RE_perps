"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useBlockNumber } from "wagmi";
import { formatUnits, parseAbiItem } from "viem";
import { PRICE_ORACLE_ADDRESS } from "@/lib/constants";

export interface PricePoint {
  time: number; // unix seconds — oracle-reported timestamp
  price: number;
  blockNumber: bigint;
}

const PRICE_UPDATED_EVENT = parseAbiItem(
  "event PriceUpdated(bytes32 indexed marketId, uint256 price, uint256 timestamp)"
);

// Oracle pushes 4x/day. A 30-day window = ~120 points. We scan a generous
// block range (~1M blocks ≈ 2 months at 5s). Integra RPCs allow large ranges.
const LOOKBACK_BLOCKS = 1_000_000n;

export function usePriceHistory(marketId: `0x${string}` | undefined) {
  const publicClient = usePublicClient();
  const { data: latestBlock } = useBlockNumber({ watch: false });

  // Bucket block numbers into coarse groups so the query only refires periodically,
  // not on every block. Also stringify — React Query can't serialize BigInt in keys.
  const blockBucket = latestBlock ? String(latestBlock / 100n) : "0";

  return useQuery<PricePoint[]>({
    queryKey: ["priceHistory", marketId, blockBucket],
    enabled: !!publicClient && !!marketId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!publicClient || !marketId) return [];

      const tip = latestBlock ?? (await publicClient.getBlockNumber());
      const from = tip > LOOKBACK_BLOCKS ? tip - LOOKBACK_BLOCKS : 0n;

      const logs = await publicClient.getLogs({
        address: PRICE_ORACLE_ADDRESS,
        event: PRICE_UPDATED_EVENT,
        args: { marketId },
        fromBlock: from,
        toBlock: tip,
      });

      const points: PricePoint[] = logs
        .map((log) => {
          const price = log.args.price ?? 0n;
          const timestamp = log.args.timestamp ?? 0n;
          return {
            time: Number(timestamp),
            price: Number(formatUnits(price, 18)),
            blockNumber: log.blockNumber ?? 0n,
          };
        })
        .filter((p) => p.time > 0 && p.price > 0)
        .sort((a, b) => a.time - b.time);

      // Dedupe identical timestamps (keep last — lightweight-charts requires strictly ascending)
      const deduped: PricePoint[] = [];
      for (const p of points) {
        const last = deduped[deduped.length - 1];
        if (last && last.time === p.time) {
          deduped[deduped.length - 1] = p;
        } else {
          deduped.push(p);
        }
      }

      return deduped;
    },
  });
}
