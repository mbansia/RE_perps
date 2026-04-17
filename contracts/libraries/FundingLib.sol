// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MathLib.sol";

/// @title FundingLib
/// @notice Velocity-based funding rate calculation (Synthetix/Parcl v3 model)
/// @dev Funding rate accelerates while skew persists, incentivizing market balance
library FundingLib {
    using MathLib for int256;
    using MathLib for uint256;

    struct FundingState {
        /// @dev Current funding rate (WAD, signed — positive means longs pay shorts)
        int256 lastFundingRate;
        /// @dev Accumulated funding per unit of position size (price-weighted, WAD)
        int256 lastFundingValue;
        /// @dev Timestamp of last funding computation
        uint256 lastFundingTime;
    }

    /// @notice Compute the current funding rate based on time elapsed and market skew
    /// @param state The last recorded funding state
    /// @param skew Current net skew (longs - shorts in sqft, signed)
    /// @param skewScale Market's skew scale parameter (WAD)
    /// @param maxFundingVelocity Maximum daily funding rate velocity (WAD)
    /// @return currentRate The current funding rate (WAD)
    function currentFundingRate(
        FundingState memory state,
        int256 skew,
        uint256 skewScale,
        uint256 maxFundingVelocity
    ) internal view returns (int256 currentRate) {
        int256 velocity = currentFundingVelocity(skew, skewScale, maxFundingVelocity);
        int256 elapsed = proportionalElapsed(state.lastFundingTime);
        currentRate = state.lastFundingRate + velocity.wadMulSigned(elapsed);
    }

    /// @notice Compute the current funding velocity
    /// @return velocity The funding velocity (WAD, signed)
    function currentFundingVelocity(
        int256 skew,
        uint256 skewScale,
        uint256 maxFundingVelocity
    ) internal pure returns (int256 velocity) {
        if (skewScale == 0) return 0;
        int256 proportionalSkew = skew.wadDivSigned(MathLib.toInt256(skewScale));
        int256 bounded = MathLib.clamp(proportionalSkew, -MathLib.WAD_INT, MathLib.WAD_INT);
        velocity = bounded.wadMulSigned(MathLib.toInt256(maxFundingVelocity));
    }

    /// @notice Compute unrecorded funding since last update
    /// @param state The last recorded funding state
    /// @param skew Current net skew
    /// @param skewScale Market's skew scale
    /// @param maxFundingVelocity Max daily velocity
    /// @param indexPrice Current oracle price (WAD)
    /// @return fundingDelta Change in accumulated funding per unit (WAD)
    /// @return newRate The new funding rate (WAD)
    function unrecordedFunding(
        FundingState memory state,
        int256 skew,
        uint256 skewScale,
        uint256 maxFundingVelocity,
        uint256 indexPrice
    ) internal view returns (int256 fundingDelta, int256 newRate) {
        newRate = currentFundingRate(state, skew, skewScale, maxFundingVelocity);

        // Average funding rate over the elapsed period
        int256 avgRate = (state.lastFundingRate + newRate) / 2;

        // Negate: positive rate means longs pay, so funding per unit is negative for longs
        int256 elapsed = proportionalElapsed(state.lastFundingTime);
        fundingDelta = -avgRate.wadMulSigned(elapsed).wadMulSigned(MathLib.toInt256(indexPrice));
    }

    /// @notice Calculate funding PnL for a position
    /// @param positionSize Signed position size (positive = long, negative = short)
    /// @param currentFundingPerUnit Current accumulated funding per unit
    /// @param entryFundingPerUnit Funding per unit at position entry/last settlement
    /// @return pnl Funding PnL in tUSDI terms (WAD, signed)
    function calculateFundingPnL(
        int256 positionSize,
        int256 currentFundingPerUnit,
        int256 entryFundingPerUnit
    ) internal pure returns (int256 pnl) {
        pnl = positionSize.wadMulSigned(currentFundingPerUnit - entryFundingPerUnit);
    }

    /// @notice Time elapsed since last funding update, as a fraction of 1 day (WAD)
    function proportionalElapsed(uint256 lastTime) internal view returns (int256) {
        if (lastTime == 0) return 0;
        return MathLib.toInt256(((block.timestamp - lastTime) * MathLib.WAD) / 1 days);
    }
}
