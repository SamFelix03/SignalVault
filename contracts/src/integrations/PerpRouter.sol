// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {FollowerMirrorWallet} from "./FollowerMirrorWallet.sol";
import {IExecutionRouter} from "../interfaces/IExecutionRouter.sol";

interface IMarginBank {
  function getSystemConfig()
    external
    view
    returns (
      address marginBank,
      address collateralToken,
      address perpPoolFactory,
      address liquidationEngine,
      address insuranceFund,
      address feeRecipient,
      uint16 maxLeverageLimit,
      bool fullyWired
    );

  function getPosition(address account, address perpPool)
    external
    view
    returns (int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs);

  function getMaxLeverage(address account, address perpPool) external view returns (uint16);
}

interface IPerpPool {
  function marginBank() external view returns (address);

  function getMarkPrice() external view returns (uint256);

  function getOneBase() external view returns (uint256);

  function getOrderBookParameters()
    external
    view
    returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize);
}

interface IFollowerMirrorWallet {
  function fundMargin(uint256 amount) external;

  function executeOpen(
    address pool,
    uint256 marginPull,
    bool isBid,
    uint256 price,
    uint256 quantity,
    uint64 expireNs
  ) external returns (uint128 orderId);

  function executeClose(
    address pool,
    bool isBid,
    uint256 price,
    uint256 quantity,
    uint64 expireNs
  ) external returns (uint128 orderId);
}

