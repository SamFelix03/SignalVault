// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import {IStrategyVault} from "../interfaces/IStrategyVault.sol";

contract DrawdownGuard is SomniaEventHandler {
    address public owner;
    address public vault;
    address public ledger;
    uint256 public maxDrawdownBps;
    bool private _initialized;

    bytes32 public constant DRAWDOWN_UPDATED_TOPIC = keccak256("DrawdownUpdated(address,uint256,uint256)");

    uint256 public drawdownSubscriptionId;
    uint256 public cooldownSubscriptionId;

    bool public coolingDown;
    uint256 public lastTriggerTime;
    uint256 public constant COOLDOWN_PERIOD = 24 hours;

    event DrawdownBreached(uint256 currentDrawdownBps, uint256 maxDrawdownBps);
    event CooldownStarted(uint256 reactivateAt);
    event CooldownCompleted();
    event SubscriptionRegistered(uint256 subscriptionId);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {}

    function initialize(address _owner, address _vault, address _ledger, uint256 _maxDrawdownBps) external {
        require(!_initialized, "already initialized");
        _initialized = true;
        owner = _owner;
        vault = _vault;
        ledger = _ledger;
        maxDrawdownBps = _maxDrawdownBps;
    }

    function registerSubscription() external onlyOwner {
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [DRAWDOWN_UPDATED_TOPIC, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: ledger
        });

        SomniaExtensions.SubscriptionOptions memory options = SomniaExtensions.defaultSubscriptionOptions();
        drawdownSubscriptionId = SomniaExtensions.subscribe(address(this), filter, options);
        emit SubscriptionRegistered(drawdownSubscriptionId);
    }

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        if (eventTopics[0] == DRAWDOWN_UPDATED_TOPIC && emitter == ledger) {
            _handleDrawdown(data);
        } else if (eventTopics[0] == keccak256("Schedule(uint256)")) {
            _handleCooldownExpiry();
        }
    }

    function _handleDrawdown(bytes calldata data) internal {
        if (coolingDown) return;

        (, uint256 currentDrawdownBps) = abi.decode(data, (address, uint256));

        if (currentDrawdownBps >= maxDrawdownBps) {
            coolingDown = true;
            lastTriggerTime = block.timestamp;

            IStrategyVault(vault).emergencyExit(
                string(abi.encodePacked("drawdown breached: ", _uint2str(currentDrawdownBps), " bps"))
            );

            emit DrawdownBreached(currentDrawdownBps, maxDrawdownBps);

            uint256 reactivateAt = (block.timestamp + COOLDOWN_PERIOD) * 1000;
            SomniaExtensions.SubscriptionOptions memory options = SomniaExtensions.defaultSubscriptionOptions();
            cooldownSubscriptionId = SomniaExtensions.scheduleSubscriptionAtTimestamp(
                address(this), reactivateAt, options
            );

            emit CooldownStarted(block.timestamp + COOLDOWN_PERIOD);
        }
    }

    function _handleCooldownExpiry() internal {
        coolingDown = false;
        cooldownSubscriptionId = 0;
        emit CooldownCompleted();
    }

    function setMaxDrawdown(uint256 _maxDrawdownBps) external onlyOwner {
        require(_maxDrawdownBps > 0 && _maxDrawdownBps <= 10000, "invalid drawdown");
        maxDrawdownBps = _maxDrawdownBps;
    }

    function unregisterSubscription() external onlyOwner {
        if (drawdownSubscriptionId != 0) {
            SomniaExtensions.unsubscribe(drawdownSubscriptionId);
            drawdownSubscriptionId = 0;
        }
        if (cooldownSubscriptionId != 0) {
            SomniaExtensions.unsubscribe(cooldownSubscriptionId);
            cooldownSubscriptionId = 0;
        }
    }

    function _uint2str(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    receive() external payable {}
}
