// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IDreamDEX {
    struct Position {
        address trader;
        int8 direction;     // 1 = long, -1 = short
        uint256 size;       // position size in native token
        uint256 entryPrice; // 18 decimals
        uint256 stopPrice;  // 18 decimals
        uint256 openedAt;
        bool isOpen;
    }

    function placeOrder(
        address trader,
        int8 direction,
        uint256 size,
        uint256 stopPrice,
        uint16 maxSlippageBps
    ) external payable returns (bytes32 positionId);

    function closePosition(bytes32 positionId) external returns (int256 pnl);

    function getPosition(bytes32 positionId) external view returns (Position memory);

    function getTraderPositions(address trader) external view returns (bytes32[] memory);
}
