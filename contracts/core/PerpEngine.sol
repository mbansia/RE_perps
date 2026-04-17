// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IPerpEngine.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IMarketManager.sol";
import "../interfaces/ILiquidityPool.sol";
import "../libraries/MathLib.sol";
import "../libraries/FundingLib.sol";
import "../libraries/PricingLib.sol";

/// @title PerpEngine
/// @notice Core perpetual futures engine — open/close/modify positions, funding, liquidation
contract PerpEngine is IPerpEngine, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using MathLib for uint256;
    using MathLib for int256;

    // ─── External contracts ─────────────────────────────────────
    IERC20 public immutable collateralToken;
    IPriceOracle public immutable oracle;
    IMarketManager public immutable marketManager;
    ILiquidityPool public liquidityPool;

    // ─── Constants ──────────────────────────────────────────────
    uint256 public constant MAX_POSITIONS = 12;
    uint256 public constant WITHDRAWAL_DELAY = 24 hours;

    // ─── Liquidation rate limiting ──────────────────────────────
    uint256 public maxLiquidationPerWindow = 1000e18; // max sqft liquidatable per window
    uint256 public liquidationWindowSeconds = 1800;    // 30 minutes
    mapping(bytes32 => uint256) private _liquidationWindowStart;
    mapping(bytes32 => uint256) private _liquidatedInWindow;

    // ─── State ──────────────────────────────────────────────────
    mapping(address => Account) private _accounts;
    mapping(address => Position[]) private _positions;
    mapping(bytes32 => MarketState) private _marketStates;

    // ─── First trade tracking for XP ────────────────────────────
    mapping(address => bool) private _hasDeposited;

    constructor(
        address _collateralToken,
        address _oracle,
        address _marketManager,
        address _liquidityPool
    ) Ownable(msg.sender) {
        collateralToken = IERC20(_collateralToken);
        oracle = IPriceOracle(_oracle);
        marketManager = IMarketManager(_marketManager);
        liquidityPool = ILiquidityPool(_liquidityPool);
    }

    // ─── Collateral ─────────────────────────────────────────────

    /// @notice Deposit tUSDI collateral into margin account
    function depositCollateral(uint256 amount) external override nonReentrant {
        require(amount > 0, "PerpEngine: zero amount");

        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        _accounts[msg.sender].collateral += amount;
        _accounts[msg.sender].lastDepositTime = block.timestamp;

        // Transfer to LP pool for unified accounting
        collateralToken.safeIncreaseAllowance(address(liquidityPool), amount);

        emit CollateralDeposited(msg.sender, amount);

        if (!_hasDeposited[msg.sender]) {
            _hasDeposited[msg.sender] = true;
            emit XPAction(msg.sender, "first_deposit", 200);
        }
    }

    /// @notice Withdraw tUSDI collateral (subject to 24h delay and margin requirements)
    function withdrawCollateral(uint256 amount) external override nonReentrant {
        Account storage account = _accounts[msg.sender];
        require(amount > 0, "PerpEngine: zero amount");
        if (block.timestamp < account.lastDepositTime + WITHDRAWAL_DELAY) revert WithdrawalDelayNotMet();

        // Check margin after withdrawal
        uint256 newCollateral = account.collateral - amount;
        require(newCollateral >= _totalRequiredMargin(msg.sender), "PerpEngine: insufficient margin after withdrawal");

        account.collateral = newCollateral;
        collateralToken.safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, amount);
    }

    // ─── Trading ────────────────────────────────────────────────

    /// @notice Open a new position in a market
    /// @param marketId The market to trade (e.g., keccak256("NYC"))
    /// @param sizeDelta Size in sqft (positive = long, negative = short, WAD-scaled)
    function openPosition(bytes32 marketId, int256 sizeDelta) external override nonReentrant {
        if (sizeDelta == 0) revert ZeroSize();
        if (!marketManager.isMarketActive(marketId)) revert MarketNotActive();

        // Check max positions
        require(_positions[msg.sender].length < MAX_POSITIONS, "PerpEngine: max positions");

        // Ensure no existing position in this market
        require(!_hasPosition(msg.sender, marketId), "PerpEngine: use modifyPosition");

        IMarketManager.MarketConfig memory config = marketManager.getMarket(marketId);
        MarketState storage state = _marketStates[marketId];

        // Settle funding before trade
        _settleFunding(marketId, config);

        // Get oracle price
        (uint256 indexPrice, ) = oracle.getPrice(marketId);

        // Check OI limits
        _validateOILimits(state, config, sizeDelta);

        // Calculate fill price
        uint256 fillPrice = PricingLib.calculateFillPrice(indexPrice, state.skew, sizeDelta, config.skewScale);

        // Calculate notional and fees
        uint256 notional = MathLib.abs(sizeDelta).wadMul(fillPrice);
        uint256 fee = PricingLib.calculateTradeFee(sizeDelta, state.skew, notional, config.makerFeeRate, config.takerFeeRate);

        // Create position
        _positions[msg.sender].push(Position({
            marketId: marketId,
            size: MathLib.toInt128(sizeDelta),
            lastFillPrice: MathLib.toUint128(fillPrice),
            lastFundingPerUnit: MathLib.toInt128(state.lastFundingValue),
            lastSettledAt: MathLib.toUint128(block.timestamp)
        }));

        // Update market state
        state.skew += sizeDelta;
        if (sizeDelta > 0) {
            state.totalLongOI += MathLib.abs(sizeDelta);
        } else {
            state.totalShortOI += MathLib.abs(sizeDelta);
        }

        // Update debt correction accumulator
        state.debtCorrectionAccumulator += int256(notional);

        // Deduct fee from collateral
        _accounts[msg.sender].collateral -= fee;

        // Send fees to LP pool
        collateralToken.safeIncreaseAllowance(address(liquidityPool), fee);
        liquidityPool.collectFees(fee);

        // Validate margin
        if (_getAccountValue(msg.sender) < int256(_totalRequiredMargin(msg.sender))) revert InsufficientMargin();

        // XP
        if (!_accounts[msg.sender].hasTraded) {
            _accounts[msg.sender].hasTraded = true;
            emit XPAction(msg.sender, "first_trade", 200);
        }

        emit PositionOpened(msg.sender, marketId, sizeDelta, fillPrice, fee);
        emit XPAction(msg.sender, "open_position", 100);
    }

    /// @notice Close an entire position in a market
    function closePosition(bytes32 marketId) external override nonReentrant {
        (uint256 posIndex, Position storage pos) = _getPositionStorage(msg.sender, marketId);

        IMarketManager.MarketConfig memory config = marketManager.getMarket(marketId);
        MarketState storage state = _marketStates[marketId];

        _settleFunding(marketId, config);

        (uint256 indexPrice, ) = oracle.getPrice(marketId);

        int256 sizeDelta = -int256(int128(pos.size)); // Reverse the position
        uint256 fillPrice = PricingLib.calculateFillPrice(indexPrice, state.skew, sizeDelta, config.skewScale);

        // Calculate PnL
        int256 pricePnL = int256(int128(pos.size)).wadMulSigned(
            int256(uint256(fillPrice)) - int256(uint256(pos.lastFillPrice))
        );
        int256 fundingPnL = FundingLib.calculateFundingPnL(
            int256(int128(pos.size)),
            state.lastFundingValue,
            int256(int128(pos.lastFundingPerUnit))
        );

        uint256 notional = MathLib.abs(sizeDelta).wadMul(fillPrice);
        uint256 fee = PricingLib.calculateTradeFee(sizeDelta, state.skew, notional, config.makerFeeRate, config.takerFeeRate);

        int256 totalPnL = pricePnL + fundingPnL - int256(fee);

        // Update market state
        state.skew += sizeDelta;
        if (pos.size > 0) {
            state.totalLongOI -= MathLib.abs(int256(int128(pos.size)));
        } else {
            state.totalShortOI -= MathLib.abs(int256(int128(pos.size)));
        }

        // Update debt correction
        state.debtCorrectionAccumulator -= int256(uint256(pos.lastFillPrice)).wadMulSigned(int256(int128(pos.size)));

        // Settle PnL
        if (totalPnL > 0) {
            _accounts[msg.sender].collateral += uint256(totalPnL);
            liquidityPool.settleTradePnL(totalPnL);
        } else if (totalPnL < 0) {
            uint256 loss = MathLib.abs(totalPnL);
            _accounts[msg.sender].collateral = _accounts[msg.sender].collateral > loss
                ? _accounts[msg.sender].collateral - loss
                : 0;
            liquidityPool.settleTradePnL(totalPnL);
        }

        // Collect fees
        if (fee > 0) {
            collateralToken.safeIncreaseAllowance(address(liquidityPool), fee);
            liquidityPool.collectFees(fee);
        }

        // Remove position
        _removePosition(msg.sender, posIndex);

        emit PositionClosed(msg.sender, marketId, sizeDelta, fillPrice, totalPnL, fee);
        emit XPAction(msg.sender, "close_position", 75);
    }

    /// @notice Modify an existing position (add or reduce size)
    function modifyPosition(bytes32 marketId, int256 sizeDelta) external override nonReentrant {
        if (sizeDelta == 0) revert ZeroSize();
        if (!marketManager.isMarketActive(marketId)) revert MarketNotActive();

        (, Position storage pos) = _getPositionStorage(msg.sender, marketId);

        IMarketManager.MarketConfig memory config = marketManager.getMarket(marketId);
        MarketState storage state = _marketStates[marketId];

        _settleFunding(marketId, config);

        (uint256 indexPrice, ) = oracle.getPrice(marketId);

        _validateOILimits(state, config, sizeDelta);

        uint256 fillPrice = PricingLib.calculateFillPrice(indexPrice, state.skew, sizeDelta, config.skewScale);

        // Settle existing PnL
        int256 pricePnL = int256(int128(pos.size)).wadMulSigned(
            int256(uint256(fillPrice)) - int256(uint256(pos.lastFillPrice))
        );
        int256 fundingPnL = FundingLib.calculateFundingPnL(
            int256(int128(pos.size)),
            state.lastFundingValue,
            int256(int128(pos.lastFundingPerUnit))
        );

        uint256 notional = MathLib.abs(sizeDelta).wadMul(fillPrice);
        uint256 fee = PricingLib.calculateTradeFee(sizeDelta, state.skew, notional, config.makerFeeRate, config.takerFeeRate);

        int256 settlePnL = pricePnL + fundingPnL - int256(fee);

        // Apply PnL to collateral
        if (settlePnL > 0) {
            _accounts[msg.sender].collateral += uint256(settlePnL);
        } else if (settlePnL < 0) {
            uint256 loss = MathLib.abs(settlePnL);
            _accounts[msg.sender].collateral = _accounts[msg.sender].collateral > loss
                ? _accounts[msg.sender].collateral - loss
                : 0;
        }

        if (settlePnL != 0) {
            liquidityPool.settleTradePnL(settlePnL);
        }
        if (fee > 0) {
            collateralToken.safeIncreaseAllowance(address(liquidityPool), fee);
            liquidityPool.collectFees(fee);
        }

        int256 oldSize = int256(int128(pos.size));
        int256 newSize = oldSize + sizeDelta;

        // Update OI
        if (oldSize > 0) state.totalLongOI -= MathLib.abs(oldSize);
        else if (oldSize < 0) state.totalShortOI -= MathLib.abs(oldSize);
        if (newSize > 0) state.totalLongOI += MathLib.abs(newSize);
        else if (newSize < 0) state.totalShortOI += MathLib.abs(newSize);

        // Update skew
        state.skew += sizeDelta;

        // Update debt correction
        state.debtCorrectionAccumulator += sizeDelta.wadMulSigned(int256(uint256(fillPrice)));

        // Update position
        pos.size = MathLib.toInt128(newSize);
        pos.lastFillPrice = MathLib.toUint128(fillPrice);
        pos.lastFundingPerUnit = MathLib.toInt128(state.lastFundingValue);
        pos.lastSettledAt = MathLib.toUint128(block.timestamp);

        // Validate margin
        if (newSize == 0) {
            // Position fully closed via modify
            // Find and remove
            _removePositionByMarket(msg.sender, marketId);
        } else {
            if (_getAccountValue(msg.sender) < int256(_totalRequiredMargin(msg.sender))) revert InsufficientMargin();
        }

        emit PositionModified(msg.sender, marketId, oldSize, newSize, fillPrice, fee);
    }

    // ─── Liquidation ────────────────────────────────────────────

    /// @notice Liquidate an account that is below maintenance margin
    /// @param trader The account to liquidate
    function liquidate(address trader) external override nonReentrant {
        // Check liquidatable
        if (_getAccountValue(trader) >= int256(_totalRequiredMargin(trader))) revert AccountNotLiquidatable();

        Position[] storage positions = _positions[trader];
        uint256 totalLiquidationFee = 0;

        for (uint256 i = positions.length; i > 0; i--) {
            Position storage pos = positions[i - 1];
            bytes32 marketId = pos.marketId;

            IMarketManager.MarketConfig memory config = marketManager.getMarket(marketId);
            MarketState storage state = _marketStates[marketId];

            // Rate limit check
            _checkLiquidationRateLimit(marketId, MathLib.abs(int256(int128(pos.size))));

            _settleFunding(marketId, config);

            (uint256 indexPrice, ) = oracle.getPrice(marketId);

            // Close at index price (not fill price — liquidations use oracle price)
            int256 sizeDelta = -int256(int128(pos.size));
            uint256 notional = MathLib.abs(sizeDelta).wadMul(indexPrice);
            uint256 liqFee = notional.wadMul(config.liquidationFeeRate);
            totalLiquidationFee += liqFee;

            // Update market state
            state.skew += sizeDelta;
            if (pos.size > 0) {
                state.totalLongOI -= MathLib.abs(int256(int128(pos.size)));
            } else {
                state.totalShortOI -= MathLib.abs(int256(int128(pos.size)));
            }

            // Update debt correction
            state.debtCorrectionAccumulator -= int256(uint256(pos.lastFillPrice)).wadMulSigned(int256(int128(pos.size)));

            emit PositionLiquidated(trader, msg.sender, marketId, int256(int128(pos.size)), liqFee);
        }

        // Full liquidation: all remaining collateral goes to LP pool
        uint256 remainingCollateral = _accounts[trader].collateral;

        // Pay liquidation fee to caller
        uint256 liquidatorReward = MathLib.min(totalLiquidationFee, remainingCollateral);
        uint256 poolReceives = remainingCollateral - liquidatorReward;

        // Clear account
        delete _positions[trader];
        _accounts[trader].collateral = 0;

        // Transfer rewards
        if (liquidatorReward > 0) {
            collateralToken.safeTransfer(msg.sender, liquidatorReward);
        }
        if (poolReceives > 0) {
            liquidityPool.settleTradePnL(-int256(poolReceives)); // Negative = pool gains
        }

        emit XPAction(msg.sender, "liquidation", 150);
    }

    // ─── View functions ─────────────────────────────────────────

    /// @notice Get the total account value (collateral + unrealized PnL)
    function getAccountValue(address trader) external view override returns (int256) {
        return _getAccountValue(trader);
    }

    /// @notice Get a specific position
    function getPosition(address trader, bytes32 marketId) external view override returns (Position memory) {
        Position[] storage positions = _positions[trader];
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].marketId == marketId) return positions[i];
        }
        revert PositionNotFound();
    }

    /// @notice Get all positions for a trader
    function getPositions(address trader) external view override returns (Position[] memory) {
        return _positions[trader];
    }

    /// @notice Get market state
    function getMarketState(bytes32 marketId) external view override returns (MarketState memory) {
        return _marketStates[marketId];
    }

    /// @notice Get account details
    function getAccount(address trader) external view returns (Account memory) {
        return _accounts[trader];
    }

    /// @notice Get total required margin for an account
    function getTotalRequiredMargin(address trader) external view returns (uint256) {
        return _totalRequiredMargin(trader);
    }

    // ─── Admin ──────────────────────────────────────────────────

    function setLiquidationParams(uint256 _maxPerWindow, uint256 _windowSeconds) external onlyOwner {
        maxLiquidationPerWindow = _maxPerWindow;
        liquidationWindowSeconds = _windowSeconds;
    }

    // ─── Internal ───────────────────────────────────────────────

    function _getAccountValue(address trader) internal view returns (int256) {
        int256 value = int256(_accounts[trader].collateral);
        Position[] storage positions = _positions[trader];

        for (uint256 i = 0; i < positions.length; i++) {
            Position storage pos = positions[i];
            MarketState storage state = _marketStates[pos.marketId];

            (uint256 indexPrice, ) = oracle.getPrice(pos.marketId);

            // Unrealized price PnL
            int256 pricePnL = int256(int128(pos.size)).wadMulSigned(
                int256(indexPrice) - int256(uint256(pos.lastFillPrice))
            );

            // Unrealized funding PnL
            IMarketManager.MarketConfig memory config = marketManager.getMarket(pos.marketId);
            (int256 fundingDelta, ) = FundingLib.unrecordedFunding(
                FundingLib.FundingState(state.lastFundingRate, state.lastFundingValue, state.lastFundingTime),
                state.skew,
                config.skewScale,
                config.maxFundingVelocity,
                indexPrice
            );
            int256 currentFundingPerUnit = state.lastFundingValue + fundingDelta;
            int256 fundingPnL = FundingLib.calculateFundingPnL(
                int256(int128(pos.size)),
                currentFundingPerUnit,
                int256(int128(pos.lastFundingPerUnit))
            );

            value += pricePnL + fundingPnL;
        }

        return value;
    }

    function _totalRequiredMargin(address trader) internal view returns (uint256 total) {
        Position[] storage positions = _positions[trader];

        for (uint256 i = 0; i < positions.length; i++) {
            Position storage pos = positions[i];
            IMarketManager.MarketConfig memory config = marketManager.getMarket(pos.marketId);
            (uint256 indexPrice, ) = oracle.getPrice(pos.marketId);

            uint256 notional = MathLib.abs(int256(int128(pos.size))).wadMul(indexPrice);
            uint256 maintenance = notional.wadMul(config.maintenanceMarginRatio);
            uint256 liqFeeMargin = notional.wadMul(config.liquidationFeeRate);

            total += maintenance + liqFeeMargin + config.minPositionMargin;
        }
    }

    function _settleFunding(bytes32 marketId, IMarketManager.MarketConfig memory config) internal {
        MarketState storage state = _marketStates[marketId];

        if (state.lastFundingTime == 0) {
            state.lastFundingTime = block.timestamp;
            return;
        }

        (uint256 indexPrice, ) = oracle.getPrice(marketId);

        (int256 fundingDelta, int256 newRate) = FundingLib.unrecordedFunding(
            FundingLib.FundingState(state.lastFundingRate, state.lastFundingValue, state.lastFundingTime),
            state.skew,
            config.skewScale,
            config.maxFundingVelocity,
            indexPrice
        );

        state.lastFundingRate = newRate;
        state.lastFundingValue += fundingDelta;
        state.lastFundingTime = block.timestamp;

        emit FundingUpdated(marketId, newRate, state.lastFundingValue);
    }

    function _validateOILimits(MarketState storage state, IMarketManager.MarketConfig memory config, int256 sizeDelta) internal view {
        // Check skew limit
        int256 newSkew = state.skew + sizeDelta;
        if (MathLib.abs(newSkew) > config.maxMarketSkew) revert ExceedsMaxSkew();

        // Check per-side OI limits
        if (sizeDelta > 0 && state.totalLongOI + MathLib.abs(sizeDelta) > config.maxLongOI) revert ExceedsMaxOI();
        if (sizeDelta < 0 && state.totalShortOI + MathLib.abs(sizeDelta) > config.maxShortOI) revert ExceedsMaxOI();
    }

    function _checkLiquidationRateLimit(bytes32 marketId, uint256 sizeToLiquidate) internal {
        uint256 windowStart = _liquidationWindowStart[marketId];

        if (block.timestamp > windowStart + liquidationWindowSeconds) {
            // New window
            _liquidationWindowStart[marketId] = block.timestamp;
            _liquidatedInWindow[marketId] = sizeToLiquidate;
        } else {
            uint256 newTotal = _liquidatedInWindow[marketId] + sizeToLiquidate;
            if (newTotal > maxLiquidationPerWindow) revert LiquidationRateLimited();
            _liquidatedInWindow[marketId] = newTotal;
        }
    }

    function _hasPosition(address trader, bytes32 marketId) internal view returns (bool) {
        Position[] storage positions = _positions[trader];
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].marketId == marketId) return true;
        }
        return false;
    }

    function _getPositionStorage(address trader, bytes32 marketId) internal view returns (uint256 index, Position storage pos) {
        Position[] storage positions = _positions[trader];
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].marketId == marketId) {
                return (i, positions[i]);
            }
        }
        revert PositionNotFound();
    }

    function _removePosition(address trader, uint256 index) internal {
        Position[] storage positions = _positions[trader];
        positions[index] = positions[positions.length - 1];
        positions.pop();
    }

    function _removePositionByMarket(address trader, bytes32 marketId) internal {
        Position[] storage positions = _positions[trader];
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].marketId == marketId) {
                positions[i] = positions[positions.length - 1];
                positions.pop();
                return;
            }
        }
    }
}
