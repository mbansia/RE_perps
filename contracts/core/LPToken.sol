// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title LPToken
/// @notice ERC-20 token representing liquidity provider shares in the Terraform pool
contract LPToken is ERC20, Ownable {
    /// @dev Only the LiquidityPool contract can mint/burn
    address public pool;

    error OnlyPool();

    modifier onlyPool() {
        if (msg.sender != pool) revert OnlyPool();
        _;
    }

    constructor() ERC20("Terraform LP", "tfLP") Ownable(msg.sender) {}

    /// @notice Set the pool address (one-time setup by owner)
    /// @param _pool The LiquidityPool contract address
    function setPool(address _pool) external onlyOwner {
        require(_pool != address(0), "LPToken: zero address");
        pool = _pool;
    }

    /// @notice Mint LP tokens to a depositor
    /// @param to Recipient address
    /// @param amount Amount to mint (WAD)
    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount);
    }

    /// @notice Burn LP tokens from a withdrawer
    /// @param from Address to burn from
    /// @param amount Amount to burn (WAD)
    function burn(address from, uint256 amount) external onlyPool {
        _burn(from, amount);
    }
}
