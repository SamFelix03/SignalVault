// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IPerformanceLedger {
    function getSharpeApprox() external view returns (int256);
}

/// @notice Demo composability reader — borrow rate discount for high-Sharpe vaults
contract SharpeGatedLending {
    uint256 public constant BASE_BORROW_RATE_BPS = 500;
    uint256 public constant SHARPE_DISCOUNT_BPS = 50;
    /// @dev Matches PerformanceLedger.getSharpeApprox scale (~1500 = Sharpe 1.5)
    int256 public constant SHARPE_THRESHOLD = 1500;

    function borrowRateBps(address performanceLedger)
        external
        view
        returns (uint256 rateBps, int256 sharpe, bool eligible)
    {
        sharpe = IPerformanceLedger(performanceLedger).getSharpeApprox();
        eligible = sharpe >= SHARPE_THRESHOLD;
        rateBps = eligible ? BASE_BORROW_RATE_BPS - SHARPE_DISCOUNT_BPS : BASE_BORROW_RATE_BPS;
    }
}
