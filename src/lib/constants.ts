// Integra Testnet
export const CHAIN_ID = 26218;
export const RPC_URL = "https://testnet.integralayer.com/evm";
export const WS_URL = "wss://testnet.integralayer.com/evm/ws";
export const EXPLORER_URL = "https://blockscout.integralayer.com";

// Token addresses
export const TUSDI_ADDRESS = "0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f" as const;
export const WIRL_ADDRESS = "0x5002000000000000000000000000000000000001" as const;

// Contract addresses (deployed to Integra testnet)
export const PRICE_ORACLE_ADDRESS = (process.env.NEXT_PUBLIC_PRICE_ORACLE_ADDRESS || "0xECc3439E727Bf2DC7D85B8a5ED33B9Ed2b3510c7") as `0x${string}`;
export const MARKET_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_MARKET_MANAGER_ADDRESS || "0x6EcE231b415e4ebB51D0B6484cBA56d7eada8de4") as `0x${string}`;
export const LIQUIDITY_POOL_ADDRESS = (process.env.NEXT_PUBLIC_LIQUIDITY_POOL_ADDRESS || "0xb078F1641d69A519092D78067b57012c87d2d490") as `0x${string}`;
export const PERP_ENGINE_ADDRESS = (process.env.NEXT_PUBLIC_PERP_ENGINE_ADDRESS || "0x4fBd5d49a9795F648C268d0e901e16efD528d621") as `0x${string}`;
export const LP_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_LP_TOKEN_ADDRESS || "0xbeE437e7290b6019aF43fA74726F679152475fe8") as `0x${string}`;

// Market IDs
export const MARKETS = {
  NYC: {
    id: "NYC",
    name: "New York City",
    slug: "nyc",
    currency: "USD",
    unit: "$/sqft",
  },
  DUBAI: {
    id: "DUBAI",
    name: "Dubai",
    slug: "dubai",
    currency: "USD",
    unit: "$/sqft",
  },
} as const;

// Trading limits
export const MAX_LEVERAGE = 10;
export const MAX_POSITIONS = 12;
export const WITHDRAWAL_DELAY_HOURS = 24;

// Margin ratios (static for MVP)
export const INITIAL_MARGIN_RATIO = 0.1; // 10% = max 10x
export const MAINTENANCE_MARGIN_RATIO = 0.05; // 5%
export const LIQUIDATION_FEE_RATE = 0.01; // 1%
export const MIN_POSITION_MARGIN = 10; // 10 tUSDI

// Faucet
export const FAUCET_URL = "https://testnet.integralayer.com";
