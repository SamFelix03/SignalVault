// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IStrategyVault} from "../interfaces/IStrategyVault.sol";

interface IPerformanceLedger {
    function recordTrade(int8 direction, uint256 entryPrice, uint256 exitPrice, uint256 size) external;
    function markToMarket() external view returns (uint256 price, uint256 updatedAt);
}

interface IERC20 {
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract StrategyVault is IStrategyVault {
    address public owner;
    address public strategist;
    address public orchestrator;
    string public strategyPrompt;
    uint16 public performanceFeeBps;
    address public paymentToken;
    uint256 public signalPrice;
    bool public agentRunning;
    bool public emergencyMode;
    bool private _initialized;
    bool private _reentrancyLock;

    Signal public currentSignal;
    Signal[] private _signalHistory;

    mapping(address => FollowerConfig) public followers;
    mapping(address => bool) public paymentAuthorized;
    address[] public followerList;
    mapping(address => uint256) public followerIndex;

    address public performanceLedger;
    address public mirrorReactor;
    address public stopReactor;
    address public drawdownGuard;

    /// @dev Oracle-scaled entry price (18 decimals) for the open strategist leg.
    uint256 private _positionEntryPrice;

    modifier onlyMirrorReactor() {
        require(msg.sender == mirrorReactor, "not mirror reactor");
        _;
    }

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
        address _orchestrator,
        address _paymentToken,
        uint256 _signalPrice
    ) external {
        require(!_initialized, "already initialized");
        require(_performanceFeeBps <= 5000, "fee too high");
        _initialized = true;
        owner = _owner;
        strategist = _strategist;
        strategyPrompt = _strategyPrompt;
        performanceFeeBps = _performanceFeeBps;
        orchestrator = _orchestrator;
        paymentToken = _paymentToken;
        signalPrice = _signalPrice;
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

    function setOrchestrator(address _orchestrator) external onlyOwner {
        orchestrator = _orchestrator;
    }

    function setPerformanceLedger(address _ledger) external onlyOwner {
        performanceLedger = _ledger;
    }

    function _readMarkPriceWei() internal view returns (bool ok, uint256 mark) {
        if (performanceLedger == address(0)) return (false, 0);
        try IPerformanceLedger(performanceLedger).markToMarket() returns (uint256 price, uint256) {
            return (true, price * 1e10);
        } catch {
            return (false, 0);
        }
    }

    function _settlePreviousTrade(Signal memory previous) internal {
        if (previous.direction == 0 || previous.sizeBps == 0) return;
        if (performanceLedger == address(0)) return;

        (bool ok, uint256 mark) = _readMarkPriceWei();
        if (!ok) return;

        uint256 entry = _positionEntryPrice > 0 ? _positionEntryPrice : mark;
        uint256 size = (uint256(previous.sizeBps) * 1e18) / 10_000;
        IPerformanceLedger(performanceLedger).recordTrade(previous.direction, entry, mark, size);
        _positionEntryPrice = 0;
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

        Signal memory previous = currentSignal;
        _settlePreviousTrade(previous);

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

        if (direction != 0 && sizeBps != 0 && performanceLedger != address(0)) {
            (bool ok, uint256 mark) = _readMarkPriceWei();
            if (ok) _positionEntryPrice = mark;
        }

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

        if (signalPrice > 0) {
            require(paymentToken != address(0), "payment token unset");
            require(
                IERC20(paymentToken).allowance(msg.sender, address(this)) >= signalPrice,
                "insufficient allowance"
            );
            paymentAuthorized[msg.sender] = true;
        }

        followers[msg.sender] = config;
        followers[msg.sender].active = true;
        followerIndex[msg.sender] = followerList.length;
        followerList.push(msg.sender);

        emit FollowerSubscribed(msg.sender);
    }

    function chargeSignalFee(address follower, bytes32 signalHash) external onlyMirrorReactor {
        if (signalPrice == 0 || paymentToken == address(0)) return;
        require(paymentAuthorized[follower], "payment not authorized");
        require(followers[follower].active, "not subscribed");

        require(
            IERC20(paymentToken).transferFrom(follower, strategist, signalPrice),
            "payment failed"
        );

        emit SignalFeeCharged(follower, strategist, signalPrice, signalHash);
    }

    function unsubscribe() external nonReentrant {
        require(followers[msg.sender].active, "not subscribed");

        followers[msg.sender].active = false;
        paymentAuthorized[msg.sender] = false;

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
        _settlePreviousTrade(currentSignal);

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
