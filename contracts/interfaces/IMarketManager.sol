// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMarketManager
/// @notice Interface for market configuration registry
interface IMarketManager {
    struct MarketConfig {
        string name;
        bytes32 marketId;
        uint256 skewScale;            // WAD — higher = less price impact per unit of skew
        uint256 maxFundingVelocity;   // WAD — max daily funding rate change
        uint256 takerFeeRate;         // WAD — fee for trades increasing skew
        uint256 makerFeeRate;         // WAD — fee for trades reducing skew
        uint256 initialMarginRatio;   // WAD — minimum initial margin (e.g., 0.1e18 = 10%)
        uint256 maintenanceMarginRatio; // WAD
        uint256 liquidationFeeRate;   // WAD — fee paid to liquidator
        uint256 minPositionMargin;    // WAD — absolute minimum margin per position
        uint256 maxMarketSkew;        // WAD — max allowed absolute skew
        uint256 maxLongOI;            // WAD — max total long open interest
        uint256 maxShortOI;           // WAD — max total short open interest
        bool active;
    }

    event MarketAdded(bytes32 indexed marketId, string name);
    event MarketUpdated(bytes32 indexed marketId);
    event MarketPaused(bytes32 indexed marketId);
    event MarketUnpaused(bytes32 indexed marketId);

    error MarketNotFound();
    error MarketAlreadyExists();
    error MarketNotActive();

    function getMarket(bytes32 marketId) external view returns (MarketConfig memory);
    function isMarketActive(bytes32 marketId) external view returns (bool);
    function getMarketIds() external view returns (bytes32[] memory);
}
