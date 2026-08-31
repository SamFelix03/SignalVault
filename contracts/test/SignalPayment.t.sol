pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {StrategyVault} from "../src/core/StrategyVault.sol";
import {ExternalSignalPublisher} from "../src/core/ExternalSignalPublisher.sol";
import {MirrorReactor} from "../src/reactivity/MirrorReactor.sol";
import {IStrategyVault} from "../src/interfaces/IStrategyVault.sol";

contract MockTusdc is ERC20 {
    constructor() ERC20("Test tUSDC", "tUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract SignalPaymentTest is Test {
    MockTusdc token;
    StrategyVault vault;
    ExternalSignalPublisher publisher;
    MirrorReactor mirror;
    address strategist = address(0xA11CE);
    address follower = makeAddr("follower");
    uint256 constant SIGNAL_PRICE = 1_000_000; // 1 tUSDC (6 decimals)

    function setUp() public {
        token = new MockTusdc();
        vault = new StrategyVault();
        publisher = new ExternalSignalPublisher();
        mirror = new MirrorReactor();

        publisher.initialize(address(vault), strategist);
        vault.initialize(
            address(this),
            strategist,
            "Paid signals vault",
            500,
            address(publisher),
            address(token),
            SIGNAL_PRICE,
            IStrategyVault.SourceType.AGENT,
            IStrategyVault.InstrumentType.BINARY,
            address(0),
            address(0)
        );
        vault.setReactors(address(mirror), address(0), address(0));
        vm.prank(strategist);
        publisher.addPublisher(strategist);

        vm.prank(follower);
        token.mint(follower, 100_000_000); // 100 tUSDC
    }

    function _subscribeFollower() internal {
        vm.startPrank(follower);
        token.approve(address(vault), 100_000_000);
        vault.subscribe(
            IStrategyVault.FollowerConfig({
                riskPct: 1000,
                maxPositionSize: 10_000_000,
                maxSlippageBps: 100,
                stopLossBuffer: 0,
                active: true
            })
        );
        vm.stopPrank();
    }

    function test_chargeSignalFee_transfersToStrategist() public {
        _subscribeFollower();

        bytes32 signalHash = keccak256("signal-1");
        uint256 strategistBefore = token.balanceOf(strategist);

        vm.prank(address(mirror));
        vault.chargeSignalFee(follower, signalHash);

        assertEq(token.balanceOf(strategist), strategistBefore + SIGNAL_PRICE);
        assertEq(token.balanceOf(follower), 100_000_000 - SIGNAL_PRICE);
    }

    function test_chargeSignalFee_revertsWhenNotMirrorReactor() public {
        _subscribeFollower();
        vm.expectRevert("not mirror reactor");
        vault.chargeSignalFee(follower, keccak256("x"));
    }

    function test_subscribe_requiresAllowanceWhenPaid() public {
        vm.startPrank(follower);
        vm.expectRevert("insufficient allowance");
        vault.subscribe(
            IStrategyVault.FollowerConfig({
                riskPct: 1000,
                maxPositionSize: 10_000_000,
                maxSlippageBps: 100,
                stopLossBuffer: 0,
                active: true
            })
        );
        vm.stopPrank();
    }

    function test_freeVault_skipsAllowanceCheck() public {
        StrategyVault freeVault = new StrategyVault();
        ExternalSignalPublisher pub = new ExternalSignalPublisher();
        pub.initialize(address(freeVault), strategist);
        freeVault.initialize(
            address(this),
            strategist,
            "Free vault",
            500,
            address(pub),
            address(token),
            0,
            IStrategyVault.SourceType.AGENT,
            IStrategyVault.InstrumentType.BINARY,
            address(0),
            address(0)
        );

        vm.prank(follower);
        freeVault.subscribe(
            IStrategyVault.FollowerConfig({
                riskPct: 1000,
                maxPositionSize: 10_000_000,
                maxSlippageBps: 100,
                stopLossBuffer: 0,
                active: true
            })
        );

        assertTrue(freeVault.getFollowerConfig(follower).active);
    }
}
