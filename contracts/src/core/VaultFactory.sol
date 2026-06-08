// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {DreamDexAdapter} from "../integrations/DreamDexAdapter.sol";

interface IInitVault {
    function initialize(address, address, string calldata, uint16, address) external;
    function setReactors(address, address, address) external;
    function setPerformanceLedger(address) external;
}

interface IInitOrchestrator {
    function initialize(address, address, address, string calldata) external;
}

interface IInitMirror {
    function initialize(address, address, address) external;
    function setPerformanceLedger(address) external;
}

interface IInitStop {
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

    // ── Implementation addresses (deployed once, cloned for each vault) ──
    address public implVault;
    address public implOrchestrator;
    address public implMirrorReactor;
    address public implStopReactor;
    address public implDrawdownGuard;
    address public implEpochCron;
    address public implPerformanceLedger;
    address public implFeeDistributor;

    // Somnia platform constants
    address public constant AGENT_PLATFORM = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;
    // Somnia testnet Protofire ETH/USD (mainnet proxy: 0x5f4eC3Df...)
    address public constant ETH_USD_ORACLE = 0xd9132c1d762D432672493F640a63B758891B449e;
    address public constant DREAMDEX_WETH_POOL = 0xD180195da5459C7a0DEA188ed61216ec43682b50;

    address public owner;
    address public dexAddress;

    struct VaultDeployment {
        address vault;
        address orchestrator;
        address mirrorReactor;
        address stopReactor;
        address drawdownGuard;
        address epochCron;
        address performanceLedger;
        address feeDistributor;
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
        address stopReactor,
        address drawdownGuard,
        address epochCron
    );

    event ImplementationsSet(
        address vault, address orchestrator, address mirror, address stop,
        address guard, address cron, address ledger, address fees
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
        address _implFeeDistributor
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

        emit ImplementationsSet(
            _implVault, _implOrchestrator, _implMirrorReactor, _implStopReactor,
            _implDrawdownGuard, _implEpochCron, _implPerformanceLedger, _implFeeDistributor
        );
    }

    function setDexAddress(address _dex) external onlyOwner {
        dexAddress = _dex;
    }

    /// @notice Deploy a complete vault system in a single transaction.
    ///         The caller becomes the strategist. Send STT to fund the agent pipeline.
    function deployVault(
        string calldata strategyPrompt,
        uint16 performanceFeeBps,
        uint256 maxDrawdownBps
    ) external payable returns (uint256 vaultId) {
        VaultDeployment memory dep;
        dep.strategist = msg.sender;
        dep.deployedAt = block.timestamp;

        // Clone core contracts
        dep.orchestrator = implOrchestrator.clone();
        dep.vault = implVault.clone();

        // Initialize core — factory is temporary owner so it can wire reactors
        IInitOrchestrator(dep.orchestrator).initialize(
            AGENT_PLATFORM, dep.vault, address(this), strategyPrompt
        );
        IInitVault(dep.vault).initialize(
            address(this), dep.strategist, strategyPrompt, performanceFeeBps, dep.orchestrator
        );

        // Clone + init support contracts
        _deploySupport(dep, performanceFeeBps, maxDrawdownBps);

        // Wire vault and mirror → ledger
        IInitVault(dep.vault).setReactors(dep.mirrorReactor, dep.stopReactor, dep.drawdownGuard);
        IInitVault(dep.vault).setPerformanceLedger(dep.performanceLedger);
        IInitMirror(dep.mirrorReactor).setPerformanceLedger(dep.performanceLedger);
        IInitLedger(dep.performanceLedger).addAuthorizedCaller(dep.orchestrator);
        IInitLedger(dep.performanceLedger).addAuthorizedCaller(dep.mirrorReactor);

        // Transfer ownership from factory to strategist
        ITransferOwnership(dep.vault).transferOwnership(dep.strategist);
        ITransferOwnership(dep.orchestrator).transferOwnership(dep.strategist);
        ITransferOwnership(dep.performanceLedger).transferOwnership(dep.strategist);

        // Fund agent pipeline
        if (msg.value > 0) {
            _distributeFunds(msg.value, dep.orchestrator, dep.epochCron);
        }

        // Register
        vaultId = deployments.length;
        deployments.push(dep);
        vaultIndex[dep.vault] = vaultId;
        strategistVaults[dep.strategist].push(dep.vault);

        emit VaultDeployed(
            vaultId, dep.vault, dep.strategist, dep.orchestrator,
            dep.mirrorReactor, dep.stopReactor, dep.drawdownGuard, dep.epochCron
        );
    }

    function _deploySupport(
        VaultDeployment memory dep,
        uint16 performanceFeeBps,
        uint256 maxDrawdownBps
    ) internal {
        dep.mirrorReactor = implMirrorReactor.clone();
        address dexAdapter = address(new DreamDexAdapter(DREAMDEX_WETH_POOL, dep.mirrorReactor));
        IInitMirror(dep.mirrorReactor).initialize(dep.strategist, dep.vault, dexAdapter);

        dep.stopReactor = implStopReactor.clone();
        IInitStop(dep.stopReactor).initialize(dep.strategist, dep.vault, dexAdapter);

        dep.performanceLedger = implPerformanceLedger.clone();
        IInitLedger(dep.performanceLedger).initialize(address(this), dep.vault, ETH_USD_ORACLE);

        dep.drawdownGuard = implDrawdownGuard.clone();
        IInitDrawdown(dep.drawdownGuard).initialize(dep.strategist, dep.vault, dep.performanceLedger, maxDrawdownBps);

        dep.feeDistributor = implFeeDistributor.clone();
        IInitFees(dep.feeDistributor).initialize(dep.strategist, dep.vault, dep.strategist, performanceFeeBps);

        dep.epochCron = implEpochCron.clone();
        IInitEpoch(dep.epochCron).initialize(dep.strategist, dep.orchestrator);
    }

    function _distributeFunds(uint256 total, address orch, address cron) internal {
        uint256 orchShare = total / 2;
        uint256 cronShare = total - orchShare;
        payable(orch).transfer(orchShare);
        payable(cron).transfer(cronShare);
    }

    // ── View functions ──────────────────────────────────────────────────

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
