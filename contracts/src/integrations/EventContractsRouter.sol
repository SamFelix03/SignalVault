// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IEventContractsRouter} from "../interfaces/IEventContractsRouter.sol";

interface IERC20Minimal {
    function decimals() external view returns (uint8);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IERC6909Minimal {
    function balanceOf(address owner, uint256 id) external view returns (uint256);
    function transfer(address receiver, uint256 id, uint256 amount) external returns (bool);
}

interface IBinaryMarketsModule {
    function markets(bytes32 marketId)
        external
        view
        returns (
            uint256 oracleQuestionId,
            uint8 outcomeSlotCount,
            uint8 voidPolicy,
            address collateral,
            uint32 originOperatorId,
            bytes32 originVenueId,
            address oracleAdapter,
            address creator,
            address market,
            address pool,
            uint256 yesId,
            uint256 noId,
            uint64 tradingStart,
            uint64 expiry
        );
}

interface IBinaryMarket {
    function status() external view returns (uint8);
    function outcomeToken() external view returns (address);
}

interface IBinaryPool {
    function getBinaryPoolParams()
        external
        view
        returns (
            address collateralToken,
            address market,
            address outcomeToken,
            uint256 yesId,
            uint256 noId,
            uint256 oneCollateral,
            uint256 setBacking,
            address feeRecipient,
            uint256 makerFeeBpsTimes1k,
            uint256 takerFeeBpsTimes1k,
            uint256 maxBuilderFeeBpsTimes1k,
            uint256 settlementFeeBpsTimes1k,
            address settlement,
            uint64 marketNonce,
            bool finalized
        );

