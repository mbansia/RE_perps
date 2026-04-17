// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MathLib
/// @notice Signed and unsigned fixed-point WAD (1e18) arithmetic for Terraform
library MathLib {
    uint256 internal constant WAD = 1e18;
    int256 internal constant WAD_INT = 1e18;

    /// @notice Multiply two unsigned WADs: (a * b) / 1e18
    function wadMul(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * b) / WAD;
    }

    /// @notice Divide two unsigned WADs: (a * 1e18) / b
    function wadDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0, "MathLib: division by zero");
        return (a * WAD) / b;
    }

    /// @notice Multiply two signed WADs: (a * b) / 1e18
    function wadMulSigned(int256 a, int256 b) internal pure returns (int256) {
        return (a * b) / WAD_INT;
    }

    /// @notice Divide two signed WADs: (a * 1e18) / b
    function wadDivSigned(int256 a, int256 b) internal pure returns (int256) {
        require(b != 0, "MathLib: division by zero");
        return (a * WAD_INT) / b;
    }

    /// @notice Absolute value of a signed integer
    function abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }

    /// @notice Clamp a signed value between min and max
    function clamp(int256 value, int256 lower, int256 upper) internal pure returns (int256) {
        if (value < lower) return lower;
        if (value > upper) return upper;
        return value;
    }

    /// @notice Safe cast from uint256 to int256
    function toInt256(uint256 x) internal pure returns (int256) {
        require(x <= uint256(type(int256).max), "MathLib: overflow");
        return int256(x);
    }

    /// @notice Safe cast from int256 to uint256
    function toUint256(int256 x) internal pure returns (uint256) {
        require(x >= 0, "MathLib: negative");
        return uint256(x);
    }

    /// @notice Safe cast from int256 to int128
    function toInt128(int256 x) internal pure returns (int128) {
        require(x >= type(int128).min && x <= type(int128).max, "MathLib: int128 overflow");
        return int128(x);
    }

    /// @notice Safe cast from uint256 to uint128
    function toUint128(uint256 x) internal pure returns (uint128) {
        require(x <= type(uint128).max, "MathLib: uint128 overflow");
        return uint128(x);
    }

    /// @notice Minimum of two unsigned values
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /// @notice Maximum of two unsigned values
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }

    /// @notice Minimum of two signed values
    function minSigned(int256 a, int256 b) internal pure returns (int256) {
        return a < b ? a : b;
    }

    /// @notice Maximum of two signed values
    function maxSigned(int256 a, int256 b) internal pure returns (int256) {
        return a > b ? a : b;
    }
}
