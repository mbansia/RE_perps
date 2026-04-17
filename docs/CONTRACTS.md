# Terraform -- Contract Specifications

> Perpetual-futures DEX on Integra Testnet (Chain ID 26218, Solidity 0.8.24+).
> Users trade synthetic perps on city-level real estate price indices (NYC, Dubai).
> Collateral: tUSDI (ERC-20, `0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f`, 18 decimals).
> Modeled after Parcl v3.

---

## Table of Contents

1. [Global Constants and Types](#1-global-constants-and-types)
2. [libraries/MathLib.sol](#2-librariesmathLibsol)
3. [libraries/FundingLib.sol](#3-librariesfundingLibsol)
4. [libraries/PricingLib.sol](#4-librariespricingLibsol)
5. [interfaces/IPriceOracle.sol](#5-interfacesipriceoraclesol)
6. [core/PriceOracle.sol](#6-corepriceoraclesol)
7. [interfaces/IMarketManager.sol](#7-interfacesimarketmanagersol)
8. [core/MarketManager.sol](#8-coremarketmanagersol)
9. [core/LPToken.sol](#9-corelptokensol)
10. [interfaces/ILiquidityPool.sol](#10-interfacesiliquiditypoolsol)
11. [core/LiquidityPool.sol](#11-coreliquiditypoolsol)
12. [interfaces/IPerpEngine.sol](#12-interfacesiperpenginesso)
13. [core/PerpEngine.sol](#13-coreperpenginessol)
14. [mocks/MockOracle.sol](#14-mocksmockoraclesol)
15. [Deployment Specification](#15-deployment-specification)
16. [Inheritance Map](#16-inheritance-map)
17. [Key Invariants (System-Wide)](#17-key-invariants-system-wide)

---

## 1. Global Constants and Types

These types and constants are shared across contracts. They are defined in the contracts that own them but referenced everywhere.

### WAD Arithmetic

All fixed-point math uses **WAD = 1e18**. Prices, ratios, funding rates, and token amounts are all 18-decimal fixed-point unless noted otherwise.

### Shared Structs

```solidity
/// @notice Represents a single perpetual position for one market
struct Position {
    /// @dev Market identifier (e.g., keccak256("NYC"), keccak256("DUBAI"))
    bytes32 marketId;
    /// @dev Signed size in sqft -- positive = long, negative = short
    int256 size;
    /// @dev Fill price at which the position was last opened or modified (WAD)
    uint256 lastFillPrice;
    /// @dev Accumulated funding per unit at the time of last settlement (WAD, signed)
    int256 lastFundingPerUnit;
    /// @dev Timestamp of last settlement
    uint256 lastSettledAt;
}

/// @notice Represents a trader's cross-margin account
struct Account {
    /// @dev tUSDI collateral deposited (WAD)
    uint256 collateral;
    /// @dev Mapping of marketId => Position (stored on-chain as array, max 12)
    Position[] positions;
    /// @dev Timestamp of last collateral deposit (for 24h withdrawal delay)
    uint256 lastDepositTime;
    /// @dev Whether this is the user's first trade (for XP bonus)
    bool hasTraded;
}

/// @notice Configuration parameters for a single market
struct MarketConfig {
    /// @dev Human-readable name (e.g., "NYC", "DUBAI")
    string name;
    /// @dev Unique market identifier: keccak256(abi.encodePacked(name))
    bytes32 marketId;
    /// @dev Scale factor for skew impact on price (WAD) -- higher = less impact
    uint256 skewScale;
    /// @dev Maximum daily funding rate velocity (WAD, e.g., 0.1e18 = 10%/day max)
    uint256 maxFundingVelocity;
    /// @dev Taker fee rate (WAD, e.g., 0.001e18 = 0.1%)
    uint256 takerFeeRate;
    /// @dev Maker fee rate (WAD, e.g., 0.0005e18 = 0.05%)
    uint256 makerFeeRate;
    /// @dev Initial margin ratio (WAD, e.g., 0.1e18 = 10%)
    uint256 initialMarginRatio;
    /// @dev Maintenance margin ratio (WAD, e.g., 0.05e18 = 5%)
    uint256 maintenanceMarginRatio;
    /// @dev Liquidation fee rate (WAD, e.g., 0.01e18 = 1%)
    uint256 liquidationFeeRate;
    /// @dev Minimum position margin in tUSDI (WAD)
    uint256 minPositionMargin;
    /// @dev Maximum absolute skew allowed (WAD, in sqft)
    uint256 maxMarketSkew;
    /// @dev Whether trading is enabled
    bool active;
}

/// @notice Snapshot of funding state for a market
struct FundingState {
    /// @dev Current funding rate (WAD, signed -- positive = longs pay shorts)
    int256 currentFundingRate;
    /// @dev Accumulated funding per unit of position size (WAD, signed)
    int256 accumulatedFundingPerUnit;
    /// @dev Timestamp of last funding update
    uint256 lastUpdatedAt;
}

/// @notice Stores a signed price update from the oracle
struct PriceData {
    /// @dev Price in WAD (e.g., 350e18 = $350/sqft)
    uint256 price;
    /// @dev Timestamp the price was observed off-chain
    uint256 timestamp;
    /// @dev Block number at submission
    uint256 blockNumber;
}
```

### XP Event (emitted by PerpEngine and LiquidityPool)

```solidity
/// @notice Emitted when a user earns XP through an on-chain action
/// @param user The address earning XP
/// @param actionType String identifier for the action
/// @param points XP points earned
event XPAction(address indexed user, string actionType, uint256 points);
```

### XP Point Table

| Action | `actionType` String | Points |
|--------|---------------------|--------|
| First trade ever | `"FIRST_TRADE"` | 200 |
| Open position | `"OPEN_POSITION"` | 100 |
| Close position | `"CLOSE_POSITION"` | 75 |
| LP deposit | `"LP_DEPOSIT"` | 100 |
| LP withdrawal | `"LP_WITHDRAW"` | 50 |
| Liquidation caller | `"LIQUIDATION"` | 150 |

---

## 2. libraries/MathLib.sol

Signed fixed-point arithmetic library. All values use WAD = 1e18.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MathLib
/// @notice Signed and unsigned fixed-point math utilities (WAD = 1e18)
/// @dev All functions are pure/internal. No state. No reverts on overflow
///      beyond Solidity's built-in checked arithmetic.
library MathLib {

    // ---------------------------------------------------------------
    //  Constants
    // ---------------------------------------------------------------

    /// @notice 1.0 in WAD representation
    uint256 internal constant WAD = 1e18;

    /// @notice Signed 1.0 in WAD representation
    int256 internal constant WAD_INT = 1e18;

    /// @notice Number of seconds in one day (for funding calculations)
    uint256 internal constant SECONDS_PER_DAY = 86_400;

    // ---------------------------------------------------------------
    //  Unsigned WAD math
    // ---------------------------------------------------------------

    /// @notice Multiply two WAD values: (a * b) / WAD
    /// @param a First operand (WAD)
    /// @param b Second operand (WAD)
    /// @return result Product in WAD
    function wadMul(uint256 a, uint256 b) internal pure returns (uint256 result);

    /// @notice Divide two WAD values: (a * WAD) / b
    /// @param a Numerator (WAD)
    /// @param b Denominator (WAD, must be > 0)
    /// @return result Quotient in WAD
    function wadDiv(uint256 a, uint256 b) internal pure returns (uint256 result);

    // ---------------------------------------------------------------
    //  Signed WAD math
    // ---------------------------------------------------------------

    /// @notice Signed multiply: (a * b) / WAD_INT
    /// @param a First operand (signed WAD)
    /// @param b Second operand (signed WAD)
    /// @return result Product in signed WAD
    function wadMulSigned(int256 a, int256 b) internal pure returns (int256 result);

    /// @notice Signed divide: (a * WAD_INT) / b
    /// @param a Numerator (signed WAD)
    /// @param b Denominator (signed WAD, must be != 0)
    /// @return result Quotient in signed WAD
    function wadDivSigned(int256 a, int256 b) internal pure returns (int256 result);

    // ---------------------------------------------------------------
    //  Utility
    // ---------------------------------------------------------------

    /// @notice Absolute value of a signed integer
    /// @param x Input value
    /// @return Absolute value as unsigned
    function abs(int256 x) internal pure returns (uint256);

    /// @notice Safe cast int256 to uint256, reverts if negative
    /// @param x Input (must be >= 0)
    /// @return Unsigned value
    function toUint256(int256 x) internal pure returns (uint256);

    /// @notice Safe cast uint256 to int256, reverts if > type(int256).max
    /// @param x Input
    /// @return Signed value
    function toInt256(uint256 x) internal pure returns (int256);

    /// @notice Clamp a signed value between min and max
    /// @param value The value to clamp
    /// @param minVal Lower bound
    /// @param maxVal Upper bound
    /// @return Clamped value
    function clamp(int256 value, int256 minVal, int256 maxVal) internal pure returns (int256);

    /// @notice Return the smaller of two unsigned values
    /// @param a First value
    /// @param b Second value
    /// @return Minimum
    function min(uint256 a, uint256 b) internal pure returns (uint256);

    /// @notice Return the larger of two unsigned values
    /// @param a First value
    /// @param b Second value
    /// @return Maximum
    function max(uint256 a, uint256 b) internal pure returns (uint256);
}
```

### Key Invariants

- `wadMul(a, WAD) == a` for all `a`
- `wadDiv(a, WAD) == a` for all `a`
- `abs(x) >= 0` always
- `clamp(v, lo, hi)` always returns a value in `[lo, hi]`
- All functions revert on overflow/underflow (Solidity 0.8+ checked math)

---

## 3. libraries/FundingLib.sol

Velocity-based funding rate calculation, closely following Parcl v3.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MathLib} from "./MathLib.sol";

/// @title FundingLib
/// @notice Computes velocity-based funding rates and per-unit funding deltas
/// @dev Funding rate changes proportionally to skew. Accumulated funding is
///      the integral of fundingRate * indexPrice over time.
///
///      Core formulas:
///        fundingVelocity = clamp(skew / skewScale, -1, 1) * maxFundingVelocity
///        newFundingRate  = currentFundingRate + fundingVelocity * elapsedDays
///        avgFundingRate  = (currentFundingRate + newFundingRate) / 2
///        deltaFunding    = avgFundingRate * indexPrice * elapsedDays
///
///      Positive funding rate => longs pay shorts.
///      Negative funding rate => shorts pay longs.
///      Excess flows to/from LP pool.
library FundingLib {

    // ---------------------------------------------------------------
    //  Structs
    // ---------------------------------------------------------------

    /// @notice Input parameters for a funding calculation
    struct FundingParams {
        /// @dev Current net skew of the market (signed sqft, WAD)
        int256 skew;
        /// @dev Market skew scale parameter (WAD)
        uint256 skewScale;
        /// @dev Maximum funding rate velocity per day (WAD)
        uint256 maxFundingVelocity;
        /// @dev Current funding rate (signed WAD)
        int256 currentFundingRate;
        /// @dev Current accumulated funding per unit (signed WAD)
        int256 accumulatedFundingPerUnit;
        /// @dev Last update timestamp (seconds)
        uint256 lastUpdatedAt;
        /// @dev Current timestamp (seconds)
        uint256 currentTimestamp;
        /// @dev Current index price (WAD)
        uint256 indexPrice;
    }

    /// @notice Result of a funding calculation
    struct FundingResult {
        /// @dev New funding rate after this update (signed WAD)
        int256 newFundingRate;
        /// @dev New accumulated funding per unit (signed WAD)
        int256 newAccumulatedFundingPerUnit;
        /// @dev Delta funding per unit since last update (signed WAD)
        int256 deltaFundingPerUnit;
    }

    // ---------------------------------------------------------------
    //  Functions
    // ---------------------------------------------------------------

    /// @notice Calculate the funding velocity based on current skew
    /// @dev velocity = clamp(skew / skewScale, -1, 1) * maxFundingVelocity
    /// @param skew Current net market skew (signed WAD)
    /// @param skewScale Market skew scale parameter (WAD)
    /// @param maxFundingVelocity Maximum funding velocity per day (WAD)
    /// @return velocity Funding velocity per day (signed WAD)
    function calculateFundingVelocity(
        int256 skew,
        uint256 skewScale,
        uint256 maxFundingVelocity
    ) internal pure returns (int256 velocity);

    /// @notice Calculate updated funding state for a market
    /// @dev Computes new funding rate, accumulated funding per unit, and delta
    /// @param params Funding calculation parameters
    /// @return result Updated funding state
    function calculateFunding(
        FundingParams memory params
    ) internal pure returns (FundingResult memory result);

    /// @notice Calculate a position's unrealized funding PnL
    /// @dev fundingPnL = positionSize * (currentAccumulatedFunding - positionLastFunding)
    /// @param positionSize Signed position size in sqft (WAD)
    /// @param currentAccumulatedFunding Current accumulated funding per unit (signed WAD)
    /// @param positionLastFunding Position's last recorded accumulated funding (signed WAD)
    /// @return fundingPnL Signed funding PnL in tUSDI (WAD)
    function calculateFundingPnL(
        int256 positionSize,
        int256 currentAccumulatedFunding,
        int256 positionLastFunding
    ) internal pure returns (int256 fundingPnL);
}
```

### Key Invariants

- When `skew == 0`, funding velocity is zero (balanced market has no funding drift)
- Funding velocity is clamped: `|velocity| <= maxFundingVelocity`
- `deltaFundingPerUnit` is zero when `elapsedTime == 0`
- Funding PnL is zero for a freshly opened position (`currentAccumulatedFunding == positionLastFunding`)
- Net funding across all positions flows to/from the LP pool (zero-sum between traders + LP)

---

## 4. libraries/PricingLib.sol

Skew-adjusted fill price calculation for perpetual trades.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MathLib} from "./MathLib.sol";

/// @title PricingLib
/// @notice Computes skew-adjusted fill prices and trade fees
/// @dev Fill price formula (Parcl v3):
///        preBias  = indexPrice * (1 + skew / skewScale)
///        postBias = indexPrice * (1 + (skew + tradeSize) / skewScale)
///        fillPrice = (preBias + postBias) / 2
///
///      Trades that reduce skew get better prices.
///      Trades that increase skew pay a premium.
library PricingLib {

    // ---------------------------------------------------------------
    //  Structs
    // ---------------------------------------------------------------

    /// @notice Parameters for a fill price calculation
    struct FillPriceParams {
        /// @dev Current index price from oracle (WAD)
        uint256 indexPrice;
        /// @dev Current net market skew before this trade (signed sqft, WAD)
        int256 currentSkew;
        /// @dev Trade size -- positive = buy/long, negative = sell/short (signed sqft, WAD)
        int256 tradeSize;
        /// @dev Market skew scale parameter (WAD)
        uint256 skewScale;
    }

    /// @notice Parameters for a fee calculation
    struct FeeParams {
        /// @dev Notional value of the trade (WAD)
        uint256 notional;
        /// @dev Current market skew before trade (signed WAD)
        int256 currentSkew;
        /// @dev Trade size (signed WAD)
        int256 tradeSize;
        /// @dev Taker fee rate (WAD)
        uint256 takerFeeRate;
        /// @dev Maker fee rate (WAD)
        uint256 makerFeeRate;
    }

    /// @notice Result of a fee calculation
    struct FeeResult {
        /// @dev Total fee charged (WAD)
        uint256 totalFee;
        /// @dev Portion going to LP pool (80%) (WAD)
        uint256 lpFee;
        /// @dev Portion going to protocol treasury (20%) (WAD)
        uint256 protocolFee;
    }

    // ---------------------------------------------------------------
    //  Functions
    // ---------------------------------------------------------------

    /// @notice Calculate the skew-adjusted fill price for a trade
    /// @dev fillPrice = [indexPrice*(1 + skew/skewScale) + indexPrice*(1 + (skew+size)/skewScale)] / 2
    /// @param params Fill price parameters
    /// @return fillPrice The execution price for this trade (WAD)
    function calculateFillPrice(
        FillPriceParams memory params
    ) internal pure returns (uint256 fillPrice);

    /// @notice Calculate notional value of a trade
    /// @dev notional = |tradeSize| * fillPrice
    /// @param tradeSize Signed trade size (WAD)
    /// @param fillPrice Fill price (WAD)
    /// @return notional Unsigned notional value (WAD)
    function calculateNotional(
        int256 tradeSize,
        uint256 fillPrice
    ) internal pure returns (uint256 notional);

    /// @notice Determine if a trade is maker (reduces skew) or taker (increases skew)
    /// @dev A trade is maker if it moves skew closer to zero
    /// @param currentSkew Current market skew (signed WAD)
    /// @param tradeSize Trade size (signed WAD)
    /// @return isMaker True if the trade reduces absolute skew
    function isMakerTrade(
        int256 currentSkew,
        int256 tradeSize
    ) internal pure returns (bool isMaker);

    /// @notice Calculate trading fees with maker/taker split and LP/protocol split
    /// @dev Fee rate determined by skew impact. 80% to LP, 20% to protocol.
    ///      If a trade partially reduces then increases skew, it is split proportionally.
    /// @param params Fee calculation parameters
    /// @return result Fee breakdown
    function calculateFees(
        FeeParams memory params
    ) internal pure returns (FeeResult memory result);

    /// @notice Calculate the price impact (premium or discount) of a trade
    /// @dev impact = fillPrice - indexPrice (signed; positive = premium, negative = discount)
    /// @param fillPrice The computed fill price (WAD)
    /// @param indexPrice The current index price (WAD)
    /// @return impact Signed price impact (WAD)
    function calculatePriceImpact(
        uint256 fillPrice,
        uint256 indexPrice
    ) internal pure returns (int256 impact);
}
```

### Key Invariants

- When `skewScale` is very large relative to skew, fill price approaches index price
- Fill price for a zero-size trade equals index price
- A trade that fully offsets skew (reduces to zero) receives the best possible price
- `totalFee == lpFee + protocolFee` always
- `lpFee == totalFee * 80 / 100` and `protocolFee == totalFee * 20 / 100`
- Notional is always non-negative

---

## 5. interfaces/IPriceOracle.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPriceOracle
/// @notice Interface for the Terraform price oracle
/// @dev Stores signed price updates for real estate index markets.
///      Only whitelisted signers can push prices. Enforces deviation
///      and staleness bounds.
interface IPriceOracle {

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    /// @notice Emitted when a price is updated for a market
    /// @param marketId Market identifier
    /// @param price New price (WAD)
    /// @param timestamp Observation timestamp
    /// @param updatedBy Address that submitted the update
    event PriceUpdated(
        bytes32 indexed marketId,
        uint256 price,
        uint256 timestamp,
        address indexed updatedBy
    );

    /// @notice Emitted when a signer is added to or removed from the whitelist
    /// @param signer Signer address
    /// @param allowed Whether the signer is now allowed
    event SignerUpdated(address indexed signer, bool allowed);

    /// @notice Emitted when oracle configuration is updated
    /// @param maxDeviation New max deviation (WAD)
    /// @param maxStaleness New max staleness (seconds)
    /// @param minUpdateInterval New min update interval (seconds)
    event ConfigUpdated(uint256 maxDeviation, uint256 maxStaleness, uint256 minUpdateInterval);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    /// @notice Thrown when a non-whitelisted address tries to push a price
    error PriceOracle__UnauthorizedSigner();

    /// @notice Thrown when the new price deviates too far from the last price
    /// @param newPrice The submitted price
    /// @param lastPrice The previous price
    /// @param maxDeviation Maximum allowed deviation (WAD)
    error PriceOracle__ExcessiveDeviation(uint256 newPrice, uint256 lastPrice, uint256 maxDeviation);

    /// @notice Thrown when an update is submitted too soon after the previous one
    /// @param elapsed Seconds since last update
    /// @param minInterval Minimum required interval
    error PriceOracle__UpdateTooFrequent(uint256 elapsed, uint256 minInterval);

    /// @notice Thrown when requesting a price that is stale
    /// @param lastUpdate Timestamp of last update
    /// @param maxStaleness Maximum allowed staleness (seconds)
    error PriceOracle__StalePrice(uint256 lastUpdate, uint256 maxStaleness);

    /// @notice Thrown when price is zero or market does not exist
    error PriceOracle__InvalidPrice();

    /// @notice Thrown when market ID is not registered
    /// @param marketId The unknown market
    error PriceOracle__UnknownMarket(bytes32 marketId);

    // ---------------------------------------------------------------
    //  External (state-changing)
    // ---------------------------------------------------------------

    /// @notice Submit a new price for a market
    /// @dev Only callable by whitelisted signers. Enforces max deviation from
    ///      last price (+-5%) and minimum update interval.
    /// @param marketId Market identifier
    /// @param price New price in WAD
    /// @param timestamp Off-chain observation timestamp
    function updatePrice(bytes32 marketId, uint256 price, uint256 timestamp) external;

    /// @notice Batch-update prices for multiple markets in one transaction
    /// @param marketIds Array of market identifiers
    /// @param prices Array of prices (WAD)
    /// @param timestamps Array of observation timestamps
    function batchUpdatePrices(
        bytes32[] calldata marketIds,
        uint256[] calldata prices,
        uint256[] calldata timestamps
    ) external;

    /// @notice Add or remove a whitelisted signer
    /// @dev Only callable by owner
    /// @param signer Address to update
    /// @param allowed Whether the signer should be whitelisted
    function setSigner(address signer, bool allowed) external;

    /// @notice Update oracle configuration parameters
    /// @dev Only callable by owner
    /// @param maxDeviation Maximum price deviation per update (WAD, e.g., 0.05e18 = 5%)
    /// @param maxStaleness Maximum acceptable price age (seconds, e.g., 43200 = 12h)
    /// @param minUpdateInterval Minimum time between updates (seconds)
    function setConfig(uint256 maxDeviation, uint256 maxStaleness, uint256 minUpdateInterval) external;

    /// @notice Register a new market with an initial price
    /// @dev Only callable by owner. Sets the first price without deviation checks.
    /// @param marketId Market identifier
    /// @param initialPrice Initial price (WAD)
    function registerMarket(bytes32 marketId, uint256 initialPrice) external;

    // ---------------------------------------------------------------
    //  View
    // ---------------------------------------------------------------

    /// @notice Get the latest price for a market
    /// @dev Reverts if price is stale (older than maxStaleness)
    /// @param marketId Market identifier
    /// @return price Latest price (WAD)
    /// @return timestamp Observation timestamp
    function getPrice(bytes32 marketId) external view returns (uint256 price, uint256 timestamp);

    /// @notice Get the latest price without staleness check
    /// @dev Use for off-chain reads or non-critical paths
    /// @param marketId Market identifier
    /// @return price Latest price (WAD)
    /// @return timestamp Observation timestamp
    /// @return isStale Whether the price exceeds maxStaleness
    function getPriceUnsafe(bytes32 marketId) external view returns (uint256 price, uint256 timestamp, bool isStale);

    /// @notice Check if a signer is whitelisted
    /// @param signer Address to check
    /// @return True if whitelisted
    function isSigner(address signer) external view returns (bool);

    /// @notice Get the current oracle configuration
    /// @return maxDeviation Maximum deviation per update (WAD)
    /// @return maxStaleness Maximum price age (seconds)
    /// @return minUpdateInterval Minimum update interval (seconds)
    function getConfig() external view returns (uint256 maxDeviation, uint256 maxStaleness, uint256 minUpdateInterval);
}
```

---

## 6. core/PriceOracle.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {MathLib} from "../libraries/MathLib.sol";

/// @title PriceOracle
/// @notice Stores and validates price updates for Terraform real estate index markets
/// @dev Only whitelisted signers can push prices. Enforces:
///      - Max price deviation per update (default 5%)
///      - Max staleness (default 12 hours)
///      - Min update interval (configurable)
///
///      NOTE: For testnet, prices are pushed by a single trusted signer.
///      Production would use a decentralized oracle network or Chainlink.
///      Upgradeability could be added via UUPS proxy if needed.
contract PriceOracle is IPriceOracle, Ownable {

    // ---------------------------------------------------------------
    //  State Variables
    // ---------------------------------------------------------------

    /// @notice Maximum price deviation per update (WAD, default 0.05e18 = 5%)
    uint256 public maxDeviation;

    /// @notice Maximum acceptable price age before considered stale (seconds, default 43200 = 12h)
    uint256 public maxStaleness;

    /// @notice Minimum time between price updates for the same market (seconds)
    uint256 public minUpdateInterval;

    /// @notice Whitelisted price signers: address => bool
    mapping(address => bool) public signers;

    /// @notice Latest price data per market: marketId => PriceData
    mapping(bytes32 => PriceData) public latestPrices;

    /// @notice Set of registered market IDs
    mapping(bytes32 => bool) public registeredMarkets;

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    /// @param _owner Contract owner address
    /// @param _initialSigner First whitelisted signer
    /// @param _maxDeviation Max deviation per update (WAD, suggested: 0.05e18)
    /// @param _maxStaleness Max staleness in seconds (suggested: 43200)
    /// @param _minUpdateInterval Min interval between updates (suggested: 10)
    constructor(
        address _owner,
        address _initialSigner,
        uint256 _maxDeviation,
        uint256 _maxStaleness,
        uint256 _minUpdateInterval
    ) Ownable(_owner);

    // ---------------------------------------------------------------
    //  Access Control
    // ---------------------------------------------------------------

    /// @dev Owner: can add/remove signers, update config, register markets
    /// @dev Signers: can push price updates (updatePrice, batchUpdatePrices)
    /// @dev Public: can read prices (getPrice, getPriceUnsafe)

    // ---------------------------------------------------------------
    //  Key Invariants
    // ---------------------------------------------------------------

    /// - Every stored price is > 0
    /// - |newPrice - lastPrice| / lastPrice <= maxDeviation (except initial price)
    /// - block.timestamp - lastUpdate >= minUpdateInterval for each market
    /// - getPrice() reverts if block.timestamp - lastUpdate > maxStaleness
    /// - Only whitelisted signers can call updatePrice / batchUpdatePrices
    /// - registeredMarkets[id] must be true before any price can be pushed
}
```

---

## 7. interfaces/IMarketManager.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMarketManager
/// @notice Interface for the Terraform market registry
/// @dev Manages market configurations, funding state, and per-market skew.
///      Each market (NYC, Dubai) has its own parameters for fees, margins,
///      skew scale, and funding velocity.
interface IMarketManager {

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    /// @notice Emitted when a new market is created
    /// @param marketId Market identifier
    /// @param name Human-readable market name
    event MarketCreated(bytes32 indexed marketId, string name);

    /// @notice Emitted when a market's configuration is updated
    /// @param marketId Market identifier
    event MarketConfigUpdated(bytes32 indexed marketId);

    /// @notice Emitted when a market is activated or deactivated
    /// @param marketId Market identifier
    /// @param active New active state
    event MarketActiveStatusChanged(bytes32 indexed marketId, bool active);

    /// @notice Emitted when a market's skew changes (on every trade)
    /// @param marketId Market identifier
    /// @param oldSkew Previous net skew (signed WAD)
    /// @param newSkew New net skew (signed WAD)
    event SkewUpdated(bytes32 indexed marketId, int256 oldSkew, int256 newSkew);

    /// @notice Emitted when funding state is updated for a market
    /// @param marketId Market identifier
    /// @param fundingRate New funding rate (signed WAD)
    /// @param accumulatedFundingPerUnit New accumulated funding per unit (signed WAD)
    event FundingUpdated(
        bytes32 indexed marketId,
        int256 fundingRate,
        int256 accumulatedFundingPerUnit
    );

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    /// @notice Thrown when a market ID is not registered
    /// @param marketId The unknown market
    error MarketManager__UnknownMarket(bytes32 marketId);

    /// @notice Thrown when trying to create a market that already exists
    /// @param marketId The duplicate market
    error MarketManager__MarketAlreadyExists(bytes32 marketId);

    /// @notice Thrown when a market is not active
    /// @param marketId The inactive market
    error MarketManager__MarketNotActive(bytes32 marketId);

    /// @notice Thrown when a configuration parameter is invalid
    /// @param param Parameter name
    error MarketManager__InvalidParameter(string param);

    /// @notice Thrown when the caller is not the authorized PerpEngine
    error MarketManager__OnlyPerpEngine();

    /// @notice Thrown when a trade would exceed the market's maximum skew
    /// @param resultingSkew The skew that would result
    /// @param maxSkew The maximum allowed skew
    error MarketManager__MaxSkewExceeded(int256 resultingSkew, uint256 maxSkew);

    // ---------------------------------------------------------------
    //  External (state-changing) -- Owner only
    // ---------------------------------------------------------------

    /// @notice Create a new market with full configuration
    /// @dev Only callable by owner. Market ID = keccak256(abi.encodePacked(name)).
    /// @param name Market name (e.g., "NYC", "DUBAI")
    /// @param skewScale Scale factor for skew impact (WAD)
    /// @param maxFundingVelocity Max daily funding rate velocity (WAD)
    /// @param takerFeeRate Taker fee rate (WAD)
    /// @param makerFeeRate Maker fee rate (WAD)
    /// @param initialMarginRatio Initial margin ratio (WAD, e.g., 0.1e18)
    /// @param maintenanceMarginRatio Maintenance margin ratio (WAD, e.g., 0.05e18)
    /// @param liquidationFeeRate Liquidation fee rate (WAD, e.g., 0.01e18)
    /// @param minPositionMargin Minimum position margin (WAD)
    /// @param maxMarketSkew Maximum absolute skew (WAD)
    /// @return marketId The generated market identifier
    function createMarket(
        string calldata name,
        uint256 skewScale,
        uint256 maxFundingVelocity,
        uint256 takerFeeRate,
        uint256 makerFeeRate,
        uint256 initialMarginRatio,
        uint256 maintenanceMarginRatio,
        uint256 liquidationFeeRate,
        uint256 minPositionMargin,
        uint256 maxMarketSkew
    ) external returns (bytes32 marketId);

    /// @notice Update an existing market's configuration
    /// @dev Only callable by owner. Cannot change name or marketId.
    /// @param marketId Market identifier
    /// @param skewScale New skew scale (WAD)
    /// @param maxFundingVelocity New max funding velocity (WAD)
    /// @param takerFeeRate New taker fee rate (WAD)
    /// @param makerFeeRate New maker fee rate (WAD)
    /// @param initialMarginRatio New initial margin ratio (WAD)
    /// @param maintenanceMarginRatio New maintenance margin ratio (WAD)
    /// @param liquidationFeeRate New liquidation fee rate (WAD)
    /// @param minPositionMargin New minimum position margin (WAD)
    /// @param maxMarketSkew New maximum absolute skew (WAD)
    function updateMarketConfig(
        bytes32 marketId,
        uint256 skewScale,
        uint256 maxFundingVelocity,
        uint256 takerFeeRate,
        uint256 makerFeeRate,
        uint256 initialMarginRatio,
        uint256 maintenanceMarginRatio,
        uint256 liquidationFeeRate,
        uint256 minPositionMargin,
        uint256 maxMarketSkew
    ) external;

    /// @notice Activate or deactivate a market
    /// @dev Only callable by owner. Deactivated markets reject new trades
    ///      but allow closing/liquidation.
    /// @param marketId Market identifier
    /// @param active New active status
    function setMarketActive(bytes32 marketId, bool active) external;

    /// @notice Set the authorized PerpEngine address
    /// @dev Only callable by owner. Only PerpEngine can update skew and funding.
    /// @param perpEngine PerpEngine contract address
    function setPerpEngine(address perpEngine) external;

    // ---------------------------------------------------------------
    //  External (state-changing) -- PerpEngine only
    // ---------------------------------------------------------------

    /// @notice Update the net skew for a market after a trade
    /// @dev Only callable by the authorized PerpEngine
    /// @param marketId Market identifier
    /// @param sizeDelta Change in position size (signed WAD)
    function updateSkew(bytes32 marketId, int256 sizeDelta) external;

    /// @notice Update the funding state for a market
    /// @dev Only callable by the authorized PerpEngine. Called before every trade.
    /// @param marketId Market identifier
    /// @param indexPrice Current index price from oracle (WAD)
    /// @return fundingState Updated funding state
    function updateFunding(bytes32 marketId, uint256 indexPrice) external returns (FundingState memory fundingState);

    // ---------------------------------------------------------------
    //  View
    // ---------------------------------------------------------------

    /// @notice Get full configuration for a market
    /// @param marketId Market identifier
    /// @return config Market configuration struct
    function getMarketConfig(bytes32 marketId) external view returns (MarketConfig memory config);

    /// @notice Get the current net skew for a market
    /// @param marketId Market identifier
    /// @return skew Net skew (signed WAD, positive = net long, negative = net short)
    function getSkew(bytes32 marketId) external view returns (int256 skew);

    /// @notice Get the current funding state for a market
    /// @param marketId Market identifier
    /// @return state Current funding state
    function getFundingState(bytes32 marketId) external view returns (FundingState memory state);

    /// @notice Get all registered market IDs
    /// @return marketIds Array of market identifiers
    function getMarketIds() external view returns (bytes32[] memory marketIds);

    /// @notice Check if a market exists and is active
    /// @param marketId Market identifier
    /// @return exists Whether the market is registered
    /// @return active Whether the market is active for trading
    function getMarketStatus(bytes32 marketId) external view returns (bool exists, bool active);

    /// @notice Get the authorized PerpEngine address
    /// @return Address of the PerpEngine contract
    function perpEngine() external view returns (address);
}
```

---

## 8. core/MarketManager.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMarketManager} from "../interfaces/IMarketManager.sol";
import {MathLib} from "../libraries/MathLib.sol";
import {FundingLib} from "../libraries/FundingLib.sol";

/// @title MarketManager
/// @notice Registry of perpetual markets with their configuration, skew, and funding state
/// @dev Manages two markets for MVP: NYC and DUBAI.
///      Configuration (fees, margins, skew scale) is set by the owner.
///      Skew and funding are updated exclusively by the PerpEngine on each trade.
///
///      NOTE: Upgradeability could be added via UUPS proxy if needed.
contract MarketManager is IMarketManager, Ownable {

    // ---------------------------------------------------------------
    //  State Variables
    // ---------------------------------------------------------------

    /// @notice Market configuration: marketId => MarketConfig
    mapping(bytes32 => MarketConfig) public marketConfigs;

    /// @notice Current net skew per market: marketId => int256 (signed WAD)
    mapping(bytes32 => int256) public marketSkews;

    /// @notice Funding state per market: marketId => FundingState
    mapping(bytes32 => FundingState) public fundingStates;

    /// @notice Ordered list of all registered market IDs
    bytes32[] public marketIds;

    /// @notice The authorized PerpEngine address (only it can update skew/funding)
    address public override perpEngine;

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    /// @param _owner Contract owner address
    constructor(address _owner) Ownable(_owner);

    // ---------------------------------------------------------------
    //  Access Control
    // ---------------------------------------------------------------

    /// @dev Owner: can create/update markets, set PerpEngine, activate/deactivate
    /// @dev PerpEngine: can update skew and funding state
    /// @dev Public: can read all market data

    // ---------------------------------------------------------------
    //  Key Invariants
    // ---------------------------------------------------------------

    /// - A market ID is derived deterministically: keccak256(abi.encodePacked(name))
    /// - No duplicate market IDs
    /// - initialMarginRatio > maintenanceMarginRatio > 0
    /// - maintenanceMarginRatio > liquidationFeeRate
    /// - skewScale > 0
    /// - maxFundingVelocity >= 0
    /// - |marketSkew| <= maxMarketSkew (enforced on trade, not on config change)
    /// - Only perpEngine can call updateSkew and updateFunding
    /// - Funding state is updated atomically with every trade
}
```

---

## 9. core/LPToken.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title LPToken
/// @notice ERC-20 token representing shares of the Terraform liquidity pool
/// @dev Minted by the LiquidityPool on deposit, burned on withdrawal.
///      Only the LiquidityPool contract (set as owner) can mint and burn.
///
///      Token value = pool NAV / total LP token supply
///
///      NOTE: Upgradeability could be added via UUPS proxy if needed.
contract LPToken is ERC20, Ownable {

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    /// @notice Emitted when LP tokens are minted
    /// @param to Recipient address
    /// @param amount Amount minted (WAD)
    event LPTokenMinted(address indexed to, uint256 amount);

    /// @notice Emitted when LP tokens are burned
    /// @param from Address whose tokens were burned
    /// @param amount Amount burned (WAD)
    event LPTokenBurned(address indexed from, uint256 amount);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    /// @notice Thrown when a non-pool address tries to mint or burn
    error LPToken__OnlyPool();

    /// @notice Thrown when attempting to mint zero tokens
    error LPToken__ZeroAmount();

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    /// @param _pool Address of the LiquidityPool contract (set as owner)
    constructor(address _pool) ERC20("Terraform LP Token", "tfLP") Ownable(_pool);

    // ---------------------------------------------------------------
    //  External (state-changing) -- Pool only
    // ---------------------------------------------------------------

    /// @notice Mint LP tokens to a recipient
    /// @dev Only callable by the LiquidityPool (owner)
    /// @param to Recipient address
    /// @param amount Amount to mint (WAD)
    function mint(address to, uint256 amount) external onlyOwner;

    /// @notice Burn LP tokens from a holder
    /// @dev Only callable by the LiquidityPool (owner)
    /// @param from Address to burn from
    /// @param amount Amount to burn (WAD)
    function burn(address from, uint256 amount) external onlyOwner;

    // ---------------------------------------------------------------
    //  Access Control
    // ---------------------------------------------------------------

    /// @dev Owner (LiquidityPool): can mint and burn
    /// @dev Public: standard ERC-20 (transfer, approve, etc.)

    // ---------------------------------------------------------------
    //  Key Invariants
    // ---------------------------------------------------------------

    /// - Only the LiquidityPool can mint or burn
    /// - Total supply tracks exactly the sum of all minted minus all burned
    /// - No LP tokens exist without a corresponding deposit in the pool
}
```

---

## 10. interfaces/ILiquidityPool.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ILiquidityPool
/// @notice Interface for the Terraform liquidity pool
/// @dev LPs deposit tUSDI and receive LP tokens. The pool is the counterparty
///      to all perpetual trades: when traders profit, the pool loses, and vice versa.
///      Pool value = totalDeposits + accumulatedFees + counterpartyPnL.
///      24h withdrawal delay on all collateral.
interface ILiquidityPool {

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    /// @notice Emitted when a user deposits tUSDI into the pool
    /// @param user Depositor address
    /// @param amount tUSDI amount deposited (WAD)
    /// @param lpTokensMinted LP tokens received (WAD)
    /// @param poolValueAfter Pool NAV after deposit (WAD)
    event Deposited(
        address indexed user,
        uint256 amount,
        uint256 lpTokensMinted,
        uint256 poolValueAfter
    );

    /// @notice Emitted when a user requests a withdrawal
    /// @param user Withdrawer address
    /// @param lpTokenAmount LP tokens to burn (WAD)
    /// @param requestedAt Timestamp of the request
    event WithdrawalRequested(
        address indexed user,
        uint256 lpTokenAmount,
        uint256 requestedAt
    );

    /// @notice Emitted when a withdrawal is executed after the delay
    /// @param user Withdrawer address
    /// @param lpTokensBurned LP tokens burned (WAD)
    /// @param tUsdiReturned tUSDI returned to user (WAD)
    /// @param poolValueAfter Pool NAV after withdrawal (WAD)
    event Withdrawn(
        address indexed user,
        uint256 lpTokensBurned,
        uint256 tUsdiReturned,
        uint256 poolValueAfter
    );

    /// @notice Emitted when a withdrawal request is cancelled
    /// @param user Withdrawer address
    event WithdrawalCancelled(address indexed user);

    /// @notice Emitted when fees are collected into the pool
    /// @param marketId Market that generated the fees
    /// @param lpFee Portion added to pool (WAD)
    /// @param protocolFee Portion sent to treasury (WAD)
    event FeesCollected(bytes32 indexed marketId, uint256 lpFee, uint256 protocolFee);

    /// @notice Emitted when trader PnL is settled against the pool
    /// @param trader Trader address
    /// @param pnl Signed PnL (positive = trader profit = pool loss) (WAD)
    event PnLSettled(address indexed trader, int256 pnl);

    /// @notice Emitted when liquidation proceeds are received by the pool
    /// @param liquidatedAccount Liquidated trader address
    /// @param collateralReceived Total collateral received (WAD)
    /// @param liquidationFee Fee paid to the liquidator (WAD)
    event LiquidationProceeds(
        address indexed liquidatedAccount,
        uint256 collateralReceived,
        uint256 liquidationFee
    );

    /// @notice Emitted when the protocol treasury address is updated
    /// @param oldTreasury Previous treasury address
    /// @param newTreasury New treasury address
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    /// @notice XP event
    event XPAction(address indexed user, string actionType, uint256 points);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    /// @notice Thrown when deposit amount is zero
    error LiquidityPool__ZeroAmount();

    /// @notice Thrown when the withdrawal delay has not passed
    /// @param requestedAt Timestamp of withdrawal request
    /// @param earliestWithdraw Earliest allowed withdrawal timestamp
    error LiquidityPool__WithdrawalDelayNotMet(uint256 requestedAt, uint256 earliestWithdraw);

    /// @notice Thrown when there is no pending withdrawal request
    error LiquidityPool__NoPendingWithdrawal();

    /// @notice Thrown when the pool has insufficient tUSDI for a withdrawal or settlement
    /// @param requested Amount requested
    /// @param available Amount available
    error LiquidityPool__InsufficientLiquidity(uint256 requested, uint256 available);

    /// @notice Thrown when the caller is not the authorized PerpEngine
    error LiquidityPool__OnlyPerpEngine();

    /// @notice Thrown when the caller is not the owner
    error LiquidityPool__OnlyOwner();

    /// @notice Thrown when address is zero
    error LiquidityPool__ZeroAddress();

    /// @notice Thrown when user already has a pending withdrawal
    error LiquidityPool__WithdrawalAlreadyPending();

    /// @notice Thrown when LP token amount exceeds user's balance
    /// @param requested Amount requested
    /// @param balance User's LP token balance
    error LiquidityPool__InsufficientLPTokens(uint256 requested, uint256 balance);

    // ---------------------------------------------------------------
    //  Structs
    // ---------------------------------------------------------------

    /// @notice Pending withdrawal request
    struct WithdrawalRequest {
        /// @dev LP tokens to burn
        uint256 lpTokenAmount;
        /// @dev Timestamp when the request was made
        uint256 requestedAt;
    }

    // ---------------------------------------------------------------
    //  External (state-changing) -- User-facing
    // ---------------------------------------------------------------

    /// @notice Deposit tUSDI into the liquidity pool
    /// @dev Caller must have approved this contract for `amount` of tUSDI.
    ///      Mints LP tokens proportional to share of pool value.
    ///      Emits XPAction("LP_DEPOSIT", 100).
    /// @param amount Amount of tUSDI to deposit (WAD)
    /// @return lpTokensMinted Number of LP tokens minted (WAD)
    function deposit(uint256 amount) external returns (uint256 lpTokensMinted);

    /// @notice Request a withdrawal from the pool
    /// @dev Starts the 24h withdrawal delay. LP tokens are locked but not yet burned.
    ///      Only one pending withdrawal per address at a time.
    /// @param lpTokenAmount Amount of LP tokens to withdraw (WAD)
    function requestWithdrawal(uint256 lpTokenAmount) external;

    /// @notice Execute a pending withdrawal after the 24h delay
    /// @dev Burns LP tokens and returns proportional tUSDI.
    ///      Emits XPAction("LP_WITHDRAW", 50).
    /// @return tUsdiAmount Amount of tUSDI returned (WAD)
    function executeWithdrawal() external returns (uint256 tUsdiAmount);

    /// @notice Cancel a pending withdrawal request
    /// @dev Returns locked LP tokens to the user
    function cancelWithdrawal() external;

    // ---------------------------------------------------------------
    //  External (state-changing) -- PerpEngine only
    // ---------------------------------------------------------------

    /// @notice Collect trading fees into the pool and treasury
    /// @dev Only callable by PerpEngine. Splits fees 80/20 (LP/treasury).
    /// @param marketId Market that generated the fees
    /// @param totalFee Total fee amount (WAD)
    function collectFees(bytes32 marketId, uint256 totalFee) external;

    /// @notice Settle a trader's PnL against the pool
    /// @dev Only callable by PerpEngine.
    ///      Positive pnl = trader profit = tUSDI flows from pool to trader.
    ///      Negative pnl = trader loss = tUSDI flows from trader to pool.
    /// @param trader Trader address
    /// @param pnl Signed PnL amount (WAD)
    function settlePnL(address trader, int256 pnl) external;

    /// @notice Receive liquidation proceeds (all of liquidated account's collateral)
    /// @dev Only callable by PerpEngine.
    ///      Liquidation fee is paid out to the liquidator; remainder stays in pool.
    /// @param liquidatedAccount Address of the liquidated trader
    /// @param totalCollateral Total collateral seized (WAD)
    /// @param liquidationFee Fee to pay the liquidator (WAD)
    /// @param liquidator Address of the liquidator (receives the fee)
    function receiveLiquidationProceeds(
        address liquidatedAccount,
        uint256 totalCollateral,
        uint256 liquidationFee,
        address liquidator
    ) external;

    // ---------------------------------------------------------------
    //  External (state-changing) -- Owner only
    // ---------------------------------------------------------------

    /// @notice Set the authorized PerpEngine address
    /// @param _perpEngine PerpEngine contract address
    function setPerpEngine(address _perpEngine) external;

    /// @notice Set the protocol treasury address
    /// @param _treasury New treasury address
    function setTreasury(address _treasury) external;

    // ---------------------------------------------------------------
    //  View
    // ---------------------------------------------------------------

    /// @notice Get the current pool NAV (net asset value)
    /// @dev poolValue = tUSDI balance held by this contract
    ///      (deposits + fees + trader losses - trader wins - withdrawals)
    /// @return Pool value in tUSDI (WAD)
    function getPoolValue() external view returns (uint256);

    /// @notice Get the current price of one LP token in tUSDI
    /// @dev lpTokenPrice = poolValue / lpToken.totalSupply (WAD)
    ///      Returns WAD (1e18) if totalSupply is zero (initial price)
    /// @return LP token price (WAD)
    function getLPTokenPrice() external view returns (uint256);

    /// @notice Get a user's pending withdrawal request
    /// @param user Address to check
    /// @return request The withdrawal request (zero values if none pending)
    function getWithdrawalRequest(address user) external view returns (WithdrawalRequest memory request);

    /// @notice Get total tUSDI deposited into the pool (lifetime)
    /// @return Total deposits (WAD)
    function totalDeposited() external view returns (uint256);

    /// @notice Get total fees collected by the pool (lifetime)
    /// @return Total LP fees (WAD)
    function totalFeesCollected() external view returns (uint256);

    /// @notice Get the LP token contract address
    /// @return LP token address
    function lpToken() external view returns (address);

    /// @notice Get the protocol treasury address
    /// @return Treasury address
    function treasury() external view returns (address);

    /// @notice Get the tUSDI collateral token address
    /// @return tUSDI address
    function collateralToken() external view returns (address);

    /// @notice Withdrawal delay duration in seconds
    /// @return Delay in seconds (86400 = 24h)
    function WITHDRAWAL_DELAY() external view returns (uint256);
}
```

---

## 11. core/LiquidityPool.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILiquidityPool} from "../interfaces/ILiquidityPool.sol";
import {LPToken} from "./LPToken.sol";
import {MathLib} from "../libraries/MathLib.sol";

/// @title LiquidityPool
/// @notice Manages LP deposits/withdrawals and acts as the counterparty to all perpetual trades
/// @dev LP depositors provide tUSDI liquidity. The pool earns fees and counterparty PnL
///      (when traders lose). The pool pays out when traders win.
///
///      Pool value = tUSDI balance in contract
///      LP token price = pool value / LP token total supply
///
///      24h withdrawal delay on all withdrawals.
///      Fee split: 80% to LP pool, 20% to protocol treasury.
///
///      NOTE: Upgradeability could be added via UUPS proxy if needed.
contract LiquidityPool is ILiquidityPool, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    //  Constants
    // ---------------------------------------------------------------

    /// @notice Withdrawal delay: 24 hours
    uint256 public constant WITHDRAWAL_DELAY = 86_400;

    /// @notice LP fee share: 80% (8000 basis points)
    uint256 public constant LP_FEE_SHARE_BPS = 8_000;

    /// @notice Total basis points (100%)
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ---------------------------------------------------------------
    //  State Variables
    // ---------------------------------------------------------------

    /// @notice tUSDI collateral token
    IERC20 public immutable collateralToken;

    /// @notice LP token (minted/burned by this contract)
    LPToken public immutable lpToken;

    /// @notice Protocol treasury address (receives 20% of fees)
    address public treasury;

    /// @notice Authorized PerpEngine address
    address public perpEngine;

    /// @notice Total tUSDI deposited (lifetime counter)
    uint256 public totalDeposited;

    /// @notice Total LP fees collected (lifetime counter)
    uint256 public totalFeesCollected;

    /// @notice Pending withdrawal requests: user => WithdrawalRequest
    mapping(address => WithdrawalRequest) public withdrawalRequests;

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    /// @param _owner Contract owner address
    /// @param _collateralToken tUSDI token address
    /// @param _treasury Protocol treasury address
    constructor(
        address _owner,
        address _collateralToken,
        address _treasury
    ) Ownable(_owner);

    // ---------------------------------------------------------------
    //  Access Control
    // ---------------------------------------------------------------

    /// @dev Owner: set PerpEngine, set treasury
    /// @dev PerpEngine: collectFees, settlePnL, receiveLiquidationProceeds
    /// @dev Public: deposit, requestWithdrawal, executeWithdrawal, cancelWithdrawal, views

    // ---------------------------------------------------------------
    //  Key Invariants
    // ---------------------------------------------------------------

    /// - LP token total supply == 0 iff pool value == 0 (pool starts empty)
    /// - LP token price >= 0 (pool value can never go below zero in practice due to
    ///   liquidation thresholds, but a catastrophic scenario is possible)
    /// - Withdrawal delay: block.timestamp - request.requestedAt >= WITHDRAWAL_DELAY
    /// - Fee split: lpFee = totalFee * 80/100, protocolFee = totalFee * 20/100
    /// - Only PerpEngine can call collectFees, settlePnL, receiveLiquidationProceeds
    /// - tUSDI transfers use SafeERC20 and are protected by ReentrancyGuard
    /// - Pool tUSDI balance == getPoolValue() (no hidden accounting)
    /// - One pending withdrawal per user at a time
}
```

---

## 12. interfaces/IPerpEngine.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPerpEngine
/// @notice Interface for the Terraform perpetual futures trading engine
/// @dev Core contract that handles:
///      - Opening, closing, and modifying positions
///      - Cross-margin account management
///      - Margin checks (initial and maintenance)
///      - Funding accrual
///      - Liquidation
///      - PnL settlement against the LP pool
///
///      Position unit = sqft (int256, positive = long, negative = short).
///      Max 12 positions per account across all markets.
///      Collateral: tUSDI (ERC-20, 18 decimals).
interface IPerpEngine {

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    /// @notice Emitted when a user deposits collateral into their account
    /// @param user Trader address
    /// @param amount tUSDI deposited (WAD)
    /// @param newCollateral Total collateral after deposit (WAD)
    event CollateralDeposited(
        address indexed user,
        uint256 amount,
        uint256 newCollateral
    );

    /// @notice Emitted when a user withdraws collateral from their account
    /// @param user Trader address
    /// @param amount tUSDI withdrawn (WAD)
    /// @param newCollateral Total collateral after withdrawal (WAD)
    event CollateralWithdrawn(
        address indexed user,
        uint256 amount,
        uint256 newCollateral
    );

    /// @notice Emitted when a position is opened or increased
    /// @param user Trader address
    /// @param marketId Market identifier
    /// @param sizeDelta Change in position size (signed WAD, positive = long)
    /// @param fillPrice Execution price (WAD)
    /// @param fee Trading fee charged (WAD)
    /// @param newPositionSize Resulting position size (signed WAD)
    event PositionOpened(
        address indexed user,
        bytes32 indexed marketId,
        int256 sizeDelta,
        uint256 fillPrice,
        uint256 fee,
        int256 newPositionSize
    );

    /// @notice Emitted when a position is closed or reduced
    /// @param user Trader address
    /// @param marketId Market identifier
    /// @param sizeDelta Change in position size (signed WAD)
    /// @param fillPrice Execution price (WAD)
    /// @param realizedPnL PnL realized on the closed portion (signed WAD)
    /// @param fee Trading fee charged (WAD)
    /// @param newPositionSize Resulting position size (signed WAD, 0 if fully closed)
    event PositionClosed(
        address indexed user,
        bytes32 indexed marketId,
        int256 sizeDelta,
        uint256 fillPrice,
        int256 realizedPnL,
        uint256 fee,
        int256 newPositionSize
    );

    /// @notice Emitted when a position is modified (size change that flips direction)
    /// @param user Trader address
    /// @param marketId Market identifier
    /// @param oldSize Previous position size (signed WAD)
    /// @param newSize New position size (signed WAD)
    /// @param fillPrice Execution price (WAD)
    /// @param realizedPnL PnL realized on the closed portion (signed WAD)
    /// @param fee Trading fee charged (WAD)
    event PositionModified(
        address indexed user,
        bytes32 indexed marketId,
        int256 oldSize,
        int256 newSize,
        uint256 fillPrice,
        int256 realizedPnL,
        uint256 fee
    );

    /// @notice Emitted when an account is liquidated
    /// @param liquidatedAccount Liquidated trader address
    /// @param liquidator Address that triggered the liquidation
    /// @param totalCollateral Total collateral seized (WAD)
    /// @param liquidationFee Fee paid to the liquidator (WAD)
    /// @param positionsLiquidated Number of positions closed
    event AccountLiquidated(
        address indexed liquidatedAccount,
        address indexed liquidator,
        uint256 totalCollateral,
        uint256 liquidationFee,
        uint256 positionsLiquidated
    );

    /// @notice Emitted when funding is settled for a position
    /// @param user Trader address
    /// @param marketId Market identifier
    /// @param fundingPnL Funding PnL applied (signed WAD)
    event FundingSettled(
        address indexed user,
        bytes32 indexed marketId,
        int256 fundingPnL
    );

    /// @notice XP event
    event XPAction(address indexed user, string actionType, uint256 points);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    /// @notice Thrown when deposit or trade amount is zero
    error PerpEngine__ZeroAmount();

    /// @notice Thrown when address is zero
    error PerpEngine__ZeroAddress();

    /// @notice Thrown when the account does not have enough collateral for the initial margin
    /// @param required Required margin (WAD)
    /// @param available Available margin (WAD)
    error PerpEngine__InsufficientMargin(uint256 required, int256 available);

    /// @notice Thrown when a user tries to exceed 12 positions
    error PerpEngine__MaxPositionsExceeded();

    /// @notice Thrown when the market is not active for new trades
    /// @param marketId The inactive market
    error PerpEngine__MarketNotActive(bytes32 marketId);

    /// @notice Thrown when trying to close a position that doesn't exist
    /// @param marketId Market identifier
    error PerpEngine__NoPosition(bytes32 marketId);

    /// @notice Thrown when the account is not liquidatable
    /// @param accountValue Current account value (signed WAD)
    /// @param requiredMargin Required maintenance margin (WAD)
    error PerpEngine__NotLiquidatable(int256 accountValue, uint256 requiredMargin);

    /// @notice Thrown when withdrawal would breach margin requirements
    /// @param requested Amount requested (WAD)
    /// @param maxWithdrawable Maximum withdrawable amount (WAD)
    error PerpEngine__WithdrawalWouldBreachMargin(uint256 requested, uint256 maxWithdrawable);

    /// @notice Thrown when the 24h deposit withdrawal delay has not passed
    /// @param depositTime Timestamp of last deposit
    /// @param earliestWithdraw Earliest allowed withdrawal timestamp
    error PerpEngine__WithdrawalDelayNotMet(uint256 depositTime, uint256 earliestWithdraw);

    /// @notice Thrown when the oracle price is stale or unavailable
    /// @param marketId Market identifier
    error PerpEngine__StaleOracle(bytes32 marketId);

    /// @notice Thrown when a trade would exceed the market's max skew
    /// @param marketId Market identifier
    error PerpEngine__MaxSkewExceeded(bytes32 marketId);

    /// @notice Thrown when trying to liquidate yourself
    error PerpEngine__SelfLiquidation();

    // ---------------------------------------------------------------
    //  External (state-changing) -- User-facing
    // ---------------------------------------------------------------

    /// @notice Deposit tUSDI collateral into the trader's cross-margin account
    /// @dev Caller must have approved this contract for `amount` of tUSDI.
    ///      Resets the 24h withdrawal delay timer.
    /// @param amount Amount of tUSDI to deposit (WAD)
    function depositCollateral(uint256 amount) external;

    /// @notice Withdraw tUSDI collateral from the trader's account
    /// @dev Subject to 24h withdrawal delay and margin requirements.
    ///      Cannot withdraw if it would cause the account to breach initial margin.
    /// @param amount Amount of tUSDI to withdraw (WAD)
    function withdrawCollateral(uint256 amount) external;

    /// @notice Open a new position or increase an existing one
    /// @dev Settles funding, calculates fill price, charges fees, checks margin.
    ///      Emits XPAction("FIRST_TRADE", 200) on the account's first ever trade.
    ///      Emits XPAction("OPEN_POSITION", 100) on every open.
    /// @param marketId Market identifier (e.g., keccak256("NYC"))
    /// @param sizeDelta Position size change in sqft (signed WAD, positive = long, negative = short)
    /// @return fillPrice The execution price (WAD)
    /// @return fee The trading fee charged (WAD)
    function openPosition(
        bytes32 marketId,
        int256 sizeDelta
    ) external returns (uint256 fillPrice, uint256 fee);

    /// @notice Close a position entirely or reduce its size
    /// @dev Settles funding, calculates PnL, charges fees, settles PnL against pool.
    ///      Emits XPAction("CLOSE_POSITION", 75).
    /// @param marketId Market identifier
    /// @param sizeDelta Size to close (must be opposite sign of current position, signed WAD).
    ///                   Pass 0 to close the entire position.
    /// @return fillPrice The execution price (WAD)
    /// @return realizedPnL The realized PnL (signed WAD)
    /// @return fee The trading fee charged (WAD)
    function closePosition(
        bytes32 marketId,
        int256 sizeDelta
    ) external returns (uint256 fillPrice, int256 realizedPnL, uint256 fee);

    /// @notice Liquidate an undercollateralized account
    /// @dev Anyone can call this. Checks if accountValue < totalRequiredMargin
    ///      (maintenance margin + liquidation fee margin summed across all positions).
    ///      Uses INDEX price (not fill price) for the check.
    ///      Full liquidation: all positions closed, all collateral sent to LP pool.
    ///      Liquidator receives a fee (sum of liquidationFeeMargin across positions).
    ///      Emits XPAction("LIQUIDATION", 150) for the caller.
    /// @param account Address of the account to liquidate
    function liquidate(address account) external;

    // ---------------------------------------------------------------
    //  External (state-changing) -- Owner only
    // ---------------------------------------------------------------

    /// @notice Set contract dependencies
    /// @dev Only callable by owner. Sets oracle, market manager, and liquidity pool.
    /// @param _oracle PriceOracle contract address
    /// @param _marketManager MarketManager contract address
    /// @param _liquidityPool LiquidityPool contract address
    function setDependencies(
        address _oracle,
        address _marketManager,
        address _liquidityPool
    ) external;

    // ---------------------------------------------------------------
    //  View
    // ---------------------------------------------------------------

    /// @notice Get a trader's full account state
    /// @param user Trader address
    /// @return collateral Total tUSDI collateral (WAD)
    /// @return positions Array of Position structs
    /// @return lastDepositTime Timestamp of last deposit
    /// @return hasTraded Whether the account has ever traded
    function getAccount(address user) external view returns (
        uint256 collateral,
        Position[] memory positions,
        uint256 lastDepositTime,
        bool hasTraded
    );

    /// @notice Get a specific position for a user in a market
    /// @param user Trader address
    /// @param marketId Market identifier
    /// @return position The position (size=0 if none exists)
    function getPosition(address user, bytes32 marketId) external view returns (Position memory position);

    /// @notice Calculate the current account value (collateral + total unrealized PnL)
    /// @dev accountValue = collateral + sum(pricePnL + fundingPnL) across all positions
    /// @param user Trader address
    /// @return accountValue Signed account value (WAD)
    function getAccountValue(address user) external view returns (int256 accountValue);

    /// @notice Calculate unrealized PnL for a specific position
    /// @dev pricePnL = positionSize * (currentFillPrice - lastFillPrice)
    ///      fundingPnL = positionSize * (currentAccFunding - lastFunding)
    ///      totalPnL = pricePnL + fundingPnL
    /// @param user Trader address
    /// @param marketId Market identifier
    /// @return pricePnL Price-based unrealized PnL (signed WAD)
    /// @return fundingPnL Funding-based unrealized PnL (signed WAD)
    /// @return totalPnL Total unrealized PnL (signed WAD)
    function getUnrealizedPnL(
        address user,
        bytes32 marketId
    ) external view returns (int256 pricePnL, int256 fundingPnL, int256 totalPnL);

    /// @notice Calculate the total required margin for an account (for liquidation check)
    /// @dev totalRequired = sum of (maintenanceMargin + liquidationFeeMargin) for each position
    ///      where maintenanceMargin = notional * maintenanceMarginRatio + minPositionMargin
    ///      and liquidationFeeMargin = notional * liquidationFeeRate
    ///      Notional is calculated using INDEX price.
    /// @param user Trader address
    /// @return totalRequired Total required margin (WAD)
    function getTotalRequiredMargin(address user) external view returns (uint256 totalRequired);

    /// @notice Calculate the initial margin required for a new trade
    /// @dev initialMargin = notional * initialMarginRatio + minPositionMargin
    /// @param marketId Market identifier
    /// @param sizeDelta Trade size (signed WAD)
    /// @return initialMargin Required initial margin (WAD)
    function getInitialMarginRequired(
        bytes32 marketId,
        int256 sizeDelta
    ) external view returns (uint256 initialMargin);

    /// @notice Check if an account is liquidatable
    /// @param user Trader address
    /// @return liquidatable True if accountValue < totalRequiredMargin
    /// @return accountValue Current account value (signed WAD)
    /// @return requiredMargin Total required maintenance + liquidation fee margin (WAD)
    function isLiquidatable(address user) external view returns (
        bool liquidatable,
        int256 accountValue,
        uint256 requiredMargin
    );

    /// @notice Calculate the maximum withdrawable collateral
    /// @dev Max amount that keeps the account above initial margin for all open positions
    /// @param user Trader address
    /// @return maxWithdrawable Maximum tUSDI that can be withdrawn (WAD)
    function getMaxWithdrawable(address user) external view returns (uint256 maxWithdrawable);

    /// @notice Get the available margin (free collateral) for new trades
    /// @dev availableMargin = accountValue - sum(initialMargin) for all open positions
    /// @param user Trader address
    /// @return availableMargin Signed available margin (WAD, can be negative if underwater)
    function getAvailableMargin(address user) external view returns (int256 availableMargin);

    /// @notice Get the number of open positions for an account
    /// @param user Trader address
    /// @return count Number of active positions (0-12)
    function getPositionCount(address user) external view returns (uint256 count);

    /// @notice Get contract dependency addresses
    /// @return oracle PriceOracle address
    /// @return marketManager MarketManager address
    /// @return liquidityPool LiquidityPool address
    /// @return collateralToken tUSDI address
    function getDependencies() external view returns (
        address oracle,
        address marketManager,
        address liquidityPool,
        address collateralToken
    );

    /// @notice Collateral withdrawal delay in seconds
    /// @return Delay (86400 = 24h)
    function WITHDRAWAL_DELAY() external view returns (uint256);

    /// @notice Maximum positions per account
    /// @return Max positions (12)
    function MAX_POSITIONS() external view returns (uint256);
}
```

---

## 13. core/PerpEngine.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPerpEngine} from "../interfaces/IPerpEngine.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {IMarketManager} from "../interfaces/IMarketManager.sol";
import {ILiquidityPool} from "../interfaces/ILiquidityPool.sol";
import {MathLib} from "../libraries/MathLib.sol";
import {FundingLib} from "../libraries/FundingLib.sol";
import {PricingLib} from "../libraries/PricingLib.sol";

/// @title PerpEngine
/// @notice Core trading engine for Terraform perpetual futures
/// @dev Handles all position lifecycle: open, close, modify, liquidate.
///      Cross-margin: one account per user with up to 12 positions across all markets.
///      All margin checks use the account's total collateral + unrealized PnL.
///
///      Trade flow:
///        1. Update funding for the market
///        2. Calculate fill price (skew-adjusted)
///        3. Calculate fees
///        4. Update position
///        5. Update market skew
///        6. Check margin requirements
///        7. Settle fees to LP pool
///        8. Emit events
///
///      Liquidation flow:
///        1. Update funding for all markets with positions
///        2. Check accountValue vs totalRequiredMargin (using INDEX prices)
///        3. Close all positions
///        4. Transfer all collateral to LP pool
///        5. LP pool pays liquidation fee to caller
///
///      NOTE: Upgradeability could be added via UUPS proxy if needed.
contract PerpEngine is IPerpEngine, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    //  Constants
    // ---------------------------------------------------------------

    /// @notice Maximum positions per account
    uint256 public constant MAX_POSITIONS = 12;

    /// @notice Collateral withdrawal delay: 24 hours
    uint256 public constant WITHDRAWAL_DELAY = 86_400;

    // ---------------------------------------------------------------
    //  State Variables
    // ---------------------------------------------------------------

    /// @notice tUSDI collateral token
    IERC20 public immutable collateralToken;

    /// @notice Price oracle contract
    IPriceOracle public oracle;

    /// @notice Market manager contract
    IMarketManager public marketManager;

    /// @notice Liquidity pool contract
    ILiquidityPool public liquidityPool;

    /// @notice Trader accounts: address => Account
    /// @dev Stored as a custom mapping structure since Account contains a dynamic array
    mapping(address => uint256) public accountCollaterals;
    mapping(address => uint256) public accountLastDepositTimes;
    mapping(address => bool) public accountHasTraded;

    /// @notice Position storage: address => marketId => Position
    mapping(address => mapping(bytes32 => Position)) public positions;

    /// @notice Active market IDs per account: address => bytes32[]
    mapping(address => bytes32[]) public accountMarketIds;

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    /// @param _owner Contract owner address
    /// @param _collateralToken tUSDI token address
    constructor(
        address _owner,
        address _collateralToken
    ) Ownable(_owner);

    // ---------------------------------------------------------------
    //  Access Control
    // ---------------------------------------------------------------

    /// @dev Owner: setDependencies
    /// @dev Public: depositCollateral, withdrawCollateral, openPosition, closePosition, liquidate, all views
    /// @dev No role-gated trading -- anyone with collateral can trade

    // ---------------------------------------------------------------
    //  Key Invariants
    // ---------------------------------------------------------------

    /// ACCOUNT INVARIANTS:
    /// - accountCollateral >= 0 (unsigned, cannot go negative)
    /// - accountMarketIds[user].length <= MAX_POSITIONS (12)
    /// - Every entry in accountMarketIds[user] corresponds to a non-zero position
    /// - An account with no positions has no entries in accountMarketIds
    ///
    /// MARGIN INVARIANTS:
    /// - After every trade: accountValue >= sum(initialMargin) for all positions
    /// - Liquidation triggered when: accountValue < sum(maintenanceMargin + liquidationFeeMargin)
    /// - Liquidation check uses INDEX price, not fill price
    /// - Withdrawal cannot bring account below initial margin requirement
    ///
    /// POSITION INVARIANTS:
    /// - position.size != 0 for all stored positions (zero-size positions are removed)
    /// - position.lastFillPrice > 0 for all stored positions
    /// - position.lastFundingPerUnit matches the market's accumulatedFundingPerUnit at settlement
    ///
    /// FUNDING INVARIANTS:
    /// - Funding is settled (accrued) before every trade and before liquidation
    /// - fundingPnL = size * (currentAccFunding - lastFunding)
    /// - Net funding across all positions flows to/from LP pool
    ///
    /// SETTLEMENT INVARIANTS:
    /// - PnL is settled against the LP pool via settlePnL
    /// - Fees are collected via LP pool's collectFees
    /// - All tUSDI transfers use SafeERC20
    /// - All state-changing externals use ReentrancyGuard
    ///
    /// PNL FORMULAS:
    /// - pricePnL = positionSize * (currentFillPrice - lastFillPrice) / WAD
    /// - fundingPnL = positionSize * (currentAccFunding - lastFunding) / WAD
    /// - totalPnL = pricePnL + fundingPnL - fees
    ///
    /// FILL PRICE:
    /// - fillPrice = [indexPrice*(1 + skew/skewScale) + indexPrice*(1 + (skew+size)/skewScale)] / 2
    ///
    /// MARGIN FORMULAS:
    /// - initialMargin = notional * initialMarginRatio + minPositionMargin
    /// - maintenanceMargin = notional * maintenanceMarginRatio + minPositionMargin
    /// - liquidationFeeMargin = notional * liquidationFeeRate
    /// - totalRequiredMargin = sum(maintenanceMargin + liquidationFeeMargin) across all positions
    ///
    /// FEE SPLIT:
    /// - 80% of fees to LP pool, 20% to protocol treasury
}
```

---

## 14. mocks/MockOracle.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

/// @title MockOracle
/// @notice Mock price oracle for testing -- allows setting arbitrary prices without validation
/// @dev Bypasses all deviation, staleness, and signer checks.
///      NEVER deploy this to mainnet or a production testnet.
contract MockOracle is IPriceOracle {

    // ---------------------------------------------------------------
    //  State Variables
    // ---------------------------------------------------------------

    /// @notice Stored prices: marketId => PriceData
    mapping(bytes32 => PriceData) public prices;

    /// @notice Mock signer whitelist
    mapping(address => bool) public signers;

    /// @notice Mock config
    uint256 public maxDeviation;
    uint256 public maxStaleness;
    uint256 public minUpdateInterval;

    /// @notice Registered markets
    mapping(bytes32 => bool) public registeredMarkets;

    // ---------------------------------------------------------------
    //  Events (inherited from IPriceOracle)
    // ---------------------------------------------------------------

    // PriceUpdated, SignerUpdated, ConfigUpdated are inherited

    // ---------------------------------------------------------------
    //  Test Helper Functions (not in interface)
    // ---------------------------------------------------------------

    /// @notice Set a price directly without any validation
    /// @dev Test-only. Sets price and timestamp for a market.
    /// @param marketId Market identifier
    /// @param price Price to set (WAD)
    function setPrice(bytes32 marketId, uint256 price) external;

    /// @notice Set a price with a specific timestamp
    /// @dev Test-only.
    /// @param marketId Market identifier
    /// @param price Price to set (WAD)
    /// @param timestamp Observation timestamp
    function setPriceWithTimestamp(bytes32 marketId, uint256 price, uint256 timestamp) external;

    /// @notice Make a price stale by setting its timestamp far in the past
    /// @dev Test-only.
    /// @param marketId Market identifier
    function makeStale(bytes32 marketId) external;

    // ---------------------------------------------------------------
    //  IPriceOracle Implementation
    // ---------------------------------------------------------------

    /// @notice Update price -- in mock, no signer or deviation checks
    function updatePrice(bytes32 marketId, uint256 price, uint256 timestamp) external override;

    /// @notice Batch update -- delegates to updatePrice for each entry
    function batchUpdatePrices(
        bytes32[] calldata marketIds,
        uint256[] calldata _prices,
        uint256[] calldata timestamps
    ) external override;

    /// @notice No-op in mock -- any address is accepted
    function setSigner(address signer, bool allowed) external override;

    /// @notice No-op in mock
    function setConfig(uint256 _maxDeviation, uint256 _maxStaleness, uint256 _minUpdateInterval) external override;

    /// @notice Register a market and set initial price
    function registerMarket(bytes32 marketId, uint256 initialPrice) external override;

    /// @notice Get price -- always returns stored price, never reverts for staleness
    function getPrice(bytes32 marketId) external view override returns (uint256 price, uint256 timestamp);

    /// @notice Get price unsafe -- same as getPrice in mock, isStale always false
    function getPriceUnsafe(bytes32 marketId) external view override returns (uint256 price, uint256 timestamp, bool isStale);

    /// @notice Always returns true in mock
    function isSigner(address) external pure override returns (bool);

    /// @notice Returns mock config values
    function getConfig() external view override returns (uint256, uint256, uint256);
}
```

---

## 15. Deployment Specification

### Deployment Order

| Order | Contract | Constructor Args | Notes |
|-------|----------|-----------------|-------|
| 1 | `PriceOracle` | `_owner`, `_initialSigner`, `0.05e18`, `43200`, `10` | Deploy first -- no dependencies |
| 2 | `MarketManager` | `_owner` | Deploy second -- no dependencies |
| 3 | `LPToken` | `_pool` (LiquidityPool address) | Deploy with LiquidityPool -- circular: deploy LiquidityPool first, then LPToken is created internally by LiquidityPool constructor |
| 4 | `LiquidityPool` | `_owner`, `tUSDI address`, `_treasury` | Creates LPToken internally |
| 5 | `PerpEngine` | `_owner`, `tUSDI address` | Deploy last |

### Post-Deployment Configuration

| Step | Contract | Function | Args |
|------|----------|----------|------|
| 1 | `PriceOracle` | `registerMarket` | `keccak256("NYC")`, `350e18` (initial NYC price) |
| 2 | `PriceOracle` | `registerMarket` | `keccak256("DUBAI")`, `500e18` (initial Dubai price) |
| 3 | `MarketManager` | `createMarket` | NYC config (see below) |
| 4 | `MarketManager` | `createMarket` | DUBAI config (see below) |
| 5 | `MarketManager` | `setPerpEngine` | PerpEngine address |
| 6 | `LiquidityPool` | `setPerpEngine` | PerpEngine address |
| 7 | `PerpEngine` | `setDependencies` | oracle, marketManager, liquidityPool addresses |

### Suggested Market Configurations

#### NYC Market

| Parameter | Value | Notes |
|-----------|-------|-------|
| name | `"NYC"` | marketId = `keccak256("NYC")` |
| skewScale | `1_000_000e18` | 1M sqft -- moderate impact |
| maxFundingVelocity | `0.1e18` | 10% per day max velocity |
| takerFeeRate | `0.001e18` | 0.1% taker fee |
| makerFeeRate | `0.0005e18` | 0.05% maker fee |
| initialMarginRatio | `0.1e18` | 10% (10x max leverage) |
| maintenanceMarginRatio | `0.05e18` | 5% |
| liquidationFeeRate | `0.01e18` | 1% |
| minPositionMargin | `10e18` | 10 tUSDI minimum |
| maxMarketSkew | `500_000e18` | 500K sqft max skew |

#### DUBAI Market

| Parameter | Value | Notes |
|-----------|-------|-------|
| name | `"DUBAI"` | marketId = `keccak256("DUBAI")` |
| skewScale | `500_000e18` | 500K sqft -- higher impact (less liquid) |
| maxFundingVelocity | `0.15e18` | 15% per day max velocity |
| takerFeeRate | `0.0015e18` | 0.15% taker fee |
| makerFeeRate | `0.00075e18` | 0.075% maker fee |
| initialMarginRatio | `0.1e18` | 10% (10x max leverage) |
| maintenanceMarginRatio | `0.05e18` | 5% |
| liquidationFeeRate | `0.01e18` | 1% |
| minPositionMargin | `10e18` | 10 tUSDI minimum |
| maxMarketSkew | `250_000e18` | 250K sqft max skew |

### Hardhat Ignition Module (reference)

```typescript
// ignition/modules/Deploy.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TUSDI_ADDRESS = "0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f";

const TerraformModule = buildModule("TerraformModule", (m) => {
  const deployer = m.getAccount(0);

  // 1. Oracle
  const oracle = m.contract("PriceOracle", [
    deployer,          // owner
    deployer,          // initial signer
    5n * 10n**16n,     // maxDeviation: 5%
    43200n,            // maxStaleness: 12h
    10n,               // minUpdateInterval: 10s
  ]);

  // 2. MarketManager
  const marketManager = m.contract("MarketManager", [deployer]);

  // 3. LiquidityPool (creates LPToken internally)
  const liquidityPool = m.contract("LiquidityPool", [
    deployer,
    TUSDI_ADDRESS,
    deployer,          // treasury (deployer for testnet)
  ]);

  // 4. PerpEngine
  const perpEngine = m.contract("PerpEngine", [deployer, TUSDI_ADDRESS]);

  return { oracle, marketManager, liquidityPool, perpEngine };
});

export default TerraformModule;
```

---

## 16. Inheritance Map

```
PriceOracle
  ├── OpenZeppelin: Ownable
  └── Custom: IPriceOracle

MarketManager
  ├── OpenZeppelin: Ownable
  └── Custom: IMarketManager

LPToken
  ├── OpenZeppelin: ERC20, Ownable
  └── (no custom interface -- simple mint/burn token)

LiquidityPool
  ├── OpenZeppelin: Ownable, ReentrancyGuard
  ├── Uses: SafeERC20
  └── Custom: ILiquidityPool

PerpEngine
  ├── OpenZeppelin: Ownable, ReentrancyGuard
  ├── Uses: SafeERC20
  ├── Libraries: MathLib, FundingLib, PricingLib
  └── Custom: IPerpEngine

MathLib       — pure library (no inheritance)
FundingLib    — pure library, uses MathLib
PricingLib    — pure library, uses MathLib
MockOracle    — implements IPriceOracle (no Ownable, no guards)
```

---

## 17. Key Invariants (System-Wide)

### Economic Invariants

1. **Zero-sum PnL**: Net PnL across all trader positions + LP pool change = 0 (excluding fees, which are additive to the system).
2. **Fee conservation**: Every trade fee = lpFee + protocolFee, where lpFee = 80% and protocolFee = 20%.
3. **Collateral conservation**: `sum(all account collaterals) + LP pool balance + treasury balance == total tUSDI deposited into the system` (no tUSDI is created or destroyed).
4. **Funding neutrality**: Net funding across all positions flows to/from the LP pool. `sum(fundingPnL for all positions) + LP funding delta == 0`.

### Safety Invariants

5. **Liquidation threshold**: An account is liquidated when `accountValue < sum(maintenanceMargin + liquidationFeeMargin)`. This prevents bad debt under normal conditions.
6. **Initial margin gate**: No position can be opened if it would cause `accountValue < sum(initialMargin)` across all positions.
7. **Withdrawal safety**: Collateral withdrawal cannot cause `accountValue < sum(initialMargin)`.
8. **Oracle freshness**: PerpEngine refuses to execute trades if the oracle price is stale (> 12h).
9. **Skew bounds**: No trade can push `|marketSkew|` beyond `maxMarketSkew`.
10. **Position limit**: No account can hold more than 12 simultaneous positions.
11. **Withdrawal delay**: 24h delay on collateral withdrawal (traders) and LP withdrawal to prevent front-running oracle updates.

### Accounting Invariants

12. **Position consistency**: Every entry in `accountMarketIds[user]` has a corresponding position with `size != 0`. When a position is fully closed, it is removed from both mappings.
13. **Funding settlement**: Funding is always settled (updated) before any position change or liquidation check.
14. **LP token supply**: `lpToken.totalSupply() > 0` iff `liquidityPool.getPoolValue() > 0` (no orphan tokens or missing backing).

---

## Appendix A: Contract File Layout

```
contracts/
├── core/
│   ├── LiquidityPool.sol
│   ├── LPToken.sol
│   ├── MarketManager.sol
│   ├── PerpEngine.sol
│   └── PriceOracle.sol
├── interfaces/
│   ├── ILiquidityPool.sol
│   ├── IMarketManager.sol
│   ├── IPerpEngine.sol
│   └── IPriceOracle.sol
├── libraries/
│   ├── FundingLib.sol
│   ├── MathLib.sol
│   └── PricingLib.sol
└── mocks/
    └── MockOracle.sol
```

## Appendix B: External Dependencies

| Package | Version | Usage |
|---------|---------|-------|
| `@openzeppelin/contracts` | `^5.0.0` | ERC20, Ownable, ReentrancyGuard, SafeERC20 |
| `hardhat` | `^2.19.0` | Compilation, testing, deployment |
| `@nomicfoundation/hardhat-ignition` | `^0.15.0` | Deployment modules |
| `@nomicfoundation/hardhat-toolbox` | `^4.0.0` | Testing utilities, ethers v6 |

## Appendix C: Integration Checklist

### Integra XP System
- [x] `XPAction` event defined in PerpEngine and LiquidityPool
- [x] Emit `FIRST_TRADE` (200 XP) on first trade per account
- [x] Emit `OPEN_POSITION` (100 XP) on every position open
- [x] Emit `CLOSE_POSITION` (75 XP) on every position close
- [x] Emit `LP_DEPOSIT` (100 XP) on every LP deposit
- [x] Emit `LP_WITHDRAW` (50 XP) on every LP withdrawal
- [x] Emit `LIQUIDATION` (150 XP) to liquidation caller

### Integra Ecosystem
- [x] Uses tUSDI (`0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f`) as collateral
- [x] Targets Integra Testnet (Chain ID 26218)
- [x] Solidity 0.8.24+
- [x] OpenZeppelin v5 contracts
- [x] Hardhat + Ignition deployment
- [x] NatSpec on all public functions
- [x] Custom errors (no require strings)
- [x] ReentrancyGuard on all state-changing externals
- [x] SafeERC20 for all token transfers
- [x] Events on every state change
