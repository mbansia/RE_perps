// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPriceOracle
/// @notice Interface for the Terraform price oracle — stores signed real estate index prices
interface IPriceOracle {
    struct PriceData {
        uint256 price;       // Median $/sqft (WAD)
        uint256 timestamp;   // When this price was observed off-chain
        uint256 updatedAt;   // When this price was submitted on-chain
    }

    event PriceUpdated(bytes32 indexed marketId, uint256 price, uint256 timestamp);
    event SignerUpdated(address indexed signer, bool authorized);
    event MaxDeviationUpdated(uint256 newDeviation);

    error UnauthorizedSigner();
    error StalePrice();
    error PriceDeviationTooLarge();
    error InvalidPrice();
    error InvalidSignature();

    function getPrice(bytes32 marketId) external view returns (uint256 price, uint256 timestamp);
    function updatePrice(bytes32 marketId, uint256 price, uint256 timestamp, bytes calldata signature) external;
    function updatePricesBatch(bytes32[] calldata marketIds, uint256[] calldata prices, uint256[] calldata timestamps, bytes calldata signature) external;
    function isSigner(address account) external view returns (bool);
    function maxStaleness() external view returns (uint256);
    function maxDeviation() external view returns (uint256);
}
