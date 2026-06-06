# LLM Inference

Provides access to Somnia's on-chain deterministic AI models for text generation, analysis, and decision-making. This agent enables smart contracts to leverage large language models for intelligent automation — including tool use with both MCP servers and on-chain function calls.

## Methods

### inferString

Simple single-turn inference with an optional system prompt.

```solidity
function inferString(string prompt, string system, bool chainOfThought, string[] allowedValues) returns (string response)
```

#### Parameters

| Input            | Type      | Description                                                                                                                              |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt`         | string    | The user prompt to send to the model                                                                                                     |
| `system`         | string    | The system prompt to configure model behavior (can be empty string)                                                                      |
| `chainOfThought` | bool      | Whether to enable chain-of-thought reasoning                                                                                             |
| `allowedValues`  | string\[] | Optional list of allowed response values — the model is constrained to return one of these. Pass an empty array for unconstrained output |

#### Returns

| Output     | Type   | Description                 |
| ---------- | ------ | --------------------------- |
| `response` | string | The generated text response |

***

### inferNumber

Single-turn inference that extracts an integer from the model's response, clamped to a specified range.

```solidity
function inferNumber(string prompt, string system, int256 minValue, int256 maxValue, bool chainOfThought) returns (int256 response)
```

#### Parameters

| Input            | Type   | Description                                                         |
| ---------------- | ------ | ------------------------------------------------------------------- |
| `prompt`         | string | The user prompt to send to the model                                |
| `system`         | string | The system prompt to configure model behavior (can be empty string) |
| `minValue`       | int256 | Minimum allowed value for the response                              |
| `maxValue`       | int256 | Maximum allowed value for the response                              |
| `chainOfThought` | bool   | Whether to enable chain-of-thought reasoning                        |

#### Returns

| Output     | Type   | Description                                             |
| ---------- | ------ | ------------------------------------------------------- |
| `response` | int256 | The extracted integer, clamped to \[minValue, maxValue] |

***

### inferChat

Multi-turn conversational inference with full message history.

```solidity
function inferChat(string[] roles, string[] messages, bool chainOfThought) returns (string response)
```

#### Parameters

| Input            | Type      | Description                                                  |
| ---------------- | --------- | ------------------------------------------------------------ |
| `roles`          | string\[] | Array of message roles: "system", "user", or "assistant"     |
| `messages`       | string\[] | Array of message contents (must match length of roles array) |
| `chainOfThought` | bool      | Whether to enable chain-of-thought reasoning                 |

#### Returns

| Output     | Type   | Description                 |
| ---------- | ------ | --------------------------- |
| `response` | string | The generated text response |

***

### inferToolsChat

Inference with tool use. The LLM can call tools provided by **MCP servers** (executed in-situ by the agent) and **on-chain tools** (yielded back to the caller as ABI-encoded calldata). When on-chain tool calls are pending, the function returns the full conversation state so the caller can execute the calls and resume.

```solidity
function inferToolsChat(
    string[] roles,
    string[] messages,
    string[] mcpServerUrls,
    OnchainTool[] onchainTools,
    uint256 maxIterations,
    bool chainOfThought
) returns (
    string finishReason,
    string response,
    string[] updatedRoles,
    string[] updatedMessages,
    string[] pendingToolCallIds,
    bytes[] pendingToolCalls
)
```

#### Tool Definitions

On-chain tools are defined using **Solidity function signature strings**, making them natural for on-chain callers:

```solidity
struct OnchainTool {
    string signature;    // e.g. "swap(address token, uint256 amount)"
    string description;  // Human-readable description for the LLM
}
```

Supported Solidity types in signatures: `string`, `bool`, `address`, `uint256` (and other `uint`/`int` sizes), `bytes`, and arrays of these types.

MCP (Model Context Protocol) tools are discovered automatically — pass the server URLs and the agent fetches the available tools at runtime.

#### Parameters

| Input            | Type           | Description                                            |
| ---------------- | -------------- | ------------------------------------------------------ |
| `roles`          | string\[]      | Array of message roles (system/user/assistant/tool)    |
| `messages`       | string\[]      | Array of message contents (must match length of roles) |
| `mcpServerUrls`  | string\[]      | URLs of MCP servers whose tools the LLM may call       |
| `onchainTools`   | OnchainTool\[] | Tools yielded back to caller as calldata               |
| `maxIterations`  | uint256        | Maximum LLM↔tool round-trips before stopping           |
| `chainOfThought` | bool           | Whether to enable chain-of-thought reasoning           |

#### Returns

| Output               | Type      | Description                                                                                         |
| -------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `finishReason`       | string    | `"stop"` (LLM done), `"tool_calls"` (on-chain calls pending), or `"max_iterations"` (limit reached) |
| `response`           | string    | Final text response (populated when `finishReason == "stop"`)                                       |
| `updatedRoles`       | string\[] | Full conversation state — roles (for resumption)                                                    |
| `updatedMessages`    | string\[] | Full conversation state — messages (for resumption)                                                 |
| `pendingToolCallIds` | string\[] | IDs of pending on-chain tool calls                                                                  |
| `pendingToolCalls`   | bytes\[]  | ABI-encoded calldata for each pending call (selector + args)                                        |

#### Return Semantics

* **`finishReason == "stop"`**: The LLM has finished. `response` contains the final text. All other outputs are empty arrays. Any MCP tool calls were already executed during processing.
* **`finishReason == "tool_calls"`**: The LLM wants to call on-chain tool(s). `response` is empty. `updatedRoles`/`updatedMessages` contain the full conversation history (including any MCP tool results). `pendingToolCallIds` and `pendingToolCalls` are parallel arrays — each `pendingToolCalls[i]` is calldata (4-byte function selector + ABI-encoded arguments).
* **`finishReason == "max_iterations"`**: The agent reached `maxIterations` tool round-trips without the LLM producing a final response.

## Tool Use Flow

### MCP Tools (Automatic)

MCP tools are executed automatically by the agent. The LLM calls the tool, the agent forwards the call to the MCP server, feeds the result back to the LLM, and continues until done.

{% @mermaid/diagram content="sequenceDiagram
participant Contract as Your Contract
participant Agent as LLM Agent
participant LLM as Language Model
participant MCP as MCP Server

```
Contract->>Agent: inferToolsChat(messages, mcpServerUrls, [], 5, false)
Agent->>MCP: Discover available tools
MCP-->>Agent: Tool definitions
Agent->>LLM: Prompt + tool definitions
LLM-->>Agent: tool_call: getWeather("Tokyo")
Agent->>MCP: Execute getWeather("Tokyo")
MCP-->>Agent: {"temp": "22°C", "condition": "sunny"}
Agent->>LLM: Tool result
LLM-->>Agent: "The weather in Tokyo is 22°C and sunny"
Agent-->>Contract: ("stop", "The weather in Tokyo is 22°C and sunny", [], [], [], [])" %}
```

### On-Chain Tools (Yield & Resume)

On-chain tools are yielded back to the caller as ABI-encoded calldata. The caller executes them, then resumes the conversation with the results.

{% @mermaid/diagram content="sequenceDiagram
participant Contract as Your Contract
participant Agent as LLM Agent
participant LLM as Language Model
participant DEX as On-Chain DEX

```
Contract->>Agent: inferToolsChat(messages, [], onchainTools, 5, false)
Agent->>LLM: Prompt + tool definitions
LLM-->>Agent: tool_call: swap(0xA0b8..., 1000)
Agent-->>Contract: ("tool_calls", "", state, [callId], [0xd004f0f7...])

