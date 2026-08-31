// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {PerpRouter} from "../src/integrations/PerpRouter.sol";

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockMarginBank {
    address public collateralToken;
    mapping(address => mapping(address => int128)) public sizes;
    mapping(address => mapping(address => uint16)) public leverage;
    mapping(address => uint256) public deposits;

    constructor(address _collateral) {
        collateralToken = _collateral;
    }

    function getSystemConfig()
        external
        view
        returns (
            address,
            address token,
            address,
            address,
            address,
            address,
            uint16,
            bool
        )
    {
        return (address(this), collateralToken, address(0), address(0), address(0), address(0), 50, true);
    }

    function getPosition(address account, address pool)
        external
        view
        returns (int128 size, uint128, int256, uint64)
    {
        return (sizes[account][pool], 0, 0, 0);
    }

    function getMaxLeverage(address account, address pool) external view returns (uint16) {
        uint16 lev = leverage[account][pool];
        return lev;
    }

    function setMaxLeverage(address pool, uint16 lev) external {
        leverage[msg.sender][pool] = lev;
    }

    function deposit(uint256 amount) external {
        require(MockERC20(collateralToken).transferFrom(msg.sender, address(this), amount), "pull");
        deposits[msg.sender] += amount;
    }
}

contract MockPerpPool {
    address public marginBank;
    uint256 public markPrice = 1e18;
    uint256 public oneBase = 1e18;
    uint256 public lotSize = 1e15;
    uint256 public tickSize = 1e15;
    uint128 public lastOrderId;

    constructor(address _bank) {
        marginBank = _bank;
    }

    function setTickSize(uint256 _tick) external {
        tickSize = _tick;
    }

    function getOrderBookParameters() external view returns (uint256, uint256, uint256) {
        return (tickSize, lotSize, lotSize);
    }

    function getMarkPrice() external view returns (uint256) {
        return markPrice;
    }

    function getOneBase() external view returns (uint256) {
        return oneBase;
    }

    function placeOrder(
        bool,
        uint64,
        uint256,
        uint256 quantity,
        uint64,
        uint8,
        uint8,
        address,
        uint96
    ) external returns (bool success, uint128 id) {
        require(quantity > 0, "qty");
        lastOrderId++;
        return (true, lastOrderId);
    }
}

contract PerpRouterTest is Test {
    MockERC20 token;
    MockMarginBank bank;
    MockPerpPool pool;
    PerpRouter router;
    address mirror = address(0xBEEF);
    address follower = address(0xF01);

    function setUp() public {
        token = new MockERC20();
        bank = new MockMarginBank(address(token));
        pool = new MockPerpPool(address(bank));
        router = new PerpRouter(mirror, address(bank));
        token.mint(follower, 100e18);
    }

    function test_predictMirrorWallet_deterministic() public view {
        address w1 = router.predictMirrorWallet(follower);
        address w2 = router.predictMirrorWallet(follower);
        assertEq(w1, w2);
    }

    function test_placeOrder_pullsFromFollower() public {
        address wallet = router.predictMirrorWallet(follower);
        vm.prank(follower);
        token.approve(wallet, type(uint256).max);

        uint256 margin = 1e6; // 6-dec vault units → 1e18 USDso after router scaling
        bytes32 marketRef = bytes32(uint256(uint160(address(pool))));

        vm.prank(mirror);
        bytes32 fillId = router.placeOrder(follower, marketRef, 1, margin, 1e18, 100);

        assertTrue(fillId != bytes32(0));
        assertGt(wallet.code.length, 0);
        assertEq(token.balanceOf(follower), 100e18 - 1e18);
        assertEq(bank.deposits(wallet), 1e18);
    }

    function test_rejects_non_mirror() public {
        vm.expectRevert(bytes("not mirror"));
        router.placeOrder(follower, bytes32(uint256(uint160(address(pool)))), 1, 1e18, 1e18, 100);
    }

    function test_routerVersion() public view {
        assertEq(router.ROUTER_VERSION(), 4);
    }

    function test_placeOrder_tickAlignsAfterSlippage() public {
        pool.setTickSize(100_000_000_000_000); // 0.0001e18, matches XRP pool tick

        address wallet = router.predictMirrorWallet(follower);
        vm.prank(follower);
        token.approve(wallet, type(uint256).max);

        bytes32 marketRef = bytes32(uint256(uint160(address(pool))));
        vm.prank(mirror);
        bytes32 fillId = router.placeOrder(follower, marketRef, -1, 1e6, 1_379_000_000_000_000_000, 100);
        assertTrue(fillId != bytes32(0));
    }
}
