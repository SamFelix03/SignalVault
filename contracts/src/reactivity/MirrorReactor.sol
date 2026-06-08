// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import {IStrategyVault} from "../interfaces/IStrategyVault.sol";
import {IDreamDEX} from "../interfaces/IDreamDEX.sol";

interface IPerformanceLedger {
    function openFollowerPosition(
        address follower,
        int8 direction,
        uint256 entryPrice,
        uint256 size,
        bytes32 signalHash
    ) external;

    function recordFollowerTrade(
        address follower,
        int8 direction,
        uint256 entryPrice,
        uint256 exitPrice,
        uint256 size,
        bytes32 signalHash
    ) external;
}

interface IDreamDexPricing {
    function getMarkPrice() external view returns (uint256);
    function lastExecutionPrice() external view returns (uint256);
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

    struct FollowerOpenLeg {
        int8 direction;
        uint256 entryPrice;
        uint256 size;
        bytes32 positionId;
    }

    mapping(address => FollowerOpenLeg) public followerOpenLegs;

    event MirrorExecuted(address indexed follower, int8 direction, uint256 size, bytes32 positionId, uint256 price);
    event MirrorFailed(address indexed follower, string reason);
    event MirrorSettled(address indexed follower, int8 direction, uint256 entryPrice, uint256 exitPrice, uint256 size);
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

        bytes32 signalHash = eventTopics.length > 1 ? eventTopics[1] : bytes32(0);

        (
            int8 direction,
            uint16 sizeBps,
            uint256 stopPrice,
            string memory reasoningSummary,
            bytes32 reasoningHash
        ) = abi.decode(data, (int8, uint16, uint256, string, bytes32));
        reasoningSummary;

        if (signalHash == bytes32(0)) signalHash = reasoningHash;

        uint256 markPrice = IDreamDexPricing(address(dex)).getMarkPrice();
        address[] memory followers = IStrategyVault(vault).getFollowers();

        for (uint256 i = 0; i < followers.length; i++) {
            address follower = followers[i];
            IStrategyVault.FollowerConfig memory config = IStrategyVault(vault).getFollowerConfig(follower);
            if (!config.active) continue;

            _settleOpenLeg(follower, markPrice, signalHash);

            if (direction == 0) continue;

            // Quote notional in USDso (18 decimals): maxPosition × signal size × risk scaling
            uint256 quoteNotional = (config.maxPositionSize * uint256(sizeBps) * uint256(config.riskPct))
                / (10_000 * 100);
            if (quoteNotional == 0) continue;

            uint256 adjustedStop = direction > 0
                ? (stopPrice > config.stopLossBuffer ? stopPrice - config.stopLossBuffer : 0)
                : stopPrice + config.stopLossBuffer;

            try dex.placeOrder{value: 0}(
                follower, direction, quoteNotional, adjustedStop, config.maxSlippageBps
            ) returns (bytes32 positionId) {
                if (positionId == bytes32(0)) {
                    emit MirrorFailed(follower, "order not filled");
                    continue;
                }

                uint256 fillPrice = IDreamDexPricing(address(dex)).lastExecutionPrice();
                if (fillPrice == 0) fillPrice = markPrice;

                followerOpenLegs[follower] = FollowerOpenLeg({
                    direction: direction,
                    entryPrice: fillPrice,
                    size: quoteNotional,
                    positionId: positionId
                });

                if (performanceLedger != address(0)) {
                    IPerformanceLedger(performanceLedger).openFollowerPosition(
                        follower, direction, fillPrice, quoteNotional, signalHash
                    );
                }

                totalMirrored++;
                emit MirrorExecuted(follower, direction, quoteNotional, positionId, fillPrice);
            } catch Error(string memory reason) {
                emit MirrorFailed(follower, reason);
            } catch {
                emit MirrorFailed(follower, "unknown error");
            }
        }
    }

    function _settleOpenLeg(address follower, uint256 exitPrice, bytes32 signalHash) internal {
        FollowerOpenLeg memory leg = followerOpenLegs[follower];
        if (leg.size == 0) return;

        if (performanceLedger != address(0)) {
            IPerformanceLedger(performanceLedger).recordFollowerTrade(
                follower,
                leg.direction,
                leg.entryPrice,
                exitPrice > 0 ? exitPrice : leg.entryPrice,
                leg.size,
                signalHash
            );
        }

        emit MirrorSettled(follower, leg.direction, leg.entryPrice, exitPrice, leg.size);
        delete followerOpenLegs[follower];
    }

    function unregisterSubscription() external onlyOwner {
        if (subscriptionId != 0) {
            SomniaExtensions.unsubscribe(subscriptionId);
            subscriptionId = 0;
        }
    }

    receive() external payable {}
}
