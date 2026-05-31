// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import {IStrategyVault} from "../interfaces/IStrategyVault.sol";
import {IDreamDEX} from "../interfaces/IDreamDEX.sol";

contract StopReactor is SomniaEventHandler {
    address public owner;
    address public vault;
    IDreamDEX public dex;
    bool private _initialized;

    bytes32 public constant SIGNAL_UPDATED_TOPIC = keccak256("SignalUpdated(bytes32,int8,uint16,uint256,string,bytes32)");

    uint256 public subscriptionId;
    uint256 public totalStopped;

    mapping(address => bytes32[]) public followerPositions;

    event StopTriggered(address indexed follower, bytes32 indexed positionId, int256 pnl);
    event StopCheckFailed(address indexed follower, bytes32 indexed positionId, string reason);
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

    function trackPosition(address follower, bytes32 positionId) external {
        require(msg.sender == owner || msg.sender == address(this), "not authorized");
        followerPositions[follower].push(positionId);
    }

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        if (emitter != vault || eventTopics[0] != SIGNAL_UPDATED_TOPIC) return;

        (,, uint256 stopPrice,,) = abi.decode(data, (int8, uint16, uint256, string, bytes32));
        if (stopPrice == 0) return;

        address[] memory followers = IStrategyVault(vault).getFollowers();

        for (uint256 i = 0; i < followers.length; i++) {
            bytes32[] storage positions = followerPositions[followers[i]];
            IStrategyVault.FollowerConfig memory config = IStrategyVault(vault).getFollowerConfig(followers[i]);
            uint256 adjustedStop = stopPrice + config.stopLossBuffer;

            for (uint256 j = 0; j < positions.length; j++) {
                try dex.getPosition(positions[j]) returns (IDreamDEX.Position memory pos) {
                    if (!pos.isOpen) continue;

                    bool shouldStop = false;
                    if (pos.direction > 0) {
                        shouldStop = pos.entryPrice > adjustedStop && adjustedStop > 0;
                    } else {
                        shouldStop = adjustedStop > pos.entryPrice;
                    }

                    if (shouldStop) {
                        try dex.closePosition(positions[j]) returns (int256 pnl) {
                            totalStopped++;
                            emit StopTriggered(followers[i], positions[j], pnl);
                        } catch Error(string memory reason) {
                            emit StopCheckFailed(followers[i], positions[j], reason);
                        }
                    }
                } catch {}
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
