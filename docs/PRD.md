# Terraform — Product Requirements Document

## Overview

Terraform is a perpetual-futures exchange deployed on Integra testnet where anyone can go long or short on city-level real estate price indices — NYC and Dubai — without owning physical property. Traders deposit tUSDI, pick a city, choose a direction and leverage (up to 10x), and profit or lose based on real median-price-per-sqft movements.

A self-hosted Playwright scraper pulls live data from Redfin, Zillow, DXBinteract, and Property Finder 4x/day, signs it with EIP-712, and pushes it on-chain — making Terraform its own oracle.

Built for the Integra ecosystem as a first-of-its-kind real-estate perps DEX on a real-estate-native L1.

## Problem

Real estate is the world's largest asset class (~$400T) but has near-zero speculative liquidity for retail participants. You can't short Miami housing, hedge your NYC rent exposure, or express a view on Dubai's boom/bust without buying or selling actual property. Parcl proved the model on Solana — Terraform brings it to the Integra chain where real-estate infrastructure (Asset Passports, IRWA tokens, GOB) is native.

## Target users

1. **Crypto-native DeFi traders** — already familiar with perps (dYdX, GMX, Hyperliquid), want new uncorrelated markets
2. **Real estate enthusiasts** — follow housing data, want to trade the thesis without capital lockup
3. **Integra ecosystem participants** — earning XP, exploring dApps on the chain
4. **Hedgers** — property owners who want to short their city's index to offset downside risk

## Markets

| Market | Index | Data sources | Oracle cadence |
|--------|-------|-------------|---------------|
| NYC | Median residential $/sqft | Redfin + Zillow | 4x/day |
| Dubai | Median residential AED/sqft (→ USD) | DXBinteract + Property Finder | 4x/day |

## Core features (MVP)

### Trading
- Open long/short positions on NYC or Dubai index
- Position size in sqft, notional = sqft x index price
- 1x to 10x leverage (static margin ratios)
- Cross-margin: one account, up to 12 simultaneous positions
- Partial close, full close, modify (add/reduce size)
- Real-time PnL: `positionSize * (currentFillPrice - entryFillPrice) + fundingPnL - fees`

### Funding (velocity model)
- Funding rate accelerates while market skew persists
- Rate: `clamp(skew/skewScale, -1, 1) * maxFundingVelocity * elapsed`
- Incentivizes balanced markets — minority side gets paid, majority side pays
- Flows through LP pool

### Fill price (skew-adjusted)
- `fillPrice = avg(indexPrice * (1 + skew/skewScale), indexPrice * (1 + (skew+trade)/skewScale))`
- Trades that reduce skew get better fills (incentivizes rebalancing)

### Liquidation
- Full liquidation when account value < totalRequiredMargin
- Checked against index price (not fill price)
- All collateral sent to LP pool
- Public function — anyone can call for a fee reward

### LP pool
- Deposit tUSDI → receive LP tokens (proportional share)
- Pool is counterparty to all trades: gains when traders lose, loses when traders win
- Earns 80% of all trading fees
- 24h withdrawal delay

### Oracle
- Self-hosted Node.js + Playwright service
- Scrapes 2 sources per city, takes median
- Signs with EIP-712, submits to PriceOracle.sol
- Contract enforces: max ±5% deviation per update, 12h staleness window, signer whitelist

### Fees
- Maker rate (reducing skew): lower
- Taker rate (increasing skew): higher
- Skew-flipping trades get blended rate
- Split: 80% LP pool, 20% protocol treasury

### Collateral
- tUSDI (testnet stablecoin, ERC-20)
- 24h withdrawal delay on all collateral

## Integra integrations
- **Web3Auth**: social login (Google, X, Email) — no MetaMask required
- **XP System**: emit XPAction events on every trade, LP deposit, liquidation
- **Subdomain**: terraform.integralayer.com
- **Faucet**: link to testnet.integralayer.com for 10 IRL + 1,000 tUSDI

## Not in MVP (future)
- Dynamic margin scaling with skew
- Per-epoch liquidation caps (MEV protection)
- Insurance fund
- Keeper bot for automated liquidations
- Additional cities (LA, Miami, SF, Austin, London, etc.)
- Portfolio analytics (PnL attribution, funding history, charts)
- LP incentive emissions in IRL
- Limit orders
- Mobile-optimized trading view

## Success metrics
- Contracts deploy and verify on Integra testnet
- Oracle updates price data 4x/day reliably
- Users can complete full flow: faucet → deposit → trade → close → withdraw
- LP deposit/withdraw works with correct share accounting
- Liquidation triggers at correct margin threshold
- XP events emit correctly for all actions
