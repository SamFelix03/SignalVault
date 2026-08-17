// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IStrategyVault {
    struct Signal {
        int8 direction;        // 1 = long, -1 = short, 0 = flat
        uint16 sizeBps;        // position size in basis points (0-10000)
        uint256 stopPrice;     // stop-loss price (18 decimals)
        uint256 epoch;         // epoch when signal was generated
        bytes32 reasoningHash; // keccak256 of full reasoning
        string reasoningSummary;
    }

    struct FollowerConfig {
        uint16 riskPct;          // risk scaling percentage (100 = 1x, 200 = 2x)
        uint256 maxPositionSize; // max position in native token
        uint16 maxSlippageBps;   // max slippage tolerance in bps
        uint256 stopLossBuffer;  // additional stop-loss buffer (18 decimals)
        bool active;
    }

    event SignalUpdated(
        bytes32 indexed signalHash,
        int8 direction,
        uint16 sizeBps,
        uint256 stopPrice,
        string reasoningSummary,
        bytes32 reasoningHash
    );
    event FollowerSubscribed(address indexed follower);
    event FollowerUnsubscribed(address indexed follower);
    event EmergencyExit(address indexed triggeredBy, string reason);
    event SignalFeeCharged(
        address indexed follower,
        address indexed strategist,
        uint256 amount,
        bytes32 indexed signalHash
    );

    function updateSignal(
        int8 direction,
        uint16 sizeBps,
        uint256 stopPrice,
        string calldata reasoningSummary,
        bytes32 reasoningHash
    ) external;

    function subscribe(FollowerConfig calldata config) external payable;
    function unsubscribe() external;
    function emergencyExit(string calldata reason) external;
    function chargeSignalFee(address follower, bytes32 signalHash) external;
    function getCurrentSignal() external view returns (Signal memory);
    function getFollowers() external view returns (address[] memory);
    function getSignalHistory(uint256 offset, uint256 limit) external view returns (Signal[] memory);
    function getFollowerConfig(address follower) external view returns (FollowerConfig memory);
    function signalPrice() external view returns (uint256);
    function paymentToken() external view returns (address);
}
