// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {EventContractsRouter} from "../integrations/EventContractsRouter.sol";
import {PerpRouter} from "../integrations/PerpRouter.sol";
import {IStrategyVault} from "../interfaces/IStrategyVault.sol";

interface IInitVault {
    function initialize(
        address,
        address,
        string calldata,
        uint16,
        address,
        address,
        uint256,
        IStrategyVault.SourceType,
        IStrategyVault.InstrumentType,
        address,
        address
    ) external;
    function setReactors(address, address, address) external;
    function setPerformanceLedger(address) external;
    function setEventRouter(address) external;
}

interface IInitOrchestrator {
    function initialize(address, address, address, string calldata) external;
}

interface IInitPublisher {
    function initialize(address vault, address owner) external;
    function addPublisher(address publisher) external;
}

interface IInitMirror {
    function initialize(address, address, address) external;
}

interface IInitDrawdown {
    function initialize(address, address, address, uint256) external;
}

interface IInitEpoch {
    function initialize(address, address) external;
}

interface IInitLedger {
    function initialize(address, address, address) external;
    function addAuthorizedCaller(address caller) external;
}

interface IInitFees {
    function initialize(address, address, address, uint16) external;
}

interface ITransferOwnership {
    function transferOwnership(address) external;
}

contract VaultFactory {
    using Clones for address;

    address public implVault;
    address public implOrchestrator;
    address public implMirrorReactor;
    address public implStopReactor;
    address public implDrawdownGuard;
    address public implEpochCron;
    address public implPerformanceLedger;
    address public implFeeDistributor;
    address public implPublisher;

    address public constant AGENT_PLATFORM = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;
    address public constant ETH_USD_ORACLE = 0xd9132c1d762D432672493F640a63B758891B449e;
    /// @dev dreamDEX event-contract collateral on Somnia Shannon testnet (6 decimals).
    address public constant TESTNET_COLLATERAL = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;
    /// @dev Perp margin collateral on Shannon testnet (18 decimals).
    address public constant TESTNET_PERP_COLLATERAL = 0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171;
  address public constant TESTNET_MARGIN_BANK = 0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E;

    address public owner;
    address public relayer;

    struct VaultDeployment {
        address vault;
        address orchestrator;
        address mirrorReactor;
        address stopReactor;
        address drawdownGuard;
        address epochCron;
        address performanceLedger;
        address feeDistributor;
        address eventRouter;
        IStrategyVault.InstrumentType instrumentType;
        address strategist;
        uint256 deployedAt;
    }

    VaultDeployment[] public deployments;
    mapping(address => uint256) public vaultIndex;
    mapping(address => address[]) public strategistVaults;

    event VaultDeployed(
        uint256 indexed vaultId,
        address indexed vault,
        address indexed strategist,
        address orchestrator,
        address mirrorReactor,
        address eventRouter,
        IStrategyVault.SourceType sourceType,
        IStrategyVault.InstrumentType instrumentType
    );

    event ImplementationsSet(
        address vault, address orchestrator, address mirror, address stop,
        address guard, address cron, address ledger, address fees, address publisher
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(
        address _implVault,
        address _implOrchestrator,
        address _implMirrorReactor,
        address _implStopReactor,
        address _implDrawdownGuard,
        address _implEpochCron,
        address _implPerformanceLedger,
        address _implFeeDistributor,
        address _implPublisher
    ) {
        owner = msg.sender;
        implVault = _implVault;
        implOrchestrator = _implOrchestrator;
        implMirrorReactor = _implMirrorReactor;
        implStopReactor = _implStopReactor;
        implDrawdownGuard = _implDrawdownGuard;
        implEpochCron = _implEpochCron;
        implPerformanceLedger = _implPerformanceLedger;
        implFeeDistributor = _implFeeDistributor;
        implPublisher = _implPublisher;

        emit ImplementationsSet(
            _implVault, _implOrchestrator, _implMirrorReactor, _implStopReactor,
            _implDrawdownGuard, _implEpochCron, _implPerformanceLedger, _implFeeDistributor,
            _implPublisher
        );
    }

    /// @dev Event-contract collateral and per-signal fees both use tUSDC on testnet.
    function collateralToken() external pure returns (address) {
        return TESTNET_COLLATERAL;
    }

    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
    }

    function deployVault(
        string calldata strategyPrompt,
        uint16 performanceFeeBps,
        uint256 maxDrawdownBps,
        uint256 signalPricePerSignal,
        IStrategyVault.InstrumentType instrument
    ) external payable returns (uint256 vaultId) {
        return _deployNativeVault(strategyPrompt, performanceFeeBps, maxDrawdownBps, signalPricePerSignal, instrument);
    }

    function deployAgentVault(
        string calldata description,
        uint16 performanceFeeBps,
        uint256 maxDrawdownBps,
        uint256 signalPricePerSignal,
        IStrategyVault.InstrumentType instrument
    ) external returns (uint256 vaultId) {
        return _deployAgentVault(description, performanceFeeBps, maxDrawdownBps, signalPricePerSignal, instrument);
    }

    /// @dev Backward-compatible alias (defaults to BINARY).
    function deployCustomAgentVault(
        string calldata description,
        uint16 performanceFeeBps,
        uint256 maxDrawdownBps,
        uint256 signalPricePerSignal
    ) external returns (uint256 vaultId) {
        return _deployAgentVault(
            description, performanceFeeBps, maxDrawdownBps, signalPricePerSignal, IStrategyVault.InstrumentType.BINARY
        );
    }

    function deployWalletVault(
        address sourceWallet,
        string calldata description,
        uint16 performanceFeeBps,
        uint256 maxDrawdownBps,
        uint256 signalPricePerSignal,
        IStrategyVault.InstrumentType instrument
    ) external returns (uint256 vaultId) {
        require(sourceWallet != address(0), "zero wallet");
        require(relayer != address(0), "relayer unset");
        require(implPublisher != address(0), "publisher impl unset");

        VaultDeployment memory dep;
        dep.strategist = msg.sender;
        dep.deployedAt = block.timestamp;

        dep.orchestrator = implPublisher.clone();
        dep.vault = implVault.clone();

        IInitPublisher(dep.orchestrator).initialize(dep.vault, address(this));
        IInitVault(dep.vault).initialize(
            address(this),
            dep.strategist,
            description,
            performanceFeeBps,
            dep.orchestrator,
            TESTNET_COLLATERAL,
            signalPricePerSignal,
            IStrategyVault.SourceType.WALLET,
            instrument,
            sourceWallet,
            relayer
        );

        _deploySupport(dep, performanceFeeBps, maxDrawdownBps, instrument);
        IInitVault(dep.vault).setEventRouter(dep.eventRouter);

        IInitVault(dep.vault).setReactors(dep.mirrorReactor, address(0), dep.drawdownGuard);
        IInitVault(dep.vault).setPerformanceLedger(dep.performanceLedger);
        IInitLedger(dep.performanceLedger).addAuthorizedCaller(dep.orchestrator);
        IInitLedger(dep.performanceLedger).addAuthorizedCaller(dep.mirrorReactor);

        IInitPublisher(dep.orchestrator).addPublisher(relayer);

        ITransferOwnership(dep.vault).transferOwnership(dep.strategist);
        ITransferOwnership(dep.orchestrator).transferOwnership(dep.strategist);
        ITransferOwnership(dep.performanceLedger).transferOwnership(dep.strategist);

        vaultId = deployments.length;
        deployments.push(dep);
        vaultIndex[dep.vault] = vaultId;
        strategistVaults[dep.strategist].push(dep.vault);

        emit VaultDeployed(
            vaultId,
            dep.vault,
            dep.strategist,
            dep.orchestrator,
            dep.mirrorReactor,
            dep.eventRouter,
            IStrategyVault.SourceType.WALLET,
            instrument
        );
    }

    function _deployNativeVault(
        string calldata strategyPrompt,
        uint16 performanceFeeBps,
        uint256 maxDrawdownBps,
        uint256 signalPricePerSignal,
        IStrategyVault.InstrumentType instrument
    ) internal returns (uint256 vaultId) {
        VaultDeployment memory dep;
        dep.strategist = msg.sender;
        dep.deployedAt = block.timestamp;

        dep.orchestrator = implOrchestrator.clone();
        dep.vault = implVault.clone();

        IInitOrchestrator(dep.orchestrator).initialize(
            AGENT_PLATFORM, dep.vault, address(this), strategyPrompt
        );
        IInitVault(dep.vault).initialize(
            address(this),
            dep.strategist,
            strategyPrompt,
            performanceFeeBps,
            dep.orchestrator,
            TESTNET_COLLATERAL,
            signalPricePerSignal,
            IStrategyVault.SourceType.AGENT,
            instrument,
            address(0),
            address(0)
        );

        _deploySupport(dep, performanceFeeBps, maxDrawdownBps, instrument);
        IInitVault(dep.vault).setEventRouter(dep.eventRouter);

        IInitVault(dep.vault).setReactors(dep.mirrorReactor, address(0), dep.drawdownGuard);
        IInitVault(dep.vault).setPerformanceLedger(dep.performanceLedger);
        IInitLedger(dep.performanceLedger).addAuthorizedCaller(dep.orchestrator);
        IInitLedger(dep.performanceLedger).addAuthorizedCaller(dep.mirrorReactor);

        ITransferOwnership(dep.vault).transferOwnership(dep.strategist);
        ITransferOwnership(dep.orchestrator).transferOwnership(dep.strategist);
        ITransferOwnership(dep.performanceLedger).transferOwnership(dep.strategist);

        if (msg.value > 0) {
            _distributeFunds(msg.value, dep.orchestrator, dep.epochCron);
        }

        vaultId = deployments.length;
        deployments.push(dep);
        vaultIndex[dep.vault] = vaultId;
        strategistVaults[dep.strategist].push(dep.vault);

        emit VaultDeployed(
            vaultId,
            dep.vault,
            dep.strategist,
            dep.orchestrator,
            dep.mirrorReactor,
            dep.eventRouter,
            IStrategyVault.SourceType.AGENT,
            instrument
        );
    }

    function _deployAgentVault(
        string calldata description,
        uint16 performanceFeeBps,
        uint256 maxDrawdownBps,
        uint256 signalPricePerSignal,
        IStrategyVault.InstrumentType instrument
    ) internal returns (uint256 vaultId) {
        require(implPublisher != address(0), "publisher impl unset");

        VaultDeployment memory dep;
        dep.strategist = msg.sender;
        dep.deployedAt = block.timestamp;

        dep.orchestrator = implPublisher.clone();
        dep.vault = implVault.clone();

        IInitPublisher(dep.orchestrator).initialize(dep.vault, address(this));
        IInitVault(dep.vault).initialize(
            address(this),
            dep.strategist,
            description,
            performanceFeeBps,
            dep.orchestrator,
            TESTNET_COLLATERAL,
            signalPricePerSignal,
            IStrategyVault.SourceType.AGENT,
            instrument,
            address(0),
            address(0)
        );

        _deploySupport(dep, performanceFeeBps, maxDrawdownBps, instrument);
        IInitVault(dep.vault).setEventRouter(dep.eventRouter);

        IInitVault(dep.vault).setReactors(dep.mirrorReactor, address(0), dep.drawdownGuard);
        IInitVault(dep.vault).setPerformanceLedger(dep.performanceLedger);
        IInitLedger(dep.performanceLedger).addAuthorizedCaller(dep.orchestrator);
        IInitLedger(dep.performanceLedger).addAuthorizedCaller(dep.mirrorReactor);

        IInitPublisher(dep.orchestrator).addPublisher(dep.strategist);

        ITransferOwnership(dep.vault).transferOwnership(dep.strategist);
        ITransferOwnership(dep.orchestrator).transferOwnership(dep.strategist);
        ITransferOwnership(dep.performanceLedger).transferOwnership(dep.strategist);

        vaultId = deployments.length;
        deployments.push(dep);
        vaultIndex[dep.vault] = vaultId;
        strategistVaults[dep.strategist].push(dep.vault);

        emit VaultDeployed(
            vaultId,
            dep.vault,
            dep.strategist,
            dep.orchestrator,
            dep.mirrorReactor,
            dep.eventRouter,
            IStrategyVault.SourceType.AGENT,
            instrument
        );
    }

    function _deploySupport(
        VaultDeployment memory dep,
        uint16 performanceFeeBps,
        uint256 maxDrawdownBps,
        IStrategyVault.InstrumentType instrument
    ) internal {
        dep.instrumentType = instrument;
        dep.mirrorReactor = implMirrorReactor.clone();
        if (instrument == IStrategyVault.InstrumentType.PERP) {
            dep.eventRouter = address(new PerpRouter(dep.mirrorReactor, TESTNET_MARGIN_BANK));
        } else {
            dep.eventRouter = address(new EventContractsRouter(dep.mirrorReactor, TESTNET_COLLATERAL));
        }
        IInitMirror(dep.mirrorReactor).initialize(dep.strategist, dep.vault, dep.eventRouter);

        dep.performanceLedger = implPerformanceLedger.clone();
        IInitLedger(dep.performanceLedger).initialize(address(this), dep.vault, ETH_USD_ORACLE);

        dep.drawdownGuard = implDrawdownGuard.clone();
        IInitDrawdown(dep.drawdownGuard).initialize(dep.strategist, dep.vault, dep.performanceLedger, maxDrawdownBps);

        dep.feeDistributor = implFeeDistributor.clone();
        IInitFees(dep.feeDistributor).initialize(dep.strategist, dep.vault, dep.strategist, performanceFeeBps);

        dep.epochCron = implEpochCron.clone();
        IInitEpoch(dep.epochCron).initialize(dep.strategist, dep.orchestrator);

        dep.stopReactor = address(0);
    }

    function _distributeFunds(uint256 total, address orch, address cron) internal {
        uint256 orchShare = total / 2;
        uint256 cronShare = total - orchShare;
        payable(orch).transfer(orchShare);
        payable(cron).transfer(cronShare);
    }

    function getDeployment(uint256 vaultId) external view returns (VaultDeployment memory) {
        return deployments[vaultId];
    }

    function getDeploymentCount() external view returns (uint256) {
        return deployments.length;
    }

    function getStrategistVaults(address _strategist) external view returns (address[] memory) {
        return strategistVaults[_strategist];
    }

    receive() external payable {}
}
