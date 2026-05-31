// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IStrategyVault} from "../interfaces/IStrategyVault.sol";

contract StrategyVault is IStrategyVault {
    address public owner;
    address public strategist;
    address public orchestrator;
    string public strategyPrompt;
    uint16 public performanceFeeBps;
    bool public agentRunning;
    bool public emergencyMode;
    bool private _initialized;
    bool private _reentrancyLock;

    Signal public currentSignal;
    Signal[] private _signalHistory;

    mapping(address => FollowerConfig) public followers;
    address[] public followerList;
    mapping(address => uint256) public followerIndex;

    address public performanceLedger;
    address public mirrorReactor;
    address public stopReactor;
    address public drawdownGuard;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator, "not orchestrator");
        _;
    }

    modifier notEmergency() {
        require(!emergencyMode, "emergency mode active");
        _;
    }

    modifier nonReentrant() {
        require(!_reentrancyLock, "reentrant");
        _reentrancyLock = true;
        _;
        _reentrancyLock = false;
    }

    constructor() {}

    function initialize(
        address _owner,
        address _strategist,
        string calldata _strategyPrompt,
        uint16 _performanceFeeBps,
        address _orchestrator
    ) external {
        require(!_initialized, "already initialized");
        require(_performanceFeeBps <= 5000, "fee too high");
        _initialized = true;
        owner = _owner;
        strategist = _strategist;
        strategyPrompt = _strategyPrompt;
        performanceFeeBps = _performanceFeeBps;
        orchestrator = _orchestrator;
    }

    function setReactors(
        address _mirrorReactor,
        address _stopReactor,
        address _drawdownGuard
    ) external onlyOwner {
        mirrorReactor = _mirrorReactor;
        stopReactor = _stopReactor;
        drawdownGuard = _drawdownGuard;
    }

    function setPerformanceLedger(address _ledger) external onlyOwner {
        performanceLedger = _ledger;
    }

    function updateSignal(
        int8 direction,
        uint16 sizeBps,
        uint256 stopPrice,
        string calldata reasoningSummary,
        bytes32 reasoningHash
    ) external onlyOrchestrator notEmergency {
        require(direction >= -1 && direction <= 1, "invalid direction");
        require(sizeBps <= 10000, "invalid size");

        Signal memory sig = Signal({
            direction: direction,
            sizeBps: sizeBps,
            stopPrice: stopPrice,
            epoch: block.number,
            reasoningHash: reasoningHash,
            reasoningSummary: reasoningSummary
        });

        currentSignal = sig;
        _signalHistory.push(sig);

        bytes32 signalHash = keccak256(
            abi.encodePacked(direction, sizeBps, stopPrice, block.number)
        );

        emit SignalUpdated(signalHash, direction, sizeBps, stopPrice, reasoningSummary, reasoningHash);
    }

    function subscribe(FollowerConfig calldata config) external payable nonReentrant notEmergency {
        require(!followers[msg.sender].active, "already subscribed");
        require(config.riskPct > 0 && config.riskPct <= 1000, "invalid risk");
        require(config.maxPositionSize > 0, "invalid max position");
        require(config.maxSlippageBps <= 1000, "slippage too high");

        followers[msg.sender] = config;
        followers[msg.sender].active = true;
        followerIndex[msg.sender] = followerList.length;
        followerList.push(msg.sender);

        emit FollowerSubscribed(msg.sender);
    }

    function unsubscribe() external nonReentrant {
        require(followers[msg.sender].active, "not subscribed");

        followers[msg.sender].active = false;

        uint256 idx = followerIndex[msg.sender];
        uint256 lastIdx = followerList.length - 1;
        if (idx != lastIdx) {
            address last = followerList[lastIdx];
            followerList[idx] = last;
            followerIndex[last] = idx;
        }
        followerList.pop();
        delete followerIndex[msg.sender];

        emit FollowerUnsubscribed(msg.sender);
    }

    function emergencyExit(string calldata reason) external {
        require(
            msg.sender == orchestrator ||
            msg.sender == drawdownGuard ||
            msg.sender == owner,
            "not authorized"
        );

        emergencyMode = true;
        currentSignal = Signal({
            direction: int8(0),
            sizeBps: 0,
            stopPrice: 0,
            epoch: block.number,
            reasoningHash: keccak256(bytes(reason)),
            reasoningSummary: reason
        });

        bytes32 signalHash = keccak256(abi.encodePacked(int8(0), uint16(0), uint256(0), block.number));
        emit SignalUpdated(signalHash, 0, 0, 0, reason, keccak256(bytes(reason)));
        emit EmergencyExit(msg.sender, reason);
    }

    function reactivate() external onlyOwner {
        emergencyMode = false;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    function setAgentRunning(bool _running) external onlyOrchestrator {
        agentRunning = _running;
    }

    function getCurrentSignal() external view returns (Signal memory) {
        return currentSignal;
    }

    function getFollowers() external view returns (address[] memory) {
        return followerList;
    }

    function followerCount() external view returns (uint256) {
        return followerList.length;
    }

    function getFollowerConfig(address follower) external view returns (FollowerConfig memory) {
        return followers[follower];
    }

    function getSignalHistory(uint256 offset, uint256 limit) external view returns (Signal[] memory) {
        uint256 total = _signalHistory.length;
        if (offset >= total) {
            return new Signal[](0);
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        Signal[] memory result = new Signal[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = _signalHistory[i];
        }
        return result;
    }

    function signalHistoryLength() external view returns (uint256) {
        return _signalHistory.length;
    }

    receive() external payable {}
}
