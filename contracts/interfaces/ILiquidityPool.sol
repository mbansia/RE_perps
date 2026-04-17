// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ILiquidityPool
/// @notice Interface for the Terraform LP pool — counterparty to all trades
interface ILiquidityPool {
    struct WithdrawalRequest {
        uint256 amount;     // LP tokens to burn
        uint256 requestedAt;
    }

    event Deposited(address indexed user, uint256 amount, uint256 lpTokensMinted);
    event WithdrawalRequested(address indexed user, uint256 lpTokens);
    event Withdrawn(address indexed user, uint256 amount, uint256 lpTokensBurned);
    event FeesCollected(uint256 lpShare, uint256 protocolShare);
    event PnLSettled(int256 traderPnL);

    error InsufficientLiquidity();
    error WithdrawalNotReady();
    error NoWithdrawalPending();
    error ZeroAmount();
    error MaxPnlExceeded();

    function deposit(uint256 amount) external;
    function requestWithdrawal(uint256 lpTokenAmount) external;
    function executeWithdrawal() external;
    function poolValue() external view returns (uint256);
    function lpTokenValue() external view returns (uint256);
    function settleTradePnL(int256 traderPnL) external;
    function collectFees(uint256 totalFees) external;
    function maxTraderPnL() external view returns (uint256);
}
