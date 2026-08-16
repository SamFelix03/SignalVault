// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IStrategyVault} from "../interfaces/IStrategyVault.sol";

/// @notice Orchestrator stand-in that lets authorized wallets publish signals.
///         Cloned per custom-agent vault; `StrategyVault.orchestrator` points here.
contract ExternalSignalPublisher {
    address public owner;
    address public vault;
    bool private _initialized;

    mapping(address => bool) public publishers;

    event PublisherAdded(address indexed publisher);
    event PublisherRemoved(address indexed publisher);
    event SignalPublished(int8 direction, uint16 sizeBps, uint256 stopPrice, bytes32 reasoningHash);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyPublisher() {
        require(publishers[msg.sender], "not publisher");
        _;
    }

    constructor() {}

    function initialize(address _vault, address _owner) external {
        require(!_initialized, "already initialized");
        require(_vault != address(0) && _owner != address(0), "zero address");
        _initialized = true;
        vault = _vault;
        owner = _owner;
    }

    function isCustomPublisher() external pure returns (bool) {
        return true;
    }

    function addPublisher(address publisher) external onlyOwner {
        require(publisher != address(0), "zero address");
        publishers[publisher] = true;
        emit PublisherAdded(publisher);
    }

    function removePublisher(address publisher) external onlyOwner {
        publishers[publisher] = false;
        emit PublisherRemoved(publisher);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }

    /// @notice Commit a trading signal. Callers must be an authorized publisher.
    function publish(
        int8 direction,
        uint16 sizeBps,
        uint256 stopPrice,
        string calldata reason
    ) external onlyPublisher {
        bytes32 reasoningHash = keccak256(bytes(reason));
        IStrategyVault(vault).updateSignal(direction, sizeBps, stopPrice, reason, reasoningHash);
        emit SignalPublished(direction, sizeBps, stopPrice, reasoningHash);
    }

    /// @notice No-op so an accidental EpochCron tick cannot revert the vault.
    function startPipeline() external payable {}

    receive() external payable {}
}
