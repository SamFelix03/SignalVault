// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAgentRequester, IAgentRequesterHandler, Response, ResponseStatus, Request} from "../interfaces/IAgentRequester.sol";
import {IJsonApiAgent} from "../interfaces/IJsonApiAgent.sol";
import {ILLMParseAgent} from "../interfaces/ILLMParseAgent.sol";
import {ILLMInferAgent} from "../interfaces/ILLMInferAgent.sol";
import {IStrategyVault} from "../interfaces/IStrategyVault.sol";

contract AgentOrchestrator is IAgentRequesterHandler {
    IAgentRequester public platform;

    uint256 public constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 public constant LLM_PARSE_AGENT_ID = 13174292974160097713;
    uint256 public constant LLM_INFER_AGENT_ID = 13174292974160097713;

    uint256 public constant JSON_FETCH_COST_PER_AGENT = 0.03 ether;
    uint256 public constant LLM_PARSE_COST_PER_AGENT = 0.10 ether;
    uint256 public constant LLM_INFER_COST_PER_AGENT = 0.07 ether;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;

    address public owner;
    address public vault;
    string public strategyPrompt;
    bool private _initialized;
    bool private _reentrancyLock;

    enum PipelineStage { Idle, FetchingPrice, FetchingFunding, Parsing, Inferring }

    struct PipelineRun {
        uint256 priceRequestId;
        uint256 fundingRequestId;
        uint256 parseRequestId;
        uint256 inferRequestId;
        uint256 fetchedPrice;
        uint256 fetchedFunding;
        string parsedSentiment;
        PipelineStage stage;
        uint256 startedAt;
        bool completed;
    }

    uint256 public currentRunId;
    mapping(uint256 => PipelineRun) public runs;
    mapping(uint256 => uint256) public requestToRun;
    mapping(uint256 => bool) public pendingRequests;

    string public constant PRICE_URL = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";
    string public constant PRICE_SELECTOR = "$.price";
    string public constant FUNDING_URL = "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1";
    string public constant FUNDING_SELECTOR = "$[0].fundingRate";
    string public constant SENTIMENT_URL = "https://alternative.me/crypto/fear-and-greed-index/";
    string public constant SENTIMENT_INSTRUCTIONS = "Extract the current Fear and Greed Index value and classification. Return as JSON: {value: number, classification: string}";

    event PipelineStarted(uint256 indexed runId, uint256 timestamp);
    event PriceRequestSent(uint256 indexed runId, uint256 requestId);
    event FundingRequestSent(uint256 indexed runId, uint256 requestId);
    event ParseRequestSent(uint256 indexed runId, uint256 requestId);
    event InferRequestSent(uint256 indexed runId, uint256 requestId);
    event PipelineCompleted(uint256 indexed runId, bool success);
    event PipelineFailed(uint256 indexed runId, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyPlatform() {
        require(msg.sender == address(platform), "not platform");
        _;
    }

    modifier nonReentrant() {
        require(!_reentrancyLock, "reentrant");
        _reentrancyLock = true;
        _;
        _reentrancyLock = false;
    }

    constructor() {}

    function initialize(address _platform, address _vault, address _owner, string calldata _strategyPrompt) external {
        require(!_initialized, "already initialized");
        _initialized = true;
        platform = IAgentRequester(_platform);
        vault = _vault;
        owner = _owner;
        strategyPrompt = _strategyPrompt;
    }

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    function setStrategyPrompt(string calldata _prompt) external onlyOwner {
        strategyPrompt = _prompt;
    }

    function startPipeline() external payable nonReentrant {
        currentRunId++;
        PipelineRun storage run = runs[currentRunId];
        run.stage = PipelineStage.FetchingPrice;
        run.startedAt = block.timestamp;

        _fetchPrice(currentRunId);

        emit PipelineStarted(currentRunId, block.timestamp);
    }

    function _fetchPrice(uint256 runId) internal {
        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchUint.selector,
            PRICE_URL, PRICE_SELECTOR, uint8(18)
        );

        uint256 deposit = platform.getRequestDeposit() + JSON_FETCH_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            JSON_API_AGENT_ID, address(this), this.handlePriceResponse.selector, payload
        );

        runs[runId].priceRequestId = requestId;
        requestToRun[requestId] = runId;
        pendingRequests[requestId] = true;
        emit PriceRequestSent(runId, requestId);
    }

    function _fetchFunding(uint256 runId) internal {
        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchUint.selector,
            FUNDING_URL, FUNDING_SELECTOR, uint8(18)
        );

        uint256 deposit = platform.getRequestDeposit() + JSON_FETCH_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            JSON_API_AGENT_ID, address(this), this.handleFundingResponse.selector, payload
        );

        runs[runId].fundingRequestId = requestId;
        requestToRun[requestId] = runId;
        pendingRequests[requestId] = true;
        emit FundingRequestSent(runId, requestId);
    }

    function _parseSentiment(uint256 runId) internal {
        bytes memory payload = abi.encodeWithSelector(
            ILLMParseAgent.scrapeUrl.selector,
            SENTIMENT_URL, SENTIMENT_INSTRUCTIONS
        );

        uint256 deposit = platform.getRequestDeposit() + LLM_PARSE_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            LLM_PARSE_AGENT_ID, address(this), this.handleParseResponse.selector, payload
        );

        runs[runId].parseRequestId = requestId;
        requestToRun[requestId] = runId;
        pendingRequests[requestId] = true;
        emit ParseRequestSent(runId, requestId);
    }

    function _runInference(uint256 runId) internal {
        PipelineRun storage run = runs[runId];

        string memory systemPrompt = string(abi.encodePacked(
            strategyPrompt,
            "\n\nYou are a trading signal generator. Analyze the market data and output a JSON object with fields: "
            "direction (1=long, -1=short, 0=flat), sizeBps (0-10000), stopPrice (uint256 18 decimals), "
            "reasoningSummary (string max 200 chars). If conditions are uncertain, output direction=0."
        ));

        string memory userPrompt = string(abi.encodePacked(
            "Market Data:\n",
            "- BTC/USDT Price: ", _uint2str(run.fetchedPrice), " (18 decimals)\n",
            "- BTC Funding Rate: ", _uint2str(run.fetchedFunding), " (18 decimals)\n",
            "- Fear & Greed: ", run.parsedSentiment, "\n",
            "\nGenerate a trading signal based on this data."
        ));

        bytes memory payload = abi.encodeWithSelector(
            ILLMInferAgent.inferToolsChat.selector, systemPrompt, userPrompt
        );

        uint256 deposit = platform.getRequestDeposit() + LLM_INFER_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            LLM_INFER_AGENT_ID, address(this), this.handleInferResponse.selector, payload
        );

        run.inferRequestId = requestId;
        requestToRun[requestId] = runId;
        pendingRequests[requestId] = true;
        emit InferRequestSent(runId, requestId);
    }

    function handlePriceResponse(
        uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory
    ) external onlyPlatform {
        require(pendingRequests[requestId], "unknown request");
        delete pendingRequests[requestId];

        uint256 runId = requestToRun[requestId];
        PipelineRun storage run = runs[runId];

        if (status != ResponseStatus.Success || responses.length == 0) {
            run.completed = true;
            emit PipelineFailed(runId, "price fetch failed");
            return;
        }

        run.fetchedPrice = abi.decode(responses[0].result, (uint256));
        run.stage = PipelineStage.FetchingFunding;
        _fetchFunding(runId);
    }

    function handleFundingResponse(
        uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory
    ) external onlyPlatform {
        require(pendingRequests[requestId], "unknown request");
        delete pendingRequests[requestId];

        uint256 runId = requestToRun[requestId];
        PipelineRun storage run = runs[runId];

        if (status != ResponseStatus.Success || responses.length == 0) {
            run.completed = true;
            emit PipelineFailed(runId, "funding fetch failed");
            return;
        }

        run.fetchedFunding = abi.decode(responses[0].result, (uint256));
        run.stage = PipelineStage.Parsing;
        _parseSentiment(runId);
    }

    function handleParseResponse(
        uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory
    ) external onlyPlatform {
        require(pendingRequests[requestId], "unknown request");
        delete pendingRequests[requestId];

        uint256 runId = requestToRun[requestId];
        PipelineRun storage run = runs[runId];

        if (status != ResponseStatus.Success || responses.length == 0) {
            run.parsedSentiment = "unavailable";
        } else {
            run.parsedSentiment = abi.decode(responses[0].result, (string));
        }

        run.stage = PipelineStage.Inferring;
        _runInference(runId);
    }

    function handleInferResponse(
        uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory
    ) external onlyPlatform {
        require(pendingRequests[requestId], "unknown request");
        delete pendingRequests[requestId];

        uint256 runId = requestToRun[requestId];
        PipelineRun storage run = runs[runId];

        if (status != ResponseStatus.Success || responses.length == 0) {
            run.completed = true;
            emit PipelineFailed(runId, "inference failed");
            return;
        }

        (int8 direction, uint16 sizeBps, uint256 stopPrice, string memory reasoningSummary) =
            abi.decode(responses[0].result, (int8, uint16, uint256, string));

        bytes32 reasoningHash = keccak256(abi.encodePacked(
            run.fetchedPrice, run.fetchedFunding, run.parsedSentiment, reasoningSummary
        ));

        IStrategyVault(vault).updateSignal(direction, sizeBps, stopPrice, reasoningSummary, reasoningHash);

        run.stage = PipelineStage.Idle;
        run.completed = true;
        emit PipelineCompleted(runId, true);
    }

    function handleResponse(
        uint256, Response[] memory, ResponseStatus, Request memory
    ) external view onlyPlatform {
        revert("use specific handlers");
    }

    function getPipelineRun(uint256 runId) external view returns (
        uint256 priceRequestId, uint256 fundingRequestId,
        uint256 parseRequestId, uint256 inferRequestId,
        uint256 fetchedPrice, uint256 fetchedFunding,
        string memory parsedSentiment, PipelineStage stage, bool completed
    ) {
        PipelineRun storage run = runs[runId];
        return (
            run.priceRequestId, run.fundingRequestId,
            run.parseRequestId, run.inferRequestId,
            run.fetchedPrice, run.fetchedFunding,
            run.parsedSentiment, run.stage, run.completed
        );
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

    function withdrawExcess() external onlyOwner {
        (bool ok,) = owner.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    receive() external payable {}
}
