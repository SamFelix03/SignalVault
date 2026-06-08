// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IDreamDEX} from "../interfaces/IDreamDEX.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface ISpotPool {
    enum OrderType { NormalOrder, FillOrKill, ImmediateOrCancel, PostOnly }
    enum SelfMatchingOption { CancelTaker, CancelMaker }

    function deposit(address token, uint256 amount) external;
    function placeOrder(
        bool isBid,
        uint64 userData,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        OrderType orderType,
        SelfMatchingOption selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k
    ) external returns (bool success, uint128 orderId);

    function getPoolParams() external view returns (
        address baseToken,
        address quoteToken,
        uint256 makerFeeBpsTimes1k,
        uint256 takerFeeBpsTimes1k,
        uint256 tickSize,
        uint256 minQuantity,
        uint256 lotSize
    );

    function getMidpointEmaState() external view returns (uint256 emaValue, uint64 lastUpdateNs);
}

/// @notice Thin adapter mapping SignalVault's IDreamDEX interface to dreamDEX SpotPool.
contract DreamDexAdapter is IDreamDEX {
    ISpotPool public immutable spotPool;
    address public immutable mirrorReactor;
    address public quoteToken;

    event QuoteDeposited(address indexed from, uint256 amount);
    event OrderPlacedFor(address indexed trader, int8 direction, uint128 orderId, bool success);

    modifier onlyMirror() {
        require(msg.sender == mirrorReactor, "not mirror");
        _;
    }

    constructor(address _spotPool, address _mirrorReactor) {
        spotPool = ISpotPool(_spotPool);
        mirrorReactor = _mirrorReactor;
        (, quoteToken,,,,,) = spotPool.getPoolParams();
    }

    /// @notice Fund the adapter's dreamDEX vault balance (USDso for WBTC pool).
    function depositQuote(uint256 amount) external {
        require(amount > 0, "zero amount");
        require(IERC20(quoteToken).transferFrom(msg.sender, address(this), amount), "transfer failed");
        require(IERC20(quoteToken).approve(address(spotPool), amount), "approve failed");
        spotPool.deposit(quoteToken, amount);
        emit QuoteDeposited(msg.sender, amount);
    }

    function placeOrder(
        address trader,
        int8 direction,
        uint256 size,
        uint256 stopPrice,
        uint16 maxSlippageBps
    ) external payable onlyMirror returns (bytes32 positionId) {
        if (direction == 0 || size == 0) return bytes32(0);

        bool isBid = direction > 0;
        (uint256 price, uint256 minQuantity, uint256 lotSize) =
            _resolveOrderPrice(stopPrice, maxSlippageBps, isBid);
        uint256 quantity = _normalizeQuantity(size, minQuantity, lotSize);
        if (quantity == 0) return bytes32(0);

        uint64 expireNs = uint64(block.timestamp + 1 hours) * 1_000_000_000;

        (bool success, uint128 orderId) = spotPool.placeOrder(
            isBid,
            0,
            price,
            quantity,
            expireNs,
            ISpotPool.OrderType.ImmediateOrCancel,
            ISpotPool.SelfMatchingOption.CancelTaker,
            address(0),
            0
        );

        emit OrderPlacedFor(trader, direction, orderId, success);
        return bytes32(uint256(orderId));
    }

    function closePosition(bytes32 positionId) external returns (int256) {
        // IOC orders settle immediately; nothing to close for the adapter path.
        positionId;
        return 0;
    }

    function getPosition(bytes32) external pure returns (Position memory) {
        return Position({
            trader: address(0),
            direction: 0,
            size: 0,
            entryPrice: 0,
            stopPrice: 0,
            openedAt: 0,
            isOpen: false
        });
    }

    function getTraderPositions(address) external pure returns (bytes32[] memory) {
        return new bytes32[](0);
    }

    function _resolveOrderPrice(
        uint256 stopPrice,
        uint16 maxSlippageBps,
        bool isBid
    ) internal view returns (uint256 price, uint256 minQuantity, uint256 lotSize) {
        uint256 tickSize;
        (,,,, tickSize, minQuantity, lotSize) = spotPool.getPoolParams();
        (uint256 emaValue,) = spotPool.getMidpointEmaState();

        if (emaValue > 0) {
            price = emaValue;
        } else if (stopPrice > 0) {
            // Signal stop prices are stored in cents (2 decimals); dreamDEX uses quote-token raw units.
            price = stopPrice * 1e14;
        } else {
            price = tickSize;
        }

        if (maxSlippageBps > 0) {
            if (isBid) {
                price += (price * maxSlippageBps) / 10_000;
            } else {
                price -= (price * maxSlippageBps) / 10_000;
            }
        }

        if (tickSize > 0) {
            price = (price / tickSize) * tickSize;
            if (price == 0) price = tickSize;
        }
    }

    function _normalizeQuantity(
        uint256 size,
        uint256 minQuantity,
        uint256 lotSize
    ) internal pure returns (uint256) {
        if (lotSize == 0) return size;
        uint256 qty = (size / lotSize) * lotSize;
        if (qty < minQuantity) return 0;
        return qty;
    }
}