Note over Contract: Execute the on-chain call
Contract->>DEX: swap(0xA0b8..., 1000)
DEX-->>Contract: "success"

Note over Contract: Resume with tool result
Contract->>Agent: inferToolsChat(updatedState + toolResult, [], onchainTools, 5, false)
Agent->>LLM: Conversation + tool result
LLM-->>Agent: "Swapped 1000 USDC successfully"
Agent-->>Contract: ("stop", "Swapped 1000 USDC successfully", [], [], [], [])" %}
```

### Resuming After On-Chain Tool Calls

When `finishReason == "tool_calls"`, the caller should:

1. Execute each on-chain call using the calldata in `pendingToolCalls`
2. Append the results to the conversation state:
   * For each pending call, add `role: "tool"` with a JSON message `{"tool_call_id": pendingToolCallIds[i], "content": "result string"}`
3. Call `inferToolsChat` again with the updated conversation

## Deterministic Execution

Because the models run deterministically across all validating nodes, consensus can be achieved on the output, making AI results trustworthy for on-chain use.

{% @mermaid/diagram content="flowchart LR
subgraph Input
P\[Prompt Text]
end

```
subgraph Execution["Deterministic Execution"]
    N1[Node 1 - LLM]
    N2[Node 2 - LLM]
    N3[Node 3 - LLM]
end

subgraph Consensus
    C{Same Output?}
end

subgraph Output
    R[Verified Response]
end

P --> N1 & N2 & N3
N1 & N2 & N3 --> C
C -->|Yes| R" %}
```

## Example Use Cases

* Analyzing text content for moderation decisions
* Generating summaries of on-chain data
* Making classification decisions (sentiment, category, etc.)
* Creating dynamic NFT descriptions or game narratives
* Extracting numeric scores or ratings from text
* **Agentic DeFi**: LLM decides which swaps/transfers to execute and returns calldata
* **AI oracles with tool use**: LLM fetches external data via MCP servers before responding

## Usage Examples

### Simple Inference

```javascript
const abi = [{
  type: 'function',
  name: 'inferString',
  inputs: [
    { name: 'prompt', type: 'string' },
    { name: 'system', type: 'string' },
    { name: 'chainOfThought', type: 'bool' },
    { name: 'allowedValues', type: 'string[]' }
  ],
  outputs: [{ name: 'response', type: 'string' }]
}];

