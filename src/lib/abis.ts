// ABI fragments for Terraform contracts — generated from Solidity interfaces
// Only includes the functions/events the frontend calls

export const PriceOracleABI = [
  {
    type: "function",
    name: "getPrice",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [
      { name: "price", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "PriceUpdated",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "price", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export const PerpEngineABI = [
  {
    type: "function",
    name: "depositCollateral",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawCollateral",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "openPosition",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "sizeDelta", type: "int256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "closePosition",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "modifyPosition",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "sizeDelta", type: "int256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "liquidate",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getAccountValue",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [{ name: "", type: "int256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAccount",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "collateral", type: "uint256" },
          { name: "lastDepositTime", type: "uint256" },
          { name: "hasTraded", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPositions",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "marketId", type: "bytes32" },
          { name: "size", type: "int128" },
          { name: "lastFillPrice", type: "uint128" },
          { name: "lastFundingPerUnit", type: "int128" },
          { name: "lastSettledAt", type: "uint128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMarketState",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "skew", type: "int256" },
          { name: "totalLongOI", type: "uint256" },
          { name: "totalShortOI", type: "uint256" },
          { name: "lastFundingRate", type: "int256" },
          { name: "lastFundingValue", type: "int256" },
          { name: "lastFundingTime", type: "uint256" },
          { name: "debtCorrectionAccumulator", type: "int256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTotalRequiredMargin",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "PositionOpened",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "size", type: "int256", indexed: false },
      { name: "fillPrice", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PositionClosed",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "size", type: "int256", indexed: false },
      { name: "fillPrice", type: "uint256", indexed: false },
      { name: "pnl", type: "int256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PositionLiquidated",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "liquidator", type: "address", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "size", type: "int256", indexed: false },
      { name: "liquidationFee", type: "uint256", indexed: false },
    ],
  },
] as const;

export const LiquidityPoolABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "requestWithdrawal",
    inputs: [{ name: "lpTokenAmount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "executeWithdrawal",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "poolValue",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lpTokenValue",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalDeposits",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "accumulatedFees",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "withdrawalRequests",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "requestedAt", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

export const ERC20ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
