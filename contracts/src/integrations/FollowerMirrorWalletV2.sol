// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "./FollowerMirrorWallet.sol";

/**
 * @title FollowerMirrorWalletV2
 * @notice Uses LIMIT orders instead of IOC for testnet compatibility
 * 
 * Key change: ORDER_TYPE_LIMIT (1) instead of ORDER_TYPE_IOC (2)
 * LIMIT orders sit on the book and create liquidity instead of requiring it
 */
contract FollowerMirrorWalletV2 is FollowerMirrorWallet {
  uint8 internal constant ORDER_TYPE_LIMIT = 1;

  constructor(address owner_, address router_, address marginBank_) 
    FollowerMirrorWallet(owner_, router_, marginBank_) {}

  /**
   * @notice Place LIMIT order (overrides IOC behavior)
   */
  function executeOpen(
    address pool,
    uint256 marginPull,
    bool isBid,
    uint256 price,
    uint256 quantity,
    uint64 expireNs
  ) external override onlyRouter returns (uint128) {
    if (marginPull > 0) {
      _pullAndDeposit(marginPull);
    }

    // Use LIMIT order instead of IOC
    (bool success, uint128 id) = IPerpPoolWallet(pool).placeOrder(
      isBid, 0, price, quantity, expireNs, ORDER_TYPE_LIMIT, SELF_MATCH_CANCEL_TAKER, address(0), 0
    );
    require(success && id != 0, "limit order failed");
    emit OrderPlaced(pool, isBid, quantity, id);
    return id;
  }

  /**
   * @notice Close position with LIMIT order
   */
  function closePosition(
    address pool,
    bool isBid,
    uint256 price,
    uint256 quantity,
    uint64 expireNs
  ) external override onlyRouter returns (uint128) {
    // Use LIMIT order for closing too
    (bool success, uint128 id) = IPerpPoolWallet(pool).placeOrder(
        isBid, 0, price, quantity, expireNs, ORDER_TYPE_LIMIT, SELF_MATCH_CANCEL_TAKER, address(0), 0
    );
    require(success && id != 0, "close limit failed");
    emit OrderPlaced(pool, isBid, quantity, id);
    return id;
  }
}