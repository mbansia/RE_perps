# Terraform Perpetual Futures DEX -- Open-Source Research

> Research conducted April 2026. Sources: Synthetix v2 PerpsV2 (archived), Synthetix v3 perps-market
> (main branch), GMX v2 Synthetics (main branch), Pyth Network SDK, and published security audits.

---

## Table of Contents

1. [Executive Summary -- Top 5 Takeaways](#1-executive-summary)
2. [Synthetix v2 Perps Deep Dive](#2-synthetix-v2-perps-deep-dive)
3. [Synthetix v3 Perps -- What Changed](#3-synthetix-v3-perps)
4. [GMX v2 Pool Mechanics](#4-gmx-v2-pool-mechanics)
5. [Oracle Patterns -- EIP-712 Signed Price Verification](#5-oracle-patterns)
6. [Security Patterns](#6-security-patterns)
7. [Specific Recommendations for Terraform](#7-specific-recommendations)

---

## 1. Executive Summary

**Top 5 actionable takeaways for the Terraform implementation:**

1. **Adopt the Synthetix v3 storage-library pattern, not the v2 inheritance chain.**
   Synthetix v3 uses `library X { struct Data { ... } }` with `keccak256` slot pointers
   for every storage domain (PerpsMarket.Data, Position.Data, PerpsAccount.Data, etc.).
   This eliminates the diamond-proxy complexity of v2 and makes each concern unit-testable.
   Our CONTRACTS.md already follows a library-based approach -- validate that every piece of
   state is in a namespaced struct with a deterministic storage slot.

2. **The velocity-based funding model is production-proven and unchanged between v2 and v3.**
   Both Synthetix versions use `velocity = clamp(skew / skewScale, -1, 1) * maxFundingVelocity`
   with `newRate = lastRate + velocity * proportionalElapsed`. The key difference:
   v3 stores `lastFundingValue` (accumulated funding per unit, already price-weighted)
   rather than a raw funding sequence array. Our FundingLib matches the v3 model. This is correct.

3. **Fill price must use the average of pre-skew and post-skew adjusted prices.**
   Both Synthetix v2/v3 use: `fillPrice = (price*(1 + skew/scale) + price*(1 + (skew+size)/scale)) / 2`.
   This is a linear price impact model. Our PricingLib already implements this formula. Confirmed correct.

4. **Cap trader PnL relative to pool size -- implement Auto-Deleveraging (ADL).**
   GMX v2 caps positive PnL at `maxPnlFactor * poolUsd` and triggers ADL when
   `pnlToPoolFactor > MAX_PNL_FACTOR_FOR_ADL`. Our current spec has `maxMarketSkew` but
   no explicit PnL-to-pool cap or ADL mechanism. This is a critical gap we must address.

5. **Margin calculations must include liquidation reward in the required margin check.**
   Synthetix v3 adds `possibleLiquidationReward` (keeper gas + flag reward) on top of
   `initialMargin + maintenanceMargin` when validating new positions. Without this,
   positions can be opened that are immediately unprofitable to liquidate, creating bad debt.

---

## 2. Synthetix v2 Perps Deep Dive

> Note: The Synthetix v2 repository (`Synthetixio/synthetix`) appears to have been archived or
> made private as of April 2026. Analysis is based on previously indexed source code at tag v2.101.3
> and the v3 codebase which preserved the same formulas.

### 2.1 Velocity-Based Funding Rate

The Synthetix dynamic funding rate was introduced in [SIP-279](https://blog.synthetix.io/synthetix-perps-dynamic-funding-rates/).

**Core formula (from v2 PerpsV2MarketViews.sol / v3 PerpsMarket.sol):**

```
velocity          = clamp(skew / skewScale, -1, +1) * maxFundingVelocity
funding_rate(t)   = lastFundingRate + velocity * (elapsed / 86400)
avgFundingRate    = -(lastFundingRate + currentFundingRate) / 2
unrecordedFunding = avgFundingRate * proportionalElapsed * price
```

**Solidity pattern (from Synthetix v3 `PerpsMarket.sol`):**

```solidity
function currentFundingRate(Data storage self) internal view returns (int256) {
    return self.lastFundingRate +
        (currentFundingVelocity(self).mulDecimal(proportionalElapsed(self)));
}

function currentFundingVelocity(Data storage self) internal view returns (int256) {
    PerpsMarketConfiguration.Data storage marketConfig = PerpsMarketConfiguration.load(self.id);
    int256 maxFundingVelocity = marketConfig.maxFundingVelocity.toInt();
    int256 skewScale = marketConfig.skewScale.toInt();
    if (skewScale == 0) { return 0; }
    int256 pSkew = self.skew.divDecimal(skewScale);
    int256 pSkewBounded = MathUtil.min(
        MathUtil.max(-(DecimalMath.UNIT).toInt(), pSkew),
        (DecimalMath.UNIT).toInt()
    );
    return pSkewBounded.mulDecimal(maxFundingVelocity);
}

function proportionalElapsed(Data storage self) internal view returns (int256) {
    return (block.timestamp - self.lastFundingTime).divDecimal(1 days).toInt();
}
```

**Key details:**

- `proportionalElapsed` divides by `1 days` (86400), not by any other period.
- The negative sign on `avgFundingRate` means: positive skew (more longs) => longs pay shorts.
- `unrecordedFunding` is price-weighted: `avgRate * elapsed * price`. This means the accumulated
  funding value stored on-chain is in USD terms per unit of position size.
- v2 stored a "funding sequence" array, where each entry held the cumulative funding per base unit.
  A position recorded its `lastFundingIndex` into this array. The net funding owed was
  `(fundingSequence[current] - fundingSequence[position.lastIndex]) * position.size`.

### 2.2 Funding State Storage

**v2 pattern (PerpsV2MarketState):**
```solidity
// Funding sequence -- grows with each recompute
int128[] public fundingSequence;
int128 public fundingLastRecomputed;    // timestamp
int128 public fundingRateLastRecomputed; // rate at last recompute

struct Position {
    uint64 id;
    uint64 lastFundingIndex;  // <-- index into fundingSequence
    uint128 margin;
    uint128 lastPrice;
    int128 size;
}
```

**v3 pattern (PerpsMarket.Data + Position.Data):**
```solidity
// Market state
struct Data {
    int256 skew;
    uint256 size;
    int256 lastFundingRate;
    int256 lastFundingValue;   // accumulated funding per unit (price-weighted)
    uint256 lastFundingTime;
    int256 debtCorrectionAccumulator;
    mapping(uint256 => Position.Data) positions;
}

// Position state
struct Data {
    uint128 marketId;
    int128 size;
    uint128 latestInteractionPrice;
    int128 latestInteractionFunding;  // snapshot of lastFundingValue at entry
    uint256 latestInterestAccrued;
}
```

**Gotcha:** v3 eliminated the ever-growing funding sequence array. Instead it stores a single
`lastFundingValue` (cumulative) on the market, and each position snapshots
`latestInteractionFunding`. Funding PnL = `size * (currentFundingValue - positionFundingSnapshot)`.
This is O(1) instead of O(n). **Our CONTRACTS.md already uses this pattern -- confirmed correct.**

### 2.3 Fill Price / Price Impact

The fill price formula creates a linear premium/discount based on how the trade affects skew:

```
pd_before  = skew / skewScale
pd_after   = (skew + size) / skewScale
fillPrice  = price * (1 + pd_before + 1 + pd_after) / 2
           = price * (1 + (pd_before + pd_after) / 2)
```

**Solidity (from Synthetix v3 AsyncOrder.sol):**

```solidity
function calculateFillPrice(
    int256 skew, uint256 skewScale, int128 size, uint256 price
) internal pure returns (uint256) {
    if (skewScale == 0) { return price; }
    int256 pdBefore = skew.divDecimal(skewScale.toInt());
    int256 newSkew = skew + size;
    int256 pdAfter = newSkew.divDecimal(skewScale.toInt());
    int256 priceBefore = price.toInt() + (price.toInt().mulDecimal(pdBefore));
    int256 priceAfter = price.toInt() + (price.toInt().mulDecimal(pdAfter));
    return (priceBefore + priceAfter).toUint().divDecimal(DecimalMath.UNIT * 2);
}
```

**Gotcha:** This formula can return values below zero for extreme negative skews with a large short
order. Synthetix handles this with `.toUint()` which reverts on negative. For safety, we should add
an explicit `require(fillPrice > 0)` check.

### 2.4 Margin System

**v2** used isolated margin per position. Each position had its own `margin` field and was
independently liquidatable.

**v3** uses **cross-margin per account**. The `PerpsAccount` holds a mapping of collateral amounts
(multi-collateral support), and all positions share this margin:

```solidity
function getAvailableMargin(Data storage self, ...) internal view returns (int256) {
    int256 totalCollateralValue = getTotalCollateralValue(self, ...).toInt();
    int256 accountPnl = getAccountPnl(self, ...);
    return totalCollateralValue + accountPnl - self.debt.toInt();
}
```

**Margin requirement formula (v3 PerpsMarketConfiguration.sol):**

```solidity
// Initial margin = f(position impact on skew) + minimumPositionMargin
uint256 impactOnSkew = sizeAbs.divDecimal(skewScale);
initialMarginRatio = impactOnSkew * initialMarginRatioD18 + minimumInitialMarginRatioD18;
maintenanceMarginRatio = initialMarginRatio * maintenanceMarginScalarD18;
initialMargin = notional * initialMarginRatio + minimumPositionMargin;
maintenanceMargin = notional * maintenanceMarginRatio + minimumPositionMargin;
```

**Key insight:** The margin ratio is **position-size-dependent** -- larger positions relative to
skewScale require higher margin ratios. This prevents large positions from having excessive leverage.
Our CONTRACTS.md uses a flat `initialMarginRatio` per market. We should consider adopting the
size-dependent model for safety.

### 2.5 Liquidation Mechanics

**v3 liquidation flow:**

1. **Flag for liquidation:** If `availableMargin < maintenanceMargin + liquidationReward`, account
   is flagged. All collateral is seized. Debt is cleared.
2. **Liquidate positions:** Each position is reduced by up to `maxLiquidatableAmount` per window.
   The `maxLiquidatableAmount` is calculated from a rate limit:
   ```
   maxLiqInWindow = (makerFee + takerFee) * skewScale * maxLiqAccumMultiplier * windowSeconds
   ```
3. **Partial liquidation:** If position > maxLiquidatableAmount, only part is liquidated per
   transaction. This prevents massive market impact from single liquidation events.
4. **Endorsed liquidator:** A special address can bypass the rate limit and liquidate fully.
5. **Keeper rewards:** `keeperReward = max(min(flagReward, maxKeeperReward), minKeeperReward + gasCost)`

**Critical pattern: liquidation rate limiting.** Synthetix v3 limits how much can be liquidated
per time window to prevent cascading liquidations and oracle manipulation attacks.
Our current spec does not have this -- we should add it.

### 2.6 Debt Correction Accumulator

Synthetix v3 uses a `debtCorrectionAccumulator` to efficiently track the total market debt
(what the LP pool owes or is owed) without iterating over all positions:

```solidity
// When a position changes:
self.debtCorrectionAccumulator +=
    fundingDelta + notionalDelta + pricePnl + fundingPnl;

// Total market debt at any time:
function marketDebt(Data storage self, uint256 price) internal view returns (int256) {
    int256 positionPnl = self.skew.mulDecimal(price.toInt());
    int256 fundingPnl = self.skew.mulDecimal(calculateNextFunding(self, price));
    return positionPnl + fundingPnl - self.debtCorrectionAccumulator;
}
```

This is an O(1) calculation for the total debt the LP pool faces. Without this pattern, you would
need to iterate every position. **We need to implement this in our LiquidityPool contract.**

---

## 3. Synthetix v3 Perps

### 3.1 Architectural Differences from v2

| Aspect | v2 | v3 |
|--------|----|----|
| Proxy pattern | Diamond-like, split across 5+ contracts | Router proxy with modular UUPS |
| State storage | Separate `PerpsV2MarketState` contract | Library structs with `keccak256` slot pointers |
| Margin model | Isolated per position | Cross-margin per account |
| Collateral | sUSD only | Multi-collateral (any synth) |
| Funding storage | Growing `fundingSequence[]` array | Single `lastFundingValue` scalar |
| Order execution | Delayed orders with 2-step commit/settle | Async orders with Pyth settlement |
| Oracle | Chainlink + off-chain Pyth | Oracle Manager node with configurable feeds |
| Liquidation | Full liquidation only | Rate-limited partial liquidation |
| Interest rate | None | Utilization-based interest on locked OI |

### 3.2 Key v3 Patterns to Adopt

**1. Async Order Pattern (commit/settle):**
```
User commits order -> order stored with timestamp
Keeper settles order -> Pyth price fetched at commitment time + delay
```
This two-step flow prevents front-running of oracle updates. The settlement strategy specifies
`commitmentPriceDelay`, `settlementDelay`, and `settlementWindowDuration`.

**2. Multi-collateral with discounted valuation:**
v3 values non-USD collateral at a discount when checking available margin:
```solidity
(amountToAdd, ) = PerpsCollateralConfiguration.load(collateralId).valueInUsd(
    amount, spotMarket, stalenessTolerance, useDiscountedValue
);
```
For our MVP with only tUSDI, this is not needed, but good to know for future.

**3. Utilization-based interest rate:**
v3 charges interest on locked OI proportional to pool utilization:
```
utilization = lockedCredit / delegatedCollateral
rate = lowGradient * utilization * 100       (if util < breakpoint)
rate = lowGradient*breakpoint + highGradient*(util - breakpoint) * 100  (if util >= breakpoint)
```
This incentivizes LP deposits when OI is high. **Consider for our LiquidityPool.**

**4. Market capacity validation:**
Before allowing position increases, v3 checks:
```solidity
int256 lockedCreditDelta = perpsMarketData.requiredCreditForSize(
    newMagnitude.toInt() - oldMagnitude.toInt(), ...
);
GlobalPerpsMarket.load().validateMarketCapacity(lockedCreditDelta);
```
This ensures the LP pool has enough collateral to back the new OI. We need this.

**5. Position size validation with per-side caps:**
```solidity
// long side = (marketSize + skew) / 2
// short side = (marketSize - skew) / 2
// each side has a maxMarketSize and maxMarketValue cap
```
Our spec uses `maxMarketSkew` but should also have per-side OI caps in units and USD.

### 3.3 What NOT to Adopt

- **Diamond/router proxy complexity:** Overkill for our 2-market MVP. Simple proxy suffices.
- **Oracle Manager:** They built an entire oracle aggregation layer. We use a simpler signed-price oracle.
- **Multi-collateral:** Not needed for MVP with single tUSDI collateral.
- **Rewards distributor for liquidation:** Too complex for testnet; simple keeper bounty is fine.

---

## 4. GMX v2 Pool Mechanics

### 4.1 Pool Value Calculation

GMX v2 uses a dual-token pool (long token + short token). Pool value is calculated as:

```
poolValue = longTokenUsd + shortTokenUsd
          + pendingBorrowingFees * borrowingFeePoolFactor
          - netPnl(long, capped)
          - netPnl(short, capped)
          - impactPoolUsd
          + lentImpactPoolUsd
```

**Key insight:** Trader PnL is **subtracted** from pool value. When traders profit, the pool shrinks.
When traders lose, the pool grows. This is the fundamental "pool as counterparty" mechanic.

### 4.2 PnL Capping (Critical for LP Protection)

GMX caps the positive PnL that traders can extract from the pool:

```solidity
function getCappedPnl(...) internal view returns (int256) {
    if (pnl < 0) { return pnl; }  // losses are never capped
    uint256 maxPnlFactor = getMaxPnlFactor(dataStore, pnlFactorType, market, isLong);
    int256 maxPnl = Precision.applyFactor(poolUsd, maxPnlFactor).toInt256();
    return pnl > maxPnl ? maxPnl : pnl;
}
```

Different cap levels serve different purposes:
- `MAX_PNL_FACTOR_FOR_TRADERS` -- caps actual payouts to traders
- `MAX_PNL_FACTOR_FOR_ADL` -- triggers auto-deleveraging when exceeded
- `MAX_PNL_FACTOR_FOR_DEPOSITS` -- affects LP token pricing for deposits
- `MAX_PNL_FACTOR_FOR_WITHDRAWALS` -- affects LP token pricing for withdrawals

### 4.3 Auto-Deleveraging (ADL)

When `pnlToPoolFactor > MAX_PNL_FACTOR_FOR_ADL`, GMX enables ADL:

1. A keeper calls `updateAdlState()` to flag that ADL is needed
2. `createAdlOrder()` creates a `MarketDecrease` order against the most profitable positions
3. Positions are force-closed at market price with no slippage protection

**ADL protects the LP pool from insolvency when trader profits exceed what the pool can pay.**
This is the equivalent of "socialized losses" in centralized exchanges.

### 4.4 GMX Funding Model (Adaptive)

GMX uses a more complex adaptive funding model than Synthetix:

```solidity
// Two modes:
// 1. Static: fundingRate = diffUsdToOIFactor * fundingFactor (capped at max)
// 2. Adaptive: savedFundingFactorPerSecond increases/decreases based on:
//    - If skew > thresholdForStableFunding: increase rate
//    - If skew < thresholdForDecreaseFunding: decrease rate
//    - If skew direction changed: increase in opposite direction
```

The adaptive model has three zones:
- **Above stable threshold:** Funding rate accelerates (velocity increases)
- **Between decrease and stable thresholds:** Funding rate holds steady
- **Below decrease threshold:** Funding rate decelerates toward zero

**For our MVP, the Synthetix velocity model is simpler and sufficient.** The GMX adaptive model
adds configurability but complexity. Consider for v2.

### 4.5 GMX Position Struct

```solidity
struct Numbers {
    uint256 sizeInUsd;
    uint256 sizeInTokens;          // tracks entry price implicitly
    uint256 collateralAmount;
    int256 pendingImpactAmount;     // stored price impact for later settlement
    uint256 borrowingFactor;
    uint256 fundingFeeAmountPerSize;
    uint256 longTokenClaimableFundingAmountPerSize;
    uint256 shortTokenClaimableFundingAmountPerSize;
    uint256 increasedAtTime;
    uint256 decreasedAtTime;
}
```

**Key insight:** GMX stores `sizeInTokens` separately from `sizeInUsd`. This means PnL is
`sizeInTokens * currentPrice - sizeInUsd`. This is more gas-efficient than storing an entry price
because you avoid a division. Our spec stores `lastFillPrice` which requires multiplication at PnL
time; consider whether `sizeInNotional` is better.

---

## 5. Oracle Patterns

### 5.1 Our Current Oracle Design

Our CONTRACTS.md specifies a custom signed-price oracle where an off-chain server signs prices
and on-chain verification uses `ecrecover`. This is the correct approach for a custom testnet
where Pyth/Chainlink may not be available.

### 5.2 Pyth Pull Oracle Pattern

Pyth uses a pull model where users submit price update data with their transactions:

```solidity
// User submits priceUpdate bytes along with their trade
function trade(bytes[] calldata priceUpdate, ...) external payable {
    uint fee = pyth.getUpdateFee(priceUpdate);
    pyth.updatePriceFeeds{value: fee}(priceUpdate);
    PythStructs.Price memory price = pyth.getPriceNoOlderThan(feedId, 60);
    // ... execute trade with price.price
}
```

This means the oracle update and trade happen atomically. No separate oracle-update transaction.

### 5.3 EIP-712 Signed Price Pattern (Recommended for Terraform)

For our custom oracle, use EIP-712 typed data for gas-efficient signature verification:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract PriceOracle is EIP712 {
    using ECDSA for bytes32;

    address public signer;

    // EIP-712 type hash for price data
    bytes32 public constant PRICE_TYPEHASH = keccak256(
        "PriceUpdate(bytes32 marketId,uint256 price,uint256 timestamp,uint256 nonce)"
    );

    // Track used nonces to prevent replay
    mapping(uint256 => bool) public usedNonces;

    // Staleness threshold
    uint256 public maxStaleness = 60; // seconds

    constructor(address _signer) EIP712("TerraformOracle", "1") {
        signer = _signer;
    }

    struct PriceUpdate {
        bytes32 marketId;
        uint256 price;
        uint256 timestamp;
        uint256 nonce;
    }

    /// @notice Verify and consume a signed price update
    /// @dev Uses EIP-712 typed data for gas efficiency (~3000 gas for ecrecover)
    function verifyPrice(
        PriceUpdate calldata update,
        bytes calldata signature
    ) external returns (uint256 price) {
        // 1. Check staleness
        require(block.timestamp - update.timestamp <= maxStaleness, "StalePrice");
        require(update.timestamp <= block.timestamp, "FuturePrice");

        // 2. Check nonce hasn't been used (replay protection)
        require(!usedNonces[update.nonce], "NonceUsed");
        usedNonces[update.nonce] = true;

        // 3. Verify signature
        bytes32 structHash = keccak256(abi.encode(
            PRICE_TYPEHASH,
            update.marketId,
            update.price,
            update.timestamp,
            update.nonce
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, signature);
        require(recovered == signer, "InvalidSignature");

        // 4. Store and return
        return update.price;
    }
}
```

**Gas costs:**
- `ecrecover` precompile: ~3,000 gas
- `keccak256` for struct hash: ~30 gas per 32 bytes
- Total signature verification: ~5,000-6,000 gas
- This is much cheaper than Pyth's Wormhole verification (~50,000+ gas)

**Security considerations for signed oracle:**
- Nonce tracking prevents replay attacks
- Staleness check prevents stale prices
- Future timestamp check prevents pre-signed manipulation
- Single signer is a centralization risk -- acceptable for testnet, consider multi-sig for mainnet

### 5.4 Alternative: Batch Price Updates

For gas efficiency when updating multiple markets in one transaction:

```solidity
bytes32 public constant BATCH_PRICE_TYPEHASH = keccak256(
    "BatchPriceUpdate(bytes32[] marketIds,uint256[] prices,uint256 timestamp,uint256 nonce)"
);

function verifyBatchPrices(
    bytes32[] calldata marketIds,
    uint256[] calldata prices,
    uint256 timestamp,
    uint256 nonce,
    bytes calldata signature
) external {
    require(marketIds.length == prices.length, "LengthMismatch");
    require(block.timestamp - timestamp <= maxStaleness, "StalePrice");
    require(!usedNonces[nonce], "NonceUsed");
    usedNonces[nonce] = true;

    bytes32 structHash = keccak256(abi.encode(
        BATCH_PRICE_TYPEHASH,
        keccak256(abi.encodePacked(marketIds)),
        keccak256(abi.encodePacked(prices)),
        timestamp,
        nonce
    ));
    bytes32 digest = _hashTypedDataV4(structHash);
    require(ECDSA.recover(digest, signature) == signer, "InvalidSignature");

    for (uint i = 0; i < marketIds.length; i++) {
        _storePrice(marketIds[i], prices[i], timestamp);
    }
}
```

---

## 6. Security Patterns

### 6.1 Known Attack Vectors for Perps DEXes

| Attack | Description | Real-world Loss |
|--------|-------------|----------------|
| Oracle manipulation | Feeding incorrect prices to extract PnL | KiloEx: $7.5M (Apr 2025) |
| Flash loan + oracle | Manipulate on-chain oracle, open position, profit | $403M in 2022 alone |
| Funding rate manipulation | Artificially skew market to extract funding | ALPACA, TRB incidents |
| Liquidation cascading | Trigger chain of liquidations for profit | Multiple DeFi events |
| Front-running oracle updates | See oracle tx in mempool, trade before update | Ongoing MEV issue |
| Reentrancy on settlement | Re-enter during PnL settlement to double-claim | Multiple DeFi hacks |

### 6.2 Oracle Manipulation Mitigations

**1. Signed oracle with staleness check (our approach):**
```solidity
require(block.timestamp - priceTimestamp <= MAX_STALENESS, "StalePrice");
require(priceTimestamp <= block.timestamp, "FutureTimestamp");
```

**2. Price deviation circuit breaker:**
```solidity
uint256 lastPrice = markets[marketId].lastOraclePrice;
if (lastPrice > 0) {
    uint256 deviation = MathLib.abs(int256(newPrice) - int256(lastPrice));
    uint256 maxDeviation = MathLib.wadMul(lastPrice, MAX_PRICE_DEVIATION); // e.g., 10%
    require(deviation <= maxDeviation, "PriceDeviationExceeded");
}
```

**3. Minimum order delay (anti-frontrunning):**
Synthetix v3 requires a minimum delay between order commitment and settlement:
```solidity
// Order committed at block N
// Settlement only allowed at block N + settlementDelay
// Settlement window expires at block N + settlementDelay + windowDuration
```
This ensures the oracle price used for settlement was not known at commitment time.

### 6.3 Funding Rate Manipulation Mitigations

**Attack:** Attacker opens a massive position to skew the market, then opens an opposite position
on another venue to collect the funding rate differential.

**Mitigations:**
1. **Max market skew cap** -- limits how far the market can be skewed (our `maxMarketSkew`)
2. **Per-side OI limits** -- caps long and short OI independently
3. **Size-dependent margin** -- larger positions require higher margin ratios (Synthetix v3 pattern)
4. **Minimum position size** -- prevents dust positions from manipulating funding

### 6.4 Liquidation Security

**1. Rate-limited liquidation (Synthetix v3 pattern):**
```solidity
// Maximum liquidation per window = (makerFee + takerFee) * skewScale * multiplier * windowSec
// Prevents single-tx mass liquidation that would crash the market
function maxLiquidatableAmount(Data storage self, uint128 requestedAmount)
    internal returns (uint128 liquidatableAmount) {
    (uint256 capacity, , ) = currentLiquidationCapacity(self, marketConfig);
    liquidatableAmount = MathUtil.min128(capacity.to128(), requestedAmount);
}
```

**2. Liquidation reward must be included in margin requirement:**
```solidity
// Total required = initialMargin + possibleLiquidationReward
// This prevents positions that are immediately unprofitable to liquidate
isEligible = (requiredMaintenanceMargin + liquidationReward).toInt() > availableMargin;
```

**3. Non-reentrancy on liquidation:**
```solidity
// Use OpenZeppelin ReentrancyGuard on all state-modifying functions:
// - openPosition / modifyPosition / closePosition
// - liquidate
// - deposit / withdraw
// - settle funding
```

### 6.5 Integer Overflow/Underflow in Signed Math

Solidity 0.8+ has built-in overflow protection, but signed position math has specific risks:

**1. Signed multiplication overflow:**
```solidity
// int256.min * -1 overflows. Use checked math or handle explicitly:
function abs(int256 x) internal pure returns (uint256) {
    return x >= 0 ? uint256(x) : uint256(-x);  // Reverts if x == type(int256).min
}
```

**2. Funding accumulation precision loss:**
When funding per unit is very small and position size is very large (or vice versa),
multiplication can lose precision. Use `mulDiv` patterns or higher-precision intermediaries.

**3. Price impact can produce zero or negative fill prices:**
```solidity
// If skew is very negative and order further increases short skew:
// fillPrice = price * (1 + negative_pd) could go negative
// Always validate: require(fillPrice > 0, "InvalidFillPrice");
```

### 6.6 Withdrawal Delay

Both Synthetix and GMX implement withdrawal delays to prevent flash-loan-style attacks:

```solidity
// On deposit:
account.lastDepositTime = block.timestamp;

// On withdraw:
require(block.timestamp - account.lastDepositTime >= WITHDRAWAL_DELAY, "WithdrawalTooSoon");
```

Our CONTRACTS.md already has a 24-hour withdrawal delay. Good.

### 6.7 Reentrancy Specific to Perps

The most dangerous reentrancy vector in perps is:

```
1. Trader calls closePosition()
2. During PnL settlement, profit is sent as ERC-20 transfer
3. If the collateral token has a callback (ERC-777, hooks), attacker re-enters
4. On re-entry, state is inconsistent (position closed but collateral not yet updated)
```

**Mitigation:** Always use the checks-effects-interactions pattern AND `nonReentrant` modifier.
Since tUSDI is a standard ERC-20 without hooks, this risk is lower but should still be guarded.

---

## 7. Specific Recommendations for Terraform

Based on this research, here are concrete changes and additions for our CONTRACTS.md spec:

### 7.1 MUST IMPLEMENT (Critical Safety)

1. **Add debt correction accumulator to LiquidityPool:**
   Track `debtCorrectionAccumulator` (int256) to compute total market debt in O(1).
   Update it on every position change: `accumulator += fundingDelta + notionalDelta + pricePnl + fundingPnl`.
   This prevents the need to iterate all positions to compute pool health.

2. **Add PnL-to-pool ratio cap and ADL mechanism:**
   ```solidity
   uint256 public maxPnlToPoolRatio = 0.45e18; // 45% of pool
   // When exceeded, enable auto-deleveraging of most profitable positions
   ```

3. **Add liquidation rate limiting:**
   ```solidity
   uint256 public maxLiquidationPerWindow;    // max units liquidatable per window
   uint256 public liquidationWindowSeconds;    // window duration (e.g., 30 minutes)
   mapping(bytes32 => LiquidationWindow[]) liquidationHistory;
   ```

4. **Include liquidation reward in margin requirement check:**
   When validating a new position, require:
   `availableMargin >= initialMargin + orderFees + estimatedLiquidationReward`

5. **Add fill price validity check:**
   ```solidity
   uint256 fillPrice = PricingLib.calculateFillPrice(params);
   require(fillPrice > 0, "InvalidFillPrice");
   ```

6. **Add price deviation circuit breaker:**
   ```solidity
   uint256 public maxPriceDeviation = 0.1e18; // 10% max change per update
   ```

### 7.2 SHOULD IMPLEMENT (Strong Recommendations)

7. **Size-dependent initial margin ratio (Synthetix v3 pattern):**
   ```solidity
   uint256 impactOnSkew = absSize.wadDiv(skewScale);
   uint256 initialMarginRatio = impactOnSkew.wadMul(initialMarginRatioD18) + minimumInitialMarginRatio;
   ```
   This makes large positions require proportionally more margin, limiting leverage for whales.

8. **Per-side OI caps (not just net skew cap):**
   ```solidity
   uint256 public maxLongOI;   // max total long open interest
   uint256 public maxShortOI;  // max total short open interest
   // These are independent of skew -- prevents one-sided buildup even when skew is balanced
   ```

9. **Async order pattern (commit/settle with minimum delay):**
   Even with a signed oracle, implement a minimum delay between order submission and execution
   to prevent oracle front-running:
   ```solidity
   uint256 public minOrderAge = 2; // blocks or seconds
   ```

10. **Market capacity validation against LP pool:**
    Before allowing position increases, check:
    ```solidity
    uint256 requiredCredit = totalOI.wadMul(price).wadMul(lockedOiRatio);
    require(requiredCredit <= lpPoolValue, "InsufficientLPCapacity");
    ```

### 7.3 CONSIDER FOR V2 (Nice-to-Have)

11. **Utilization-based interest rate on locked OI:**
    Charge traders interest proportional to pool utilization. This creates additional LP yield
    and discourages excessive OI relative to pool size.

12. **Endorsed liquidator address:**
    A trusted bot that can bypass rate limits for full liquidations. Useful for emergency scenarios.

13. **Maker/taker fee split for skew-crossing orders:**
    When an order crosses zero skew, the portion reducing skew pays maker fee and the portion
    increasing skew in the new direction pays taker fee. Synthetix v3 `calculateOrderFee()` handles
    this -- our current spec uses a simpler single-fee approach.

14. **Multi-collateral support:**
    Not needed for tUSDI-only MVP but the storage pattern should accommodate it. Use
    `mapping(address => uint256) collateralAmounts` instead of a single `uint256 collateral`.

### 7.4 Struct Layout Recommendations

Based on Synthetix v3 patterns, our Position struct should be:

```solidity
struct Position {
    bytes32 marketId;
    int128 size;                    // Use int128 to pack with marketId in one slot
    uint128 latestInteractionPrice; // WAD, fill price at last modification
    int128 latestInteractionFunding;// Snapshot of accumulated funding per unit
    uint256 lastSettledAt;          // Timestamp of last interaction
}
```

Using `int128` for size and funding fits two values in one storage slot, saving ~20,000 gas
per position update. Synthetix v3 uses this exact pattern.

Market state struct:
```solidity
struct MarketState {
    int256 skew;                       // Net skew (longs - shorts)
    uint256 size;                      // Total absolute OI
    int256 lastFundingRate;            // Funding rate at last recompute
    int256 lastFundingValue;           // Accumulated funding per unit (price-weighted)
    uint256 lastFundingTime;           // Timestamp of last funding recompute
    int256 debtCorrectionAccumulator;  // For O(1) market debt calculation
}
```

### 7.5 Gas Optimization Notes

From the studied codebases:

1. **Use `mulDecimal`/`divDecimal` consistently** -- Synthetix v3 uses these for all WAD math.
   They are `(a * b) / 1e18` and `(a * 1e18) / b` respectively. Same as our `wadMul`/`wadDiv`.

2. **Storage slot packing matters** -- Position data is hot path. Pack fields to minimize SSTORE costs.
   `int128 size + uint128 price` = one slot. `int128 funding + uint128 timestamp` = one slot.

3. **Avoid unbounded loops** -- Neither Synthetix v3 nor GMX iterates over all positions in core paths.
   Use accumulators (debt correction, funding per unit) for O(1) global calculations.

4. **Batch oracle updates** -- Our oracle should accept batch price updates in a single signature
   to reduce gas when multiple markets need updating.

---

## Sources

### Synthetix
- [Synthetix v3 perps-market source code](https://github.com/Synthetixio/synthetix-v3/tree/main/markets/perps-market/contracts)
- [Synthetix Perps Dynamic Funding Rates (Blog)](https://blog.synthetix.io/synthetix-perps-dynamic-funding-rates/)
- [Synthetix V3 Markets Guide (Blog)](https://blog.synthetix.io/synthetix-v3-markets-a-comprehensive-guide/)
- [Synthetix Developer Docs](https://docs.synthetix.io/developer-docs/for-derivatives-market-builders/market-development-guide)

### GMX
- [GMX v2 Synthetics source code](https://github.com/gmx-io/gmx-synthetics)

### Oracle
- [Pyth EVM Integration Guide](https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/evm)
- [EIP-712 Specification](https://eips.ethereum.org/EIPS/eip-712)
- [Pyth Solidity SDK](https://github.com/pyth-network/pyth-sdk-solidity)

### Security
- [Perp DEX Architecture and Security (QuillAudits)](https://www.quillaudits.com/blog/dex/perp-dex-architecture-and-security)
- [Top 10 Smart Contract Vulnerabilities 2025 (Hacken)](https://hacken.io/discover/smart-contract-vulnerabilities/)
- [KiloEx Oracle Exploit Analysis](https://www.quillaudits.com/blog/dex/perp-dex-architecture-and-security)

### Kwenta
- [Kwenta GitHub](https://github.com/Kwenta/kwenta)
- [Kwenta Subgraph](https://github.com/Kwenta/kwenta-subgraph)
