pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ExternalSignalPublisher} from "../src/core/ExternalSignalPublisher.sol";
import {StrategyVault} from "../src/core/StrategyVault.sol";
import {VaultFactory} from "../src/core/VaultFactory.sol";
import {AgentOrchestrator} from "../src/core/AgentOrchestrator.sol";
import {MirrorReactor} from "../src/reactivity/MirrorReactor.sol";
import {StopReactor} from "../src/reactivity/StopReactor.sol";
import {DrawdownGuard} from "../src/reactivity/DrawdownGuard.sol";
import {EpochCron} from "../src/reactivity/EpochCron.sol";
import {PerformanceLedger} from "../src/finance/PerformanceLedger.sol";
import {FeeDistributor} from "../src/finance/FeeDistributor.sol";
import {IStrategyVault} from "../src/interfaces/IStrategyVault.sol";

address constant ETH_USD_ORACLE = 0xd9132c1d762D432672493F640a63B758891B449e;

contract MockEthOracle {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (0, 2_000_00000000, 0, block.timestamp, 0);
    }
}

contract ExternalSignalPublisherTest is Test {
    ExternalSignalPublisher publisher;
    StrategyVault vault;
    address owner = address(this);
    address stranger = address(0xBEEF);
    bytes32 constant MARKET_ID = bytes32(uint256(1));
    uint256 constant LIMIT_PRICE = 500_000;

    function setUp() public {
        vault = new StrategyVault();
        publisher = new ExternalSignalPublisher();
        publisher.initialize(address(vault), owner);
        vault.initialize(
            owner,
            owner,
            "Test: custom agent",
            500,
            address(publisher),
            address(0),
            0,
            IStrategyVault.SourceType.AGENT,
            IStrategyVault.InstrumentType.BINARY,
            address(0),
            address(0)
        );
        publisher.addPublisher(owner);
    }

    function test_isCustomPublisher() public view {
        assertTrue(publisher.isCustomPublisher());
    }

    function test_publishUpdatesVaultSignal() public {
        publisher.publish(1, 1500, MARKET_ID, LIMIT_PRICE, "RSI oversold");

        IStrategyVault.Signal memory sig = vault.getCurrentSignal();
        assertEq(sig.direction, 1);
        assertEq(sig.sizeBps, 1500);
        assertEq(sig.marketId, MARKET_ID);
        assertEq(sig.limitPrice, LIMIT_PRICE);
        assertEq(sig.reasoningSummary, "RSI oversold");
        assertEq(sig.reasoningHash, keccak256(bytes("RSI oversold")));
        assertEq(vault.signalHistoryLength(), 1);
    }

    function test_unknownCallerCannotPublish() public {
        vm.prank(stranger);
        vm.expectRevert("not publisher");
        publisher.publish(1, 1000, MARKET_ID, LIMIT_PRICE, "nope");
    }

    function test_ownerCanAddAndRemovePublisher() public {
        publisher.addPublisher(stranger);
        vm.prank(stranger);
        publisher.publish(-1, 800, MARKET_ID, LIMIT_PRICE, "from stranger");
        assertEq(vault.getCurrentSignal().direction, int8(-1));

        publisher.removePublisher(stranger);
        vm.prank(stranger);
        vm.expectRevert("not publisher");
        publisher.publish(0, 0, bytes32(0), 0, "removed");
    }

    function test_startPipelineIsNoop() public {
        publisher.startPipeline{value: 1 ether}();
        assertEq(address(publisher).balance, 1 ether);
    }
}

contract DeployCustomAgentVaultTest is Test {
    VaultFactory factory;
    address strategist = address(0xA11CE);
    address other = address(0xB0B);

    function setUp() public {
        MockEthOracle oracle = new MockEthOracle();
        vm.etch(ETH_USD_ORACLE, address(oracle).code);

        factory = new VaultFactory(
            address(new StrategyVault()),
            address(new AgentOrchestrator()),
            address(new MirrorReactor()),
            address(new StopReactor()),
            address(new DrawdownGuard()),
            address(new EpochCron()),
            address(new PerformanceLedger()),
            address(new FeeDistributor()),
            address(new ExternalSignalPublisher())
        );
    }

    function test_customVaultWiresPublisherAndAllowsStrategist() public {
        vm.prank(strategist);
        uint256 vaultId = factory.deployCustomAgentVault("RSI Bot: mean reversion", 500, 2000, 0);

        VaultFactory.VaultDeployment memory dep = factory.getDeployment(vaultId);
        assertEq(dep.strategist, strategist);
        assertTrue(ExternalSignalPublisher(payable(dep.orchestrator)).isCustomPublisher());
        assertTrue(ExternalSignalPublisher(payable(dep.orchestrator)).publishers(strategist));
        assertEq(StrategyVault(payable(dep.vault)).orchestrator(), dep.orchestrator);
        assertEq(StrategyVault(payable(dep.vault)).owner(), strategist);
        assertTrue(dep.eventRouter != address(0));

        vm.prank(strategist);
        ExternalSignalPublisher(payable(dep.orchestrator)).publish(
            1, 1200, bytes32(uint256(42)), 450_000, "from sdk"
        );

        IStrategyVault.Signal memory sig = StrategyVault(payable(dep.vault)).getCurrentSignal();
        assertEq(sig.direction, 1);
        assertEq(sig.sizeBps, 1200);
        assertEq(sig.reasoningSummary, "from sdk");
    }

    function test_otherCannotPublishUntilAdded() public {
        vm.prank(strategist);
        uint256 vaultId = factory.deployCustomAgentVault("Custom: test", 100, 1000, 0);
        VaultFactory.VaultDeployment memory dep = factory.getDeployment(vaultId);
        ExternalSignalPublisher pub = ExternalSignalPublisher(payable(dep.orchestrator));

        vm.prank(other);
        vm.expectRevert("not publisher");
        pub.publish(1, 1, bytes32(uint256(1)), 1, "blocked");

        vm.prank(strategist);
        pub.addPublisher(other);

        vm.prank(other);
        pub.publish(-1, 500, bytes32(uint256(2)), 400_000, "allowed");
        assertEq(StrategyVault(payable(dep.vault)).getCurrentSignal().direction, int8(-1));
    }
}
