// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet payment token for SignalVault pay-per-signal subscriptions.
///         Anyone can mint SVT to their wallet for testing.
contract SignalPayToken is ERC20 {
    uint256 public constant MAX_MINT_PER_TX = 10_000 ether;
    uint256 public constant MINT_COOLDOWN = 1 hours;

    mapping(address => uint256) public lastMintAt;

    constructor() ERC20("SignalVault Pay", "SVT") {}

    function mint(uint256 amount) external {
        require(amount > 0, "zero amount");
        require(amount <= MAX_MINT_PER_TX, "exceeds max mint");
        require(block.timestamp >= lastMintAt[msg.sender] + MINT_COOLDOWN, "mint cooldown");

        lastMintAt[msg.sender] = block.timestamp;
        _mint(msg.sender, amount);
    }
}
