// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

contract PerformanceLedger {
    address public owner;
    address public vault;
    AggregatorV3Interface public oracle;
    bool private _initialized;
    bool private _reentrancyLock;

    struct TradeRecord {
        int8 direction;
        uint256 entryPrice;
        uint256 exitPrice;
        uint256 size;
        int256 pnl;
        uint256 timestamp;
    }

    struct VaultStats {
        int256 totalPnl;
        uint256 totalTrades;
        uint256 winCount;
        uint256 lossCount;
        int256 highWaterMark;
        uint256 maxDrawdownBps;
        uint256 currentDrawdownBps;
        int256 sumReturns;
        int256 sumSquaredReturns;
        uint256 lastSettledEpoch;
    }

    VaultStats public stats;
    TradeRecord[] public tradeHistory;

    uint256 public pendingFees;

    event TradeSettled(uint256 indexed tradeIndex, int8 direction, int256 pnl, uint256 entryPrice, uint256 exitPrice);
    event DrawdownUpdated(address indexed vault, uint256 currentDrawdownBps, uint256 maxDrawdownBps);
    event EpochFeeSettled(uint256 epoch, uint256 feeAmount);
    event MarkToMarket(uint256 oraclePrice, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    mapping(address => bool) public authorizedCallers;

    modifier onlyAuthorized() {
        require(msg.sender == vault || msg.sender == owner || authorizedCallers[msg.sender], "not authorized");
        _;
    }

    modifier nonReentrant() {
        require(!_reentrancyLock, "reentrant");
        _reentrancyLock = true;
        _;
        _reentrancyLock = false;
    }

    constructor() {}

    function initialize(address _owner, address _vault, address _oracle) external {
        require(!_initialized, "already initialized");
        _initialized = true;
        owner = _owner;
        vault = _vault;
        oracle = AggregatorV3Interface(_oracle);
    }

    function addAuthorizedCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = true;
    }

    function recordTrade(
        int8 direction, uint256 entryPrice, uint256 exitPrice, uint256 size
    ) external onlyAuthorized nonReentrant {
        int256 pnl;
        if (direction > 0) {
            pnl = int256(exitPrice) - int256(entryPrice);
        } else {
            pnl = int256(entryPrice) - int256(exitPrice);
        }
        pnl = (pnl * int256(size)) / 1e18;

        tradeHistory.push(TradeRecord({
            direction: direction, entryPrice: entryPrice, exitPrice: exitPrice,
            size: size, pnl: pnl, timestamp: block.timestamp
        }));

        stats.totalTrades++;
        stats.totalPnl += pnl;

        if (pnl > 0) { stats.winCount++; }
        else if (pnl < 0) { stats.lossCount++; }

        int256 returnBps = (pnl * 10000) / int256(size);
        stats.sumReturns += returnBps;
        stats.sumSquaredReturns += returnBps * returnBps;

        if (stats.totalPnl > stats.highWaterMark) {
            stats.highWaterMark = stats.totalPnl;
        }

        if (stats.highWaterMark > 0 && stats.totalPnl < stats.highWaterMark) {
            uint256 drawdown = uint256(stats.highWaterMark - stats.totalPnl);
            stats.currentDrawdownBps = (drawdown * 10000) / uint256(stats.highWaterMark);
        } else {
            stats.currentDrawdownBps = 0;
        }

        if (stats.currentDrawdownBps > stats.maxDrawdownBps) {
            stats.maxDrawdownBps = stats.currentDrawdownBps;
        }

        emit TradeSettled(tradeHistory.length - 1, direction, pnl, entryPrice, exitPrice);
        emit DrawdownUpdated(vault, stats.currentDrawdownBps, stats.maxDrawdownBps);
    }

    function markToMarket() external view returns (uint256 price, uint256 updatedAt) {
        (, int256 answer,, uint256 _updatedAt,) = oracle.latestRoundData();
        require(answer > 0, "invalid oracle price");
        return (uint256(answer), _updatedAt);
    }

    function getWinRate() external view returns (uint256) {
        if (stats.totalTrades == 0) return 0;
        return (stats.winCount * 10000) / stats.totalTrades;
    }

    function getSharpeApprox() external view returns (int256) {
        if (stats.totalTrades < 2) return 0;
        int256 n = int256(stats.totalTrades);
        int256 meanReturn = stats.sumReturns / n;
        int256 variance = (stats.sumSquaredReturns / n) - (meanReturn * meanReturn);
        if (variance <= 0) return 0;
        uint256 sqrtVar = _sqrt(uint256(variance));
        if (sqrtVar == 0) return 0;
        return (meanReturn * 1000) / int256(sqrtVar);
    }

    function getTradeHistory(uint256 offset, uint256 limit) external view returns (TradeRecord[] memory) {
        uint256 total = tradeHistory.length;
        if (offset >= total) return new TradeRecord[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        TradeRecord[] memory result = new TradeRecord[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = tradeHistory[i];
        }
        return result;
    }

    function getTradeCount() external view returns (uint256) {
        return tradeHistory.length;
    }

    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
        return y;
    }

    receive() external payable {}
}
