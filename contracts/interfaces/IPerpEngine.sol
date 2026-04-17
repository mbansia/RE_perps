// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPerpEngine
/// @notice Interface for the core perpetual futures engine
interface IPerpEngine {
    struct Position {
        bytes32 marketId;
        int128 size;                      // sqft (positive = long, negative = short)
        uint128 lastFillPrice;            // WAD
        int128 lastFundingPerUnit;        // WAD
        uint128 lastSettledAt;            // timestamp
    }

    struct Account {
        uint256 collateral;               // tUSDI deposited (WAD)
        uint256 lastDepositTime;          // for 24h withdrawal delay
        bool hasTraded;                   // for first-trade XP bonus
    }

    struct MarketState {
        int256 skew;                      // net skew (WAD, signed)
        uint256 totalLongOI;              // total long open interest in sqft (WAD)
        uint256 totalShortOI;             // total short open interest in sqft (WAD)
        int256 lastFundingRate;           // WAD
        int256 lastFundingValue;          // accumulated funding per unit (WAD)
        uint256 lastFundingTime;          // timestamp
        int256 debtCorrectionAccumulator; // for O(1) pool debt calc
    }

    event PositionOpened(address indexed trader, bytes32 indexed marketId, int256 size, uint256 fillPrice, uint256 fee);
    event PositionClosed(address indexed trader, bytes32 indexed marketId, int256 size, uint256 fillPrice, int256 pnl, uint256 fee);
    event PositionModified(address indexed trader, bytes32 indexed marketId, int256 oldSize, int256 newSize, uint256 fillPrice, uint256 fee);
    event PositionLiquidated(address indexed trader, address indexed liquidator, bytes32 indexed marketId, int256 size, uint256 liquidationFee);
    event CollateralDeposited(address indexed trader, uint256 amount);
    event CollateralWithdrawn(address indexed trader, uint256 amount);
    event FundingUpdated(bytes32 indexed marketId, int256 fundingRate, int256 fundingValue);
    event XPAction(address indexed user, string actionType, uint256 points);

    error InsufficientMargin();
    error MaxPositionsReached();
    error PositionNotFound();
    error WithdrawalDelayNotMet();
    error MarketNotActive();
    error AccountNotLiquidatable();
    error ExceedsMaxSkew();
    error ExceedsMaxOI();
    error LiquidationRateLimited();
    error ZeroSize();

    function depositCollateral(uint256 amount) external;
    function withdrawCollateral(uint256 amount) external;
    function openPosition(bytes32 marketId, int256 sizeDelta) external;
    function closePosition(bytes32 marketId) external;
    function modifyPosition(bytes32 marketId, int256 sizeDelta) external;
    function liquidate(address trader) external;
    function getAccountValue(address trader) external view returns (int256);
    function getPosition(address trader, bytes32 marketId) external view returns (Position memory);
    function getPositions(address trader) external view returns (Position[] memory);
    function getMarketState(bytes32 marketId) external view returns (MarketState memory);
}
