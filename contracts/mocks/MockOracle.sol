// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IPriceOracle.sol";

/// @title MockOracle
/// @notice Simple mock oracle for testing — admin sets prices directly, no signatures required
contract MockOracle is IPriceOracle {
    mapping(bytes32 => PriceData) private _prices;
    mapping(address => bool) public override isSigner;

    uint256 public override maxStaleness = 12 hours;
    uint256 public override maxDeviation = 0.05e18;

    /// @notice Set a price directly (for testing only)
    function setPrice(bytes32 marketId, uint256 price) external {
        _prices[marketId] = PriceData({
            price: price,
            timestamp: block.timestamp,
            updatedAt: block.timestamp
        });
        emit PriceUpdated(marketId, price, block.timestamp);
    }

    function getPrice(bytes32 marketId) external view override returns (uint256 price, uint256 timestamp) {
        PriceData memory data = _prices[marketId];
        require(data.price > 0, "MockOracle: no price");
        return (data.price, data.timestamp);
    }

    function updatePrice(bytes32, uint256, uint256, bytes calldata) external pure override {
        revert("MockOracle: use setPrice");
    }

    function updatePricesBatch(bytes32[] calldata, uint256[] calldata, uint256[] calldata, bytes calldata) external pure override {
        revert("MockOracle: use setPrice");
    }
}