    function placeBinaryOrder(
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k,
        uint64 userData
    ) external payable returns (bool success, uint128 id);
}

/// @notice Pulls tUSDC from followers (subscribe-time approve), places IOC binary orders,
///         and forwards ERC-6909 outcome tokens back to the follower wallet.
contract EventContractsRouter is IEventContractsRouter {
    address public constant BINARY_MARKETS_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;

    uint8 internal constant MARKET_STATUS_TRADING = 1;
    uint8 internal constant ORDER_KIND_BUY_YES = 0;
    uint8 internal constant ORDER_KIND_BUY_NO = 2;
    uint8 internal constant ORDER_TYPE_LIMIT = 0;  // Post LIMIT order to the book
    uint8 internal constant SELF_MATCH_CANCEL_TAKER = 0;

    address public immutable mirrorReactor;
    address public immutable collateralToken;

    event OrderMirrored(
        address indexed follower,
        bytes32 indexed marketId,
        int8 direction,
        uint256 collateralAmount,
        uint256 outcomeAmount,
        uint128 orderId
    );

    modifier onlyMirror() {
        require(msg.sender == mirrorReactor, "not mirror");
        _;
    }

    constructor(address _mirrorReactor, address _collateralToken) {
        require(_mirrorReactor != address(0) && _collateralToken != address(0), "zero address");
        mirrorReactor = _mirrorReactor;
        collateralToken = _collateralToken;
    }

    function placeOrder(
        address follower,
        bytes32 marketRef,
        int8 direction,
        uint256 collateralAmount,
        uint256 limitPrice,
        uint16 maxSlippageBps
    ) external onlyMirror returns (bytes32 fillId) {
        if (direction == 0 || collateralAmount == 0) return bytes32(0);

        (
            ,,, address collateral,,,,,
            address marketAddr,
            address pool,
            uint256 yesId,
            uint256 noId,
            ,
        ) = IBinaryMarketsModule(BINARY_MARKETS_MODULE).markets(marketRef);

        require(pool != address(0), "unknown market");
        require(collateral == collateralToken, "collateral mismatch");
        require(IBinaryMarket(marketAddr).status() == MARKET_STATUS_TRADING, "not trading");

        require(
            IERC20Minimal(collateralToken).transferFrom(follower, address(this), collateralAmount),
            "pull failed"
        );
        require(IERC20Minimal(collateralToken).approve(pool, collateralAmount), "approve failed");

        uint8 kind = direction > 0 ? ORDER_KIND_BUY_YES : ORDER_KIND_BUY_NO;
        uint256 outcomeId = direction > 0 ? yesId : noId;
        address outcomeToken = IBinaryMarket(marketAddr).outcomeToken();

        // `limitPrice` is YES-probability for BUY_YES, NO-probability for BUY_NO (dreamDEX convention).
        uint256 execPrice = _applySlippage(limitPrice, maxSlippageBps, kind);
        uint256 quantity = _collateralToQuantity(collateralAmount, execPrice, pool);
        require(quantity > 0, "qty zero");

        uint64 expireNs = uint64((block.timestamp + 300) * 1_000_000_000);

        uint256 balBefore = IERC6909Minimal(outcomeToken).balanceOf(address(this), outcomeId);

        (bool success, uint128 orderId) = IBinaryPool(pool).placeBinaryOrder(
            kind,
            execPrice,
            quantity,
            expireNs,
            ORDER_TYPE_LIMIT,
            SELF_MATCH_CANCEL_TAKER,
            address(0),
            0,
            0
        );

        require(success && orderId != 0, "order failed");

        uint256 balAfter = IERC6909Minimal(outcomeToken).balanceOf(address(this), outcomeId);
        uint256 received = balAfter > balBefore ? balAfter - balBefore : 0;
        require(received > 0, "no fill");

        require(IERC6909Minimal(outcomeToken).transfer(follower, outcomeId, received), "forward failed");

        emit OrderMirrored(follower, marketRef, direction, collateralAmount, received, orderId);
        return bytes32(uint256(orderId));
    }

    function _applySlippage(uint256 price, uint16 slippageBps, uint8 kind)
        internal
        view
        returns (uint256)
    {
        if (slippageBps == 0) return price;
        uint256 adj = (price * slippageBps) / 10_000;
        uint256 adjusted;
        // IOC buys: loosen limit in the outcome's own price terms.
        if (kind == ORDER_KIND_BUY_YES || kind == ORDER_KIND_BUY_NO) {
            adjusted = price + adj;
        } else {
            adjusted = price > adj ? price - adj : price;
        }
        // Snap to tick grid to avoid InvalidPrice revert
        return _snapToTick(adjusted);
    }

    function _snapToTick(uint256 price) internal view returns (uint256) {
        uint8 dec = IERC20Minimal(collateralToken).decimals();
        uint256 tick = dec <= 6 ? 1_000 : 1_000_000_000_000_000;
        if (price == 0) return 0;
        return (price / tick) * tick;
    }

    function _collateralToQuantity(uint256 collateralAmount, uint256 price, address pool)
        internal
        view
        returns (uint256)
    {
        if (price == 0) return 0;
        (,,,, uint256 oneCollateral,,,,,,,,,,) = IBinaryPool(pool).getBinaryPoolParams();
        uint256 scale = oneCollateral > 0 ? oneCollateral : 10 ** IERC20Minimal(collateralToken).decimals();
        uint256 rawQty = (collateralAmount * scale) / price;
        return _snapToLot(rawQty, pool);
    }

    function _snapToLot(uint256 qty, address pool) internal view returns (uint256) {
        (,,,,,, uint256 makerFeeBpsTimes1k,,,,,,,,) = IBinaryPool(pool).getBinaryPoolParams();
        makerFeeBpsTimes1k;
        // lot size via tick read — use 1e15 default for 18-dec collateral, 1e3 for 6-dec
        uint8 dec = IERC20Minimal(collateralToken).decimals();
        uint256 lot = dec <= 6 ? 1_000 : 1_000_000_000_000_000;
        if (qty < lot) return 0;
        return (qty / lot) * lot;
    }
}
