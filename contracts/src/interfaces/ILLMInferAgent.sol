// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ILLMInferAgent {
    function inferToolsChat(string calldata systemPrompt, string calldata userPrompt) external returns (string memory);
}
