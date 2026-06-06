# LLM Parse Website

Search a domain (or directly scrape a URL) and extract structured data using AI. Unlike the JSON API Request agent, this agent can handle HTML pages and extract human-readable content. Sites are visited using a real web browser, making it suitable for pages that require JavaScript rendering.

## Overview

This agent is designed for on-chain callers that need trustless, auditable web extraction:

* Find relevant pages via search, or scrape explicit URL
* Fetch HTML and generate markdown
* Build a context window across sources
* Run a structured LLM extraction
* Return a typed, ABI-encoded response

## Example Use Cases

* Scraping price information from e-commerce sites
* Extracting news headlines for on-chain curation
* Monitoring website content for changes
* Building oracles for data not available via APIs

## How It Works

{% @mermaid/diagram content="flowchart TB
subgraph Request\["Caller"]
A\[baseUrl + prompt + schema]
end

subgraph Search\["Search Layer"]
B{resolveUrl?}
C\[Search service]
end

subgraph Fetch\["Fetch + Convert"]
D\[Fetch pages]
E\[HTML]
F\[Markdown]
end

subgraph LLM\["Structured Extraction"]
G\[Context builder]
H\[LLM structured output]
end

subgraph Response\["Response"]
I\[Result + Receipt]
end

A --> B
B -->|true| C
B -->|false| D
C --> D --> E --> F --> G --> H --> I" %}

### Flow Stages (Receipt)

The agent emits receipt steps for auditability. Each step includes timing, inputs, and outputs.

1. request: Input parameters and schema
2. search: URL discovery (skipped when resolveUrl=false)
3. scrape: Fetch HTML artifacts
4. sanitise: Markdown conversion and context assembly
5. extract: LLM structured extraction

## ABI Functions

The ABI exposes the following functions:

### ExtractString

Extract a single string field, optionally choosing from a list of options.

Inputs

<table><thead><tr><th width="197.21875">Name</th><th>Type</th><th>Example</th><th>Description</th></tr></thead><tbody><tr><td><code>key</code></td><td><code>string</code></td><td><code>best_drama</code></td><td>Field name to extract</td></tr><tr><td><code>description</code></td><td><code>string</code></td><td><code>Title of the film that won Best Motion Picture - Drama.</code></td><td>Field description for the LLM</td></tr><tr><td><code>options</code></td><td><code>string[]</code></td><td><code>[]</code></td><td>Literal options; pass an empty array when you do not want to constrain the output</td></tr><tr><td><code>prompt</code></td><td><code>string</code></td><td><code>Best Picture winners at the 2026 Golden Globe Awards</code></td><td>Natural language extraction prompt, also used as search term</td></tr><tr><td><code>url</code></td><td><code>string</code></td><td><code>goldenglobes.com</code></td><td>URL, either base URL or direct</td></tr><tr><td><code>resolveUrl</code></td><td><code>bool</code></td><td><code>true</code></td><td>Search domain vs. scrape direct URLs</td></tr><tr><td><code>numPages</code></td><td><code>uint8</code></td><td><code>3</code></td><td>Max pages to fetch, if resolveUrl is off, value is capped at 1</td></tr><tr><td><code>confidenceThreshold</code></td><td><code>uint8</code></td><td><code>70</code></td><td>Minimum extraction confidence (0–100) required to return a result; below it the field is treated as not answerable</td></tr></tbody></table>

Output

* output (string)

### ExtractANumber

Extract a single numeric field (type fixed to number), optionally bounded by min/max.

Inputs

<table><thead><tr><th width="192.55859375">Name</th><th>Type</th><th>Example</th><th>Description</th></tr></thead><tbody><tr><td><code>key</code></td><td><code>string</code></td><td><code>senegal_goals</code></td><td>Field name to extract</td></tr><tr><td><code>description</code></td><td><code>string</code></td><td><code>Number of goals scored by Senegal in the 18/1/26 AFCON final vs Morocco.</code></td><td>Field description for the LLM</td></tr><tr><td><code>min</code></td><td><code>uint256</code></td><td><code>0</code></td><td>Minimum bound (set both min and max to 0 to disable bounds)</td></tr><tr><td><code>max</code></td><td><code>uint256</code></td><td><code>0</code></td><td>Maximum bound</td></tr><tr><td><code>prompt</code></td><td><code>string</code></td><td><code>Africa Cup of Nations final score: number of goals for Senegal on 18/1/26 against Morocco.</code></td><td>Natural language extraction prompt, also used as search term</td></tr><tr><td><code>url</code></td><td><code>string</code></td><td><code>espn.com</code></td><td>URL, either base URL or direct</td></tr><tr><td><code>resolveUrl</code></td><td><code>bool</code></td><td><code>true</code></td><td>Search domain vs. scrape direct URLs</td></tr><tr><td><code>numPages</code></td><td><code>uint8</code></td><td><code>3</code></td><td>Max pages to fetch, if resolveUrl is off, value is capped at 1</td></tr><tr><td><code>confidenceThreshold</code></td><td><code>uint8</code></td><td><code>70</code></td><td>Minimum extraction confidence (0–100) required to return a result; below it the field is treated as not answerable</td></tr></tbody></table>

Output

* output (uint256)

Notes

* Values are coerced to integers; negative values are clamped to 0.
* If bounds are provided, they must be within JS safe integer range.

## JavaScript Example

```javascript
const abi = [
  {
    type: 'function',
    name: 'ExtractANumber',
    inputs: [
      { name: 'key', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'min', type: 'uint256' },
      { name: 'max', type: 'uint256' },
      { name: 'prompt', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'resolveUrl', type: 'bool' },
      { name: 'numPages', type: 'uint8' },
      { name: 'confidenceThreshold', type: 'uint8' }
    ],
    outputs: [{ name: 'output', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'ExtractString',
    inputs: [
      { name: 'key', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'options', type: 'string[]' },
      { name: 'prompt', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'resolveUrl', type: 'bool' },
      { name: 'numPages', type: 'uint8' },
      { name: 'confidenceThreshold', type: 'uint8' }
    ],
    outputs: [{ name: 'output', type: 'string' }]
  }
];

const numberCalldata = encodeFunctionData({
  abi,
  functionName: 'ExtractANumber',
  args: [
    'senegal_goals',
    'Number of goals scored by Senegal in the 18/1/26 AFCON final vs Morocco.',
    0,
    0,
    'Africa Cup of Nations final score: number of goals for Senegal on 18/1/26 against Morocco.',
    'espn.com',
    true,
    3,
    70
  ]
});

const stringCalldata = encodeFunctionData({
  abi,
  functionName: 'ExtractString',
  args: [
    'best_drama',
    'Title of the film that won Best Motion Picture - Drama.',
    [],
    'Best Picture winners at the 2026 Golden Globe Awards',
    'goldenglobes.com',
    true,
    3,
    70
  ]
});
```

## Solidity Example

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

enum ConsensusType { Majority, Threshold }
enum ResponseStatus {
    None,       // 0 - Default zero value (uninitialized storage)
    Pending,    // 1 - Awaiting responses
    Success,    // 2 - Consensus reached normally
    Failed,     // 3 - Validators reported failure
    TimedOut    // 4 - Request timed out
}

struct Response {
    address validator;
    bytes result;
    ResponseStatus status;
    uint256 receipt;
    uint256 timestamp;
    uint256 executionCost;
}

struct Request {
    uint256 id;
    address requester;
    address callbackAddress;
    bytes4 callbackSelector;
    address[] subcommittee;
    Response[] responses;
    uint256 responseCount;
    uint256 failureCount;
    uint256 threshold;
    uint256 createdAt;
    uint256 deadline;
    ResponseStatus status;
    ConsensusType consensusType;
    uint256 remainingBudget;
    uint256 perAgentBudget;
}

interface IAgentRequester {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    function getRequestDeposit() external view returns (uint256);
}

// Agent interface (for .selector and type safety)
interface IParseWebsiteAgent {
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

contract MyContract {
    // testnet: 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776
    // mainnet: 0x5E5205CF39E766118C01636bED000A54D93163E6
    IAgentRequester public platform =
        IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);

    uint256 constant AGENT_ID = 12875401142070969085;
    uint256 constant SUBCOMMITTEE_SIZE = 3;                        // platform default
    uint256 constant LLM_PARSE_WEBSITE_COST_PER_AGENT = 0.10 ether; // see Gas Fees → Current Per-Agent Prices

    mapping(uint256 => address) public requestSenders;

    event AgentResponseReceived(
        uint256 indexed requestId,
        ResponseStatus status,
        string output
    );

    function invokeExtractString(
        string calldata key,
        string calldata description,
        string[] calldata options,
        string calldata prompt,
        string calldata url,
        bool resolveUrl,
        uint8 numPages,
        uint8 confidenceThreshold
    ) external payable returns (uint256 requestId) {
        bytes memory payload = abi.encodeWithSelector(
            IParseWebsiteAgent.ExtractString.selector,
            key,
            description,
            options,
            prompt,
            url,
            resolveUrl,
            numPages,
            confidenceThreshold
        );

        // Safe deposit: contract floor + per-agent execution reward.
        uint256 reserve = platform.getRequestDeposit();
        uint256 reward  = LLM_PARSE_WEBSITE_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 deposit = reserve + reward;
        requestId = platform.createRequest{value: deposit}(
            AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );
        requestSenders[requestId] = msg.sender;
    }

    function invokeExtractANumber(
        string calldata key,
        string calldata description,
        uint256 min,
        uint256 max,
        string calldata prompt,
        string calldata url,
        bool resolveUrl,
        uint8 numPages,
        uint8 confidenceThreshold
    ) external payable returns (uint256 requestId) {
        bytes memory payload = abi.encodeWithSelector(
            IParseWebsiteAgent.ExtractANumber.selector,
            key,
            description,
            min,
            max,
            prompt,
            url,
            resolveUrl,
            numPages,
            confidenceThreshold
        );

        // Safe deposit: contract floor + per-agent execution reward.
        uint256 reserve = platform.getRequestDeposit();
        uint256 reward  = LLM_PARSE_WEBSITE_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 deposit = reserve + reward;
        requestId = platform.createRequest{value: deposit}(
            AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );
        requestSenders[requestId] = msg.sender;
    }

    function getSenegalGoals() external payable returns (uint256 requestId) {
        return
            this.invokeExtractANumber{value: msg.value}(
                "senegal_goals",
                "Number of goals scored by Senegal in the 18/1/26 AFCON final vs Morocco.",
                0,
                0,
                "Africa Cup of Nations final score: number of goals for Senegal on 18/1/26 against Morocco.",
                "espn.com",
                true,
                3,
                70
            );
    }

    function getBestDrama() external payable returns (uint256 requestId) {
        string[] memory options = new string[](0);
        return
            this.invokeExtractString{value: msg.value}(
                "best_drama",
                "Title of the film that won Best Motion Picture - Drama.",
                options,
                "Best Picture winners at the 2026 Golden Globe Awards",
                "goldenglobes.com",
                true,
                3,
                70
            );
    }

    // Called by the platform when consensus is reached
    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        require(msg.sender == address(platform), "Only platform can call");

        if (status == ResponseStatus.Success && responses.length > 0) {
            string memory output = abi.decode(responses[0].result, (string));
            emit AgentResponseReceived(requestId, status, output);
        } else {
            emit AgentResponseReceived(requestId, status, "");
        }
    }

    // Allow receiving rebates
    receive() external payable {}
}
```

## Structured Output Schema

Internally calls to the LLM are encoded into an output schema as a JSON object with:

```json
{
  "type": "struct",
  "fields": [
    { "name": "field_name", "description": "...", "field_type": { "type": "str" } }
  ]
}
```

Supported field types:

* str (string)
* int (integer)
* bool (boolean)
* lit (literal; use options)

The server automatically injects the following fields unless already present:

* reasoning (str)
* answerable (bool)
* confidence\_score (int, 0–100)
  * `confidenceThreshold` is a direct lower-bound gate against this `confidence_score` , both use the same 0–100 integer scale. If the extraction's confidence is below the threshold, the response is treated as unsuccessful (same outcome as answerable=false)

These fields are not returned in the ABI output, but they are included in the receipt for auditability.
