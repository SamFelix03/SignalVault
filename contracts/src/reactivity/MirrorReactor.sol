// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import {IStrategyVault} from "../interfaces/IStrategyVault.sol";
import {IExecutionRouter} from "../interfaces/IExecutionRouter.sol";

contract MirrorReactor is SomniaEventHandler {
    address public owner;
    address public vault;
    IExecutionRouter public router;
    bool private _initialized;

    bytes32 public constant SIGNAL_UPDATED_TOPIC =
        keccak256("SignalUpdated(bytes32,int8,uint16,bytes32,uint256,string,bytes32)");

    /// @dev PerpRouter v3 mirror path needs ~22M gas (wallet deploy + slippage retries).
    uint64 internal constant MIRROR_HANDLER_GAS_LIMIT = 30_000_000;

    uint256 public subscriptionId;
    uint256 public totalMirrored;

    event MirrorExecuted(
        address indexed follower, int8 direction, uint256 collateral, bytes32 fillId, bytes32 marketId
    );
    event MirrorFailed(address indexed follower, string reason);
    event SubscriptionRegistered(uint256 subscriptionId);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {}

    function initialize(address _owner, address _vault, address _router) external {
        require(!_initialized, "already initialized");
        _initialized = true;
        owner = _owner;
        vault = _vault;
        router = IExecutionRouter(_router);
    }

    function registerSubscription() external onlyOwner {
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [SIGNAL_UPDATED_TOPIC, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: vault
        });

        SomniaExtensions.SubscriptionOptions memory options = SomniaExtensions.SubscriptionOptions({
            priorityFeePerGas: SomniaExtensions.DEFAULT_PRIORITY_FEE_PER_GAS,
            maxFeePerGas: SomniaExtensions.DEFAULT_MAX_FEE_PER_GAS,
            gasLimit: MIRROR_HANDLER_GAS_LIMIT
        });
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
            bytes32 marketId,
            uint256 limitPrice,
            string memory reasoningSummary,
            bytes32 reasoningHash
        ) = abi.decode(data, (int8, uint16, bytes32, uint256, string, bytes32));
        reasoningSummary;
        reasoningHash;

        if (signalHash == bytes32(0)) signalHash = reasoningHash;

        bool isPerp = IStrategyVault(vault).instrumentType() == IStrategyVault.InstrumentType.PERP;
        if (direction == 0 && !isPerp) return;

        address[] memory followerAddrs = IStrategyVault(vault).getFollowers();

        for (uint256 i = 0; i < followerAddrs.length; i++) {
            address follower = followerAddrs[i];
            IStrategyVault.FollowerConfig memory config = IStrategyVault(vault).getFollowerConfig(follower);
            if (!config.active) continue;

            if (direction != 0) {
                try IStrategyVault(vault).chargeSignalFee(follower, signalHash) {
                } catch {
                    emit MirrorFailed(follower, "signal payment failed");
                    continue;
                }
            }

            uint256 collateral = direction == 0
                ? 0
                : (config.maxPositionSize * uint256(sizeBps) * uint256(config.riskPct)) / (10_000 * 10_000);
            if (direction != 0 && collateral == 0) continue;

            try router.placeOrder(
                follower, marketId, direction, collateral, limitPrice, config.maxSlippageBps
            ) returns (bytes32 fillId) {
                if (fillId == bytes32(0)) {
                    emit MirrorFailed(follower, "order not filled");
                    continue;
                }
                totalMirrored++;
                emit MirrorExecuted(follower, direction, collateral, fillId, marketId);
            } catch Error(string memory reason) {
                emit MirrorFailed(follower, reason);
            } catch {
                emit MirrorFailed(follower, "unknown error");
            }
        }
    }

    function setRouter(address _router) external onlyOwner {
        require(_router != address(0), "zero router");
        router = IExecutionRouter(_router);
    }

    function unregisterSubscription() external onlyOwner {
        if (subscriptionId != 0) {
            SomniaExtensions.unsubscribe(subscriptionId);
            subscriptionId = 0;
        }
    }

    receive() external payable {}
}
