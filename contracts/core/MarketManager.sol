// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IMarketManager.sol";

/// @title MarketManager
/// @notice Registry of Terraform markets (NYC, Dubai) and their trading parameters
contract MarketManager is IMarketManager, Ownable {
    /// @dev All market configs by marketId
    mapping(bytes32 => MarketConfig) private _markets;

    /// @dev List of all market IDs
    bytes32[] private _marketIds;

    constructor() Ownable(msg.sender) {}

    /// @notice Add a new market
    /// @param name Human-readable name (e.g., "NYC", "DUBAI")
    /// @param config Full market configuration
    function addMarket(string calldata name, MarketConfig calldata config) external onlyOwner {
        bytes32 marketId = keccak256(abi.encodePacked(name));
        if (_markets[marketId].marketId != bytes32(0)) revert MarketAlreadyExists();

        MarketConfig storage m = _markets[marketId];
        m.name = name;
        m.marketId = marketId;
        m.skewScale = config.skewScale;
        m.maxFundingVelocity = config.maxFundingVelocity;
        m.takerFeeRate = config.takerFeeRate;
        m.makerFeeRate = config.makerFeeRate;
        m.initialMarginRatio = config.initialMarginRatio;
        m.maintenanceMarginRatio = config.maintenanceMarginRatio;
        m.liquidationFeeRate = config.liquidationFeeRate;
        m.minPositionMargin = config.minPositionMargin;
        m.maxMarketSkew = config.maxMarketSkew;
        m.maxLongOI = config.maxLongOI;
        m.maxShortOI = config.maxShortOI;
        m.active = true;

        _marketIds.push(marketId);

        emit MarketAdded(marketId, name);
    }

    /// @notice Update an existing market's parameters
    function updateMarket(bytes32 marketId, MarketConfig calldata config) external onlyOwner {
        if (_markets[marketId].marketId == bytes32(0)) revert MarketNotFound();

        MarketConfig storage m = _markets[marketId];
        m.skewScale = config.skewScale;
        m.maxFundingVelocity = config.maxFundingVelocity;
        m.takerFeeRate = config.takerFeeRate;
        m.makerFeeRate = config.makerFeeRate;
        m.initialMarginRatio = config.initialMarginRatio;
        m.maintenanceMarginRatio = config.maintenanceMarginRatio;
        m.liquidationFeeRate = config.liquidationFeeRate;
        m.minPositionMargin = config.minPositionMargin;
        m.maxMarketSkew = config.maxMarketSkew;
        m.maxLongOI = config.maxLongOI;
        m.maxShortOI = config.maxShortOI;

        emit MarketUpdated(marketId);
    }

    /// @notice Pause a market (disables new trades)
    function pauseMarket(bytes32 marketId) external onlyOwner {
        if (_markets[marketId].marketId == bytes32(0)) revert MarketNotFound();
        _markets[marketId].active = false;
        emit MarketPaused(marketId);
    }

    /// @notice Unpause a market
    function unpauseMarket(bytes32 marketId) external onlyOwner {
        if (_markets[marketId].marketId == bytes32(0)) revert MarketNotFound();
        _markets[marketId].active = true;
        emit MarketUnpaused(marketId);
    }

    /// @notice Get a market's full configuration
    function getMarket(bytes32 marketId) external view override returns (MarketConfig memory) {
        if (_markets[marketId].marketId == bytes32(0)) revert MarketNotFound();
        return _markets[marketId];
    }

    /// @notice Check if a market is active
    function isMarketActive(bytes32 marketId) external view override returns (bool) {
        return _markets[marketId].active;
    }

    /// @notice Get all market IDs
    function getMarketIds() external view override returns (bytes32[] memory) {
        return _marketIds;
    }

    /// @notice Helper: compute marketId from name
    function computeMarketId(string calldata name) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(name));
    }
}