/// @notice Mirrors perp signals by pulling USDso from the follower wallet per signal into a
/// deterministic FollowerMirrorWallet, then placing orders directly on the perp pool.
contract PerpRouter is IExecutionRouter {
  /// @dev Bump when mirror execution semantics change.
  uint256 public constant ROUTER_VERSION = 4;

  /// @dev Floor slippage for IOC mirrors on thin testnet books (follower config may be lower).
  uint16 internal constant MIN_MIRROR_SLIPPAGE_BPS = 200;
  /// @dev Max slippage attempted across the retry ladder.
  uint16 internal constant MAX_MIRROR_SLIPPAGE_BPS = 1500;
  uint8 internal constant MAX_FILL_ATTEMPTS = 6;

  address public immutable mirrorReactor;
  address public immutable marginBank;

  event OrderMirrored(
    address indexed follower,
    address indexed mirrorWallet,
    address indexed perpPool,
    int8 direction,
    uint256 marginBudget,
    uint256 quantity,
    uint128 orderId
  );

  modifier onlyMirror() {
    require(msg.sender == mirrorReactor, "not mirror");
    _;
  }

  constructor(address _mirrorReactor, address _marginBank) {
    require(_mirrorReactor != address(0) && _marginBank != address(0), "zero address");
    mirrorReactor = _mirrorReactor;
    marginBank = _marginBank;
  }

  function collateralToken() external view returns (address) {
    (, address token,,,,,,) = IMarginBank(marginBank).getSystemConfig();
    return token;
  }

  /// @notice CREATE2 address of the follower's mirror wallet (approve USDso here before mirroring).
  function predictMirrorWallet(address follower) public view returns (address) {
    bytes memory creationCode = _walletCreationCode(follower);
    return Create2.computeAddress(_walletSalt(follower), keccak256(creationCode), address(this));
  }

  function placeOrder(
    address follower,
    bytes32 marketRef,
    int8 direction,
    uint256 sizeAmount,
    uint256,
    uint16 maxSlippageBps
  ) external onlyMirror returns (bytes32 fillId) {
    address pool = address(uint160(uint256(marketRef)));
    require(pool != address(0), "zero pool");
    require(IPerpPool(pool).marginBank() == marginBank, "bank mismatch");

    address wallet = _deployWallet(follower);

    if (direction == 0) {
      return _closePosition(wallet, follower, pool, maxSlippageBps);
    }

    if (sizeAmount == 0) return bytes32(0);

    // Vault subscribe stores maxPositionSize in tUSDC 6-dec units; USDso margin uses 18 dec.
    sizeAmount = sizeAmount * 1e12;

    bool isBid = direction > 0;
    uint64 expireNs = uint64((block.timestamp + 300) * 1_000_000_000);
    uint16 slippage = _effectiveSlippage(maxSlippageBps);

    // Pull USDso once; retries only adjust price/qty (avoids repeated pulls + allowance issues).
    try IFollowerMirrorWallet(wallet).fundMargin(sizeAmount) {} catch {}

    for (uint8 attempt = 0; attempt < MAX_FILL_ATTEMPTS; attempt++) {
      uint256 price = _resolveMirrorPrice(pool, slippage, isBid);
      if (price == 0) break;

      uint256 quantity = _marginToQuantity(wallet, pool, sizeAmount, price);
      if (quantity == 0) break;

      try IFollowerMirrorWallet(wallet).executeOpen(pool, 0, isBid, price, quantity, expireNs) returns (
        uint128 orderId
      ) {
        if (orderId != 0) {
          emit OrderMirrored(follower, wallet, pool, direction, sizeAmount, quantity, orderId);
          return bytes32(uint256(orderId));
        }
      } catch {}

      if (slippage >= MAX_MIRROR_SLIPPAGE_BPS) break;
      uint16 doubled = slippage * 2;
      slippage = doubled > MAX_MIRROR_SLIPPAGE_BPS ? MAX_MIRROR_SLIPPAGE_BPS : doubled;
    }

    return bytes32(0);
  }

  function _closePosition(address wallet, address follower, address pool, uint16 maxSlippageBps)
    internal
    returns (bytes32 fillId)
  {
    (int128 size,,,) = IMarginBank(marginBank).getPosition(wallet, pool);
    if (size == 0) return bytes32(0);

    bool isBid = size < 0;
    uint256 absSize = size > 0 ? uint256(int256(size)) : uint256(int256(-size));
    (, , uint256 lotSize) = IPerpPool(pool).getOrderBookParameters();
    uint256 quantity = _snapToLot(absSize, lotSize);
    if (quantity == 0) return bytes32(0);

    uint64 expireNs = uint64((block.timestamp + 300) * 1_000_000_000);
    uint16 slippage = _effectiveSlippage(maxSlippageBps);

    for (uint8 attempt = 0; attempt < MAX_FILL_ATTEMPTS; attempt++) {
      uint256 price = _resolveMirrorPrice(pool, slippage, isBid);
      if (price == 0) break;

      try IFollowerMirrorWallet(wallet).executeClose(pool, isBid, price, quantity, expireNs) returns (uint128 orderId)
      {
        if (orderId != 0) {
          emit OrderMirrored(follower, wallet, pool, 0, 0, quantity, orderId);
          return bytes32(uint256(orderId));
        }
      } catch {}

      if (slippage >= MAX_MIRROR_SLIPPAGE_BPS) break;
      uint16 doubled = slippage * 2;
      slippage = doubled > MAX_MIRROR_SLIPPAGE_BPS ? MAX_MIRROR_SLIPPAGE_BPS : doubled;
    }

    return bytes32(0);
  }

  function _deployWallet(address follower) internal returns (address wallet) {
    wallet = predictMirrorWallet(follower);
    if (wallet.code.length > 0) return wallet;

    bytes memory creationCode = _walletCreationCode(follower);
    wallet = Create2.deploy(0, _walletSalt(follower), creationCode);
  }

  function _walletCreationCode(address follower) internal view returns (bytes memory) {
    return abi.encodePacked(
      type(FollowerMirrorWallet).creationCode,
      abi.encode(follower, address(this), marginBank)
    );
  }

  function _walletSalt(address follower) internal pure returns (bytes32) {
    return keccak256(abi.encode(follower));
  }

  function _effectiveSlippage(uint16 maxSlippageBps) internal pure returns (uint16) {
    if (maxSlippageBps < MIN_MIRROR_SLIPPAGE_BPS) return MIN_MIRROR_SLIPPAGE_BPS;
    return maxSlippageBps;
  }

  /// @dev IOC mirrors always price from live mark + slippage (signal limit is not used for execution).
  function _resolveMirrorPrice(address pool, uint16 slippageBps, bool isBid) internal view returns (uint256) {
    uint256 mark = IPerpPool(pool).getMarkPrice();
    if (mark == 0) return 0;

    uint256 adj = (mark * uint256(slippageBps)) / 10_000;
    uint256 price = isBid ? mark + adj : (mark > adj ? mark - adj : mark);

    (uint256 tickSize,,) = IPerpPool(pool).getOrderBookParameters();
    return _snapToTick(price, tickSize, isBid);
  }

  /// @dev Perp pools reject non-tick-aligned prices (`InvalidPrice`). Round aggressively for fills.
  function _snapToTick(uint256 price, uint256 tickSize, bool roundUp) internal pure returns (uint256) {
    if (tickSize == 0) tickSize = 1;
    uint256 rem = price % tickSize;
    if (rem == 0) return price;
    return roundUp ? price + (tickSize - rem) : price - rem;
  }

  function _marginToQuantity(address wallet, address pool, uint256 marginBudget, uint256 price)
    internal
    view
    returns (uint256)
  {
    uint16 lev = IMarginBank(marginBank).getMaxLeverage(wallet, pool);
    if (lev == 0) lev = FollowerMirrorWallet(payable(wallet)).DEFAULT_LEVERAGE_X();
    uint256 oneBase = IPerpPool(pool).getOneBase();
    if (oneBase == 0 || price == 0) return 0;
    uint256 notional = marginBudget * uint256(lev);
    uint256 rawQty = (notional * oneBase) / price;
    (, , uint256 lotSize) = IPerpPool(pool).getOrderBookParameters();
    return _snapToLot(rawQty, lotSize);
  }

  function _snapToLot(uint256 qty, uint256 lotSize) internal pure returns (uint256) {
    if (lotSize == 0) lotSize = 1;
    if (qty < lotSize) return 0;
    return (qty / lotSize) * lotSize;
  }
}
