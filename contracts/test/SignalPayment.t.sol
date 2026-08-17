pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SignalPayToken} from "../src/finance/SignalPayToken.sol";
import {StrategyVault} from "../src/core/StrategyVault.sol";
import {ExternalSignalPublisher} from "../src/core/ExternalSignalPublisher.sol";
import {MirrorReactor} from "../src/reactivity/MirrorReactor.sol";
import {IStrategyVault} from "../src/interfaces/IStrategyVault.sol";

contract SignalPaymentTest is Test {
    SignalPayToken token;
    StrategyVault vault;
    ExternalSignalPublisher publisher;
    MirrorReactor mirror;
    address strategist = address(0xA11CE);
    address follower = makeAddr("follower");
    uint256 constant SIGNAL_PRICE = 1 ether;

    function setUp() public {
        token = new SignalPayToken();
        vault = new StrategyVault();
        publisher = new ExternalSignalPublisher();
        mirror = new MirrorReactor();

        publisher.initialize(address(vault), strategist);
        vault.initialize(
            strategist,
            strategist,
            "Paid signals vault",
            500,
            address(publisher),
            address(token),
            SIGNAL_PRICE
        );
        vault.setReactors(address(mirror), address(0), address(0));
        publisher.addPublisher(strategist);

        vm.prank(follower);
        token.mint(100 ether);
    }

    function _subscribeFollower() internal {
        vm.startPrank(follower);
        token.approve(address(vault), 100 ether);
        vault.subscribe(
            IStrategyVault.FollowerConfig({
                riskPct: 100,
                maxPositionSize: 1 ether,
                maxSlippageBps: 100,
                stopLossBuffer: 0,
                active: true
            })
        );
        vm.stopPrank();
    }

    function test_subscribeRequiresAllowanceWhenPaid() public {
        vm.prank(follower);
        vm.expectRevert("insufficient allowance");
        vault.subscribe(
            IStrategyVault.FollowerConfig({
                riskPct: 100,
                maxPositionSize: 1 ether,
                maxSlippageBps: 100,
                stopLossBuffer: 0,
                active: true
            })
        );
    }

    function test_chargeSignalFeeTransfersToStrategist() public {
        _subscribeFollower();

        bytes32 signalHash = keccak256("signal-1");
        vm.prank(address(mirror));
        vault.chargeSignalFee(follower, signalHash);

        assertEq(token.balanceOf(strategist), SIGNAL_PRICE);
        assertEq(token.balanceOf(follower), 99 ether);
        assertTrue(vault.paymentAuthorized(follower));
    }

    function test_chargeFailsWithoutAllowanceRemaining() public {
        _subscribeFollower();

        vm.prank(address(mirror));
        vault.chargeSignalFee(follower, keccak256("s1"));

        vm.prank(follower);
        token.approve(address(vault), 0);

        vm.prank(address(mirror));
        vm.expectRevert("payment failed");
        vault.chargeSignalFee(follower, keccak256("s2"));
    }

    function test_freeVaultSkipsPayment() public {
        StrategyVault freeVault = new StrategyVault();
        ExternalSignalPublisher freePub = new ExternalSignalPublisher();
        freePub.initialize(address(freeVault), strategist);
        freeVault.initialize(
            strategist, strategist, "Free vault", 0, address(freePub), address(token), 0
        );
        freePub.addPublisher(strategist);

        vm.prank(follower);
        freeVault.subscribe(
            IStrategyVault.FollowerConfig({
                riskPct: 100,
                maxPositionSize: 1 ether,
                maxSlippageBps: 100,
                stopLossBuffer: 0,
                active: true
            })
        );

        uint256 before = token.balanceOf(strategist);
        vm.prank(address(mirror));
        freeVault.chargeSignalFee(follower, keccak256("free"));
        assertEq(token.balanceOf(strategist), before);
    }

    function test_mintEnforcesCooldown() public {
        address user = address(0x123);
        vm.prank(user);
        token.mint(1 ether);

        vm.prank(user);
        vm.expectRevert("mint cooldown");
        token.mint(1 ether);

        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(user);
        token.mint(1 ether);
        assertEq(token.balanceOf(user), 2 ether);
    }
}
