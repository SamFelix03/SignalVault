// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PerpRouterV5} from "./PerpRouterV5.sol";

/**
 * @title PerpRouterForce
 * @notice FORCES trades by using LIMIT orders instead of IOC
 * 
 * Problem: IOC requires existing liquidity, fails in empty testnet
 * Solution: Use LIMIT orders that sit on book and create liquidity
 */
contract PerpRouterForce is PerpRouterV5 {
    function ROUTER_VERSION() public pure override returns (uint256) {
        return 999; // Special "force" version
    }

    /// @notice Limit order type - sits on book until filled
    uint8 internal constant ORDER_TYPE_LIMIT = 1;

    event ForcedLimitOrder(
        address indexed follower,
        address indexed wallet,
        uint256 price,
        string reason
    );

    /**
     * @notice FORCE trade by placing LIMIT order at signal price
     * @dev Creates liquidity instead of consuming it
     */
    function placeOrder(
        address follower,
        address wallet,
        address pool,
        int8 direction,
        uint256 sizeAmount,
        uint256 quantity,
        bytes memory /* data */
    ) public override returns (bytes32) {
        bool isBid = direction > 0;
        
        // Get current mark price
        uint256 markPrice = IPerpPool(pool).getMarkPrice();
        
        // Calculate signal price (12% from mark for SHORT 1200bps)
        uint256 signalPrice;
        if (isBid) {
            // LONG: signal wants to buy at premium
            signalPrice = (markPrice * 11200) / 10000; // +12%
        } else {
            // SHORT: signal wants to sell at discount  
            signalPrice = (markPrice * 8800) / 10000; // -12%
        }

        // Long expiry - let it sit on book for hours
        uint64 expireNs = uint64(block.timestamp + 7200) * 1_000_000_000; // 2 hours

        // Fund margin first (we know this will work)
        try IFollowerMirrorWallet(wallet).fundMargin(sizeAmount) {
            // Place LIMIT order at exact signal price
            try IFollowerMirrorWallet(wallet).executeOpenLimit(pool, 0, isBid, signalPrice, quantity, expireNs) returns (
                uint128 orderId
            ) {
                if (orderId != 0) {
                    emit ForcedLimitOrder(follower, wallet, signalPrice, "LIMIT order placed at signal price");
                    emit OrderMirrored(follower, wallet, pool, direction, sizeAmount, quantity, orderId);
                    return bytes32(uint256(orderId));
                }
            } catch {
                // LIMIT order failed
            }
        } catch {
            // Margin funding failed
        }

        emit MirrorFailed(follower, wallet, pool, direction, sizeAmount, "forced limit order failed");
        return bytes32(0);
    }
}