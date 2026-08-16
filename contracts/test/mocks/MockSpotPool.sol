// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Minimal dreamDEX SpotPool stub for VaultFactory tests.
contract MockSpotPool {
    function getPoolParams() external pure returns (
        address baseToken,
        address quoteToken,
        uint256 makerFeeBpsTimes1k,
        uint256 takerFeeBpsTimes1k,
        uint256 tickSize,
        uint256 minQuantity,
        uint256 lotSize
    ) {
        return (address(0x1), address(0x2), 0, 0, 1, 1, 1);
    }

    function getMidpointEmaState() external pure returns (uint256 emaValue, uint64 lastUpdateNs) {
        return (3_000_000_000_000, 0);
    }
}
