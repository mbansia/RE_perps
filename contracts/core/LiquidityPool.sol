// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ILiquidityPool.sol";
import "../libraries/MathLib.sol";
import "./LPToken.sol";

/// @title LiquidityPool
/// @notice Counterparty pool for Terraform perps — LPs deposit tUSDI, earn fees, bear trader PnL
contract LiquidityPool is ILiquidityPool, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using MathLib for uint256;

    IERC20 public immutable collateralToken; // tUSDI
    LPToken public immutable lpToken;

    /// @dev Authorized PerpEngine that can settle PnL and collect fees
    address public perpEngine;

    /// @dev Total tUSDI deposited by LPs (not including unrealized PnL)
    uint256 public totalDeposits;

    /// @dev Accumulated fees earned by the pool (LP's 80% share)
    uint256 public accumulatedFees;

    /// @dev Net PnL settled against the pool (negative = pool has paid out to traders)
    int256 public settledPnL;

    /// @dev Protocol treasury for the 20% fee share
    address public treasury;

    /// @dev Accumulated protocol fees (20% share, withdrawable by treasury)
    uint256 public protocolFees;

    /// @dev 80% of fees to LPs
    uint256 public constant LP_FEE_SHARE = 0.8e18;

    /// @dev Max trader PnL as fraction of pool value (45%)
    uint256 public maxPnlToPoolRatio = 0.45e18;

    /// @dev 24-hour withdrawal delay
    uint256 public constant WITHDRAWAL_DELAY = 24 hours;

    /// @dev Pending withdrawal requests
    mapping(address => WithdrawalRequest) public withdrawalRequests;

    event XPAction(address indexed user, string actionType, uint256 points);

    error OnlyPerpEngine();
    error TreasuryNotSet();

    modifier onlyPerpEngine() {
        if (msg.sender != perpEngine) revert OnlyPerpEngine();
        _;
    }

    constructor(address _collateralToken, address _lpToken) Ownable(msg.sender) {
        collateralToken = IERC20(_collateralToken);
        lpToken = LPToken(_lpToken);
    }

    /// @notice Set the PerpEngine address (one-time setup)
    function setPerpEngine(address _perpEngine) external onlyOwner {
        require(_perpEngine != address(0), "LiquidityPool: zero address");
        perpEngine = _perpEngine;
    }

    /// @notice Set the protocol treasury address
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    /// @notice Set the max PnL-to-pool ratio
    function setMaxPnlToPoolRatio(uint256 _ratio) external onlyOwner {
        maxPnlToPoolRatio = _ratio;
    }

    /// @notice Deposit tUSDI into the LP pool, receive LP tokens
    /// @param amount Amount of tUSDI to deposit (WAD)
    function deposit(uint256 amount) external override nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 currentPoolValue = poolValue();
        uint256 totalSupply = lpToken.totalSupply();

        // Calculate LP tokens to mint
        uint256 lpTokensToMint;
        if (totalSupply == 0 || currentPoolValue == 0) {
            lpTokensToMint = amount; // 1:1 for first deposit
        } else {
            lpTokensToMint = amount.wadMul(totalSupply.wadDiv(currentPoolValue));
        }

        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        totalDeposits += amount;
        lpToken.mint(msg.sender, lpTokensToMint);

        emit Deposited(msg.sender, amount, lpTokensToMint);
        emit XPAction(msg.sender, "lp_deposit", 100);
    }

    /// @notice Request withdrawal of LP tokens (starts 24h delay)
    /// @param lpTokenAmount Amount of LP tokens to withdraw
    function requestWithdrawal(uint256 lpTokenAmount) external override nonReentrant {
        if (lpTokenAmount == 0) revert ZeroAmount();
        require(lpToken.balanceOf(msg.sender) >= lpTokenAmount, "LiquidityPool: insufficient LP tokens");

        withdrawalRequests[msg.sender] = WithdrawalRequest({
            amount: lpTokenAmount,
            requestedAt: block.timestamp
        });

        emit WithdrawalRequested(msg.sender, lpTokenAmount);
    }

    /// @notice Execute a pending withdrawal after 24h delay
    function executeWithdrawal() external override nonReentrant {
        WithdrawalRequest memory request = withdrawalRequests[msg.sender];
        if (request.amount == 0) revert NoWithdrawalPending();
        if (block.timestamp < request.requestedAt + WITHDRAWAL_DELAY) revert WithdrawalNotReady();

        uint256 lpTokenAmount = request.amount;
        uint256 totalSupply = lpToken.totalSupply();
        uint256 currentPoolValue = poolValue();

        // Calculate tUSDI to return
        uint256 collateralToReturn = lpTokenAmount.wadMul(currentPoolValue.wadDiv(totalSupply));

        // Check liquidity
        uint256 available = collateralToken.balanceOf(address(this));
        if (collateralToReturn > available) revert InsufficientLiquidity();

        // Clear request
        delete withdrawalRequests[msg.sender];

        // Burn LP tokens and transfer collateral
        lpToken.burn(msg.sender, lpTokenAmount);
        totalDeposits = totalDeposits > collateralToReturn ? totalDeposits - collateralToReturn : 0;
        collateralToken.safeTransfer(msg.sender, collateralToReturn);

        emit Withdrawn(msg.sender, collateralToReturn, lpTokenAmount);
        emit XPAction(msg.sender, "lp_withdraw", 50);
    }

    /// @notice Settle trader PnL against the pool (called by PerpEngine)
    /// @param traderPnL Positive = trader profit (pool pays), negative = trader loss (pool gains)
    function settleTradePnL(int256 traderPnL) external override onlyPerpEngine {
        settledPnL += traderPnL;

        if (traderPnL > 0) {
            // Trader profit — check PnL cap
            uint256 currentPool = poolValue();
            uint256 maxPnl = currentPool.wadMul(maxPnlToPoolRatio);
            if (uint256(traderPnL) > maxPnl) revert MaxPnlExceeded();
        }

        emit PnLSettled(traderPnL);
    }

    /// @notice Collect trading fees (called by PerpEngine)
    /// @param totalFees Total fees from a trade (WAD)
    function collectFees(uint256 totalFees) external override onlyPerpEngine {
        uint256 lpShare = totalFees.wadMul(LP_FEE_SHARE);
        uint256 protocolShare = totalFees - lpShare;

        accumulatedFees += lpShare;
        protocolFees += protocolShare;

        emit FeesCollected(lpShare, protocolShare);
    }

    /// @notice Withdraw accumulated protocol fees to treasury
    function withdrawProtocolFees() external {
        if (treasury == address(0)) revert TreasuryNotSet();
        uint256 amount = protocolFees;
        protocolFees = 0;
        collateralToken.safeTransfer(treasury, amount);
    }

    /// @notice Current total value of the LP pool
    /// @return value Pool value in tUSDI (WAD)
    function poolValue() public view override returns (uint256 value) {
        // Pool value = deposits + fees + counterparty gains - counterparty losses
        int256 raw = int256(totalDeposits) + int256(accumulatedFees) - settledPnL;
        value = raw > 0 ? uint256(raw) : 0;
    }

    /// @notice Value per LP token
    function lpTokenValue() external view override returns (uint256) {
        uint256 supply = lpToken.totalSupply();
        if (supply == 0) return MathLib.WAD;
        return poolValue().wadDiv(supply);
    }

    /// @notice Maximum PnL the pool can pay out to traders
    function maxTraderPnL() external view override returns (uint256) {
        return poolValue().wadMul(maxPnlToPoolRatio);
    }
}
