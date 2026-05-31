// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";

interface IOrchestrator {
    function startPipeline() external payable;
}

contract EpochCron is SomniaEventHandler {
    address public owner;
    IOrchestrator public orchestrator;
    bool private _initialized;

    bytes32 public constant EPOCH_TICK_TOPIC = keccak256("EpochTick(uint64,uint64)");

    uint256 public subscriptionId;
    uint256 public totalTriggers;
    uint256 public agentBudget;
    bool public active;

    event EpochTriggered(uint256 epochNumber, uint256 blockNumber, uint256 timestamp);
    event SubscriptionRegistered(uint256 subscriptionId);
    event BudgetUpdated(uint256 newBudget);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {}

    function initialize(address _owner, address _orchestrator) external {
        require(!_initialized, "already initialized");
        _initialized = true;
        owner = _owner;
        orchestrator = IOrchestrator(_orchestrator);
        active = true;
        agentBudget = 1 ether;
    }

    function registerSubscription() external onlyOwner {
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [EPOCH_TICK_TOPIC, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS
        });

        SomniaExtensions.SubscriptionOptions memory options = SomniaExtensions.defaultSubscriptionOptions();
        subscriptionId = SomniaExtensions.subscribe(address(this), filter, options);
        emit SubscriptionRegistered(subscriptionId);
    }

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata
    ) internal override {
        if (!active) return;
        if (eventTopics[0] != EPOCH_TICK_TOPIC) return;
        if (emitter != SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS) return;

        uint256 budget = agentBudget;
        if (address(this).balance < budget) {
            budget = address(this).balance;
        }
        if (budget == 0) return;

        uint64 epochNumber = uint64(uint256(eventTopics[1]));

        try orchestrator.startPipeline{value: budget}() {
            totalTriggers++;
            emit EpochTriggered(epochNumber, block.number, block.timestamp);
        } catch {}
    }

    function setAgentBudget(uint256 _budget) external onlyOwner {
        agentBudget = _budget;
        emit BudgetUpdated(_budget);
    }

    function setActive(bool _active) external onlyOwner {
        active = _active;
    }

    function unregisterSubscription() external onlyOwner {
        if (subscriptionId != 0) {
            SomniaExtensions.unsubscribe(subscriptionId);
            subscriptionId = 0;
        }
    }

    function withdraw() external onlyOwner {
        (bool ok,) = owner.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    receive() external payable {}
}
