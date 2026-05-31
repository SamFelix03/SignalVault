// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AgentOrchestrator} from "../src/core/AgentOrchestrator.sol";

contract TriggerEpoch is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address orchestratorAddr = vm.envAddress("ORCHESTRATOR_ADDRESS");
        uint256 budget = vm.envOr("AGENT_BUDGET", uint256(1 ether));

        vm.startBroadcast(deployerPrivateKey);

        AgentOrchestrator orchestrator = AgentOrchestrator(payable(orchestratorAddr));
        orchestrator.startPipeline{value: budget}();

        console.log("Pipeline triggered on orchestrator:", orchestratorAddr);
        console.log("Budget sent:", budget);
        console.log("Current run ID:", orchestrator.currentRunId());

        vm.stopBroadcast();
    }
}
