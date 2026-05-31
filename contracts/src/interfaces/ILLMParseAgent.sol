// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ILLMParseAgent {
    function searchAndScrape(string calldata query, string calldata instructions) external returns (string memory);
    function scrapeUrl(string calldata url, string calldata instructions) external returns (string memory);
}
