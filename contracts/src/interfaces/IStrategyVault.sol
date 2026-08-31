// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IStrategyVault {
    enum SourceType {
        AGENT,
        WALLET
    }

    enum InstrumentType {
        BINARY,
        PERP
    }

    struct Signal {
        int8 direction; // 1 = UP (buy Yes), -1 = DOWN (buy No), 0 = FLAT
        uint16 sizeBps;
        bytes32 marketId;
        uint256 limitPrice;
        uint256 epoch;
        bytes32 reasoningHash;
        string reasoningSummary;
    }

    struct FollowerConfig {
        uint16 riskPct;
        uint256 maxPositionSize; // max collateral per mirror (tUSDC binary / USDso perp)
        uint16 maxSlippageBps;
        uint256 stopLossBuffer; // unused for event contracts; kept for ABI compat
        bool active;
    }

    event SignalUpdated(
        bytes32 indexed signalHash,
        int8 direction,
        uint16 sizeBps,
        bytes32 marketId,
        uint256 limitPrice,
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
        bytes32 marketId,
        uint256 limitPrice,
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
    function sourceType() external view returns (SourceType);
    function sourceWallet() external view returns (address);
    function relayer() external view returns (address);
    function eventRouter() external view returns (address);
    function executionRouter() external view returns (address);
    function instrumentType() external view returns (InstrumentType);
}
