// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IERC20Minimal {
  function transferFrom(address from, address to, uint256 amount) external returns (bool);
  function approve(address spender, uint256 amount) external returns (bool);
  function allowance(address owner, address spender) external view returns (uint256);
}

interface IMarginBankWallet {
  function deposit(uint256 amount) external;
  function getMaxLeverage(address account, address perpPool) external view returns (uint16);
  function setMaxLeverage(address perpPool, uint16 leverageX) external;
  function getPosition(address account, address perpPool)
    external
    view
    returns (int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs);
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
}

interface IPerpPoolWallet {
  function placeOrder(
    bool isBid,
    uint64 userData,
    uint256 price,
    uint256 quantity,
    uint64 expireTimestampNs,
    uint8 orderType,
    uint8 selfMatchingOption,
    address builder,
    uint96 builderFeeBpsTimes1k
  ) external returns (bool success, uint128 id);

  function getOrderBookParameters()
    external
    view
    returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize);
}

/// @notice Per-follower trading account: pulls USDso from the owner EOA per mirror signal,
/// deposits to MarginBank, and places perp orders directly (enabling protocol auto-pull).
contract FollowerMirrorWallet {
  uint8 internal constant ORDER_TYPE_IOC = 2;
  uint8 internal constant SELF_MATCH_CANCEL_TAKER = 0;
  uint16 public constant DEFAULT_LEVERAGE_X = 10;

  address public immutable owner;
  address public immutable perpRouter;
  address public immutable marginBank;

  event MarginPulled(address indexed owner, uint256 amount);
  event OrderPlaced(address indexed pool, bool isBid, uint256 quantity, uint128 orderId);

  modifier onlyRouter() {
    require(msg.sender == perpRouter, "not router");
    _;
  }

  constructor(address owner_, address router_, address marginBank_) {
    require(owner_ != address(0) && router_ != address(0) && marginBank_ != address(0), "zero address");
    owner = owner_;
    perpRouter = router_;
    marginBank = marginBank_;
  }

  function fundMargin(uint256 amount) external onlyRouter {
    if (amount > 0) {
      _pullAndDeposit(amount);
    }
  }

  function executeOpen(
    address pool,
    uint256 marginPull,
    bool isBid,
    uint256 price,
    uint256 quantity,
    uint64 expireNs
  ) external onlyRouter returns (uint128 orderId) {
    if (marginPull > 0) {
      _pullAndDeposit(marginPull);
    }
    _ensureLeverage(pool);

    (bool success, uint128 id) = IPerpPoolWallet(pool).placeOrder(
      isBid, 0, price, quantity, expireNs, ORDER_TYPE_IOC, SELF_MATCH_CANCEL_TAKER, address(0), 0
    );
    require(success && id != 0, "order failed");
    emit OrderPlaced(pool, isBid, quantity, id);
    return id;
  }

  function executeClose(
    address pool,
    bool isBid,
    uint256 price,
    uint256 quantity,
    uint64 expireNs
  ) external onlyRouter returns (uint128 orderId) {
  (bool success, uint128 id) = IPerpPoolWallet(pool).placeOrder(
      isBid, 0, price, quantity, expireNs, ORDER_TYPE_IOC, SELF_MATCH_CANCEL_TAKER, address(0), 0
    );
    require(success && id != 0, "close failed");
    emit OrderPlaced(pool, isBid, quantity, id);
    return id;
  }

  function _pullAndDeposit(uint256 amount) internal {
    (, address token,,,,,,) = IMarginBankWallet(marginBank).getSystemConfig();
    require(IERC20Minimal(token).transferFrom(owner, address(this), amount), "pull failed");
    if (IERC20Minimal(token).allowance(address(this), marginBank) < amount) {
      require(IERC20Minimal(token).approve(marginBank, type(uint256).max), "approve failed");
    }
    IMarginBankWallet(marginBank).deposit(amount);
    emit MarginPulled(owner, amount);
  }

  function _ensureLeverage(address pool) internal {
    uint16 lev = IMarginBankWallet(marginBank).getMaxLeverage(address(this), pool);
    if (lev == 0) {
      IMarginBankWallet(marginBank).setMaxLeverage(pool, DEFAULT_LEVERAGE_X);
    }
  }
}
