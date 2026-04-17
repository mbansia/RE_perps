// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MathLib.sol";

/// @title PricingLib
/// @notice Skew-adjusted fill price calculation (Parcl v3 / Synthetix model)
/// @dev Trades that reduce skew get better prices; trades that increase skew pay a premium
library PricingLib {
    using MathLib for int256;
    using MathLib for uint256;

    /// @notice Calculate the skew-adjusted fill price for a trade
    /// @dev fillPrice = avg( indexPrice * (1 + skew/scale), indexPrice * (1 + (skew+size)/scale) )
    /// @param indexPrice Current oracle index price (WAD)
    /// @param skew Current net market skew (WAD, signed)
    /// @param tradeSize Size of the trade (WAD, signed — positive for buy/long, negative for sell/short)
    /// @param skewScale Market's skew scale parameter (WAD)
    /// @return fillPrice The skew-adjusted fill price (WAD)
    function calculateFillPrice(
        uint256 indexPrice,
        int256 skew,
        int256 tradeSize,
        uint256 skewScale
    ) internal pure returns (uint256 fillPrice) {
        require(indexPrice > 0, "PricingLib: zero price");
        require(skewScale > 0, "PricingLib: zero skewScale");

        int256 price = MathLib.toInt256(indexPrice);
        int256 scale = MathLib.toInt256(skewScale);

        // Price adjusted for current skew: indexPrice * (1 + skew/skewScale)
        int256 pdBefore = skew.wadDivSigned(scale);
        int256 priceBefore = price + price.wadMulSigned(pdBefore);

        // Price adjusted for skew after trade: indexPrice * (1 + (skew + tradeSize)/skewScale)
        int256 pdAfter = (skew + tradeSize).wadDivSigned(scale);
        int256 priceAfter = price + price.wadMulSigned(pdAfter);

        // Fill price is the average
        int256 fill = (priceBefore + priceAfter) / 2;

        // Fill price must be positive
        require(fill > 0, "PricingLib: negative fill price");
        fillPrice = MathLib.toUint256(fill);
    }

    /// @notice Calculate the premium/discount for current skew
    /// @param skew Current net skew (WAD, signed)
    /// @param skewScale Market's skew scale (WAD)
    /// @return pd Premium/discount ratio (WAD, signed — positive = premium, negative = discount)
    function premiumDiscount(int256 skew, uint256 skewScale) internal pure returns (int256 pd) {
        if (skewScale == 0) return 0;
        pd = skew.wadDivSigned(MathLib.toInt256(skewScale));
    }

    /// @notice Calculate trading fee based on skew impact
    /// @param tradeSize Signed trade size
    /// @param skew Current net skew before trade
    /// @param notionalValue Absolute notional value of the trade (WAD)
    /// @param makerFeeRate Fee rate for trades reducing skew (WAD)
    /// @param takerFeeRate Fee rate for trades increasing skew (WAD)
    /// @return fee Total fee in collateral terms (WAD)
    function calculateTradeFee(
        int256 tradeSize,
        int256 skew,
        uint256 notionalValue,
        uint256 makerFeeRate,
        uint256 takerFeeRate
    ) internal pure returns (uint256 fee) {
        int256 skewAfter = skew + tradeSize;

        // If trade doesn't cross zero skew, it's purely maker or taker
        bool sameSide = (skew >= 0 && skewAfter >= 0) || (skew <= 0 && skewAfter <= 0);

        if (sameSide) {
            // Entirely maker or taker based on whether it reduces or increases |skew|
            bool reducesSkew = MathLib.abs(skewAfter) < MathLib.abs(skew);
            uint256 rate = reducesSkew ? makerFeeRate : takerFeeRate;
            fee = notionalValue.wadMul(rate);
        } else {
            // Trade crosses zero skew — blend maker and taker portions
            uint256 absSkew = MathLib.abs(skew);
            uint256 absSize = MathLib.abs(tradeSize);
            // Maker portion reduces skew to zero
            uint256 makerPortion = (absSkew * MathLib.WAD) / absSize;
            uint256 takerPortion = MathLib.WAD - makerPortion;
            fee = notionalValue.wadMul(makerPortion).wadMul(makerFeeRate) / MathLib.WAD
                + notionalValue.wadMul(takerPortion).wadMul(takerFeeRate) / MathLib.WAD;
        }
    }
}
