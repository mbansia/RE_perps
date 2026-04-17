"use client";

import { useReadContracts, useAccount } from "wagmi";
import { formatUnits } from "viem";
import { PerpEngineABI, ERC20ABI } from "@/lib/abis";
import { PERP_ENGINE_ADDRESS, TUSDI_ADDRESS } from "@/lib/constants";

export function useAccountHealth() {
  const { address } = useAccount();

  const { data, isLoading } = useReadContracts({
    contracts: address
      ? [
          {
            address: PERP_ENGINE_ADDRESS,
            abi: PerpEngineABI,
            functionName: "getAccount",
            args: [address],
          },
          {
            address: PERP_ENGINE_ADDRESS,
            abi: PerpEngineABI,
            functionName: "getAccountValue",
            args: [address],
          },
          {
            address: PERP_ENGINE_ADDRESS,
            abi: PerpEngineABI,
            functionName: "getTotalRequiredMargin",
            args: [address],
          },
          {
            address: TUSDI_ADDRESS as `0x${string}`,
            abi: ERC20ABI,
            functionName: "balanceOf",
            args: [address],
          },
        ]
      : [],
    query: {
      enabled: !!address,
      refetchInterval: 10_000,
    },
  });

  const account = data?.[0]?.result;
  const accountValue = data?.[1]?.result;
  const requiredMargin = data?.[2]?.result;
  const walletBalance = data?.[3]?.result;

  const collateral = account ? Number(formatUnits(account.collateral, 18)) : 0;
  const totalValue = accountValue
    ? Number(formatUnits(accountValue as bigint, 18))
    : 0;
  const marginRequired = requiredMargin
    ? Number(formatUnits(requiredMargin as bigint, 18))
    : 0;
  const tUsdiBalance = walletBalance
    ? Number(formatUnits(walletBalance as bigint, 18))
    : 0;

  const marginUsed = marginRequired;
  const availableMargin = Math.max(0, totalValue - marginRequired);
  const healthFactor =
    marginRequired > 0 ? totalValue / marginRequired : Infinity;

  return {
    collateral,
    totalValue,
    marginRequired,
    marginUsed,
    availableMargin,
    healthFactor,
    tUsdiBalance,
    isLoading,
  };
}
