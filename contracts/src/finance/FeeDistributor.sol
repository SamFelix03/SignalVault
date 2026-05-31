// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";

contract FeeDistributor is SomniaEventHandler {
    address public owner;
    address public vault;
    address public strategist;
    uint16 public performanceFeeBps;
    bool private _initialized;
    bool private _reentrancyLock;

    uint256 public totalFeesCollected;
    uint256 public totalFeesDistributed;
    uint256 public lastDistribution;

    uint256 public scheduleSubscriptionId;

    uint256 public constant DISTRIBUTION_INTERVAL = 24 hours;

    event FeesCollected(uint256 amount, uint256 totalCollected);
    event FeesDistributed(address indexed strategist, uint256 amount);
    event SubscriptionRegistered(uint256 subscriptionId);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyVaultOrOwner() {
        require(msg.sender == vault || msg.sender == owner, "not authorized");
        _;
    }

    modifier nonReentrant() {
        require(!_reentrancyLock, "reentrant");
        _reentrancyLock = true;
        _;
        _reentrancyLock = false;
    }

    constructor() {}

    function initialize(address _owner, address _vault, address _strategist, uint16 _performanceFeeBps) external {
        require(!_initialized, "already initialized");
        _initialized = true;
        owner = _owner;
        vault = _vault;
        strategist = _strategist;
        performanceFeeBps = _performanceFeeBps;
    }

    function collectFees() external payable onlyVaultOrOwner {
        totalFeesCollected += msg.value;
        emit FeesCollected(msg.value, totalFeesCollected);
    }

    function scheduleDistribution() external onlyOwner {
        uint256 nextDistribution = (block.timestamp + DISTRIBUTION_INTERVAL) * 1000;
        SomniaExtensions.SubscriptionOptions memory options = SomniaExtensions.defaultSubscriptionOptions();
        scheduleSubscriptionId = SomniaExtensions.scheduleSubscriptionAtTimestamp(
            address(this), nextDistribution, options
        );
        emit SubscriptionRegistered(scheduleSubscriptionId);
    }

    function _onEvent(address, bytes32[] calldata eventTopics, bytes calldata) internal override {
        if (eventTopics[0] != keccak256("Schedule(uint256)")) return;
        _distribute();

        uint256 nextDistribution = (block.timestamp + DISTRIBUTION_INTERVAL) * 1000;
        SomniaExtensions.SubscriptionOptions memory options = SomniaExtensions.defaultSubscriptionOptions();
        scheduleSubscriptionId = SomniaExtensions.scheduleSubscriptionAtTimestamp(
            address(this), nextDistribution, options
        );
    }

    function _distribute() internal nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) return;

        totalFeesDistributed += balance;
        lastDistribution = block.timestamp;

        (bool ok,) = strategist.call{value: balance}("");
        require(ok, "distribution failed");

        emit FeesDistributed(strategist, balance);
    }

    function manualDistribute() external onlyOwner {
        _distribute();
    }

    function updateStrategist(address _strategist) external onlyOwner {
        require(_strategist != address(0), "zero address");
        strategist = _strategist;
    }

    function unregisterSubscription() external onlyOwner {
        if (scheduleSubscriptionId != 0) {
            SomniaExtensions.unsubscribe(scheduleSubscriptionId);
            scheduleSubscriptionId = 0;
        }
    }

    receive() external payable {}
}
