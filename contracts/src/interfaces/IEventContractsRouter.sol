// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IExecutionRouter} from "./IExecutionRouter.sol";

interface IEventContractsRouter is IExecutionRouter {
    function collateralToken() external view returns (address);

    function placeOrder(
        address follower,
        bytes32 marketId,
        int8 direction,
        uint256 collateralAmount,
        uint256 limitPrice,
        uint16 maxSlippageBps
    ) external returns (bytes32 fillId);
}
