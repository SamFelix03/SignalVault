// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Unified mirror execution surface for binary event contracts and perp pools.
interface IExecutionRouter {
  function collateralToken() external view returns (address);

  function placeOrder(
    address follower,
    bytes32 marketRef,
    int8 direction,
    uint256 sizeAmount,
    uint256 limitPrice,
    uint16 maxSlippageBps
  ) external returns (bytes32 fillId);
}