// Content moderation example — constrain output to "safe" or "unsafe"
const calldata = encodeFunctionData({
  abi,
  functionName: 'inferString',
  args: [
    'Analyze the following text: "Check out this amazing new product!"',
    'You are a content moderation assistant.',
    false,            // chainOfThought
    ['safe', 'unsafe'] // allowedValues
  ]
});
```

### Numeric Inference

```javascript
const abi = [{
  type: 'function',
  name: 'inferNumber',
  inputs: [
    { name: 'prompt', type: 'string' },
    { name: 'system', type: 'string' },
    { name: 'minValue', type: 'int256' },
    { name: 'maxValue', type: 'int256' },
    { name: 'chainOfThought', type: 'bool' }
  ],
  outputs: [{ name: 'response', type: 'int256' }]
}];

// Sentiment score from 1-10
const calldata = encodeFunctionData({
  abi,
  functionName: 'inferNumber',
  args: [
    'Rate the sentiment of this review: "Absolutely loved it, best purchase ever!"',
    'You are a sentiment analysis assistant. Rate sentiment from 1 (very negative) to 10 (very positive).',
    1,     // minValue
    10,    // maxValue
    false  // chainOfThought
  ]
});
```

### Conversational Example

```javascript
const abi = [{
  type: 'function',
  name: 'inferChat',
  inputs: [
    { name: 'roles', type: 'string[]' },
    { name: 'messages', type: 'string[]' },
    { name: 'chainOfThought', type: 'bool' }
  ],
  outputs: [{ name: 'response', type: 'string' }]
}];

const calldata = encodeFunctionData({
  abi,
  functionName: 'inferChat',
  args: [
    ['system', 'user', 'assistant', 'user'],
    [
      'You are a helpful coding assistant.',
      'How do I reverse a string in JavaScript?',
      'You can use: str.split("").reverse().join("")',
      'Can you explain how that works step by step?'
    ],
    false // chainOfThought
  ]
});
```

### MCP Tool Use (Solidity)

The LLM automatically discovers and calls tools from the MCP server, gets the result, and incorporates it into its response.

```solidity
interface ILLMAgent {
    struct OnchainTool {
        string signature;
        string description;
    }

    function inferToolsChat(
        string[] calldata roles,
        string[] calldata messages,
        string[] calldata mcpServerUrls,
        OnchainTool[] calldata onchainTools,
        uint256 maxIterations,
        bool chainOfThought
    ) external returns (
        string memory finishReason,
        string memory response,
        string[] memory updatedRoles,
        string[] memory updatedMessages,
        string[] memory pendingToolCallIds,
        bytes[] memory pendingToolCalls
    );
}

// Provide MCP server URLs — the agent discovers available tools automatically
string[] memory mcpServerUrls = new string[](1);
mcpServerUrls[0] = "http://weather-service:80/";

ILLMAgent.OnchainTool[] memory onchainTools = new ILLMAgent.OnchainTool[](0);

string[] memory roles = new string[](2);
roles[0] = "system";
roles[1] = "user";

string[] memory messages = new string[](2);
messages[0] = "You are a weather assistant. Use available tools when asked about weather.";
messages[1] = "What is the weather in Tokyo?";

bytes memory payload = abi.encodeWithSelector(
    ILLMAgent.inferToolsChat.selector,
    roles, messages, mcpServerUrls, onchainTools, 5, false
);
```

### On-Chain Tool Use with Yield & Resume (Solidity)

The LLM returns calldata for on-chain tools. Your contract executes them and resumes the conversation.

```solidity
// Define on-chain tools
ILLMAgent.OnchainTool[] memory onchainTools = new ILLMAgent.OnchainTool[](1);
onchainTools[0] = ILLMAgent.OnchainTool(
    "swap(address token, uint256 amount)",
    "Swap tokens on the DEX"
);

// First call — LLM decides to use swap tool
(
    string memory finishReason,
    string memory response,
    string[] memory updatedRoles,
    string[] memory updatedMessages,
    string[] memory pendingToolCallIds,
    bytes[] memory pendingToolCalls
) = llmAgent.inferToolsChat(roles, messages, mcpServerUrls, onchainTools, 5, false);

if (keccak256(bytes(finishReason)) == keccak256("tool_calls")) {
    // Execute each pending on-chain call
    for (uint i = 0; i < pendingToolCalls.length; i++) {
        // pendingToolCalls[i] is calldata: swap(0xA0b8..., 1000)
        (bool success, bytes memory result) = dexContract.call(pendingToolCalls[i]);

        // Append tool result to conversation for resumption
        // ... add ("tool", '{"tool_call_id":"...","content":"success"}') to updatedRoles/updatedMessages
    }

    // Resume — call inferToolsChat again with updated conversation
    // The LLM will see the tool results and produce a final response
}
```
