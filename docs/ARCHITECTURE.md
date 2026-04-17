# Terraform -- Architecture Document

**Perpetual-futures DEX for city-level real estate price indices on Integra testnet.**

Version: 1.0
Last updated: 2026-04-15

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Contract Architecture](#2-contract-architecture)
3. [Oracle Service Architecture](#3-oracle-service-architecture)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Directory Structure](#5-directory-structure)
6. [Data Flow Diagrams](#6-data-flow-diagrams)
7. [Security Considerations](#7-security-considerations)
8. [Gas and Performance Notes](#8-gas-and-performance-notes)

---

## 1. System Overview

Terraform is a perpetual-futures DEX where users trade synthetic perps on city-level real estate price indices (NYC and Dubai). It follows the Parcl v3 model -- a peer-to-pool AMM where the LP pool is the counterparty to all trades. Positions are denominated in square footage, and notional value equals sqft multiplied by the city index price ($/sqft). The system runs on Integra testnet (Chain ID 26218, Cosmos SDK + EVM) with tUSDI as collateral.

### High-Level Architecture

```
                                    TERRAFORM SYSTEM OVERVIEW
                                    
    +------------------+          +------------------+          +------------------+
    |   Data Sources   |          |  Oracle Service  |          |   Integra Chain  |
    |                  |  scrape  |   (Node.js +     |  submit  |   (Testnet)      |
    |  Redfin          +--------->+   Playwright)    +--------->+                  |
    |  Zillow          |  4x/day  |                  | EIP-712  |  +-----------+   |
    |  DXBinteract     |          |  Sign prices     | signed   |  |PriceOracle|   |
    |  Property Finder |          |  with EIP-712    | txns     |  +-----------+   |
    +------------------+          +------------------+          |                  |
                                                                |  +-----------+   |
    +------------------+                                        |  |MarketMgr  |   |
    |   Frontend       |          wagmi v2 + viem               |  +-----------+   |
    |   (Next.js 14)   +<-------------------------------------->+                  |
    |                  |    JSON-RPC / WebSocket                 |  +-----------+   |
    |  - Trade UI      |                                        |  |PerpEngine |   |
    |  - LP Dashboard  |                                        |  +-----------+   |
    |  - Portfolio     |                                        |                  |
    |  - Leaderboard   |                                        |  +-----------+   |
    +--------+---------+                                        |  |LiqPool    |   |
             |                                                  |  +-----------+   |
             | Web3Auth                                         |                  |
             | (social login)                                   |  +-----------+   |
             v                                                  |  |MarginAcct |   |
    +------------------+                                        |  +-----------+   |
    |   @integra/      |                                        |                  |
    |   web3auth-      |                                        |  +-----------+   |
    |   provider       |                                        |  |  tUSDI    |   |
    +------------------+                                        |  | (ERC-20)  |   |
                                                                |  +-----------+   |
                                                                +------------------+
```

### Component Summary

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Smart Contracts | Solidity 0.8.24+, Hardhat + Ignition | Core perpetual-futures protocol logic |
| Oracle Service | Node.js, Playwright, ethers.js | Scrape real estate data, sign and submit prices |
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind, shadcn/ui | Trading interface, LP dashboard, portfolio management |
| Auth | Web3Auth via `@integra/web3auth-provider` | Social login (Google, X, Email) |
| Chain Interaction | wagmi v2 + viem | Contract reads/writes, event subscriptions |
| Network | Integra Testnet (Chain ID 26218) | EVM-compatible blockchain with ~5s blocks |
| Collateral | tUSDI at `0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f` | 18-decimal ERC-20 stablecoin |

### Network Configuration

| Property | Value |
|----------|-------|
| Chain Name | Integra Testnet |
| Chain ID (decimal) | 26218 |
| Chain ID (hex) | 0x666A |
| EVM JSON-RPC | `https://testnet.integralayer.com/evm` |
| WebSocket | `wss://testnet.integralayer.com/evm/ws` |
| Block Explorer | `https://blockscout.integralayer.com` |
| Block Time | ~5 seconds |
| Finality | Instant (CometBFT DPoS) |
| Gas | Free on testnet (0 airl min gas price) |

---

## 2. Contract Architecture

All contracts use Solidity 0.8.24+, OpenZeppelin base contracts, and follow the Checks-Effects-Interactions pattern. Custom errors are used instead of require strings. All state-changing functions emit events and include XPAction emissions for the Integra XP system.

### Contract Dependency Graph

```
                           +------------------+
                           |   MarketManager  |
                           | (market registry |
                           |  + parameters)   |
                           +--------+---------+
                                    |
                        reads market params
                                    |
          +-------------------------+-------------------------+
          |                         |                         |
          v                         v                         v
 +-----------------+     +-----------------+     +-------------------+
 |   PriceOracle   |     |   PerpEngine    |     |  LiquidityPool    |
 | (signed prices  |     | (positions,     |     | (LP deposits,     |
 |  per market)    |     |  funding, PnL,  |     |  withdrawals,     |
 |                 |     |  margin checks) |     |  counterparty)    |
 +--------+--------+     +--------+--------+     +---------+---------+
          |                        |                        |
          | price feeds            | margin/collateral      | pool value
          |                        v                        |
          |              +-----------------+                |
          +------------->| MarginAccount   |<---------------+
                         | (per-user cross |
                         |  margin, tUSDI  |
                         |  deposits/      |
                         |  withdrawals)   |
                         +--------+--------+
                                  |
                           interacts with
                                  v
                         +-----------------+
                         |     tUSDI       |
                         |   (ERC-20)      |
                         +-----------------+


  Libraries used by core contracts:
  +-------------+  +-------------+  +----------------+
  |  MathLib    |  | FundingLib  |  | PricingLib     |
  | (fixed-pt)  |  | (velocity   |  | (fill price,   |
  |             |  |  funding)   |  |  skew-adjusted) |
  +-------------+  +-------------+  +----------------+
```

### 2.1 PriceOracle.sol

**Location:** `contracts/core/PriceOracle.sol`
**Purpose:** Stores EIP-712 signed price data per market index. Enforces staleness checks and deviation bounds so stale or manipulated prices cannot be used by the engine.

| Property | Detail |
|----------|--------|
| Price format | uint256, 8 decimals (e.g., 85_00000000 = $85.00 per sqft) |
| Markets | Identified by `bytes32 marketId` (keccak256 of market name) |
| Staleness bound | Configurable per market (default: 12 hours) |
| Deviation bound | Max % change from previous price per update (default: 10%) |
| Authorized signers | Whitelist of oracle service addresses authorized to submit prices |
| Signature scheme | EIP-712 typed structured data with domain separator tied to chain ID and contract address |

**Key functions:**

```
submitPrice(bytes32 marketId, uint256 price, uint256 timestamp, bytes signature)
  - Verifies EIP-712 signature from authorized signer
  - Rejects if timestamp <= last update timestamp
  - Rejects if deviation from last price exceeds bound
  - Stores price and emits PriceUpdated event

getPrice(bytes32 marketId) -> (uint256 price, uint256 timestamp)
  - Returns latest price
  - Reverts if price is stale (older than staleness bound)

getUnsafePrice(bytes32 marketId) -> (uint256 price, uint256 timestamp)
  - Returns latest price without staleness check (for UI display only)
```

**Access control:** Owner can add/remove authorized signers and adjust staleness/deviation bounds per market.

### 2.2 MarketManager.sol

**Location:** `contracts/core/MarketManager.sol`
**Purpose:** Registry of all markets and their configurable parameters. Acts as the single source of truth for market configuration consumed by PerpEngine and LiquidityPool.

**Market parameters (per market):**

| Parameter | Type | Description | Default (NYC) | Default (Dubai) |
|-----------|------|-------------|---------------|-----------------|
| `marketId` | bytes32 | keccak256 identifier | keccak256("NYC") | keccak256("DUBAI") |
| `skewScale` | uint256 | Denominator for skew impact (in sqft) | 500,000 sqft | 300,000 sqft |
| `maxFundingVelocity` | uint256 | Max daily funding rate (18 decimals, e.g., 0.03e18 = 3%/day) | 0.03e18 | 0.03e18 |
| `makerFee` | uint256 | Fee for reducing skew (basis points) | 2 bps (0.02%) | 2 bps |
| `takerFee` | uint256 | Fee for increasing skew (basis points) | 5 bps (0.05%) | 5 bps |
| `initialMarginRatio` | uint256 | Required margin to open (basis points) | 1000 (10%) | 1000 (10%) |
| `maintenanceMarginRatio` | uint256 | Liquidation threshold (basis points) | 500 (5%) | 500 (5%) |
| `maxLeverage` | uint256 | Maximum leverage multiplier | 10 | 10 |
| `maxMarketSize` | uint256 | Open interest cap (sqft) | 1,000,000 | 600,000 |
| `active` | bool | Whether trading is enabled | true | true |

**Key functions:**

```
createMarket(bytes32 marketId, MarketParams params) -- owner only
updateMarketParams(bytes32 marketId, MarketParams params) -- owner only
pauseMarket(bytes32 marketId) / resumeMarket(bytes32 marketId) -- owner only
getMarketParams(bytes32 marketId) -> MarketParams
getAllMarketIds() -> bytes32[]
```

### 2.3 LiquidityPool.sol

**Location:** `contracts/core/LiquidityPool.sol`
**Purpose:** The counterparty to all trades. LPs deposit tUSDI and receive LP tokens representing their share of the pool. The pool absorbs trader PnL -- when traders lose, the pool gains; when traders win, the pool pays.

**Mechanics:**

- LP token is a standard ERC-20 minted/burned on deposit/withdraw
- Pool value = total tUSDI deposits + unrealized PnL from all open positions (net of trader gains/losses) + accrued fees
- LP share price = pool value / total LP token supply
- 24-hour withdrawal delay on LP withdrawals (prevents sandwich attacks around oracle updates)
- 80% of all trading fees go to the pool; 20% to protocol treasury

**Key functions:**

```
deposit(uint256 amount) -> uint256 lpTokensMinted
  - Transfers tUSDI from user to pool
  - Mints LP tokens proportional to current share price
  - Emits XPAction("lp_deposit", 100)

requestWithdraw(uint256 lpTokenAmount)
  - Queues withdrawal with 24h delay
  - Locks LP tokens in contract

executeWithdraw()
  - Callable after 24h delay has passed
  - Burns LP tokens, transfers proportional tUSDI back
  - Emits XPAction("lp_withdraw", 50)

getPoolValue() -> uint256
  - Calculates total pool value including unrealized PnL from open positions

getSharePrice() -> uint256
  - Returns current tUSDI value per LP token (18 decimals)

settleTraderPnL(address trader, int256 pnl) -- only callable by PerpEngine
  - Positive pnl: pool pays trader (pool value decreases)
  - Negative pnl: pool receives from trader (pool value increases)
```

### 2.4 PerpEngine.sol

**Location:** `contracts/core/PerpEngine.sol`
**Purpose:** Core perpetual futures logic. Handles opening/closing/modifying positions, computes funding accrual, calculates PnL, and performs margin checks. This is the primary entry point for all trading operations.

**Position model:**

```solidity
struct Position {
    bytes32 marketId;       // Which market (NYC or DUBAI)
    int256  size;           // Positive = long, negative = short (in sqft)
    uint256 entryPrice;     // Volume-weighted average entry price (8 decimals)
    uint256 entryFundingIndex; // Funding index at entry (for accrued funding calc)
    uint256 openTimestamp;  // When position was opened
}
```

**Cross-margin model:** One margin account per user, up to 12 simultaneous positions across all markets. Total account margin must satisfy the sum of initial margin requirements for all positions.

**Skew-adjusted fill price:**

```
fillPrice = [ indexPrice * (1 + skew/skewScale) + indexPrice * (1 + (skew + tradeSize)/skewScale) ] / 2
```

This is the average of the price impact before and after the trade, creating a smooth price impact curve proportional to position size relative to skewScale.

**Velocity funding model:**

```
currentFundingRate += clamp(skew / skewScale, -1, 1) * maxFundingVelocity * daysElapsed
```

Funding is not a fixed rate -- it is a velocity. The rate accelerates in the direction of skew. When skew is balanced (longs = shorts), the rate decelerates toward zero.

**Fee determination:**
- If trade reduces absolute skew: maker fee applies
- If trade increases absolute skew: taker fee applies
- Fee is charged on notional value (size * fillPrice)
- 80% of fee goes to LiquidityPool, 20% to protocol treasury

**Key functions:**

```
openPosition(bytes32 marketId, int256 size)
  - Validates market is active and not paused
  - Reads current index price from PriceOracle (reverts if stale)
  - Calculates fill price with skew adjustment
  - Calculates fee (maker or taker based on skew impact)
  - Checks margin account has sufficient free margin for initial margin requirement
  - Stores position, updates market skew
  - Emits PositionOpened event + XPAction("open_position", 150)

closePosition(bytes32 marketId)
  - Settles accrued funding
  - Calculates realized PnL = size * (exitPrice - entryPrice) - accruedFunding - fee
  - Calls LiquidityPool.settleTraderPnL() to transfer PnL
  - Removes position from user's account
  - Emits PositionClosed event + XPAction("close_position", 100)

modifyPosition(bytes32 marketId, int256 sizeDelta)
  - Partial close (reduce size) or increase size
  - Settles funding up to modification point
  - Re-calculates entry price as volume-weighted average
  - Re-checks margin requirements

liquidate(address account)
  - Callable by anyone (public liquidator)
  - Checks if account total margin < maintenance margin requirement
  - Closes all positions at current index price
  - Liquidation penalty deducted from remaining margin (goes to liquidator + pool)
  - Emits AccountLiquidated event + XPAction("liquidation", 150) for liquidator

accrueMarketFunding(bytes32 marketId)
  - Updates the global funding index for a market
  - Called automatically before any position change
  - Can also be called externally to keep funding current
```

### 2.5 MarginAccount.sol

**Location:** `contracts/core/MarginAccount.sol`
**Purpose:** Per-user cross-margin accounting. Manages tUSDI collateral deposits and withdrawals with a 24-hour withdrawal delay to prevent front-running oracle updates.

**Account model:**

```solidity
struct Account {
    uint256 collateral;           // Total tUSDI deposited (18 decimals)
    uint256 pendingWithdrawal;    // Amount queued for withdrawal
    uint256 withdrawalRequestTime; // Timestamp of withdrawal request
}
```

**Margin calculations:**

```
totalMargin = collateral + unrealizedPnL(all positions) - pendingWithdrawal
requiredInitialMargin = sum( |position.size| * indexPrice * initialMarginRatio ) for all positions
requiredMaintenanceMargin = sum( |position.size| * indexPrice * maintenanceMarginRatio ) for all positions
freeMargin = totalMargin - requiredInitialMargin
isLiquidatable = totalMargin < requiredMaintenanceMargin
```

**Key functions:**

```
depositCollateral(uint256 amount)
  - Transfers tUSDI from user to contract
  - Increases user's collateral balance
  - Emits CollateralDeposited event + XPAction("deposit_collateral", 100)

requestWithdrawal(uint256 amount)
  - Validates freeMargin >= amount after withdrawal
  - Queues withdrawal with 24h delay
  - Emits WithdrawalRequested event

executeWithdrawal()
  - Validates 24h has passed since request
  - Re-checks freeMargin (prices may have moved)
  - Transfers tUSDI back to user
  - Emits WithdrawalExecuted event + XPAction("withdraw_collateral", 50)

cancelWithdrawal()
  - Cancels pending withdrawal, returns amount to available collateral

getAccountSummary(address user) -> AccountSummary
  - Returns collateral, unrealizedPnL, totalMargin, freeMargin, requiredMargin, liquidatable status
```

### 2.6 Libraries

#### MathLib.sol

**Location:** `contracts/libraries/MathLib.sol`
**Purpose:** Fixed-point arithmetic for 18-decimal math used throughout the protocol.

```
mulDiv(uint256 a, uint256 b, uint256 denominator) -> uint256
  - Full-precision multiplication then division (avoids overflow)
signedMulDiv(int256 a, int256 b, uint256 denominator) -> int256
  - Signed version for PnL calculations
abs(int256 x) -> uint256
  - Absolute value of signed integer
clamp(int256 value, int256 min, int256 max) -> int256
  - Clamp value within bounds (used for funding velocity)
toInt256(uint256 x) -> int256
  - Safe cast with overflow check
```

#### FundingLib.sol

**Location:** `contracts/libraries/FundingLib.sol`
**Purpose:** Velocity funding rate calculations.

```
calculateFundingDelta(
    int256 currentSkew,
    uint256 skewScale,
    uint256 maxFundingVelocity,
    uint256 elapsedSeconds
) -> int256 fundingRateDelta
  - Implements: clamp(skew/skewScale, -1, 1) * maxFundingVelocity * daysElapsed

calculateAccruedFunding(
    int256 positionSize,
    uint256 entryFundingIndex,
    uint256 currentFundingIndex
) -> int256 accruedFunding
  - Funding owed by a position since its entry
```

#### PricingLib.sol

**Location:** `contracts/libraries/PricingLib.sol`
**Purpose:** Skew-adjusted fill price and fee calculations.

```
calculateFillPrice(
    uint256 indexPrice,
    int256 currentSkew,
    int256 tradeSize,
    uint256 skewScale
) -> uint256 fillPrice
  - Implements the average skew-impact formula

calculateTradeFee(
    int256 tradeSize,
    uint256 fillPrice,
    int256 currentSkew,
    uint256 makerFee,
    uint256 takerFee
) -> uint256 fee
  - Determines maker/taker classification and computes fee
```

### 2.7 Interfaces

All core contracts expose interfaces in `contracts/interfaces/`:

| File | Interface |
|------|-----------|
| `IPriceOracle.sol` | Price submission, queries, staleness checks |
| `IMarketManager.sol` | Market parameter reads |
| `ILiquidityPool.sol` | Deposit/withdraw, pool value, PnL settlement |
| `IPerpEngine.sol` | Position management, funding, liquidation |
| `IMarginAccount.sol` | Collateral management, margin queries |

### 2.8 Mocks

| File | Purpose |
|------|---------|
| `MockPriceOracle.sol` | Allows setting prices directly in tests without signatures |
| `MocktUSDI.sol` | Mintable ERC-20 for testing collateral flows |

### 2.9 XP Integration

All user-facing contract actions emit the Integra XP event:

```solidity
event XPAction(address indexed user, string actionType, uint256 points);
```

| Action | Event Type | Points |
|--------|-----------|--------|
| Deposit collateral | `deposit_collateral` | 100 |
| Withdraw collateral | `withdraw_collateral` | 50 |
| Open position | `open_position` | 150 |
| Close position | `close_position` | 100 |
| Modify position | `modify_position` | 75 |
| LP deposit | `lp_deposit` | 100 |
| LP withdraw | `lp_withdraw` | 50 |
| Execute liquidation | `liquidation` | 150 |

---

## 3. Oracle Service Architecture

The oracle service is a standalone Node.js process that scrapes real estate price data from public sources, signs it with EIP-712, and submits it on-chain to `PriceOracle.sol`.

### 3.1 Architecture Overview

```
  +--------------------------------------------------------------+
  |                    Oracle Service (Node.js)                   |
  |                                                               |
  |  +------------------+    +------------------+                 |
  |  |   Scheduler      |    |   PriceAggregator|                 |
  |  |  (node-cron)     |--->|                  |                 |
  |  |  4x/day:         |    |  - Median filter |                 |
  |  |  00:00, 06:00,   |    |  - Outlier       |                 |
  |  |  12:00, 18:00 UTC|    |    rejection     |                 |
  |  +------------------+    |  - Deviation     |                 |
  |                          |    check vs last |                 |
  |                          +--------+---------+                 |
  |                                   |                           |
  |            +----------------------+----------------------+    |
  |            |                      |                      |    |
  |            v                      v                      v    |
  |  +------------------+  +------------------+  +----------+--+ |
  |  |  NYC Scraper     |  | Dubai Scraper    |  |  Signer     | |
  |  |                  |  |                  |  |  (EIP-712)  | |
  |  | Sources:         |  | Sources:         |  |             | |
  |  |  - Redfin        |  |  - DXBinteract   |  | ethers.js   | |
  |  |  - Zillow        |  |  - PropertyFinder |  | Wallet      | |
  |  |                  |  |                  |  +------+------+ |
  |  | Playwright       |  | Playwright       |         |        |
  |  | headless browser |  | headless browser |         |        |
  |  +------------------+  +------------------+         |        |
  |                                                     v        |
  |                                            +--------+------+ |
  |                                            |  Submitter    | |
  |                                            |               | |
  |                                            | PriceOracle   | |
  |                                            | .submitPrice()| |
  |                                            | via ethers.js | |
  |                                            +---------------+ |
  +--------------------------------------------------------------+
```

### 3.2 Schedule

| Frequency | Times (UTC) | Rationale |
|-----------|-------------|-----------|
| 4x daily | 00:00, 06:00, 12:00, 18:00 | Real estate indices move slowly; 6-hour intervals provide sufficient granularity while keeping scraping load low |

### 3.3 Data Sources

**NYC Market:**

| Source | URL Pattern | Data Extracted | Method |
|--------|------------|---------------|--------|
| Redfin | `redfin.com/city/.../NY/New-York/housing-market` | Median price per sqft | Playwright: navigate, wait for data render, extract from DOM |
| Zillow | `zillow.com/home-values/.../new-york-ny/` | ZHVI per sqft | Playwright: navigate, extract from data elements |

**Dubai Market:**

| Source | URL Pattern | Data Extracted | Method |
|--------|------------|---------------|--------|
| DXBinteract | `dxbinteract.com` | Average price per sqft (AED, converted to USD) | Playwright: navigate, interact with filters, extract data |
| Property Finder | `propertyfinder.ae/market-data` | Median price per sqft (AED, converted to USD) | Playwright: navigate, extract from market data section |

### 3.4 Data Pipeline

1. **Scrape** -- Playwright launches headless Chromium, navigates to each source, waits for dynamic content to render, extracts price data via DOM selectors
2. **Validate** -- Each scraped value is checked for basic sanity (positive number, within expected range for the city, not zero)
3. **Aggregate** -- For each city, take the median of successfully scraped values (minimum 1 source required, 2 preferred)
4. **Deviation check** -- Compare aggregated price against last submitted on-chain price; reject if deviation exceeds configurable threshold (default: 10%)
5. **Sign** -- Construct EIP-712 typed data message containing `(marketId, price, timestamp)` and sign with the oracle service's private key
6. **Submit** -- Call `PriceOracle.submitPrice()` via ethers.js with the signed price data
7. **Verify** -- Wait for transaction confirmation, log result

### 3.5 Error Handling and Retries

| Failure | Handling |
|---------|----------|
| Single source scrape fails | Skip that source; proceed if at least 1 source succeeds for the market |
| All sources fail for a market | Log critical error, skip this update cycle for that market, alert via configured webhook |
| Deviation bound exceeded | Log warning, do not submit (protects against scraping bugs or data errors) |
| Transaction submission fails | Retry up to 3 times with exponential backoff (5s, 15s, 45s) |
| Nonce conflict | Re-fetch nonce from chain and retry |
| Gas estimation failure | Use fallback gas limit (500,000) |

### 3.6 Configuration

All oracle configuration is in environment variables:

```
ORACLE_PRIVATE_KEY=           # Private key of the authorized oracle signer
ORACLE_RPC_URL=https://testnet.integralayer.com/evm
PRICE_ORACLE_ADDRESS=         # Deployed PriceOracle.sol address
DEVIATION_THRESHOLD=1000      # 10% in basis points
SCRAPE_TIMEOUT=30000          # 30s max per source
RETRY_COUNT=3
ALERT_WEBHOOK_URL=            # Optional: Slack/Discord webhook for alerts
```

### 3.7 Service File Structure

```
oracle/
├── src/
│   ├── index.ts              # Entry point, scheduler setup
│   ├── scrapers/
│   │   ├── base-scraper.ts   # Abstract base class for all scrapers
│   │   ├── redfin.ts         # Redfin price extraction
│   │   ├── zillow.ts         # Zillow price extraction
│   │   ├── dxbinteract.ts    # DXBinteract price extraction
│   │   └── property-finder.ts # Property Finder price extraction
│   ├── aggregator.ts         # Median calculation, outlier rejection
│   ├── signer.ts             # EIP-712 signing logic
│   ├── submitter.ts          # On-chain submission with retries
│   ├── config.ts             # Environment variable loading
│   └── logger.ts             # Structured logging
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 4. Frontend Architecture

The frontend is a Next.js 14+ application using the App Router. It follows the standard Integra dApp structure with a custom dark real-estate-finance aesthetic (Bloomberg Terminal meets modern property platform).

### 4.1 Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing / Dashboard | Market overview, current prices, trending stats, portfolio summary |
| `/trade` | Trade Terminal | Main trading interface with market selector, order form, position list, price chart |
| `/trade/[marketId]` | Market-Specific Trade | Pre-selected market (e.g., `/trade/nyc`) |
| `/pool` | LP Dashboard | Pool stats, deposit/withdraw forms, LP share value, fee earnings |
| `/portfolio` | Portfolio | All open positions, margin status, PnL history, collateral management |
| `/leaderboard` | Leaderboard | Top traders by PnL, XP rankings, trading volume leaders |
| `/faucet` | Faucet | Get testnet tUSDI and IRL tokens for testing |

### 4.2 Component Tree

```
frontend/
├── app/
│   ├── layout.tsx              # Root layout: providers, fonts, metadata
│   ├── page.tsx                # Dashboard
│   ├── trade/
│   │   ├── page.tsx            # Trade terminal
│   │   └── [marketId]/
│   │       └── page.tsx        # Market-specific trade view
│   ├── pool/
│   │   └── page.tsx            # LP dashboard
│   ├── portfolio/
│   │   └── page.tsx            # User portfolio
│   ├── leaderboard/
│   │   └── page.tsx            # Leaderboard
│   ├── faucet/
│   │   └── page.tsx            # Testnet faucet
│   └── globals.css             # Custom brand tokens + Tailwind base
│
├── components/
│   ├── layout/
│   │   ├── header.tsx          # Top bar: logo, nav, wallet connect, XP badge
│   │   ├── sidebar.tsx         # Market selector sidebar (optional)
│   │   └── footer.tsx          # Links, network status
│   │
│   ├── trade/
│   │   ├── market-selector.tsx # NYC / Dubai toggle
│   │   ├── order-form.tsx      # Long/Short, size input, leverage slider, margin display
│   │   ├── position-list.tsx   # Open positions table
│   │   ├── position-row.tsx    # Single position with PnL, funding, close button
│   │   ├── price-chart.tsx     # Historical price chart (index price over time)
│   │   ├── market-stats.tsx    # Current price, 24h change, OI, skew, funding rate
│   │   └── order-book-depth.tsx # Visual skew/depth display
│   │
│   ├── pool/
│   │   ├── pool-stats.tsx      # TVL, share price, APY estimate, fee earnings
│   │   ├── deposit-form.tsx    # tUSDI deposit form
│   │   ├── withdraw-form.tsx   # LP token withdraw with 24h delay status
│   │   └── lp-position.tsx     # User's LP position details
│   │
│   ├── portfolio/
│   │   ├── account-summary.tsx # Total margin, free margin, liquidation risk
│   │   ├── collateral-form.tsx # Deposit/withdraw tUSDI collateral
│   │   ├── pnl-chart.tsx       # Historical PnL chart
│   │   └── position-history.tsx # Closed position history
│   │
│   ├── shared/
│   │   ├── connect-button.tsx  # Web3Auth social login button
│   │   ├── xp-notification.tsx # XP earned toast notification
│   │   ├── token-amount.tsx    # Formatted token amount display
│   │   ├── tx-status.tsx       # Transaction pending/confirmed/failed indicator
│   │   └── price-display.tsx   # Price with $/sqft formatting and change indicator
│   │
│   └── ui/                     # shadcn/ui components (auto-generated)
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── slider.tsx
│       ├── tabs.tsx
│       ├── toast.tsx
│       ├── tooltip.tsx
│       └── ...
│
├── hooks/
│   ├── use-price-oracle.ts     # Read current/historical prices, subscribe to PriceUpdated events
│   ├── use-perp-engine.ts      # Open/close/modify positions, read position data
│   ├── use-margin-account.ts   # Deposit/withdraw collateral, read account summary
│   ├── use-liquidity-pool.ts   # LP deposit/withdraw, read pool stats
│   ├── use-market-manager.ts   # Read market parameters
│   ├── use-market-data.ts      # Aggregated market data (price + stats + funding)
│   └── use-xp.ts               # XP balance and history
│
└── lib/
    ├── abis/
    │   ├── PriceOracle.json
    │   ├── MarketManager.json
    │   ├── LiquidityPool.json
    │   ├── PerpEngine.json
    │   └── MarginAccount.json
    ├── chains.ts               # Integra testnet chain definition for wagmi
    ├── contracts.ts            # Contract address registry
    ├── constants.ts            # Market IDs, decimals, formatting constants
    ├── format.ts               # Price formatting, sqft formatting, PnL formatting
    └── web3auth.ts             # Web3Auth configuration (via @integra/web3auth-provider)
```

### 4.3 Data Flow

**Contract reads (polling + event-driven):**

```
wagmi useReadContract / useWatchContractEvent
          |
          v
    +-----+------+
    | Custom Hook |  (e.g., usePriceOracle, usePerpEngine)
    +-----+------+
          |
          v
    +-----+------+
    |  Component  |  (e.g., market-stats.tsx, position-row.tsx)
    +-----+------+
          |
          v
    +-----+------+
    |  Rendered   |
    |    UI       |
    +-------------+
```

**Contract writes (user actions):**

```
    User clicks "Open Long"
          |
          v
    +-----+------+
    |  order-form |  Validates inputs, shows estimated fill price and fee
    +-----+------+
          |
          v
    +-----+-----------+
    | useWriteContract |  Sends transaction via wagmi
    +-----+-----------+
          |
          v
    +-----+----------------------+
    | useWaitForTransaction      |  Shows pending state
    +-----+----------------------+
          |
          v
    +-----+------+
    | tx-status   |  Shows confirmed / failed
    +-----+------+
          |
          v
    +-----+-----------+
    | XP notification |  If confirmed, show "+150 XP" toast
    +------------------+
```

**Real-time updates (WebSocket):**

The frontend subscribes to contract events via the Integra testnet WebSocket endpoint (`wss://testnet.integralayer.com/evm/ws`):

| Event | Source Contract | UI Update |
|-------|---------------|-----------|
| `PriceUpdated` | PriceOracle | Refresh price display, chart, estimated PnL |
| `PositionOpened` / `PositionClosed` | PerpEngine | Refresh position list, market OI |
| `FundingUpdated` | PerpEngine | Refresh funding rate display |
| `AccountLiquidated` | PerpEngine | Refresh position list, show notification |
| `CollateralDeposited` / `WithdrawalExecuted` | MarginAccount | Refresh margin balances |
| `LPDeposited` / `LPWithdrawn` | LiquidityPool | Refresh pool stats |

### 4.4 Auth Flow

```
User clicks "Connect" -> Web3Auth modal opens -> User selects Google/X/Email
  -> Web3Auth creates/recovers key shard -> Returns provider
  -> wagmi connects with provider -> User's address available app-wide
  -> All contract interactions go through the Web3Auth-backed signer
```

Web3Auth is configured for Integra testnet via `@integra/web3auth-provider` with `sapphire_devnet` network and the shared Integra client ID.

---

## 5. Directory Structure

```
terraform/
├── .claude/
│   └── CLAUDE.md                      # Project-specific AI instructions
├── .integra/
│   └── config.json                    # Integra studio config (branding: "custom")
│
├── contracts/
│   ├── core/
│   │   ├── PriceOracle.sol            # Oracle price storage + verification
│   │   ├── MarketManager.sol          # Market registry + parameters
│   │   ├── LiquidityPool.sol          # LP pool + counterparty logic
│   │   ├── PerpEngine.sol             # Core perp engine (positions, funding, PnL)
│   │   └── MarginAccount.sol          # Cross-margin collateral management
│   ├── interfaces/
│   │   ├── IPriceOracle.sol
│   │   ├── IMarketManager.sol
│   │   ├── ILiquidityPool.sol
│   │   ├── IPerpEngine.sol
│   │   └── IMarginAccount.sol
│   ├── libraries/
│   │   ├── MathLib.sol                # Fixed-point arithmetic (18 decimals)
│   │   ├── FundingLib.sol             # Velocity funding calculations
│   │   └── PricingLib.sol             # Fill price + fee calculations
│   └── mocks/
│       ├── MockPriceOracle.sol        # Direct price setting for tests
│       └── MocktUSDI.sol              # Mintable ERC-20 for tests
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout (providers, fonts, metadata)
│   │   ├── page.tsx                   # Dashboard
│   │   ├── globals.css                # Custom brand CSS variables + Tailwind
│   │   ├── trade/
│   │   │   ├── page.tsx               # Trade terminal
│   │   │   └── [marketId]/
│   │   │       └── page.tsx           # Market-specific trade
│   │   ├── pool/
│   │   │   └── page.tsx               # LP dashboard
│   │   ├── portfolio/
│   │   │   └── page.tsx               # Portfolio view
│   │   ├── leaderboard/
│   │   │   └── page.tsx               # XP + PnL leaderboard
│   │   └── faucet/
│   │       └── page.tsx               # Testnet faucet
│   ├── components/
│   │   ├── layout/
│   │   │   ├── header.tsx
│   │   │   ├── sidebar.tsx
│   │   │   └── footer.tsx
│   │   ├── trade/
│   │   │   ├── market-selector.tsx
│   │   │   ├── order-form.tsx
│   │   │   ├── position-list.tsx
│   │   │   ├── position-row.tsx
│   │   │   ├── price-chart.tsx
│   │   │   ├── market-stats.tsx
│   │   │   └── order-book-depth.tsx
│   │   ├── pool/
│   │   │   ├── pool-stats.tsx
│   │   │   ├── deposit-form.tsx
│   │   │   ├── withdraw-form.tsx
│   │   │   └── lp-position.tsx
│   │   ├── portfolio/
│   │   │   ├── account-summary.tsx
│   │   │   ├── collateral-form.tsx
│   │   │   ├── pnl-chart.tsx
│   │   │   └── position-history.tsx
│   │   ├── shared/
│   │   │   ├── connect-button.tsx
│   │   │   ├── xp-notification.tsx
│   │   │   ├── token-amount.tsx
│   │   │   ├── tx-status.tsx
│   │   │   └── price-display.tsx
│   │   └── ui/                        # shadcn/ui (auto-generated)
│   │       └── ...
│   ├── hooks/
│   │   ├── use-price-oracle.ts
│   │   ├── use-perp-engine.ts
│   │   ├── use-margin-account.ts
│   │   ├── use-liquidity-pool.ts
│   │   ├── use-market-manager.ts
│   │   ├── use-market-data.ts
│   │   └── use-xp.ts
│   └── lib/
│       ├── abis/
│       │   ├── PriceOracle.json
│       │   ├── MarketManager.json
│       │   ├── LiquidityPool.json
│       │   ├── PerpEngine.json
│       │   └── MarginAccount.json
│       ├── chains.ts
│       ├── contracts.ts
│       ├── constants.ts
│       ├── format.ts
│       └── web3auth.ts
│
├── oracle/
│   ├── src/
│   │   ├── index.ts                   # Entry point + scheduler
│   │   ├── scrapers/
│   │   │   ├── base-scraper.ts
│   │   │   ├── redfin.ts
│   │   │   ├── zillow.ts
│   │   │   ├── dxbinteract.ts
│   │   │   └── property-finder.ts
│   │   ├── aggregator.ts
│   │   ├── signer.ts
│   │   ├── submitter.ts
│   │   ├── config.ts
│   │   └── logger.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── test/
│   ├── PriceOracle.test.ts
│   ├── MarketManager.test.ts
│   ├── LiquidityPool.test.ts
│   ├── PerpEngine.test.ts
│   ├── MarginAccount.test.ts
│   ├── integration/
│   │   ├── full-trade-lifecycle.test.ts
│   │   ├── liquidation.test.ts
│   │   └── funding-accrual.test.ts
│   └── helpers/
│       ├── fixtures.ts                # Shared deployment fixtures
│       ├── constants.ts               # Test market params
│       └── utils.ts                   # Helper functions
│
├── ignition/
│   └── modules/
│       └── Terraform.ts               # Hardhat Ignition deployment module
│
├── docs/
│   ├── ARCHITECTURE.md                # This document
│   ├── PRD.md                         # Product requirements
│   ├── CONTRACTS.md                   # Detailed contract specifications
│   ├── FRONTEND.md                    # Frontend design document
│   └── INTEGRATIONS.md               # Integra ecosystem integration details
│
├── hardhat.config.ts                  # Hardhat config with Integra testnet network
├── next.config.ts                     # Next.js config
├── tailwind.config.ts                 # Tailwind with custom brand theme
├── tsconfig.json                      # TypeScript config (strict mode)
├── package.json                       # Monorepo-style with workspaces or unified deps
├── .env.example                       # All env vars documented
├── .gitignore                         # Standard Integra dApp gitignore
└── README.md                          # Setup and run instructions
```

---

## 6. Data Flow Diagrams

### 6.1 Open Position

```
User                    Frontend              PerpEngine           PriceOracle        MarginAccount      LiquidityPool
 |                         |                      |                    |                    |                  |
 |  1. Enter trade params  |                      |                    |                    |                  |
 |  (market, size, side)   |                      |                    |                    |                  |
 |------------------------>|                      |                    |                    |                  |
 |                         |  2. Estimate fill     |                    |                    |                  |
 |                         |  price + fee          |                    |                    |                  |
 |                         |---read--------------->|                    |                    |                  |
 |                         |<--fillPrice, fee------|                    |                    |                  |
 |                         |                      |                    |                    |                  |
 |  3. Show preview,       |                      |                    |                    |                  |
 |  user confirms          |                      |                    |                    |                  |
 |------------------------>|                      |                    |                    |                  |
 |                         |  4. Send openPosition |                    |                    |                  |
 |                         |  tx via wagmi         |                    |                    |                  |
 |                         |---write-------------->|                    |                    |                  |
 |                         |                      |  5. Get index      |                    |                  |
 |                         |                      |  price             |                    |                  |
 |                         |                      |---getPrice()------>|                    |                  |
 |                         |                      |<--price, ts--------|                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  6. Accrue         |                    |                  |
 |                         |                      |  funding for       |                    |                  |
 |                         |                      |  market            |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  7. Calculate fill |                    |                  |
 |                         |                      |  price + fee       |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  8. Check margin   |                    |                  |
 |                         |                      |---freeMargin?----->|                    |                  |
 |                         |                      |<--sufficient-------|                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  9. Store position |                    |                  |
 |                         |                      |  Update skew       |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  10. Transfer fee  |                    |                  |
 |                         |                      |---80% fee--------->|                    |---------->pool   |
 |                         |                      |---20% fee--------->| (protocol treasury)|                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  11. Emit events   |                    |                  |
 |                         |                      |  PositionOpened    |                    |                  |
 |                         |                      |  XPAction          |                    |                  |
 |                         |<--tx receipt----------|                    |                    |                  |
 |  12. Show confirmation  |                      |                    |                    |                  |
 |  + XP toast             |                      |                    |                    |                  |
 |<------------------------|                      |                    |                    |                  |
```

### 6.2 Close Position

```
User                    Frontend              PerpEngine           PriceOracle        MarginAccount      LiquidityPool
 |                         |                      |                    |                    |                  |
 |  1. Click "Close"       |                      |                    |                    |                  |
 |------------------------>|                      |                    |                    |                  |
 |                         |  2. Send              |                    |                    |                  |
 |                         |  closePosition tx     |                    |                    |                  |
 |                         |---write-------------->|                    |                    |                  |
 |                         |                      |  3. Get index      |                    |                  |
 |                         |                      |  price             |                    |                  |
 |                         |                      |---getPrice()------>|                    |                  |
 |                         |                      |<--price------------|                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  4. Accrue funding |                    |                  |
 |                         |                      |  since entry       |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  5. Calculate PnL  |                    |                  |
 |                         |                      |  = size * (exit -  |                    |                  |
 |                         |                      |    entry) - funding|                    |                  |
 |                         |                      |    - fee           |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  6. Settle with    |                    |                  |
 |                         |                      |  LP pool           |                    |                  |
 |                         |                      |---settleTraderPnL->|                    |--------->pool    |
 |                         |                      |                    |                    |                  |
 |                         |                      |  7. Update margin  |                    |                  |
 |                         |                      |  account           |                    |                  |
 |                         |                      |---credit/debit---->|                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  8. Remove position|                    |                  |
 |                         |                      |  Update skew       |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  9. Emit events    |                    |                  |
 |                         |<--tx receipt----------|                    |                    |                  |
 |  10. Show PnL + XP      |                      |                    |                    |                  |
 |<------------------------|                      |                    |                    |                  |
```

### 6.3 Liquidation

```
Liquidator              Frontend              PerpEngine           PriceOracle        MarginAccount      LiquidityPool
 |                         |                      |                    |                    |                  |
 |  1. Call liquidate(user)|                      |                    |                    |                  |
 |------------------------>|---write-------------->|                    |                    |                  |
 |                         |                      |  2. Get prices     |                    |                  |
 |                         |                      |  for all markets   |                    |                  |
 |                         |                      |  with positions    |                    |                  |
 |                         |                      |---getPrice()------>|                    |                  |
 |                         |                      |<--prices-----------|                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  3. Calculate      |                    |                  |
 |                         |                      |  total margin      |                    |                  |
 |                         |                      |  vs maintenance    |                    |                  |
 |                         |                      |---getAccount------>|                    |                  |
 |                         |                      |<--collateral-------|                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  4. Verify:        |                    |                  |
 |                         |                      |  totalMargin <     |                    |                  |
 |                         |                      |  maintenanceMargin |                    |                  |
 |                         |                      |  (reverts if not)  |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  5. Close ALL      |                    |                  |
 |                         |                      |  positions at      |                    |                  |
 |                         |                      |  index price       |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  6. Calculate      |                    |                  |
 |                         |                      |  liquidation       |                    |                  |
 |                         |                      |  penalty           |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  7. Settle PnL     |                    |                  |
 |                         |                      |  with pool         |                    |                  |
 |                         |                      |---settleTraderPnL->|                    |--------->pool    |
 |                         |                      |                    |                    |                  |
 |                         |                      |  8. Pay penalty:   |                    |                  |
 |                         |                      |  to liquidator     |                    |                  |
 |                         |                      |  + to pool         |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  9. Return any     |                    |                  |
 |                         |                      |  remaining margin  |                    |                  |
 |                         |                      |  to user           |                    |                  |
 |                         |                      |---updateAccount--->|                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  10. Emit events   |                    |                  |
 |                         |                      |  AccountLiquidated |                    |                  |
 |                         |                      |  XPAction(liqdr)   |                    |                  |
 |                         |<--tx receipt----------|                    |                    |                  |
 |  11. Show reward        |                      |                    |                    |                  |
 |<------------------------|                      |                    |                    |                  |
```

### 6.4 Oracle Price Update

```
Scheduler               Scrapers              Aggregator            Signer              Submitter          PriceOracle
 |                         |                      |                    |                    |                  |
 |  1. Cron fires          |                      |                    |                    |                  |
 |  (every 6 hours)        |                      |                    |                    |                  |
 |------------------------>|                      |                    |                    |                  |
 |                         |  2. Launch Playwright |                    |                    |                  |
 |                         |  for each source      |                    |                    |                  |
 |                         |  (parallel per city)  |                    |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |  3. Return scraped   |                    |                    |                  |
 |                         |  prices per source   |                    |                    |                  |
 |                         |---NYC: [R,Z]-------->|                    |                    |                  |
 |                         |---DXB: [D,PF]------->|                    |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  4. Median filter  |                    |                  |
 |                         |                      |  + outlier reject  |                    |                  |
 |                         |                      |  + deviation check |                    |                  |
 |                         |                      |  vs last on-chain  |                    |                  |
 |                         |                      |                    |                    |                  |
 |                         |                      |  5. Final prices:  |                    |                  |
 |                         |                      |  NYC=$X, DXB=$Y    |                    |                  |
 |                         |                      |---sign request---->|                    |                  |
 |                         |                      |                    |  6. EIP-712 sign   |                  |
 |                         |                      |                    |  (marketId, price, |                  |
 |                         |                      |                    |   timestamp)       |                  |
 |                         |                      |                    |---signed data----->|                  |
 |                         |                      |                    |                    |  7. Submit tx    |
 |                         |                      |                    |                    |  with retries    |
 |                         |                      |                    |                    |---submitPrice()->|
 |                         |                      |                    |                    |                  |
 |                         |                      |                    |                    |                  | 8. Verify sig
 |                         |                      |                    |                    |                  | Store price
 |                         |                      |                    |                    |                  | Emit event
 |                         |                      |                    |                    |<--tx receipt-----|
 |                         |                      |                    |                    |                  |
 |  9. Log success/failure |                      |                    |                    |                  |
 |<------------------------|                      |                    |                    |                  |
```

### 6.5 LP Deposit and Withdraw

**Deposit:**

```
LP User                 Frontend              LiquidityPool         tUSDI (ERC-20)
 |                         |                      |                    |
 |  1. Enter deposit amt   |                      |                    |
 |------------------------>|                      |                    |
 |                         |  2. approve() tUSDI  |                    |
 |                         |  for LiquidityPool   |                    |
 |                         |---write------------------------+--------->|
 |                         |<--tx receipt-------------------+----------|
 |                         |                      |                    |
 |                         |  3. deposit(amount)  |                    |
 |                         |---write-------------->|                    |
 |                         |                      |  4. transferFrom   |
 |                         |                      |---transferFrom---->|
 |                         |                      |                    |
 |                         |                      |  5. Calculate LP   |
 |                         |                      |  tokens to mint    |
 |                         |                      |  based on share    |
 |                         |                      |  price             |
 |                         |                      |                    |
 |                         |                      |  6. Mint LP tokens |
 |                         |                      |  to user           |
 |                         |                      |                    |
 |                         |                      |  7. Emit events    |
 |                         |<--tx receipt----------|                    |
 |  8. Show LP tokens + XP |                      |                    |
 |<------------------------|                      |                    |
```

**Withdraw (24h delay):**

```
LP User                 Frontend              LiquidityPool
 |                         |                      |
 |  1. Request withdraw    |                      |
 |------------------------>|                      |
 |                         |  2. requestWithdraw  |
 |                         |---write-------------->|
 |                         |                      |  3. Lock LP tokens
 |                         |                      |  Record timestamp
 |                         |<--tx receipt----------|
 |                         |                      |
 |  ... 24 hours pass ...  |                      |
 |                         |                      |
 |  4. Execute withdraw    |                      |
 |------------------------>|                      |
 |                         |  5. executeWithdraw  |
 |                         |---write-------------->|
 |                         |                      |  6. Verify 24h elapsed
 |                         |                      |  7. Calculate tUSDI
 |                         |                      |     at current share price
 |                         |                      |  8. Burn LP tokens
 |                         |                      |  9. Transfer tUSDI to user
 |                         |<--tx receipt----------|
 |  10. Show tUSDI + XP    |                      |
 |<------------------------|                      |
```

---

## 7. Security Considerations

### 7.1 Oracle Manipulation

| Risk | Mitigation |
|------|-----------|
| Compromised oracle signer key | Multi-sig for signer whitelist management; key rotation support; monitor for unexpected price submissions |
| Stale price exploitation | `getPrice()` reverts if price older than staleness bound (12h default); PerpEngine cannot operate on stale prices |
| Price deviation attack (submit extreme price) | Deviation bound rejects any single update that moves more than 10% from previous; gradual manipulation would require multiple 6-hour windows |
| Scraping returns incorrect data | Median of multiple sources reduces impact of any single faulty source; outlier rejection filters extreme values |
| Man-in-the-middle on scrape | Playwright uses HTTPS; scraped data is validated against expected ranges before signing |

### 7.2 Smart Contract Security

| Risk | Mitigation |
|------|-----------|
| Reentrancy on collateral operations | ReentrancyGuard (OpenZeppelin) on all external state-changing functions; Checks-Effects-Interactions pattern throughout |
| Integer overflow/underflow | Solidity 0.8.24+ has built-in overflow checks; MathLib uses safe math for all fixed-point operations |
| Flash loan attacks | 24-hour withdrawal delay on both collateral and LP tokens prevents within-block manipulation |
| Unauthorized liquidation (liquidating healthy accounts) | Liquidation function re-checks margin requirement at execution time; reverts if account is above maintenance margin |
| Price manipulation via large trades | Skew-adjusted fill price means large trades face increasing price impact; no single trade can move the "index" price (that comes from oracle only) |
| Front-running oracle updates | Oracle updates are submitted by the oracle service, not by users; traders cannot predict exact timing of the next price update due to off-chain scheduling |
| Denial of service on liquidations | Liquidation is permissionless (anyone can call it); no single keeper bottleneck; liquidator is economically incentivized via penalty share |
| Access control bypass | All admin functions use Ownable; all inter-contract calls validate caller addresses; deployer sets authorized contract references at deployment |

### 7.3 Frontend Security

| Risk | Mitigation |
|------|-----------|
| Private key exposure | Web3Auth manages keys via MPC; no raw keys in frontend; private key provider handles signing |
| Wrong chain interaction | Chain ID validation before every transaction; wagmi config locked to Integra testnet |
| Transaction parameter tampering | All amounts and addresses validated client-side before submission; preview shown to user before signing |
| XSS via contract data | All contract return values treated as untrusted; no `dangerouslySetInnerHTML`; sanitize all displayed data |

### 7.4 Oracle Service Security

| Risk | Mitigation |
|------|-----------|
| Private key exposure | Oracle private key stored in environment variable, never in code or logs; `.env` in `.gitignore` |
| Service disruption | Prices remain valid for staleness period (12h); trading can continue on existing prices; alerts on missed update cycles |
| Rate limiting by data sources | Scraping only 4x/day is well below detection thresholds; headless Chromium mimics real browser |

---

## 8. Gas and Performance Notes

### 8.1 Chain Characteristics

| Property | Value | Implication |
|----------|-------|-------------|
| Block time | ~5 seconds | Transactions confirm within one block; UI should show pending state for ~5s |
| Finality | Instant (CometBFT) | No reorg risk; once confirmed, transaction is final; no need for multi-block confirmation waits |
| Gas price | 0 airl (free on testnet) | No gas cost optimization needed; can use higher gas limits freely; no user gas burden |
| Gas limit per block | Standard EVM | Complex operations (liquidation with many positions) may approach gas limits |

### 8.2 Contract Gas Optimization Notes

Even though gas is free on testnet, the contracts are designed for reasonable gas efficiency in case of mainnet deployment:

| Operation | Estimated Gas | Notes |
|-----------|--------------|-------|
| `depositCollateral()` | ~60,000 | Simple ERC-20 transfer + storage update |
| `openPosition()` | ~150,000 | Price read + funding accrual + margin check + position storage + event |
| `closePosition()` | ~180,000 | PnL calculation + funding settlement + pool settlement + position removal |
| `liquidate()` (single position) | ~200,000 | Full margin check + position close + penalty distribution |
| `liquidate()` (max 12 positions) | ~800,000 | Loop over all positions; most expensive operation |
| `submitPrice()` | ~80,000 | Signature verification + storage + event |
| LP `deposit()` | ~100,000 | ERC-20 transfer + LP token mint + share price calculation |

### 8.3 Frontend Performance

| Concern | Approach |
|---------|----------|
| Price updates | Subscribe to `PriceUpdated` events via WebSocket; avoid polling on short intervals |
| Position PnL display | Calculate PnL client-side from cached price + position data; only re-fetch from chain when price event fires |
| Market data aggregation | Single `useMarketData` hook combines price, skew, funding, and OI into one cached object; components read from this composite hook |
| Initial page load | Prefetch critical data (prices, user positions) during page load with wagmi's SSR support |
| Transaction UX | Show optimistic UI immediately on tx submission; update definitively on confirmation (~5s); use toast notifications for XP awards |

### 8.4 Oracle Service Performance

| Concern | Approach |
|---------|----------|
| Scraping speed | Playwright instances run in parallel (one per source); total scrape cycle targets < 60 seconds |
| Memory | Playwright browser instances are created per scrape and destroyed after; no persistent browser process |
| Submission timing | Prices for both markets submitted in sequence (not parallel) to avoid nonce conflicts; total submission < 30 seconds |
| Failure recovery | If a cycle fails entirely, the next cycle (6h later) will succeed on fresh data; no cascading failure state |

---

## Appendix A: Key Constants

```
tUSDI Address:     0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f
tUSDI Decimals:    18
WIRL Address:      0x5002000000000000000000000000000000000001
Price Decimals:    8
Position Unit:     sqft
Max Positions:     12 per account
Max Leverage:      10x
Fee Split:         80% LP / 20% protocol
Withdrawal Delay:  24 hours (both collateral and LP)
Oracle Frequency:  4x daily (every 6 hours UTC)
Staleness Bound:   12 hours (default)
Deviation Bound:   10% (default)
NYC Market ID:     keccak256("NYC")
Dubai Market ID:   keccak256("DUBAI")
```

## Appendix B: Integra Ecosystem Integration Points

| Integration | Contract/System | How Terraform Uses It |
|-------------|----------------|----------------------|
| Web3Auth | `@integra/web3auth-provider` | Social login for all users (Google, X, Email); `sapphire_devnet` on testnet |
| XP System | `XPAction` event | Emitted by all contracts on user actions (trade, deposit, liquidate); indexed by Integra XP service |
| tUSDI | ERC-20 at `0xa640...04f` | Sole collateral token for margin accounts and LP deposits |
| Block Explorer | `https://blockscout.integralayer.com` | Transaction verification links in UI |
| Faucet | `https://testnet.integralayer.com` | tUSDI + IRL distribution for new users (10 IRL + 1,000 tUSDI per request) |
| Subdomain | `terraform.integralayer.com` | Production hosting via Integra Domain Router (Caddy reverse proxy) |

## Appendix C: Deployment Order

Contracts must be deployed in this order due to cross-references:

1. **tUSDI** -- already deployed at known address
2. **MarketManager** -- no dependencies
3. **PriceOracle** -- no dependencies (oracle signer address set post-deploy)
4. **MarginAccount** -- depends on tUSDI address
5. **LiquidityPool** -- depends on tUSDI address, MarginAccount address
6. **PerpEngine** -- depends on PriceOracle, MarketManager, LiquidityPool, MarginAccount

Post-deployment setup:
- Register PerpEngine as authorized caller on MarginAccount and LiquidityPool
- Add oracle service address as authorized signer on PriceOracle
- Create NYC and Dubai markets on MarketManager with initial parameters
- Submit initial prices via oracle service
