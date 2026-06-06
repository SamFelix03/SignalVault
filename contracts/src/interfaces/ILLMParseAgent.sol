// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ILLMParseAgent {
    function ExtractANumber(
        string memory key,
        string memory description,
        uint256 min,
        uint256 max,
        string memory prompt,
        string memory url,
        bool resolveUrl,
        uint8 numPages,
        uint8 confidenceThreshold
    ) external returns (uint256);

    function ExtractString(
        string memory key,
        string memory description,
        string[] calldata options,
        string memory prompt,
        string memory url,
        bool resolveUrl,
        uint8 numPages,
        uint8 confidenceThreshold
    ) external returns (string memory);
}
