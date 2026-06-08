# SignalVault — Product Requirements Document
## Autonomous Social Trading Protocol on Somnia Agentic L1

**Version:** 1.0  
**Status:** Draft  
**Network:** Somnia Testnet (chain ID `50312`) → Mainnet (chain ID `5031`)  
**Date:** May 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Vision & Value Proposition](#3-product-vision--value-proposition)
4. [Why This Can Only Exist on Somnia](#4-why-this-can-only-exist-on-somnia)
5. [Somnia Primitives — Deep Feature Mapping](#5-somnia-primitives--deep-feature-mapping)
6. [System Architecture Overview](#6-system-architecture-overview)
7. [Module Specifications](#7-module-specifications)
   - 7.1 [Smart Contracts](#71-smart-contracts)
   - 7.2 [Backend Services](#72-backend-services)
   - 7.3 [Frontend Application](#73-frontend-application)
8. [Data Schemas (Somnia Data Streams)](#8-data-schemas-somnia-data-streams)
9. [Agent Pipeline Specification](#9-agent-pipeline-specification)
10. [On-chain Reactivity Subscriptions](#10-on-chain-reactivity-subscriptions)
11. [Full User Stories](#11-full-user-stories)
12. [End-to-End Demo Flow](#12-end-to-end-demo-flow)
13. [Error Handling & Edge Cases](#13-error-handling--edge-cases)
14. [Security Considerations](#14-security-considerations)
15. [Environment & Network Configuration](#15-environment--network-configuration)
16. [Glossary](#16-glossary)

---

## 1. Executive Summary

SignalVault is a fully autonomous social trading protocol. A strategy provider deploys a **StrategyVault** smart contract and seeds it with a natural-language strategy ruleset and a SOMI deposit. From that point forward, an autonomous agent loop — running entirely on Somnia's Agentic L1 infrastructure — fetches live market data from public APIs, scrapes macro/sentiment from news pages, synthesises both into a trading decision via on-chain LLM inference, and commits the signed signal with its full reasoning trail to the vault's onchain state.

Followers subscribe to a vault. When the agent updates the signal, an on-chain reactive handler fires in the **same block** and places each follower's scaled order on dreamDEX — no off-chain bot, no polling, no latency gap between signal and execution. The vault's live PnL, per-trade history, and signal stream are published to Somnia Data Streams, making vault performance a composable, protocol-native data layer that any other Somnia contract can read.

The result: the first trading system in existence where (a) the strategy is executed autonomously by an onchain AI agent, (b) the reasoning behind every decision is verifiably committed onchain, (c) follower execution is atomic with the signal in the same block, and (d) no company or operator controls or can censor any step.

---

## 2. Problem Statement

Copy trading has existed for a decade across every major CEX. It remains fundamentally broken in three ways:

**1. The trust problem.** On Binance, eToro, and Bybit copy-trading, the strategy provider is a black box. Their track record is displayed by the exchange. Their reasoning is hidden. Their historical PnL can be cherry-picked. The follower has no independent verification mechanism for anything — they are trusting the platform's curation.

**2. The latency and execution problem.** Off-chain copy approaches (Nansen, Arkham wallet tracking) are surveillance, not automation. By the time a follower observes a wallet move, parses it, and submits their own transaction, the market has moved. On-chain mempool sniffing is detectable and front-runnable by MEV bots.

**3. The opacity of AI-assisted strategies.** AI trading tools (OKX OnchainOS, various Telegram bots) make decisions in black boxes. There is no way to audit what information the model consumed, what it reasoned, or whether the same model and inputs would produce the same output again. Users are trusting the AI provider just as much as a centralized exchange.

**The gap:** There is no system where:
- A trading strategy's logic is expressed in auditable on-chain state
- The agent that executes it fetches its inputs from consensus-validated sources
- The AI's reasoning chain is committed onchain and verifiable by anyone
- Follower execution is atomically bound to the signal with zero latency gap
- No operator, curator, or platform can interfere with any step

SignalVault is that system.

---

## 3. Product Vision & Value Proposition

### Core Premise
Signal execution and follower mirroring are a single atomic operation on Somnia. A strategy agent produces a signal in block N. Follower orders are placed in block N. There is no "copy" delay; there is no separate step.

### For Strategy Providers
- Deploy a vault, define a strategy in natural language, fund it with a SOMI agent deposit
- The autonomous loop runs indefinitely without any further action
- Performance is publicly verifiable and immutable — no ability to hide losses or manipulate history
- Earn a configurable performance fee from follower PnL (deducted atomically on settlement)
- Build a public track record that is provably uncurated

### For Followers
- Subscribe once with a risk config (max position size, slippage tolerance, max drawdown)
- Orders are placed automatically in the same block as every signal update
- Full reasoning trail for every signal is inspectable before and after subscription
- Unsubscribe at any time; emergency exit fires automatically if drawdown threshold is breached
- No custody of funds by any protocol contract beyond active positions

### For the Ecosystem (Composability)
- Every vault's signal and PnL data is published to Somnia Data Streams
- Any Somnia contract can read live vault performance as a primitive
- Lending protocols: adjust rates based on follower strategy risk
- DAOs: gate treasury management access by verified vault track record
- Options protocols: use vault signal as underlying trigger for structured products

---

## 4. Why This Can Only Exist on Somnia

The following is an explicit dependency map. Each feature of SignalVault maps to a Somnia primitive that has no equivalent on any other EVM chain.

| SignalVault Feature | Required Somnia Primitive | Why No Other Chain Works |
|---|---|---|
| Fetching live price/OI/funding from exchange APIs inside a smart contract | JSON API Agent (Somnia Agents) | Other chains require off-chain keepers or trusted oracles. Somnia validators execute the API call in consensus — every validator independently fetched the same data. |
| Scraping macro news from rendered JavaScript pages as part of a trade decision | LLM Parse Website Agent | No other chain has a browser-scraping compute layer backed by validator consensus. There is no clean API for CoinDesk headlines or Fear & Greed. |
| The LLM synthesising market data + news into a strategy decision and yielding trade calldata | LLM inferToolsChat Agent | On-chain deterministic AI inference (temperature=0, fixed seed, Qwen3-30B) with tool calling is unique to Somnia. Every validator independently re-ran inference and agreed. |
| Agent loop firing every 5 minutes without any off-chain trigger | EpochTick System Event (Reactivity) | No other EVM chain has a native cron. Ethereum requires Chainlink Automation or Gelato — external trusted services with their own liveness assumptions and fees. |
| Follower orders placed in the exact same block as the signal | On-chain Reactivity (synthetic transactions) | On other chains, a follower contract must observe an event in block N and submit in block N+1 or later. Somnia's reactive subscriptions insert a synthetic handler invocation in the same block as the triggering event. This is architecturally impossible on Ethereum. |
| Emergency stop firing at the exact millisecond drawdown is breached | Schedule System Event (Reactivity) | One-shot scheduled callbacks at a specific millisecond timestamp. Ethereum has no equivalent native primitive. |
| Vault signal and PnL as a composable protocol-native data layer | Somnia Data Streams | EVM events are one-way. Data Streams are typed, queryable, multi-publisher records that persist and can be subscribed to by any contract or TypeScript client via SDK. |
| Sub-cent fee per agent call, 100ms blocks making 5-minute loops practical | MultiStream Consensus + IceDB | Ethereum's gas model and 12-second blocks make frequent agent loops economically impractical. Somnia's sub-cent fees and 100ms blocks make every EpochTick a viable trigger for a full 3-agent pipeline. |

---

## 5. Somnia Primitives — Deep Feature Mapping

Each primitive is described here with its documentation reference, the specific implementation detail needed for SignalVault, and the exact reason it is used.

---

### 5.1 Somnia Agents — JSON API Request

**Documentation:** https://docs.somnia.network/agents/invoking-agents/from-solidity  
**Code Generator:** https://agents.somnia.network  
**Agent ID (testnet):** `13174292974160097713` (JSON API Agent — verify via code generator)  
**Platform Contract (testnet):** `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`  
**Platform Contract (mainnet):** `0x5E5205CF39E766118C01636bED000A54D93163E6`  
**Cost:** 0.03 STT per validator (default subcommittee size: 3 → 0.09 STT total reward, plus operations reserve)

**What it does:** Fetches any public HTTP JSON endpoint and extracts a typed value using a JSON-path selector. Typed variants: `fetchUint`, `fetchString`, `fetchAddress`, `fetchArray`. Each of 3 elected validators independently performs the fetch; consensus is reached when a majority returns identical results.

**How SignalVault uses it:**
- Stage 1a: On-chain Protofire ETH/USD oracle + CoinGecko `ethereum` spot (8 decimals)
- Stage 1b: `fetchUint` → Exchange funding rate endpoint (signed integer, basis points)
- Stage 1c: `fetchUint` → Open interest from Coinglass or exchange API

**Solidity invocation pattern:**
```solidity
interface IJsonApiAgent {
    function fetchUint(
        string calldata url,
        string calldata selector,
        uint8 decimals
    ) external returns (uint256);
}

bytes memory payload = abi.encodeWithSelector(
    IJsonApiAgent.fetchUint.selector,
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    "price",
    uint8(2)
);

uint256 deposit = platform.getRequestDeposit()
    + JSON_FETCH_COST_PER_AGENT * SUBCOMMITTEE_SIZE;

uint256 requestId = platform.createRequest{value: deposit}(
    JSON_API_AGENT_ID,
    address(this),
    this.handlePriceResponse.selector,
    payload
);
```

**Key implementation notes:**
- The callback (`handleResponse`) must verify `msg.sender == address(platform)`
- Track `pendingRequests[requestId]` to validate incoming callbacks
- Implement `receive() external payable {}` to accept rebates of unused deposit
- Fire Stage 1b and 1c in parallel (separate `createRequest` calls in the same transaction); track both request IDs and only proceed to Stage 2 when both have resolved

---

### 5.2 Somnia Agents — LLM Parse Website

**Documentation:** https://docs.somnia.network/agents/invoking-agents/from-solidity  
**Code Generator:** https://agents.somnia.network  
**Cost:** ~0.10 STT per validator

**What it does:** Launches a real browser (JavaScript-rendered), navigates to a URL or searches a domain, runs LLM extraction over the rendered page. Returns typed structured fields. Two modes:
- **Direct mode:** `scrapeUrl(url, fields[])` — scrape exactly this URL
- **Search mode:** `searchAndScrape(domain, query, fields[])` — find the most relevant page on this domain for this query, then extract

Receipt includes: source URL, extracted markdown snippet, LLM reasoning, `answerable` boolean, `confidence_score` (0-100).

**How SignalVault uses it:**
- Stage 2a: Search mode on `alternative.me` for Fear & Greed index value (no clean API, JS-rendered)
- Stage 2b: Direct mode on configured news source (`coindesk.com/tag/ethereum`) for ETH macro headline sentiment; returns `ExtractString` with a 1-sentence macro summary

**Why this stage matters:** A strategy agent without macro context is a pure price-follower. The LLM Parse Website stage is what elevates the agent from a statistical bot to a context-aware reasoner. The Fear & Greed value + headline summary are fed as context into Stage 3 (inferToolsChat). This is the step that has no analogue on any other chain.

---

### 5.3 Somnia Agents — LLM Inference (inferToolsChat)

**Documentation:** https://docs.somnia.network/agents/invoking-agents/from-solidity  
**Code Generator:** https://agents.somnia.network  
**Model:** Qwen3-30B, temperature=0, fixed seed (deterministic across all validators)  
**Cost:** ~0.07 STT per validator for basic inference; inferToolsChat costs more depending on tool calls

**What it does (inferToolsChat specifically):** Multi-turn conversation with:
1. A system prompt defining the agent's strategy rules
2. A user message containing structured market state (from Stage 1) and macro context (from Stage 2)
3. A set of **on-chain tools** the model can call — these return ABI-encoded calldata back to your contract, which executes them

The model reasons (chain-of-thought is captured), decides which tool to call with what parameters, yields ABI calldata. Your `handleResponse` callback decodes the calldata and executes it against the target contract.

**How SignalVault uses it:**

System prompt (stored in vault at deployment):
```
You are an autonomous trading strategy agent. Rules:
- Strategy: momentum breakout with macro filter
- Max position: 30% of vault
- Exit if: funding rate > 0.1% OR drawdown > 20% OR macro sentiment negative
- Risk/reward: minimum 2:1

Available tools:
- updateSignal(int8 direction, uint16 sizeBps, uint256 stopPrice, string reasoning)
  direction: 1=LONG, -1=SHORT, 0=FLAT
  sizeBps: position size in basis points of vault (max 3000 = 30%)
  stopPrice: stop loss price (18 decimals)
  reasoning: one sentence explaining the decision

- emergencyExit(string reason)
  Use ONLY if drawdown > 20% or critical risk threshold breached

Given the current market state, decide the optimal position and call the appropriate tool.
```

User message template (assembled by `AgentOrchestrator.sol`):
```
Current market state:
- ETH/USDT spot: $[price]
- Funding rate: [fundingRate]% (positive = longs paying)
- Open interest: $[oi]B
- Fear & Greed Index: [fng] ([sentiment])
- Macro headline: "[headline]"
- Current vault position: [currentDirection] [currentSizeBps]bps
- Vault PnL since last signal: [pnl]%

Call the appropriate tool with your decision.
```

The model reasons and yields calldata for `updateSignal(...)` or `emergencyExit(...)`. The vault decodes and executes. The LLM's full chain-of-thought is committed as a hash of the agent receipt.

---

### 5.4 Somnia Reactivity — On-chain Event Subscriptions

**Documentation:** https://docs.somnia.network/developer/reactivity/what-is-reactivity  
**Subscriptions reference:** https://docs.somnia.network/developer/reactivity/subscriptions-the-core-primitive  
**On-chain tutorial:** https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial  
**Precompile address:** `0x0100` (SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS)  
**Funding requirement:** Minimum 32 SOMI balance held by subscription owner

**What it does:** When a matching EVM event fires in block N, validators insert a synthetic transaction invoking the registered handler contract **also in block N**. Same block. The handler receives the event data. Handler gas is funded by the subscription owner's SOMI balance.

**Key properties:**
- `isGuaranteed: true` — eventual delivery with some block distance
- `isCoalesced: false` — each signal event triggers a separate handler call per follower (not batched)
- Filter fields: `emitter` (the vault contract), `eventTopics[0]` (the `SignalUpdated(bytes32)` selector)

**How SignalVault uses it:**

`MirrorReactor.sol` subscribes to `StrategyVault.SignalUpdated`. When the vault agent updates the signal, every registered MirrorReactor fires in the same block and places follower orders on dreamDEX. The subscription is created once per vault deployment by the vault factory, funded from a portion of follower subscription fees.

`StopReactor.sol` subscribes to `StrategyVault.PositionUpdate`. Checks each follower's entry price against their configured stop. If breached, calls `dreamDEX.closePosition()` in the same block.

**Subscription creation (Solidity):**
```solidity
ISomniaReactivityPrecompile.SubscriptionData memory sub = ISomniaReactivityPrecompile.SubscriptionData({
    eventTopics: [
        SignalUpdated.selector,   // topic[0] = event selector
        bytes32(0),               // topic[1] = wildcard
        bytes32(0),               // topic[2] = wildcard  
        bytes32(0)                // topic[3] = wildcard
    ],
    emitter: address(vault),      // only this vault's events
    handlerContractAddress: address(mirrorReactor),
    handlerFunctionSelector: IMirrorReactor.onSignalUpdated.selector,
    isGuaranteed: true,
    isCoalesced: false,
    priorityFeePerGas: 1 gwei,
    maxFeePerGas: 50 gwei,
    gasLimit: 500_000
});
SomniaExtensions.subscribe(sub);
```

---

### 5.5 Somnia Reactivity — System Events (EpochTick + Schedule)

**Documentation:** https://docs.somnia.network/developer/reactivity/system-events  
**Events:** `event BlockTick(uint64 indexed blockNumber)` and `event Schedule(uint256 indexed timestampMillis)`  
**Emitter for system events:** `SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS` (must be set as `emitter` in subscription)

**EpochTick:**  
Not a separate event — implemented as a `BlockTick` subscription with `topic[1] = bytes32(0)` (fires every block), then filtered inside the handler to fire the full agent pipeline once every N blocks (≈ every 5 minutes at 100ms/block = every 3000 blocks). This avoids needing a separate cron infrastructure.

Alternatively, use an off-chain SDK `cron subscription` that fires a transaction every N minutes; on-chain handler validates the sender.

**Schedule:**  
One-shot event. Used for:
- **Drawdown guard**: When `emergencyExit` is called and all follower positions are closed, a `Schedule` is registered for 24 hours later to re-enable the vault (cooling-off period)
- **Fee settlement**: A `Schedule` fires at midnight UTC daily to call `PerformanceLedger.settleEpochFees()`

**EpochTick handler pattern:**
```solidity
// Fires every block; agent loop throttled internally
function onBlockTick(
    bytes32[] calldata topics,
    bytes calldata data
) external onlyReactivityPrecompile {
    uint64 blockNumber = uint64(uint256(topics[1]));
    if (blockNumber % EPOCH_BLOCKS != 0) return;  // fire every 3000 blocks
    if (agentRunning) return;                       // prevent re-entrancy
    agentRunning = true;
    orchestrator.startAgentPipeline{value: agentBudget}();
}
```

---

### 5.6 Somnia Data Streams

**Documentation:** https://docs.somnia.network/developer/data-streams/what-is-somnia-data-streams  
**SDK:** `@somnia-chain/streams` — https://www.npmjs.com/package/@somnia-chain/streams  
**SDK Methods:** https://docs.somnia.network/somnia-data-streams/getting-started/sdk-methods-guide  
**Intersection with Reactivity:** https://docs.somnia.network/developer/data-streams/concepts/intersection-with-somnia-reactivity

**What it does:** A typed, structured data layer where publishers write records conforming to a schema string, and subscribers read them by (schemaId, publisherAddress). No Solidity required for publishing. `schemaId = keccak256(schemaString)`. Multiple publishers can write under the same schema. Records persist on-chain and are queryable via SDK.

**How SignalVault uses it:** Two schemas are published by the `StreamPublisher` TypeScript service after every agent callback.

See [Section 8](#8-data-schemas-somnia-data-streams) for full schema definitions and publishing code.

**Key SDK methods used:**
```typescript
// Register schema (once)
await sdk.streams.registerDataSchemas([{ schemaName, schema, parentSchemaId: zeroBytes32 }])

// Publish a record
await sdk.streams.set([{ id: dataId, schemaId, data: encodedPayload }])

// Or publish + emit event atomically (for off-chain reactivity)
await sdk.streams.setAndEmitEvents({ dataId, schemaId, data, events: [...] })

// Subscribe (off-chain WebSocket, for UI)
await sdk.streams.subscribe({ somniaStreamsEventId: 'SignalUpdated', onData: handler })

// Read all records (for leaderboard / history)
await sdk.streams.getAllPublisherDataForSchema(schemaId, publisherAddress)
```

---

### 5.7 Off-chain Reactivity (WebSocket)

**Documentation:** https://docs.somnia.network/developer/reactivity  
**SDK:** `@somnia-chain/reactivity`

**What it does:** WebSocket subscription where the Somnia node pushes an event notification the moment a matching event fires, including the contract state from the same block in one atomic message. No polling. Used in the SignalVault frontend.

**How SignalVault uses it:** The frontend subscribes to `SignalUpdated` events from any vault. When a signal fires, the UI receives the full new signal state (direction, size, stop, reasoning hash, new PnL) in one WebSocket push, in the same block as the agent callback. The leaderboard cards update in real time.

**TypeScript pattern:**
```typescript
import { SDK } from '@somnia-chain/reactivity'

const sdk = new SDK({ rpcUrl: SOMNIA_RPC })
await sdk.subscribe({
    emitter: VAULT_ADDRESS,
    eventTopics: [SignalUpdated_TOPIC, null, null, null],
    ethCalls: [{
        to: VAULT_ADDRESS,
        data: encodeFunctionData({ abi: VaultABI, functionName: 'getCurrentSignal' })
    }],
    onData: (data) => {
        const signal = decodeCurrentSignal(data.ethCallResults[0])
        updateLeaderboardCard(vaultAddress, signal)
    }
})
```

---

### 5.8 Protofire / DIA Price Feeds (Oracle Integration)

**Documentation:** https://docs.somnia.network/developer/building-dapps/oracles/protofire-price-feeds  
**Protofire ETH/USD proxy (testnet):** `0xd9132c1d762D432672493F640a63B758891B449e`  
**Protofire ETH/USD proxy:** `0xeC25a820A6F194118ef8274216a7F225Da019526`

**How SignalVault uses it:** The `PerformanceLedger` contract uses the Protofire oracle to mark positions to market for PnL calculation. This is independent of the agent's price fetch — the ledger uses the onchain oracle (which is Chainlink-compatible AggregatorV3 interface) as an authoritative settlement price, while the agent's JSON API fetch is used for signal generation context.

```solidity
interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId, int256 answer, uint256 startedAt,
        uint256 updatedAt, uint80 answeredInRound
    );
}
AggregatorV3Interface btcFeed = AggregatorV3Interface(0xa57d637618252669fD859B1F4C7bE6F52Bef67ed);
(, int256 price,,,) = btcFeed.latestRoundData();
```

---

## 6. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL WORLD                                       │
│  Binance/Coinbase APIs   Exchange Funding APIs   CoinDesk   Fear&Greed       │
└────────────────┬────────────────────┬──────────────────────────────────────┘
                 │ JSON API Agent      │ LLM Parse Website Agent
                 ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SOMNIA AGENTS (Validator Consensus Compute)               │
│  Stage 1: JSON fetch (price, funding, OI)                                   │
│  Stage 2: LLM Parse Website (F&G, news headlines)                           │
│  Stage 3: LLM inferToolsChat (decision → calldata for updateSignal/exit)    │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ handleResponse callback
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORE CONTRACTS (EVM)                                 │
│  StrategyVault.sol    AgentOrchestrator.sol    PerformanceLedger.sol        │
│  VaultFactory.sol     FollowerRegistry.sol     FeeDistributor.sol           │
└──────────┬────────────────────────────────────────────┬─────────────────────┘
           │ SignalUpdated event                         │ publishData
           ▼ (same block)                               ▼
┌──────────────────────────┐            ┌───────────────────────────────────┐
│   ON-CHAIN REACTIVITY    │            │       SOMNIA DATA STREAMS         │
│  MirrorReactor.sol       │            │  SignalStream (schemaId_A)        │
│  StopReactor.sol         │            │  PnLStream (schemaId_B)           │
│  DrawdownGuard.sol       │            │  TradeStream (schemaId_C)         │
│  EpochCron handler       │            │  (composable for any consumer)    │
└──────────┬───────────────┘            └────────────────┬──────────────────┘
           │ same-block orders                           │ WebSocket push
           ▼                                             ▼
┌────────────────────┐              ┌────────────────────────────────────────┐
│  dreamDEX / DEX   │              │        FRONTEND (Next.js)              │
│  Order placement  │              │  Live leaderboard, vault detail,       │
│  Position mgmt    │              │  audit trail, follower dashboard       │
└────────────────────┘              └────────────────────────────────────────┘
           ▲
           │ EpochTick (every 3000 blocks, ~5 min)
           │ fires AgentOrchestrator.startPipeline()
```

---

## 7. Module Specifications

### 7.1 Smart Contracts

All contracts are Solidity ^0.8.20, deployable via Foundry or Hardhat on Somnia testnet/mainnet.

---

#### 7.1.1 `VaultFactory.sol`

**Purpose:** Factory contract for deploying StrategyVault instances. Maintains a registry of all deployed vaults. Emits a `VaultDeployed` event that the frontend indexes.

**Functions:**
```solidity
function deployVault(
    string calldata name,
    string calldata strategyPrompt,      // natural language rules for the LLM system prompt
    address paymentToken,                // SOMI or USDC
    uint16 performanceFeeBps,            // e.g., 1000 = 10%
    uint256 agentBudgetPerEpoch          // STT allocated per agent run
) external payable returns (address vault)

function getVault(uint256 vaultId) external view returns (address)
function getAllVaults() external view returns (address[] memory)
function getVaultCount() external view returns (uint256)
```

**Events:**
```solidity
event VaultDeployed(uint256 indexed vaultId, address vault, address strategist, string name)
```

**Notes:** On deployment, `VaultFactory` also deploys the corresponding `MirrorReactor`, `StopReactor`, and registers the EpochTick subscription. This is done in a single `deployVault` transaction to minimise setup friction.

---

#### 7.1.2 `StrategyVault.sol`

**Purpose:** The core state machine. Stores the current signal, all historical signals with their reasoning hashes, follower configurations, vault metadata, and PnL ledger pointer. Is the `IAgentRequesterHandler` target for agent callbacks.

**State:**
```solidity
struct Signal {
    int8 direction;          // 1=LONG, -1=SHORT, 0=FLAT
    uint16 sizeBps;          // position size (basis points of vault)
    uint256 stopPrice;       // stop-loss price (18 decimals)
    uint256 epoch;           // block number when signal was set
    bytes32 reasoningHash;   // keccak256(IPFS CID of agent receipt)
    string reasoningSummary; // 1-sentence summary from LLM
}

struct FollowerConfig {
    uint16 riskPct;          // % of follower's approved budget to mirror
    uint256 maxPositionSize; // hard cap in USD (18 decimals)
    uint16 maxSlippageBps;   // max acceptable slippage
    uint256 stopLossBuffer;  // additional buffer on top of vault stop
    bool active;
}

Signal public currentSignal;
Signal[] public signalHistory;
mapping(address => FollowerConfig) public followers;
address[] public followerList;
address public strategist;
string public strategyPrompt;
uint16 public performanceFeeBps;
bool public agentRunning;
uint256 public vaultBalance;         // SOMI deposited by strategist
address public agentOrchestrator;
address public performanceLedger;
address public mirrorReactor;
```

**Key Functions:**
```solidity
// Called by AgentOrchestrator callback — updates signal state
function updateSignal(
    int8 direction,
    uint16 sizeBps,
    uint256 stopPrice,
    string calldata reasoning
) external onlyOrchestrator

// Called by followers to subscribe
function subscribe(FollowerConfig calldata config) external payable

// Called by followers to unsubscribe
function unsubscribe() external

// Called by DrawdownGuard (reactive handler) when vault drawdown > threshold
function emergencyExit() external onlyGuardOrStrategist

// View
function getCurrentSignal() external view returns (Signal memory)
function getFollowers() external view returns (address[] memory)
function getSignalHistory(uint256 limit) external view returns (Signal[] memory)
```

**Events:**
```solidity
event SignalUpdated(
    bytes32 indexed signalHash,  // keccak of (direction, sizeBps, stopPrice)
    int8 direction,
    uint16 sizeBps,
    uint256 stopPrice,
    string reasoningSummary,
    bytes32 reasoningHash
)
event FollowerSubscribed(address indexed follower, FollowerConfig config)
event FollowerUnsubscribed(address indexed follower)
event EmergencyExit(string reason, uint256 epoch)
event AgentStarted(uint256 indexed requestId, uint256 epoch)
event AgentCompleted(uint256 indexed requestId, bytes32 signalHash)
```

---

#### 7.1.3 `AgentOrchestrator.sol`

**Purpose:** Manages the 3-stage agent pipeline. Fires the Stage 1 JSON API requests, chains through Stage 2 (LLM Parse Website) and Stage 3 (inferToolsChat) via sequential callbacks. Assembles the final prompt from all stage outputs and calls `vault.updateSignal()` with the LLM's decision.

**Implements:** `IAgentRequesterHandler`

**Platform addresses (inject via constructor):**
```solidity
IAgentRequester public immutable platform;
// testnet: 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776
// mainnet: 0x5E5205CF39E766118C01636bED000A54D93163E6
```

**Agent IDs (verify via https://agents.somnia.network):**
```solidity
uint256 public constant JSON_API_AGENT_ID = 13174292974160097713;
uint256 public constant LLM_PARSE_AGENT_ID = /* verify at agents.somnia.network */;
uint256 public constant LLM_INFERENCE_AGENT_ID = /* verify at agents.somnia.network */;
```

**Per-agent costs:**
```solidity
uint256 public constant JSON_FETCH_COST_PER_AGENT   = 0.03 ether;
uint256 public constant PARSE_WEBSITE_COST_PER_AGENT = 0.10 ether;
uint256 public constant LLM_INFER_COST_PER_AGENT    = 0.07 ether;
uint256 public constant SUBCOMMITTEE_SIZE            = 3;
```

**Pipeline state (per run, keyed by runId):**
```solidity
struct PipelineRun {
    uint256 runId;
    uint256 priceRequestId;
    uint256 fundingRequestId;
    uint256 parseRequestId;
    uint256 inferRequestId;
    uint256 price;           // set after Stage 1a
    int256 fundingRate;      // set after Stage 1b
    uint256 openInterest;    // set after Stage 1c
    string  macroSummary;    // set after Stage 2
    uint256 fngIndex;        // set after Stage 2
    bool    priceReady;
    bool    fundingReady;
    bool    parseReady;
    bool    complete;
}
mapping(uint256 => PipelineRun) public runs;
```

**Pipeline execution (called by EpochCron handler):**
```solidity
function startPipeline() external payable onlyVaultOrCron {
    uint256 runId = ++currentRunId;
    PipelineRun storage run = runs[runId];
    run.runId = runId;

    // Stage 1a: ETH price (oracle + CoinGecko)
    bytes memory pricePayload = abi.encodeWithSelector(
        IJsonApiAgent.fetchUint.selector,
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
        "price",
        uint8(2)
    );
    uint256 priceDeposit = platform.getRequestDeposit()
        + JSON_FETCH_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
    run.priceRequestId = platform.createRequest{value: priceDeposit}(
        JSON_API_AGENT_ID, address(this),
        this.handlePriceResponse.selector, pricePayload
    );

    // Stage 1b: Funding rate (parallel)
    bytes memory fundingPayload = abi.encodeWithSelector(
        IJsonApiAgent.fetchUint.selector,
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true",
        "0.fundingRate",
        uint8(8)
    );
    run.fundingRequestId = platform.createRequest{value: priceDeposit}(
        JSON_API_AGENT_ID, address(this),
        this.handleFundingResponse.selector, fundingPayload
    );

    pendingRuns[run.priceRequestId] = runId;
    pendingRuns[run.fundingRequestId] = runId;
    emit PipelineStarted(runId, block.number);
}
```

**Stage 2 trigger (called when both Stage 1 callbacks resolved):**
```solidity
function _tryFireStage2(uint256 runId) internal {
    PipelineRun storage run = runs[runId];
    if (!run.priceReady || !run.fundingReady) return;

    // Stage 2: Scrape Fear & Greed + news
    bytes memory parsePayload = abi.encodeWithSelector(
        ILLMParseAgent.searchAndScrape.selector,
        "alternative.me",
        "fear greed index current value",
        ["fng_value:uint256", "fng_label:string"]
    );
    uint256 parseDeposit = platform.getRequestDeposit()
        + PARSE_WEBSITE_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
    run.parseRequestId = platform.createRequest{value: parseDeposit}(
        LLM_PARSE_AGENT_ID, address(this),
        this.handleParseResponse.selector, parsePayload
    );
    pendingRuns[run.parseRequestId] = runId;
}
```

**Stage 3 trigger (inferToolsChat — called when Stage 2 resolves):**
```solidity
function _fireStage3(uint256 runId) internal {
    PipelineRun storage run = runs[runId];
    Signal memory current = vault.getCurrentSignal();

    string memory userMessage = string.concat(
        "Current market state:\n",
        "- ETH/USDT: $", Strings.toString(run.price / 100), "\n",
        "- Funding rate: ", _formatRate(run.fundingRate), "% (positive = longs paying)\n",
        "- Fear & Greed: ", Strings.toString(run.fngIndex), "\n",
        "- Macro: ", run.macroSummary, "\n",
        "- Current position: direction=", _dirStr(current.direction),
        " size=", Strings.toString(current.sizeBps), "bps\n\n",
        "Call the appropriate tool."
    );

    bytes memory inferPayload = abi.encodeWithSelector(
        ILLMInferAgent.inferToolsChat.selector,
        vault.strategyPrompt(),  // system prompt stored in vault
        userMessage,
        _encodeOnchainTools()    // updateSignal + emergencyExit ABIs
    );
    uint256 inferDeposit = platform.getRequestDeposit()
        + LLM_INFER_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
    run.inferRequestId = platform.createRequest{value: inferDeposit}(
        LLM_INFERENCE_AGENT_ID, address(this),
        this.handleInferResponse.selector, inferPayload
    );
    pendingRuns[run.inferRequestId] = runId;
}
```

**Final callback — executes LLM's decision:**
```solidity
function handleInferResponse(
    uint256 requestId,
    Response[] memory responses,
    ResponseStatus status,
    Request memory details
) external {
    require(msg.sender == address(platform));
    if (status != ResponseStatus.Success) {
        emit PipelineFailed(requestId, uint8(status));
        vault.agentRunning = false;
        return;
    }
    // Decode the calldata the LLM yielded
    (bytes4 selector, bytes memory args) = abi.decode(responses[0].result, (bytes4, bytes));

    // Commit reasoning hash
    bytes32 reasoningHash = keccak256(abi.encode(responses[0].receipt));

    if (selector == IStrategyVault.updateSignal.selector) {
        (int8 dir, uint16 size, uint256 stop, string memory reasoning)
            = abi.decode(args, (int8, uint16, uint256, string));
        vault.updateSignal{value: 0}(dir, size, stop, reasoning);
        vault.setReasoningHash(reasoningHash);
    } else if (selector == IStrategyVault.emergencyExit.selector) {
        (string memory reason) = abi.decode(args, (string));
        vault.emergencyExit();
        emit EmergencyExitTriggered(reason);
    }

    vault.agentRunning = false;
    emit PipelineCompleted(requestId, block.number);
}
```

---

#### 7.1.4 `MirrorReactor.sol`

**Purpose:** On-chain reactive handler. Subscribed to `StrategyVault.SignalUpdated`. When the vault signal updates, fires in the same block and places scaled orders for all active followers.

**Implements:** `ISomniaEventHandler` (the interface for on-chain reactivity handlers)

**Funding:** This contract must hold ≥ 32 SOMI. The VaultFactory tops this up from follower subscription fees. A `lowBalance` check emits a warning event when balance approaches threshold.

```solidity
interface ISomniaEventHandler {
    function onEvent(
        address emitter,
        bytes32[] calldata topics,
        bytes calldata data
    ) external;
}

contract MirrorReactor is ISomniaEventHandler {
    IStrategyVault public vault;
    IDreamDEX public dex;

    function onEvent(
        address emitter,
        bytes32[] calldata topics,
        bytes calldata data
    ) external onlyReactivityPrecompile {
        require(emitter == address(vault), "wrong emitter");

        // Decode signal from event data
        (int8 direction, uint16 sizeBps, uint256 stopPrice,, ) 
            = abi.decode(data, (int8, uint16, uint256, bytes32, string));

        address[] memory followers = vault.getFollowers();

        for (uint256 i = 0; i < followers.length; i++) {
            address follower = followers[i];
            FollowerConfig memory cfg = vault.followers(follower);
            if (!cfg.active) continue;

            // Scale vault signal by follower risk config
            uint256 scaledSize = (uint256(sizeBps) * cfg.riskPct) / 10000;
            if (scaledSize == 0) continue;

            // Place order on dreamDEX
            try dex.placeOrder{value: 0}(
                follower,
                direction > 0 ? OrderSide.LONG : OrderSide.SHORT,
                scaledSize,
                stopPrice + cfg.stopLossBuffer,
                cfg.maxSlippageBps
            ) {
                emit FollowerOrderPlaced(follower, direction, scaledSize);
            } catch {
                emit FollowerOrderFailed(follower, direction, scaledSize);
            }
        }
    }
}
```

---

#### 7.1.5 `StopReactor.sol`

**Purpose:** On-chain reactive handler. Subscribed to `StrategyVault.SignalUpdated` and also to Protofire price feed updates. Checks each follower's active position against their stop-loss price. Closes positions that have breached stop.

**Logic:**
```solidity
function onEvent(...) external onlyReactivityPrecompile {
    (, , uint256 newStopPrice, , ) = abi.decode(data, (...));
    address[] memory followers = vault.getFollowers();
    for (uint256 i = 0; i < followers.length; i++) {
        Position memory pos = dex.getPosition(followers[i]);
        if (pos.size == 0) continue;
        if (_isStopBreached(pos, newStopPrice)) {
            dex.closePosition(followers[i]);
            emit StopTriggered(followers[i], pos.entryPrice, newStopPrice);
        }
    }
}
```

---

#### 7.1.6 `DrawdownGuard.sol`

**Purpose:** Monitors vault-level drawdown. When the vault's aggregate PnL (from `PerformanceLedger`) crosses the configured drawdown threshold, calls `vault.emergencyExit()` and registers a `Schedule` subscription for 24-hour cooldown.

**Trigger:** Subscribed to `PerformanceLedger.DrawdownUpdated` event (reactive).

```solidity
function onEvent(...) external onlyReactivityPrecompile {
    (uint256 currentDrawdown) = abi.decode(data, (uint256));
    if (currentDrawdown > vault.maxDrawdownBps()) {
        vault.emergencyExit("Vault drawdown threshold breached");
        _scheduleReactivation();  // Schedule event 24h from now
    }
}

function _scheduleReactivation() internal {
    uint256 reactivateAt = (block.timestamp + 86400) * 1000; // 24h in ms
    ISomniaReactivityPrecompile.SubscriptionData memory sub = ISomniaReactivityPrecompile.SubscriptionData({
        eventTopics: [Schedule.selector, bytes32(reactivateAt), bytes32(0), bytes32(0)],
        emitter: SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS,
        handlerContractAddress: address(this),
        handlerFunctionSelector: this.onReactivation.selector,
        /* ... */
    });
    SomniaExtensions.subscribe(sub);
}
```

---

#### 7.1.7 `EpochCron.sol`

**Purpose:** Registered as a `BlockTick` subscriber. Filters to fire once per epoch (every N blocks). Calls `AgentOrchestrator.startPipeline()` with the vault's pre-funded agent budget.

```solidity
function onEvent(
    address emitter,
    bytes32[] calldata topics,
    bytes calldata data
) external onlyReactivityPrecompile {
    uint64 blockNumber = uint64(uint256(topics[1]));
    if (blockNumber % EPOCH_BLOCKS != 0) return;
    if (vault.agentRunning()) return;
    orchestrator.startPipeline{value: vault.agentBudgetPerEpoch()}();
}
```

---

#### 7.1.8 `PerformanceLedger.sol`

**Purpose:** Tracks per-vault and per-follower PnL, Sharpe ratio approximation, win rate, max drawdown, and trade history. Updated by `AgentOrchestrator` on each signal update and by `MirrorReactor` on each trade settlement.

**Key state:**
```solidity
struct VaultStats {
    int256 totalPnlBps;          // cumulative PnL in basis points
    uint256 peakEquity;          // for drawdown calculation
    uint256 maxDrawdownBps;      // max observed drawdown
    uint256 winCount;
    uint256 tradeCount;
    uint256 lastUpdated;
}

struct TradeRecord {
    uint256 epoch;
    int8 direction;
    uint16 sizeBps;
    uint256 entryPrice;
    uint256 exitPrice;
    int256 pnlBps;
    bytes32 reasoningHash;
    uint256 blockNumber;
}
```

**Events (subscribed to by StreamPublisher):**
```solidity
event DrawdownUpdated(address indexed vault, uint256 drawdownBps)
event TradeSettled(address indexed vault, address indexed follower, TradeRecord trade)
event EpochFeeSettled(address indexed vault, uint256 feesCollected, uint256 epoch)
```

---

#### 7.1.9 `FeeDistributor.sol`

**Purpose:** Holds performance fees accumulated from follower trades. On each `Schedule`-triggered settlement (daily), distributes earned fees to strategist wallet. Configurable fee: up to 20% of follower PnL on winning trades.

---

### 7.2 Backend Services

#### 7.2.1 `StreamPublisher` (TypeScript)

**Runtime:** Node.js 18+, deployed as a long-running service  
**Dependencies:** `@somnia-chain/streams`, `@somnia-chain/reactivity`, `viem`

**Purpose:** Listens via off-chain WebSocket reactivity to `SignalUpdated`, `TradeSettled`, and `DrawdownUpdated` events from all vaults. On each event, publishes a new record to the appropriate Data Stream schema.

**Environment variables:**
```
RPC_URL=https://dream-rpc.somnia.network
WS_RPC_URL=wss://dream-rpc.somnia.network
PRIVATE_KEY=0xPUBLISHER_WALLET_PRIVATE_KEY
VAULT_FACTORY_ADDRESS=0x...
```

**Schemas published (see Section 8 for full definitions):**
- `SignalStream` — one record per `SignalUpdated` event
- `PnLStream` — one record per `TradeSettled` event
- `VaultMetaStream` — updated on vault deployment and configuration changes

**Core subscription loop:**
```typescript
import { SDK as ReactivitySDK } from '@somnia-chain/reactivity'
import { SDK as StreamsSDK, SchemaEncoder } from '@somnia-chain/streams'

const reactivity = new ReactivitySDK({ rpcUrl: process.env.WS_RPC_URL })
const streams = new StreamsSDK({ public: publicClient, wallet: walletClient })

await reactivity.subscribe({
    emitter: null,   // all vaults — filter by known vault addresses in handler
    eventTopics: [SignalUpdated_TOPIC, null, null, null],
    ethCalls: [],
    onData: async (data) => {
        const vaultAddr = data.emitter
        if (!knownVaults.has(vaultAddr)) return

        const [direction, sizeBps, stopPrice, reasoningHash, reasoning]
            = decodeSignalUpdated(data.eventData)

        const schemaId = await streams.computeSchemaId(SIGNAL_SCHEMA)
        const enc = new SchemaEncoder(SIGNAL_SCHEMA)
        const payload = enc.encodeData([
            { name: 'timestamp',      value: String(Date.now()),    type: 'uint64' },
            { name: 'vault',          value: vaultAddr,              type: 'address' },
            { name: 'direction',      value: String(direction),      type: 'int8' },
            { name: 'sizeBps',        value: String(sizeBps),        type: 'uint16' },
            { name: 'stopPrice',      value: String(stopPrice),      type: 'uint256' },
            { name: 'reasoningHash',  value: reasoningHash,          type: 'bytes32' },
            { name: 'reasoning',      value: reasoning,              type: 'string' },
        ])
        const dataId = toHex(`${vaultAddr}-${Date.now()}`, { size: 32 })
        await streams.setAndEmitEvents({
            id: dataId, schemaId, data: payload,
            events: [{ somniaStreamsEventId: 'SignalUpdated', argumentTopics: [vaultAddr], data: payload }]
        })
    }
})
```

---

#### 7.2.2 `ReceiptStore` (TypeScript / Lightweight API)

**Purpose:** Agent receipts returned from Somnia Agents are potentially large (full chain-of-thought, source URLs, extracted content). The hash is stored onchain; the full receipt is stored off-chain and served via a simple HTTP API.

**Storage:** IPFS (via web3.storage or Pinata) keyed by the `keccak256` hash committed onchain. The frontend resolves `reasoningHash → IPFS CID → full receipt object`.

**Endpoints:**
```
POST /receipts/:hash       Store a receipt (called by orchestrator after agent callback)
GET  /receipts/:hash       Retrieve full receipt by hash
```

**Receipt schema (JSON):**
```json
{
  "hash": "0xabc...",
  "epoch": 1234567,
  "blockNumber": 8901234,
  "stages": [
    {
      "stage": 1,
      "type": "json_api",
      "url": "https://api.binance.com/...",
      "result": {"price": 98420.00},
      "validators": ["0x...", "0x...", "0x..."],
      "consensus": "majority"
    },
    {
      "stage": 2,
      "type": "llm_parse_website",
      "url": "https://alternative.me/crypto/fear-and-greed-index/",
      "extracted": {"fng_value": 27, "fng_label": "Fear"},
      "confidence": 94,
      "answerable": true
    },
    {
      "stage": 3,
      "type": "llm_infer_tools_chat",
      "model": "Qwen3-30B",
      "systemPrompt": "...",
      "userMessage": "...",
      "chainOfThought": "The funding rate is elevated at +0.087%, suggesting crowded longs...",
      "toolCalled": "updateSignal",
      "toolArgs": {"direction": -1, "sizeBps": 1500, "stopPrice": "100200000000000000000000"},
      "reasoning": "Reduce long exposure: elevated funding + fear at 27 = mean reversion setup"
    }
  ]
}
```

---

#### 7.2.3 `VaultIndexer` (TypeScript)

**Purpose:** Listens to `VaultDeployed` events from `VaultFactory` and maintains an in-memory (or Redis-backed) registry of all vault addresses, their metadata, and current stats. Serves the leaderboard API.

**Endpoints:**
```
GET /vaults                           List all vaults with stats
GET /vaults/:address                  Get single vault detail
GET /vaults/:address/signals          Get signal history (from Data Stream)
GET /vaults/:address/trades           Get trade history (from Data Stream)
GET /vaults/:address/receipt/:hash    Proxy to ReceiptStore
```

---

### 7.3 Frontend Application

**Stack:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, viem, wagmi, `@somnia-chain/streams`, `@somnia-chain/reactivity`

**RPC:** `https://dream-rpc.somnia.network` (HTTP) + `wss://dream-rpc.somnia.network` (WebSocket for reactivity)

---

#### 7.3.1 Pages

**`/` — Leaderboard**  
Displays all active vaults sorted by 30-day Sharpe ratio. Each card shows: vault name, current signal (direction + size as a visual indicator), 7d PnL%, follower count, last signal age.

Cards update live via off-chain WebSocket reactivity subscription to all `SignalUpdated` events. No polling.

**`/vault/[address]` — Vault Detail**  
- Current signal with full reasoning summary
- Live PnL chart (from PnLStream, updated via WebSocket)
- Signal history table: epoch, direction, size, stop, reasoning summary, receipt link
- Follower count and aggregate stats
- Subscribe / Unsubscribe button
- "View Audit Trail" for any signal row

**`/vault/[address]/audit/[reasoningHash]` — Audit Trail**  
Full agent receipt view:
- Stage 1: API calls made, raw JSON returned, extracted values, validator addresses
- Stage 2: URL scraped, extracted markdown snippet, confidence score, answerable flag
- Stage 3: System prompt, assembled user message, full LLM chain-of-thought, tool called, arguments
- Block number, transaction hashes, validator consensus proof

**`/follow` — Follower Dashboard**  
- Active subscriptions with entry signal, current PnL, stop price
- Subscription configuration editor
- Trade history with per-trade reasoning link

**`/deploy` — Deploy Vault**  
- Form: vault name, strategy description (natural language → stored as system prompt), performance fee, initial deposit
- Live strategy prompt preview showing how it will be formatted for `inferToolsChat`
- One-click deploy via `VaultFactory.deployVault()`

---

#### 7.3.2 Key React Hooks

**`useVaultSignal(vaultAddress)`**  
Subscribes to the vault's `SignalUpdated` events via `@somnia-chain/reactivity`. Returns current signal with live updates. Used on leaderboard cards and vault detail.

**`useVaultPnL(vaultAddress)`**  
Subscribes to `PnLStream` Data Stream via `@somnia-chain/streams`. Returns trade-by-trade PnL history for chart rendering.

**`useFollowerPositions(followerAddress)`**  
Reads follower's active subscriptions and current position state from `FollowerRegistry` via viem `readContract`.

**`useAgentPipelineStatus(vaultAddress)`**  
Polls (or subscribes) to `PipelineStarted` and `PipelineCompleted` events to show live agent pipeline status ("Fetching prices... Scraping news... LLM reasoning...").

---

## 8. Data Schemas (Somnia Data Streams)

All schemas are registered once at launch using `sdk.streams.registerDataSchemas()`.

**Schema strings are canonical** — even whitespace matters for schemaId computation.

---

### 8.1 SignalStream Schema

```typescript
export const SIGNAL_SCHEMA =
  'uint64 timestamp, address vault, int8 direction, uint16 sizeBps, uint256 stopPrice, bytes32 reasoningHash, string reasoning'

// schemaId = await sdk.streams.computeSchemaId(SIGNAL_SCHEMA)
```

**Field descriptions:**
- `timestamp` — Unix milliseconds when signal was committed
- `vault` — vault contract address
- `direction` — 1=LONG, -1=SHORT, 0=FLAT
- `sizeBps` — position size in basis points of vault (1000 = 10%)
- `stopPrice` — stop loss price (18 decimals)
- `reasoningHash` — keccak256 of IPFS receipt CID
- `reasoning` — one-sentence reasoning summary from LLM

**dataId pattern:** `toHex(`${vault}-${timestamp}`, { size: 32 })`

---

### 8.2 PnLStream Schema

```typescript
export const PNL_SCHEMA =
  'uint64 timestamp, address vault, address follower, int8 direction, uint256 entryPrice, uint256 exitPrice, int256 pnlBps, bytes32 signalHash'
```

**Field descriptions:**
- `pnlBps` — trade PnL in basis points (can be negative)
- `signalHash` — links this trade back to the signal that caused it

---

### 8.3 VaultMetaStream Schema

```typescript
export const VAULT_META_SCHEMA =
  'uint64 timestamp, address vault, address strategist, string name, uint16 performanceFeeBps, uint256 followerCount, int256 sharpe30dBps, uint256 maxDrawdownBps'
```

**Published:** on vault deployment, and updated each epoch after performance ledger settlement.

---

## 9. Agent Pipeline Specification

Full execution sequence per epoch:

```
T+0ms    EpochCron.onBlockTick() fires (block % 3000 == 0)
         → AgentOrchestrator.startPipeline()
         → createRequest(JSON_API, pricePayload)       requestId_1a
         → createRequest(JSON_API, fundingPayload)     requestId_1b
         → createRequest(JSON_API, oiPayload)          requestId_1c
         (3 parallel agent requests, total cost ~0.27 STT reward + operations reserve)

T+2-5s   Validator consensus on JSON API requests
         → handlePriceResponse(requestId_1a)    → run.priceReady = true
         → handleFundingResponse(requestId_1b)  → run.fundingReady = true  
         → handleOIResponse(requestId_1c)       → run.oiReady = true
         (when all 3 ready: _tryFireStage2())

T+5-15s  createRequest(LLM_PARSE, fearGreedPayload)    requestId_2a
         createRequest(LLM_PARSE, newsPayload)          requestId_2b
         (2 parallel website scrape requests, total cost ~0.60 STT reward)

T+20-30s Validator consensus on LLM Parse requests
         → handleParseResponse(requestId_2a)  → run.fngIndex = 27, fngLabel = "Fear"
         → handleNewsResponse(requestId_2b)   → run.macroSummary = "Ethereum faces..."
         (when both ready: _fireStage3())

T+30-45s Assemble full context prompt
         createRequest(LLM_INFERENCE, inferToolsChatPayload)  requestId_3
         (cost ~0.21 STT reward + operations reserve)

T+45-60s Validator consensus on inferToolsChat
         → handleInferResponse(requestId_3)
         → Decode LLM calldata: updateSignal(direction=-1, sizeBps=1500, ...)
         → vault.updateSignal(...)
         → emit SignalUpdated(...)
         → StreamPublisher publishes to SignalStream

T+60s    ON-CHAIN REACTIVITY FIRES (same block as SignalUpdated)
         → MirrorReactor.onEvent() executes for all followers
         → dreamDEX.placeOrder() for each active follower (same block)
         → StopReactor.onEvent() checks stop prices (same block)

         Total cost per epoch: ~1.08 STT base reward + ops reserves
         At $0.001/STT estimate: ~$0.001 per epoch
         Runs 288 times/day: ~$0.29/day per vault
```

---

## 10. On-chain Reactivity Subscriptions

Summary of all subscriptions created per vault:

| Subscription | Handler Contract | Event Subscribed | Emitter | Purpose |
|---|---|---|---|---|
| `MirrorSub` | `MirrorReactor` | `SignalUpdated` | vault | Place follower orders same block |
| `StopSub` | `StopReactor` | `SignalUpdated` | vault | Check + fire stop losses same block |
| `DrawdownSub` | `DrawdownGuard` | `DrawdownUpdated` | PerformanceLedger | Emergency exit when vault drawdown breached |
| `EpochSub` | `EpochCron` | `BlockTick` (wildcard) | Precompile | Fire agent pipeline every 3000 blocks |
| `ReactivateSub` | `DrawdownGuard` | `Schedule` (T+24h) | Precompile | Re-enable vault after emergency exit cooldown |
| `FeeSettleSub` | `FeeDistributor` | `Schedule` (daily midnight) | Precompile | Settle and distribute performance fees |

**All subscriptions require:**
- Owner holds ≥ 32 SOMI (funded from follower subscription fees by VaultFactory)
- `isGuaranteed: true` for MirrorSub and StopSub (critical path)
- `gasLimit: 500_000` for MirrorReactor (iterates over followers)

---

## 11. Full User Stories

### US-01: Strategy Provider — Deploy a Vault

**Actor:** Experienced crypto trader / quant  
**Goal:** Deploy an autonomous strategy vault with no ongoing manual operation

**Acceptance criteria:**
- Provider connects wallet and navigates to `/deploy`
- Enters vault name, natural-language strategy description (e.g., "Momentum breakout: go long when price breaks 20-day high and funding rate is below 0.05%. Exit if price drops 5% from entry or funding rises above 0.1%. Max position 20% of vault.")
- Sets performance fee (0–20%)
- Deposits initial SOMI for agent budget (minimum: 7-day runway at current epoch cost)
- Clicks Deploy — `VaultFactory.deployVault()` is called
- VaultFactory deploys vault + reactor contracts and registers all 6 subscriptions atomically
- Provider is redirected to `/vault/[newAddress]` and sees the vault in ACTIVE state
- First agent pipeline fires within 5 minutes (next EpochTick)

---

### US-02: Follower — Subscribe to a Vault

**Actor:** Retail trader who wants passive automated exposure  
**Goal:** Mirror a vault's signals with custom risk parameters

**Acceptance criteria:**
- Follower browses `/` leaderboard, sorts by 30-day PnL or Sharpe
- Clicks a vault card, reads the strategy description, views last 20 signal history with reasoning summaries
- Opens audit trail for 3 recent signals to verify agent reasoning quality
- Clicks Subscribe, enters risk config: 5% portfolio risk, max $500 position, 1% slippage
- Approves token spend + calls `vault.subscribe(config)` — single transaction
- From the next signal update, follower's order is placed atomically in the same block

---

### US-03: Follower — Monitor Active Position

**Actor:** Active follower  
**Goal:** See live PnL and current position without polling

**Acceptance criteria:**
- Opens `/follow` dashboard
- Sees active vault subscriptions with current position direction, entry price, live unrealised PnL
- PnL updates in real time via WebSocket (off-chain reactivity) — no manual refresh needed
- Can see the exact reasoning that caused the entry signal (link to audit trail)
- Can see that their stop price is set and will fire reactively if breached

---

### US-04: Follower — Inspect an Agent Reasoning Trail

**Actor:** Sceptical follower wanting to verify an AI decision  
**Goal:** Understand exactly why the agent took a specific position

**Acceptance criteria:**
- Navigates to `/vault/[address]/audit/[reasoningHash]`
- Sees Stage 1 data: exact API URLs called, raw JSON returned, extracted values
- Sees Stage 2 data: which page was scraped, extracted markdown snippet, confidence 94/100
- Sees Stage 3 data: full LLM chain-of-thought ("Funding rate at +0.087% indicates crowded longs..."), tool called (`updateSignal`), arguments
- Sees block number and the 3 validator addresses who independently reached consensus
- Can verify the reasoning hash matches what is stored on-chain in `StrategyVault.currentSignal.reasoningHash`

---

### US-05: Emergency Exit (Automated)

**Actor:** DrawdownGuard contract  
**Goal:** Protect all followers when vault's aggregate drawdown exceeds threshold

**Acceptance criteria:**
- Vault's PnL drops 20% (configured threshold)
- `PerformanceLedger` emits `DrawdownUpdated(vault, 2000)` (2000 bps = 20%)
- `DrawdownGuard.onEvent()` fires in the same block (reactive)
- Calls `vault.emergencyExit()` → emits `EmergencyExit`
- `MirrorReactor` fires (reactive to `EmergencyExit`), calls `dex.closePosition()` for all followers in same block
- Vault enters PAUSED state; agent pipeline disabled
- `Schedule` subscription registered for 24h later
- At T+24h, `DrawdownGuard.onReactivation()` fires, vault returns to ACTIVE

---

### US-06: Ecosystem Consumer — Read Signal Stream from Another Contract

**Actor:** A Somnia lending protocol developer  
**Goal:** Use vault performance as a collateral factor

**Acceptance criteria:**
- Reads `PnLStream` for vault at `(schemaId, vaultPublisherAddress)` using `sdk.streams.getAllPublisherDataForSchema()`
- Computes rolling 30-day Sharpe from returned records
- Sets follower borrowing rate: `baseRate - 0.5%` if follower's primary vault Sharpe > 1.5
- No API call to SignalVault frontend. No trust in SignalVault operator. Data is on-chain.

---

## 12. End-to-End Demo Flow

This section describes the exact live demo sequence, step by step, suitable for a 7-minute conference or hackathon presentation.

### Setup (before demo, done in advance)
- One vault deployed with strategy: "ETH momentum on WETH:USDso, max 25% position, exit above 0.1% funding"
- Vault has 3 days of signal history with reasoning trails
- Three follower wallets pre-subscribed with different risk configs (5%, 10%, 15%)
- `StreamPublisher` running, Data Streams populated with 72 signal records
- A second demo contract (mock lending protocol) deployed that reads `PnLStream`

---

### Demo Step 1: The Leaderboard (0:00–1:00)

Open `https://signalvault.app/` (or localhost).

Show the live leaderboard. Point out that cards are updating in real time — no refresh button, no polling. Explain: "This is Somnia's off-chain reactivity — the chain pushes signal events to the browser the instant they're committed. Zero polling."

Point at one vault card: name, current signal (SHORT 15%), 7d PnL (+4.2%), 3 followers.

---

### Demo Step 2: The Vault Detail + Signal History (1:00–2:30)

Click into the vault. Show signal history table:

| Epoch | Signal | Size | Reasoning |
|---|---|---|---|
| 8,901,234 | SHORT | 15% | "Funding +0.092%, F&G=24 (Extreme Fear), reduce long" |
| 8,898,234 | LONG | 20% | "Breakout above $98,400, funding neutral, momentum confirmed" |
| 8,895,234 | FLAT | 0% | "Mixed signals: high OI but macro negative, stay neutral" |

Click "View Audit Trail" on the SHORT signal.

---

### Demo Step 3: The Audit Trail (2:30–4:00)

Show the full audit page for the SHORT signal. Walk through the three stages:

**Stage 1 (JSON API):** "The agent read the Protofire ETH/USD oracle at $3,420 and CoinGecko 24h change at +0.92%. Three validators independently called these endpoints and all got the same numbers — that's how consensus works."

**Stage 2 (LLM Parse Website):** "The agent browsed Alternative.me — a JavaScript-rendered page — and extracted Fear & Greed: 24, labelled 'Extreme Fear'. Confidence: 97/100. No API for this exists — the agent used a real browser."

**Stage 3 (LLM inferToolsChat):** Show the chain-of-thought:
> *"Funding rate at +0.092% is approaching the 0.1% exit threshold. Fear & Greed at 24 indicates extreme fear — historically a mean reversion indicator but also consistent with a continuation sell-off. Current position is LONG 20%. Given the elevated funding (cost of carry) and negative macro sentiment, reducing long exposure to 15% with a tighter stop is the risk-adjusted decision. Calling updateSignal(direction=1, sizeBps=1500, stopPrice=96500...)."*

"This is Qwen3-30B, run with temperature zero on Somnia's validator network. Every validator ran the exact same inference. The hash of this receipt is committed to the vault contract. Anyone can verify it."

---

### Demo Step 4: Trigger a Live Signal (4:00–5:30)

"Now let's watch it happen live."

Manually trigger the epoch (call `EpochCron.triggerNow()` — a demo-only function) or wait for the next natural epoch.

Watch the agent pipeline status bar appear in the UI (populated by `PipelineStarted` event + WebSocket):

```
[●●●○] Stage 1: Fetching price, funding rate, open interest...
[●●●●] Stage 1 complete: ETH $3,420 | Funding +0.041% | Fear/Greed 28
[●●●○] Stage 2: Scraping Fear & Greed...
[●●●●] Stage 2 complete: F&G 31 (Fear) | Headline: "ETF outflows slow..."
[●●●○] Stage 3: LLM reasoning...
[●●●●] Stage 3 complete: Decision → LONG 20%, stop $96,000
```

Signal card flips: "SHORT 15%" → "LONG 20%".

"And simultaneously" — show the explorer tab — "in the same block as that signal update, three follower orders were placed on dreamDEX. Block 8,904,567. Signal callback: tx 0xabc. Follower order 1: tx 0xdef. Follower order 2: tx 0xghi. Follower order 3: tx 0xjkl. All same block."

"There is no copy. There is no delay. There is no bot. The chain did this."

---

### Demo Step 5: The Composable Truth Layer (5:30–6:30)

Open the mock lending protocol page. Show the rate table:

| Follower | Vault Sharpe (30d) | Borrowing Rate |
|---|---|---|
| 0xAlice | 1.82 | Base -0.5% |
| 0xBob | 0.94 | Base |
| 0xCarol | 2.11 | Base -0.5% |

"This rate table is computed directly from the PnLStream Data Stream — not from our API, not from a trusted source. Any protocol on Somnia can read this stream. The vault's performance is a protocol-native primitive."

---

### Demo Step 6: The Summary (6:30–7:00)

"To summarise what Somnia made possible here:

1. **JSON API Agent** — trustless, consensus-validated price and funding data, no oracle dependency
2. **LLM Parse Website Agent** — real-time macro context from JS-rendered pages with no API
3. **inferToolsChat Agent** — deterministic AI reasoning that yields trade calldata, auditable forever
4. **On-chain Reactivity** — follower execution in the same block as the signal, no bots, no latency
5. **EpochTick** — strategy loop running continuously without any off-chain infrastructure
6. **Data Streams** — vault performance as a composable protocol primitive, readable by any contract

None of this — not a single piece — works on any other chain."

---

## 13. Error Handling & Edge Cases

| Scenario | Handling |
|---|---|
| Stage 1 agent times out | `PipelineFailed` event emitted, `agentRunning = false`, next epoch retries normally |
| Stage 2 parse returns `answerable=false` | Use cached F&G value from previous epoch; proceed to Stage 3 with staleness flag |
| Stage 3 LLM returns unexpected tool call | Revert in callback, emit `UnexpectedToolCall`, vault keeps current signal |
| Signal unchanged (LLM decides to hold) | Still emits `SignalUpdated` with same values (followers don't re-place orders if direction/size unchanged — checked in MirrorReactor) |
| Follower has insufficient balance for DEX order | Order attempt fails; caught in `try/catch` in MirrorReactor; `FollowerOrderFailed` emitted |
| MirrorReactor SOMI balance drops below 32 | `LowReactivityBalance` emitted; VaultFactory auto-tops up from subscriber fee pool |
| dreamDEX market closed / halted | MirrorReactor catches failure, schedules retry for next block |
| Vault strategist withdraws all SOMI | Agent pipeline fails at Stage 1 (no budget); vault enters INACTIVE state |

---

## 14. Security Considerations

**Agent callback verification:** All `handleResponse` functions must verify `msg.sender == address(platform)` and that `requestId` is in `pendingRequests`. Without this, anyone can spoof a callback.

**Reactivity handler verification:** All `onEvent` handlers must verify `msg.sender == SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS`. Without this, anyone can spoof system events.

**Re-entrancy in MirrorReactor:** The follower iteration in `onEvent` must use a checks-effects-interactions pattern. Use `nonReentrant` modifier. Order placement calls are wrapped in `try/catch`.

**Strategy prompt injection:** The strategy prompt stored in the vault is a fixed string set at deployment. It cannot be modified post-deployment (immutable after first epoch run). This prevents a malicious strategist from changing the LLM's behaviour after attracting followers.

**Performance fee cap:** Hard-coded maximum of 20% performance fee in `VaultFactory`. Cannot be set higher regardless of strategist input.

**Follower fund custody:** `MirrorReactor` never holds follower funds. Orders are placed directly from follower-approved positions on dreamDEX. The vault contract never holds follower funds beyond the subscription deposit (used only for reactor SOMI top-up).

**Agent budget drain:** The agent budget is a separate vault balance from the strategist's personal wallet. The strategist can top up but cannot drain beyond the committed `agentBudgetPerEpoch` per epoch. A minimum 7-day runway is enforced at deployment.

---

## 15. Environment & Network Configuration

### Somnia Testnet
```
Chain ID:          50312
RPC HTTP:          https://dream-rpc.somnia.network
RPC WebSocket:     wss://dream-rpc.somnia.network
Explorer:          https://testnet.somniascan.io
Native currency:   STT (test tokens — request in Discord #dev-chat, tag @emreyeth)
AgentRequester:    0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776
Agent Code Gen:    https://agents.somnia.network
```

### Somnia Mainnet
```
Chain ID:          5031
RPC HTTP:          https://mainnet-rpc.somnia.network (verify current via docs)
Explorer:          https://somniascan.io
Native currency:   SOMI
AgentRequester:    0x5E5205CF39E766118C01636bED000A54D93163E6
Protofire ETH/USD (testnet): 0xd9132c1d762D432672493F640a63B758891B449e
Protofire ETH/USD: 0xeC25a820A6F194118ef8274216a7F225Da019526
```

### NPM Packages
```bash
npm install @somnia-chain/streams @somnia-chain/reactivity viem wagmi
```

### Foundry Config (`foundry.toml`)
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.20"

[rpc_endpoints]
somnia_testnet = "https://dream-rpc.somnia.network"
somnia_mainnet = "https://mainnet-rpc.somnia.network"

[etherscan]
somnia_testnet = { key = "placeholder", url = "https://testnet.somniascan.io/api" }
```

### Key Documentation Links

| Topic | URL |
|---|---|
| Agents — Invoking from Solidity | https://docs.somnia.network/agents/invoking-agents/from-solidity |
| Agents — Code Generator | https://agents.somnia.network |
| Agents — Gas Fees | https://docs.somnia.network/agents/invoking-agents/gas-fees |
| Reactivity — What is Reactivity | https://docs.somnia.network/developer/reactivity/what-is-reactivity |
| Reactivity — Subscriptions | https://docs.somnia.network/developer/reactivity/subscriptions-the-core-primitive |
| Reactivity — System Events | https://docs.somnia.network/developer/reactivity/system-events |
| Reactivity — On-chain Tutorial | https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial |
| Reactivity — Gas Configuration | https://docs.somnia.network/developer/reactivity/gas-configuration |
| Data Streams — What is SDS | https://docs.somnia.network/developer/data-streams/what-is-somnia-data-streams |
| Data Streams — SDK Methods | https://docs.somnia.network/somnia-data-streams/getting-started/sdk-methods-guide |
| Data Streams — Intersection with Reactivity | https://docs.somnia.network/developer/data-streams/concepts/intersection-with-somnia-reactivity |
| Oracles — Protofire Price Feeds | https://docs.somnia.network/developer/building-dapps/oracles/protofire-price-feeds |
| Network Info | https://docs.somnia.network/developer/network-info |
| Hardhat / Foundry Setup | https://docs.somnia.network/developer/development-frameworks |

---

## 16. Glossary

| Term | Definition |
|---|---|
| **AgentOrchestrator** | Contract managing the 3-stage agent pipeline per epoch |
| **Basis Points (bps)** | 1/100 of a percent. 100 bps = 1%. Used for position sizes and PnL. |
| **Callback** | The `handleResponse()` function called by the Somnia Agents platform when validator consensus is reached |
| **createRequest** | The Somnia Agents platform function that initiates an off-chain agent computation |
| **dreamDEX** | Fully on-chain CLOB DEX on Somnia — the order execution venue for SignalVault |
| **EpochTick** | A periodic on-chain cron implemented via BlockTick subscription; fires the agent pipeline every N blocks |
| **inferToolsChat** | The most powerful LLM agent method: multi-turn with on-chain tool calling; yields ABI calldata back to the contract |
| **IceDB** | Somnia's custom storage layer replacing LevelDB; enables deterministic gas and high-throughput I/O |
| **LLM Parse Website** | Somnia agent that uses a real browser to scrape JS-rendered pages and extracts structured fields via LLM |
| **MirrorReactor** | On-chain reactive handler that places follower orders in the same block as a vault signal update |
| **MultiStream Consensus** | Somnia's consensus mechanism: each validator publishes a personal data chain; a consensus chain periodically finalises them |
| **PnLStream** | Somnia Data Stream schema publishing per-trade PnL records for vault composability |
| **ReceiptHash** | keccak256 of an agent execution receipt's IPFS CID; committed on-chain as proof of reasoning |
| **Schedule** | Somnia system event: a one-shot reactive callback at a specific millisecond timestamp |
| **SchemaId** | keccak256 of a schema string; the globally deterministic identifier for a Somnia Data Streams schema |
| **SignalStream** | Somnia Data Stream schema publishing vault signal updates for external consumption |
| **SOMI / STT** | Somnia's native token (SOMI on mainnet, STT on testnet); used for gas, agent deposits, and reactivity funding |
| **StrategyVault** | Core EVM contract holding signal state, follower config, reasoning hashes, and agent pipeline pointer |
| **Subcommittee** | The subset of validators elected to execute a specific agent request (default size: 3) |
| **Synthetic Transaction** | A transaction inserted by validators into a block in response to a reactive subscription; not submitted by any user |
| **VaultFactory** | Factory contract for deploying vaults and their supporting reactor/subscription infrastructure atomically |
