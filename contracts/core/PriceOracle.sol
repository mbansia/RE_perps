// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "../interfaces/IPriceOracle.sol";

/// @title PriceOracle
/// @notice Stores EIP-712 signed real estate index prices for Terraform markets
/// @dev Prices are pushed by an off-chain Playwright scraper service 4x/day
contract PriceOracle is IPriceOracle, Ownable, EIP712 {
    using ECDSA for bytes32;

    bytes32 private constant PRICE_TYPEHASH =
        keccak256("PriceUpdate(bytes32 marketId,uint256 price,uint256 timestamp)");

    bytes32 private constant BATCH_PRICE_TYPEHASH =
        keccak256("BatchPriceUpdate(bytes32[] marketIds,uint256[] prices,uint256[] timestamps)");

    /// @dev Authorized price signers
    mapping(address => bool) public override isSigner;

    /// @dev Latest price per market
    mapping(bytes32 => PriceData) private _prices;

    /// @dev Maximum allowed staleness before price is considered invalid (default 12h)
    uint256 public override maxStaleness = 12 hours;

    /// @dev Maximum allowed deviation per update (default 5%, WAD)
    uint256 public override maxDeviation = 0.05e18;

    constructor() Ownable(msg.sender) EIP712("TerraformOracle", "1") {}

    /// @notice Get the latest price for a market
    function getPrice(bytes32 marketId) external view override returns (uint256 price, uint256 timestamp) {
        PriceData memory data = _prices[marketId];
        require(data.price > 0, "PriceOracle: no price");
        require(block.timestamp - data.updatedAt <= maxStaleness, "PriceOracle: stale");
        return (data.price, data.timestamp);
    }

    /// @notice Get raw price data without staleness check (for views)
    function getRawPrice(bytes32 marketId) external view returns (PriceData memory) {
        return _prices[marketId];
    }

    /// @notice Update price for a single market with EIP-712 signature
    function updatePrice(
        bytes32 marketId,
        uint256 price,
        uint256 timestamp,
        bytes calldata signature
    ) external override {
        _validateAndUpdatePrice(marketId, price, timestamp, signature);
    }

    /// @notice Update prices for multiple markets with a single batch signature
    function updatePricesBatch(
        bytes32[] calldata marketIds,
        uint256[] calldata prices,
        uint256[] calldata timestamps,
        bytes calldata signature
    ) external override {
        require(marketIds.length == prices.length && prices.length == timestamps.length, "PriceOracle: length mismatch");

        // Verify batch signature
        bytes32 structHash = keccak256(abi.encode(
            BATCH_PRICE_TYPEHASH,
            keccak256(abi.encodePacked(marketIds)),
            keccak256(abi.encodePacked(prices)),
            keccak256(abi.encodePacked(timestamps))
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        if (!isSigner[signer]) revert UnauthorizedSigner();

        for (uint256 i = 0; i < marketIds.length; i++) {
            _updatePrice(marketIds[i], prices[i], timestamps[i]);
        }
    }

    /// @notice Add or remove an authorized signer
    function setSigner(address signer, bool authorized) external onlyOwner {
        isSigner[signer] = authorized;
        emit SignerUpdated(signer, authorized);
    }

    /// @notice Update the maximum staleness window
    function setMaxStaleness(uint256 _maxStaleness) external onlyOwner {
        maxStaleness = _maxStaleness;
    }

    /// @notice Update the maximum price deviation
    function setMaxDeviation(uint256 _maxDeviation) external onlyOwner {
        maxDeviation = _maxDeviation;
        emit MaxDeviationUpdated(_maxDeviation);
    }

    function _validateAndUpdatePrice(
        bytes32 marketId,
        uint256 price,
        uint256 timestamp,
        bytes calldata signature
    ) internal {
        bytes32 structHash = keccak256(abi.encode(PRICE_TYPEHASH, marketId, price, timestamp));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        if (!isSigner[signer]) revert UnauthorizedSigner();

        _updatePrice(marketId, price, timestamp);
    }

    function _updatePrice(bytes32 marketId, uint256 price, uint256 timestamp) internal {
        if (price == 0) revert InvalidPrice();

        PriceData storage existing = _prices[marketId];

        // Deviation check (skip for first price)
        if (existing.price > 0) {
            uint256 deviation;
            if (price > existing.price) {
                deviation = ((price - existing.price) * 1e18) / existing.price;
            } else {
                deviation = ((existing.price - price) * 1e18) / existing.price;
            }
            if (deviation > maxDeviation) revert PriceDeviationTooLarge();
        }

        // Timestamp must be newer than last update
        require(timestamp > existing.timestamp || existing.timestamp == 0, "PriceOracle: old timestamp");

        existing.price = price;
        existing.timestamp = timestamp;
        existing.updatedAt = block.timestamp;

        emit PriceUpdated(marketId, price, timestamp);
    }

    /// @notice Get the EIP-712 domain separator (for off-chain signing)
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
