# Terraform

Perpetual-futures DEX for city-level real estate price indices on Integra testnet.

## Project context

Terraform lets users go long or short on real-estate prices in NYC and Dubai using tUSDI collateral, up to 10x leverage. A self-hosted Playwright scraper pulls real median-price data from Redfin/Zillow (NYC) and DXBinteract/Property Finder (Dubai) 4x/day, signs it with EIP-712, and pushes it on-chain. The LP pool acts as counterparty to all trades (peer-to-pool AMM, Parcl v3 model).

## Tech stack

- **Contracts:** Solidity 0.8.24+, Hardhat + Ignition, OpenZeppelin
- **Frontend:** Next.js 14+ (App Router), TypeScript strict, Tailwind, shadcn/ui
- **Auth:** Web3Auth via `@integra/web3auth-provider` (social login)
- **Chain:** wagmi v2 + viem → Integra testnet (Chain ID 26218)
- **Oracle:** Node.js + Playwright + ethers.js
- **Design:** Custom dark real-estate-finance aesthetic (not Integra official brand)

## Chain details

- EVM JSON-RPC: `https://testnet.integralayer.com/evm`
- WebSocket: `wss://testnet.integralayer.com/evm/ws`
- Chain ID: 26218
- Explorer: `https://blockscout.integralayer.com`
- Gas: free on testnet
- Block time: ~5s, instant finality

## Token addresses (testnet)

- tUSDI: `0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f` (18 decimals)
- WIRL: `0x5002000000000000000000000000000000000001` (18 decimals)

## Key contracts

- `PriceOracle.sol` — stores signed prices per market
- `MarketManager.sol` — market registry and parameters
- `LiquidityPool.sol` — LP deposits/withdrawals, counterparty accounting
- `PerpEngine.sol` — open/close/modify positions, funding, liquidation
- `LPToken.sol` — ERC-20 LP token

## Core mechanics

- Position unit: sqft. Notional = |sqft| x fillPrice
- Cross-margin: max 12 positions per account
- Velocity funding: rate accelerates while skew persists
- Skew-adjusted fill price: rebalancing trades get better prices
- Full liquidation when account < maintenance margin
- 80/20 fee split (LPs / protocol)
- 24h withdrawal delay on collateral

## Conventions

- Solidity: PascalCase contracts, camelCase functions, UPPER_SNAKE constants, NatSpec on all publics
- Frontend: TypeScript strict, no `any`, component files PascalCase
- Events: emit `XPAction(address indexed user, string actionType, uint256 points)` on every user action
- Git: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- Never commit `.env` — use `.env.example`
- Contract addresses go in `NEXT_PUBLIC_` prefixed env vars

## Docs

- `docs/PRD.md` — product requirements
- `docs/ARCHITECTURE.md` — system design, data flows, directory structure
- `docs/CONTRACTS.md` — full Solidity interface specs
- `docs/FRONTEND.md` — pages, components, hooks, design tokens
- `docs/INTEGRATIONS.md` — Web3Auth, XP, oracle, tUSDI, events
