// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {VaultFactory} from "../src/core/VaultFactory.sol";
import {StrategyVault} from "../src/core/StrategyVault.sol";
import {AgentOrchestrator} from "../src/core/AgentOrchestrator.sol";
import {MirrorReactor} from "../src/reactivity/MirrorReactor.sol";
import {StopReactor} from "../src/reactivity/StopReactor.sol";
import {DrawdownGuard} from "../src/reactivity/DrawdownGuard.sol";
import {EpochCron} from "../src/reactivity/EpochCron.sol";
import {PerformanceLedger} from "../src/finance/PerformanceLedger.sol";
import {FeeDistributor} from "../src/finance/FeeDistributor.sol";

/// @notice Local simulation / gas preview only.
/// @dev Do NOT use `forge script ... --broadcast` on Somnia testnet — CREATE gas is
///      ~25-55M per contract and batch broadcasts revert with out-of-gas.
///      Use `script/deploy.sh` for reliable on-chain deployment.
contract DeployAll is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer:", deployer);
        console.log("NOTE: simulation only - run script/deploy.sh to broadcast");

        vm.startBroadcast(deployerPrivateKey);

        address implVault = address(new StrategyVault());
        console.log("Impl StrategyVault:", implVault);

        address implOrch = address(new AgentOrchestrator());
        console.log("Impl AgentOrchestrator:", implOrch);

        address implMirror = address(new MirrorReactor());
        console.log("Impl MirrorReactor:", implMirror);

        address implStop = address(new StopReactor());
        console.log("Impl StopReactor:", implStop);

        address implGuard = address(new DrawdownGuard());
        console.log("Impl DrawdownGuard:", implGuard);

        address implCron = address(new EpochCron());
        console.log("Impl EpochCron:", implCron);

        address implLedger = address(new PerformanceLedger());
        console.log("Impl PerformanceLedger:", implLedger);

        address implFees = address(new FeeDistributor());
        console.log("Impl FeeDistributor:", implFees);

        VaultFactory factory = new VaultFactory(
            implVault, implOrch, implMirror, implStop,
            implGuard, implCron, implLedger, implFees
        );
        console.log("VaultFactory:", address(factory));

        vm.stopBroadcast();
        console.log("--- SIMULATION COMPLETE (use script/deploy.sh to deploy) ---");
    }
}
