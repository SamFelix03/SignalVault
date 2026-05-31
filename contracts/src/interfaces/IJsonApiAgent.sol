// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IJsonApiAgent {
    function fetchUint(string calldata url, string calldata selector, uint8 decimals) external returns (uint256);
    function fetchString(string calldata url, string calldata selector) external returns (string memory);
    function fetchArray(string calldata url, string calldata selector) external returns (bytes memory);
}
