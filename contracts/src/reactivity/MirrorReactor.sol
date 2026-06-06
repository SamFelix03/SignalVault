// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import {IStrategyVault} from "../interfaces/IStrategyVault.sol";
import {IDreamDEX} from "../interfaces/IDreamDEX.sol";

interface IPerformanceLedger {
    function recordTrade(int8 direction, uint256 entryPrice, uint256 exitPrice, uint256 size) external;
}

contract MirrorReactor is SomniaEventHandler {
    address public owner;
    address public vault;
    IDreamDEX public dex;
    address public performanceLedger;
    bool private _initialized;

    bytes32 public constant SIGNAL_UPDATED_TOPIC = keccak256("SignalUpdated(bytes32,int8,uint16,uint256,string,bytes32)");

    uint256 public subscriptionId;
    uint256 public totalMirrored;

    event MirrorExecuted(address indexed follower, int8 direction, uint256 size, bytes32 positionId);
    event MirrorFailed(address indexed follower, string reason);
    event SubscriptionRegistered(uint256 subscriptionId);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {}

    function initialize(address _owner, address _vault, address _dex) external {
        require(!_initialized, "already initialized");
        _initialized = true;
        owner = _owner;
        vault = _vault;
        dex = IDreamDEX(_dex);
    }

    function setPerformanceLedger(address _ledger) external {
        require(msg.sender == owner || performanceLedger == address(0), "not authorized");
        performanceLedger = _ledger;
    }

    function registerSubscription() external onlyOwner {
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [SIGNAL_UPDATED_TOPIC, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: vault
        });

        SomniaExtensions.SubscriptionOptions memory options = SomniaExtensions.defaultSubscriptionOptions();
        subscriptionId = SomniaExtensions.subscribe(address(this), filter, options);
        emit SubscriptionRegistered(subscriptionId);
    }

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        if (emitter != vault || eventTopics[0] != SIGNAL_UPDATED_TOPIC) return;

        (int8 direction, uint16 sizeBps, uint256 stopPrice,,) =
            abi.decode(data, (int8, uint16, uint256, string, bytes32));

        if (direction == 0) return;

        address[] memory followers = IStrategyVault(vault).getFollowers();

        for (uint256 i = 0; i < followers.length; i++) {
            IStrategyVault.FollowerConfig memory config = IStrategyVault(vault).getFollowerConfig(followers[i]);
            if (!config.active) continue;

            uint256 scaledSize = (config.maxPositionSize * sizeBps * config.riskPct) / (10000 * 100);
            if (scaledSize == 0) continue;

            uint256 adjustedStop = direction > 0
                ? (stopPrice > config.stopLossBuffer ? stopPrice - config.stopLossBuffer : 0)
                : stopPrice + config.stopLossBuffer;

            try dex.placeOrder{value: 0}(
                followers[i], direction, scaledSize, adjustedStop, config.maxSlippageBps
            ) returns (bytes32 positionId) {
                totalMirrored++;
                emit MirrorExecuted(followers[i], direction, scaledSize, positionId);
            } catch Error(string memory reason) {
                emit MirrorFailed(followers[i], reason);
            } catch {
                emit MirrorFailed(followers[i], "unknown error");
            }
        }
    }

    function unregisterSubscription() external onlyOwner {
        if (subscriptionId != 0) {
            SomniaExtensions.unsubscribe(subscriptionId);
            subscriptionId = 0;
        }
    }

    receive() external payable {}
}
