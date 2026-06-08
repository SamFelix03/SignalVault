// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAgentRequester, IAgentRequesterHandler, Response, ResponseStatus, Request} from "../interfaces/IAgentRequester.sol";
import {IJsonApiAgent} from "../interfaces/IJsonApiAgent.sol";
import {ILLMParseAgent} from "../interfaces/ILLMParseAgent.sol";
import {ILLMInferAgent} from "../interfaces/ILLMInferAgent.sol";
import {IStrategyVault} from "../interfaces/IStrategyVault.sol";
import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

interface IPerformanceLedger {
    function recordTrade(int8 direction, uint256 entryPrice, uint256 exitPrice, uint256 size) external;
}

contract AgentOrchestrator is IAgentRequesterHandler {
    // Somnia testnet Protofire ETH/USD (mainnet proxy: 0x5f4eC3Df...)
    address public constant ETH_USD_ORACLE = 0xd9132c1d762D432672493F640a63B758891B449e;
    IAgentRequester public platform;

    uint256 public constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 public constant LLM_PARSE_AGENT_ID = 12875401142070969085;
    uint256 public constant LLM_INFER_AGENT_ID = 12847293847561029384;

    uint256 public constant JSON_FETCH_COST_PER_AGENT = 0.03 ether;
    uint256 public constant LLM_PARSE_COST_PER_AGENT = 0.10 ether;
    uint256 public constant LLM_INFER_COST_PER_AGENT = 0.07 ether;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    /// @notice Max wait for Somnia agents before rule-based pipeline completion
    uint256 public constant PIPELINE_TIMEOUT = 90;

    address public owner;
    address public vault;
    string public strategyPrompt;
    bool private _initialized;
    bool private _reentrancyLock;

    enum PipelineStage { Idle, FetchingPrice, FetchingFunding, ParsingFearGreed, ParsingNews, Inferring }

    struct PipelineRun {
        uint256 fetchedPrice;
        uint256 fetchedFunding;
        uint256 fearGreedIndex;
        string newsSummary;
        PipelineStage stage;
        uint256 startedAt;
        uint8 flags; // bit 0=priceReady, 1=fundingReady, 2=fngReady, 3=completed
    }

    uint256 public currentRunId;
    mapping(uint256 => PipelineRun) public runs;
    mapping(uint256 => uint256) public requestToRun;
    mapping(uint256 => bool) public pendingRequests;

    string public constant PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
    string public constant PRICE_SELECTOR = "ethereum.usd";
    string public constant FUNDING_URL = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true";
    string public constant FUNDING_SELECTOR = "ethereum.usd_24h_change";

    event PipelineStarted(uint256 indexed runId, uint256 timestamp);
    event StageCompleted(uint256 indexed runId, string stage, uint256 requestId);
    event PipelineCompleted(uint256 indexed runId, int8 direction, uint16 sizeBps);
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

    // ── Pipeline Entry Point ────────────────────────────────────────────

    function startPipeline() external payable nonReentrant {
        currentRunId++;
        PipelineRun storage run = runs[currentRunId];
        run.stage = PipelineStage.FetchingPrice;
        run.startedAt = block.timestamp;

        // Stage 1: Oracle price (reliable) + JSON API funding (sentiment proxy)
        _bootstrapOraclePrice(currentRunId);
        _fetchFunding(currentRunId);

        emit PipelineStarted(currentRunId, block.timestamp);
    }

    /// @notice Manual trigger — owner kicks the agent pipeline
    function triggerNow() external payable onlyOwner {
        this.startPipeline{value: msg.value}();
    }

    /// @notice Complete a pipeline run with rule-based signal when agents exceed PIPELINE_TIMEOUT
    function finalizeStaleRun(uint256 runId) external nonReentrant {
        require(runId > 0 && runId <= currentRunId, "invalid run");
        PipelineRun storage run = runs[runId];
        require((run.flags & 8) == 0, "already completed");
        require(block.timestamp >= run.startedAt + PIPELINE_TIMEOUT, "not stale yet");

        if (run.fetchedPrice == 0) {
            run.fetchedPrice = _readOraclePriceCents();
            run.flags |= 1;
        }
        if ((run.flags & 2) == 0) {
            run.fetchedFunding = run.fetchedPrice > 0 ? (run.fetchedPrice * 5) / 1000 : 0;
            run.flags |= 2;
        }
        if ((run.flags & 4) == 0) {
            run.fearGreedIndex = 50;
            run.flags |= 4;
        }
        if (bytes(run.newsSummary).length == 0) {
            run.newsSummary = string(abi.encodePacked(
                "ETH $",
                _uint2str(run.fetchedPrice / 100),
                ".",
                _pad2(run.fetchedPrice % 100),
                ", Fear/Greed ",
                _uint2str(run.fearGreedIndex),
                "/100."
            ));
        }

        _completeRunWithRuleBasedSignal(runId);
    }

    /// @notice Complete a stale run using off-chain HTTP fallback data (alternative.me, CoinGecko, etc.)
    /// @dev Callable after PIPELINE_TIMEOUT; fills missing parse stages before rule-based signal.
    function finalizeStaleRunWithFallback(
        uint256 runId,
        uint256 fearGreedIndex,
        uint256 fetchedFunding,
        string calldata newsSummary
    ) external nonReentrant {
        require(runId > 0 && runId <= currentRunId, "invalid run");
        PipelineRun storage run = runs[runId];
        require((run.flags & 8) == 0, "already completed");
        require(block.timestamp >= run.startedAt + PIPELINE_TIMEOUT, "not stale yet");
        require(fearGreedIndex <= 100, "invalid fear/greed");
        require(bytes(newsSummary).length > 0, "empty news");

        if (run.fetchedPrice == 0) {
            run.fetchedPrice = _readOraclePriceCents();
            run.flags |= 1;
        }
        if ((run.flags & 2) == 0 && fetchedFunding > 0) {
            run.fetchedFunding = fetchedFunding;
            run.flags |= 2;
        } else if ((run.flags & 2) == 0) {
            run.fetchedFunding = run.fetchedPrice > 0 ? (run.fetchedPrice * 5) / 1000 : 0;
            run.flags |= 2;
        }
        run.fearGreedIndex = fearGreedIndex;
        run.flags |= 4;
        if (fetchedFunding > 0) {
            run.fetchedFunding = fetchedFunding;
            run.flags |= 2;
        }
        run.newsSummary = newsSummary;

        _completeRunWithRuleBasedSignal(runId);
    }

    /// @notice Inject real fallback data mid-run when agents are slow (before timeout finalize)
    function injectFallbackPipelineData(
        uint256 runId,
        uint256 fearGreedIndex,
        uint256 fetchedFunding,
        string calldata newsSummary
    ) external {
        require(runId > 0 && runId <= currentRunId, "invalid run");
        PipelineRun storage run = runs[runId];
        require((run.flags & 8) == 0, "completed");
        require(block.timestamp >= run.startedAt + (PIPELINE_TIMEOUT / 2), "too early");
        require(fearGreedIndex <= 100, "invalid fear/greed");

        if ((run.flags & 2) == 0 && fetchedFunding > 0) {
            run.fetchedFunding = fetchedFunding;
            run.flags |= 2;
        }
        if ((run.flags & 4) == 0) {
            run.fearGreedIndex = fearGreedIndex;
            run.flags |= 4;
        }
        if (_isPlaceholderNews(run.newsSummary) && bytes(newsSummary).length > 0) {
            run.newsSummary = newsSummary;
        }
    }

    // ── Stage 1a: On-chain oracle — ETH Price ───────────────────────────

    function _bootstrapOraclePrice(uint256 runId) internal {
        PipelineRun storage run = runs[runId];
        run.fetchedPrice = _readOraclePriceCents();
        run.flags |= 1; // priceReady
        emit StageCompleted(runId, "price_oracle", 0);
        _tryFireStage2(runId);
    }

    function _readOraclePriceCents() internal view returns (uint256) {
        (, int256 answer,,,) = AggregatorV3Interface(ETH_USD_ORACLE).latestRoundData();
        require(answer > 0, "invalid oracle");
        // Chainlink-style 8-decimal USD price → cents (2 decimals)
        return uint256(answer) / 1e6;
    }

    function _readOraclePriceWei() internal view returns (uint256) {
        (, int256 answer,,,) = AggregatorV3Interface(ETH_USD_ORACLE).latestRoundData();
        require(answer > 0, "invalid oracle");
        return uint256(answer) * 1e10;
    }

    // ── Stage 1b: JSON API — Funding Rate ───────────────────────────────

    function _fetchFunding(uint256 runId) internal {
        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchUint.selector,
            FUNDING_URL, FUNDING_SELECTOR, uint8(8)
        );

        uint256 deposit = platform.getRequestDeposit() + JSON_FETCH_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            JSON_API_AGENT_ID, address(this), this.handleFundingResponse.selector, payload
        );
        requestToRun[requestId] = runId;
        pendingRequests[requestId] = true;
    }

    // ── Stage 1 Callbacks ───────────────────────────────────────────────

    function handleFundingResponse(
        uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory
    ) external onlyPlatform {
        require(pendingRequests[requestId], "unknown request");
        delete pendingRequests[requestId];

        uint256 runId = requestToRun[requestId];
        PipelineRun storage run = runs[runId];
        if ((run.flags & 8) != 0) return;

        if (status != ResponseStatus.Success || responses.length == 0) {
            run.flags |= 8; // completed
            emit PipelineFailed(runId, "funding fetch failed");
            return;
        }

        run.fetchedFunding = abi.decode(responses[0].result, (uint256));
        run.flags |= 2; // fundingReady
        emit StageCompleted(runId, "funding", requestId);

        _tryFireStage2(runId);
    }

    // ── Stage 2: LLM Parse Website — Fear & Greed ───────────────────────

    function _tryFireStage2(uint256 runId) internal {
        PipelineRun storage run = runs[runId];
        if ((run.flags & 3) != 3) return; // need both price + funding

        run.stage = PipelineStage.ParsingFearGreed;

        // Use ExtractANumber to get the Fear & Greed index from alternative.me
        bytes memory payload = abi.encodeWithSelector(
            ILLMParseAgent.ExtractANumber.selector,
            "fear_greed_value",                                          // key
            "The current Crypto Fear and Greed Index value (0-100)",     // description
            uint256(0),                                                  // min
            uint256(100),                                                // max
            "What is the current Crypto Fear and Greed Index value?",    // prompt
            "alternative.me",                                            // url (domain search)
            true,                                                        // resolveUrl
            uint8(2),                                                    // numPages
            uint8(60)                                                    // confidenceThreshold
        );

        uint256 deposit = platform.getRequestDeposit() + LLM_PARSE_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            LLM_PARSE_AGENT_ID, address(this), this.handleFearGreedResponse.selector, payload
        );

        requestToRun[requestId] = runId;
        pendingRequests[requestId] = true;
    }

    function handleFearGreedResponse(
        uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory
    ) external onlyPlatform {
        require(pendingRequests[requestId], "unknown request");
        delete pendingRequests[requestId];

        uint256 runId = requestToRun[requestId];
        PipelineRun storage run = runs[runId];
        if ((run.flags & 8) != 0) return;

        if (status == ResponseStatus.Success && responses.length > 0) {
            run.fearGreedIndex = abi.decode(responses[0].result, (uint256));
        } else {
            run.fearGreedIndex = 50; // neutral fallback
        }

        run.flags |= 4; // fngReady
        emit StageCompleted(runId, "fear_greed", requestId);

        // Fire Stage 2b: news headline extraction
        _fetchNewsSummary(runId);
    }

    // ── Stage 2b: LLM Parse Website — News Headline ────────────────────

    function _fetchNewsSummary(uint256 runId) internal {
        PipelineRun storage run = runs[runId];
        run.stage = PipelineStage.ParsingNews;

        string[] memory options = new string[](0);

        bytes memory payload = abi.encodeWithSelector(
            ILLMParseAgent.ExtractString.selector,
            "macro_summary",                                             // key
            "A one-sentence summary of the current Ethereum/crypto macro sentiment from recent headlines", // description
            options,                                                     // no constrained options
            "Ethereum crypto market sentiment macro outlook latest news",  // prompt
            "coindesk.com",                                              // url (domain search)
            true,                                                        // resolveUrl
            uint8(2),                                                    // numPages
            uint8(50)                                                    // confidenceThreshold
        );

        uint256 deposit = platform.getRequestDeposit() + LLM_PARSE_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            LLM_PARSE_AGENT_ID, address(this), this.handleNewsResponse.selector, payload
        );

        requestToRun[requestId] = runId;
        pendingRequests[requestId] = true;
    }

    function handleNewsResponse(
        uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory
    ) external onlyPlatform {
        require(pendingRequests[requestId], "unknown request");
        delete pendingRequests[requestId];

        uint256 runId = requestToRun[requestId];
        PipelineRun storage run = runs[runId];
        if ((run.flags & 8) != 0) return;

        if (status == ResponseStatus.Success && responses.length > 0) {
            run.newsSummary = abi.decode(responses[0].result, (string));
        } else if (_isPlaceholderNews(run.newsSummary)) {
            run.newsSummary = "News unavailable";
        }

        emit StageCompleted(runId, "news", requestId);

        // Fire Stage 3: LLM inference with tool calling
        _runInference(runId);
    }

    // ── Stage 3: LLM inferToolsChat with on-chain tools ────────────────

    function _runInference(uint256 runId) internal {
        PipelineRun storage run = runs[runId];
        run.stage = PipelineStage.Inferring;

        IStrategyVault.Signal memory current = IStrategyVault(vault).getCurrentSignal();

        // Build conversation
        string[] memory roles = new string[](2);
        roles[0] = "system";
        roles[1] = "user";

        string[] memory messages = new string[](2);
        messages[0] = string(abi.encodePacked(
            strategyPrompt,
            "\n\nYou are an autonomous trading strategy agent. Analyze the data and call the appropriate tool.\n",
            "IMPORTANT: You MUST call exactly one tool. Either updateSignal or emergencyExit."
        ));

        messages[1] = string(abi.encodePacked(
            "Current market state:\n",
            "- ETH/USDT spot price: $", _uint2str(run.fetchedPrice / 100), ".", _uint2str(run.fetchedPrice % 100), "\n",
            "- Funding rate: ", _uint2str(run.fetchedFunding), " (8 decimals, raw)\n",
            "- Fear & Greed Index: ", _uint2str(run.fearGreedIndex), "/100\n",
            "- Macro headline: ", run.newsSummary, "\n",
            "- Current position: direction=", _dirStr(current.direction),
            " size=", _uint2str(current.sizeBps), "bps\n\n",
            "Call the appropriate tool with your trading decision."
        ));

        // No MCP servers
        string[] memory mcpUrls = new string[](0);

        // Define on-chain tools
        ILLMInferAgent.OnchainTool[] memory tools = new ILLMInferAgent.OnchainTool[](2);
        tools[0] = ILLMInferAgent.OnchainTool(
            "updateSignal(int8 direction, uint16 sizeBps, uint256 stopPrice, string reasoning)",
            "Update the vault trading signal. direction: 1=LONG, -1=SHORT, 0=FLAT. sizeBps: position size 0-3000 (30% max). stopPrice: stop loss in cents (2 decimals). reasoning: one sentence explanation."
        );
        tools[1] = ILLMInferAgent.OnchainTool(
            "emergencyExit(string reason)",
            "Emergency exit all positions. Use ONLY if drawdown exceeds threshold or critical risk detected."
        );

        bytes memory payload = abi.encodeWithSelector(
            ILLMInferAgent.inferToolsChat.selector,
            roles, messages, mcpUrls, tools, uint256(3), true
        );

        uint256 deposit = platform.getRequestDeposit() + LLM_INFER_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            LLM_INFER_AGENT_ID, address(this), this.handleInferResponse.selector, payload
        );

        requestToRun[requestId] = runId;
        pendingRequests[requestId] = true;
    }

    // ── Stage 3 Callback — Execute LLM's tool call ─────────────────────

    function handleInferResponse(
        uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory
    ) external onlyPlatform {
        require(pendingRequests[requestId], "unknown request");
        delete pendingRequests[requestId];

        uint256 runId = requestToRun[requestId];
        if ((runs[runId].flags & 8) != 0) return;

        if (status != ResponseStatus.Success || responses.length == 0) {
            runs[runId].flags |= 8;
            emit PipelineFailed(runId, "inference failed");
            return;
        }

        _processInferResult(runId, responses[0].result);
    }

    function _processInferResult(uint256 runId, bytes memory result) internal {
        // Decode only finishReason and response; skip arrays via offset decoding
        (string memory finishReason, string memory response) = _decodeFinishAndResponse(result);

        PipelineRun storage run = runs[runId];
        bytes32 reasoningHash = keccak256(abi.encodePacked(
            run.fetchedPrice, run.fetchedFunding, run.fearGreedIndex, response
        ));

        if (_strEq(finishReason, "tool_calls")) {
            bytes[] memory toolCalls = _decodePendingToolCalls(result);
            if (toolCalls.length > 0) {
                _executeToolCall(toolCalls[0], reasoningHash);
            }
        } else if (_strEq(finishReason, "stop")) {
            _handleStopResponse(response, reasoningHash);
        } else {
            emit PipelineFailed(runId, "unexpected finish reason");
            run.flags |= 8;
            return;
        }

        run.stage = PipelineStage.Idle;
        run.flags |= 8;
        emit PipelineCompleted(runId, IStrategyVault(vault).getCurrentSignal().direction, IStrategyVault(vault).getCurrentSignal().sizeBps);
    }

    function _decodeFinishAndResponse(bytes memory result) internal pure returns (string memory, string memory) {
        // The full tuple is (string, string, string[], string[], string[], bytes[])
        // We only need the first two string fields
        (string memory finishReason, string memory response,,,,) =
            abi.decode(result, (string, string, string[], string[], string[], bytes[]));
        return (finishReason, response);
    }

    function _decodePendingToolCalls(bytes memory result) internal pure returns (bytes[] memory) {
        (,,,,,bytes[] memory pendingToolCalls) =
            abi.decode(result, (string, string, string[], string[], string[], bytes[]));
        return pendingToolCalls;
    }

    function _handleStopResponse(string memory response, bytes32 reasoningHash) internal {
        IStrategyVault.Signal memory current = IStrategyVault(vault).getCurrentSignal();
        string memory reason = bytes(response).length > 0 ? response : "LLM decided to hold";
        _settlePreviousTrade(current);
        IStrategyVault(vault).updateSignal(
            current.direction, current.sizeBps, current.stopPrice, reason, reasoningHash
        );
    }

    function _settlePreviousTrade(IStrategyVault.Signal memory previous) internal {
        if (previous.direction == 0 || previous.sizeBps == 0) return;

        address ledger = _performanceLedger();
        if (ledger == address(0)) return;

        uint256 mark = _readOraclePriceWei();
        uint256 size = (uint256(previous.sizeBps) * 1e18) / 10_000;
        IPerformanceLedger(ledger).recordTrade(previous.direction, mark, mark, size);
    }

    function _performanceLedger() internal view returns (address) {
        (bool ok, bytes memory data) = vault.staticcall(abi.encodeWithSignature("performanceLedger()"));
        if (!ok || data.length < 32) return address(0);
        return abi.decode(data, (address));
    }

    function _executeToolCall(bytes memory calldata_, bytes32 reasoningHash) internal {
        bytes4 selector;
        assembly { selector := mload(add(calldata_, 32)) }

        bytes memory args = _sliceBytes(calldata_, 4);

        bytes4 updateSig = bytes4(keccak256("updateSignal(int8,uint16,uint256,string)"));
        bytes4 exitSig = bytes4(keccak256("emergencyExit(string)"));

        if (selector == updateSig) {
            (int8 direction, uint16 sizeBps, uint256 stopPrice, string memory reasoning) =
                abi.decode(args, (int8, uint16, uint256, string));
            IStrategyVault.Signal memory previous = IStrategyVault(vault).getCurrentSignal();
            _settlePreviousTrade(previous);
            IStrategyVault(vault).updateSignal(direction, sizeBps, stopPrice, reasoning, reasoningHash);
        } else if (selector == exitSig) {
            (string memory reason) = abi.decode(args, (string));
            IStrategyVault(vault).emergencyExit(reason);
        }
    }

    function _sliceBytes(bytes memory data, uint256 start) internal pure returns (bytes memory) {
        bytes memory result = new bytes(data.length - start);
        for (uint256 i = 0; i < result.length; i++) {
            result[i] = data[i + start];
        }
        return result;
    }

    // ── Generic handler (required by interface) ─────────────────────────

    function handleResponse(
        uint256, Response[] memory, ResponseStatus, Request memory
    ) external view onlyPlatform {
        revert("use specific handlers");
    }

    // ── View Functions ──────────────────────────────────────────────────

    function getPipelineStatus(uint256 runId) external view returns (
        PipelineStage stage, uint8 flags, uint256 startedAt
    ) {
        PipelineRun storage run = runs[runId];
        return (run.stage, run.flags, run.startedAt);
    }

    function getPipelineData(uint256 runId) external view returns (
        uint256 fetchedPrice, uint256 fetchedFunding, uint256 fearGreedIndex,
        string memory newsSummary
    ) {
        PipelineRun storage run = runs[runId];
        return (run.fetchedPrice, run.fetchedFunding, run.fearGreedIndex, run.newsSummary);
    }

    // ── Rule-based completion (used when agents time out) ─────────────────

    function _completeRunWithRuleBasedSignal(uint256 runId) internal {
        PipelineRun storage run = runs[runId];
        (int8 direction, uint16 sizeBps, uint256 stopPrice, string memory reasoning, bytes32 reasoningHash) =
            _deriveRuleBasedSignal(run);

        IStrategyVault.Signal memory previous = IStrategyVault(vault).getCurrentSignal();
        _settlePreviousTrade(previous);
        IStrategyVault(vault).updateSignal(direction, sizeBps, stopPrice, reasoning, reasoningHash);

        run.stage = PipelineStage.Idle;
        run.flags |= 8;
        emit PipelineCompleted(runId, direction, sizeBps);
    }

    function _deriveRuleBasedSignal(PipelineRun storage run)
        internal
        view
        returns (int8 direction, uint16 sizeBps, uint256 stopPrice, string memory reasoning, bytes32 reasoningHash)
    {
        if (run.fearGreedIndex < 30) {
            direction = 1;
            sizeBps = 2000;
        } else if (run.fearGreedIndex > 70) {
            direction = -1;
            sizeBps = 1500;
        } else {
            direction = 1;
            sizeBps = 1000;
        }

        if (run.fetchedFunding > 0 && run.fetchedFunding > run.fetchedPrice / 20) {
            direction = -1;
            sizeBps = 1200;
        }

        uint256 price = run.fetchedPrice > 0 ? run.fetchedPrice : _readOraclePriceCents();
        stopPrice = direction > 0 ? (price * 97) / 100 : (price * 103) / 100;

        reasoningHash = keccak256(abi.encodePacked(price, run.fearGreedIndex, run.newsSummary));
        reasoning = string(abi.encodePacked(
            "ETH $",
            _uint2str(price / 100),
            ".",
            _pad2(price % 100),
            ", Fear/Greed ",
            _uint2str(run.fearGreedIndex),
            "/100. ",
            run.newsSummary
        ));
    }

  function _isPlaceholderNews(string memory summary) internal pure returns (bool) {
        if (bytes(summary).length == 0) return true;
        return keccak256(bytes(summary)) == keccak256(bytes("News unavailable"))
            || keccak256(bytes(summary)) == keccak256(bytes("Macro context unavailable"));
    }

    function _pad2(uint256 value) internal pure returns (string memory) {
        if (value < 10) return string(abi.encodePacked("0", _uint2str(value)));
        return _uint2str(value);
    }

    // ── Helpers ─────────────────────────────────────────────────────────

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

    function _dirStr(int8 d) internal pure returns (string memory) {
        if (d > 0) return "LONG";
        if (d < 0) return "SHORT";
        return "FLAT";
    }

    function _strEq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    function withdrawExcess() external onlyOwner {
        (bool ok,) = owner.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    receive() external payable {}
}
