# SignalVault

**The first autonomous social trading protocol where a strategy agent publishes its full reasoning on-chain and followers mirror execution in the same block — no off-chain bots, no trusted curator, no copy-paste.**

SignalVault solves copy trading's fundamental trust problem: followers cannot verify what they are copying. On centralized exchanges, strategy providers are black boxes. Off-chain wallet trackers are surveillance, not automation — by the time a follower reacts, the edge is gone. SignalVault deploys on **Somnia Agentic L1**, where on-chain AI agents fetch consensus-validated market data, reason over macro sentiment, commit every decision with a verifiable reasoning hash, and trigger follower orders via **Somnia Reactivity** in the **same block** as the signal. Vault performance is published to **Somnia Data Streams**, making strategy intelligence a composable protocol primitive.

---

## Important Links

| Resource | URL |
|----------|-----|
| **Live Demo** | [View](https://signal-vault-nine.vercel.app/) |
| **Demo Video** | *Coming soon* |
| **Pitch Deck** | *Coming soon* |

### Deployed Contracts (Somnia Testnet — Chain ID `50312`)

| Contract | Address | Explorer |
|----------|---------|----------|
| **VaultFactory** | `0x5C5E7222C2Ed5DE198398F67d7574cAa87012E9e` | [View](https://shannon-explorer.somnia.network/address/0x5C5E7222C2Ed5DE198398F67d7574cAa87012E9e) |
| **StrategyVault (impl)** | `0xB1002E371F990313Df28F562Dd2A1c979AD94FA4` | [View](https://shannon-explorer.somnia.network/address/0xB1002E371F990313Df28F562Dd2A1c979AD94FA4) |
| **AgentOrchestrator (impl)** | `0xB3a4ea0d2bdc96Bf6a29ae04ec90c6a9e9d28214` | [View](https://shannon-explorer.somnia.network/address/0xB3a4ea0d2bdc96Bf6a29ae04ec90c6a9e9d28214) |
| **MirrorReactor (impl)** | `0xfB8368D044C8B514AC182e0Ba0C29AEB660B417a` | [View](https://shannon-explorer.somnia.network/address/0xfB8368D044C8B514AC182e0Ba0C29AEB660B417a) |
| **StopReactor (impl)** | `0xA51eF1F8d804BAbA0e65073A9b5f2b1a58b03b44` | [View](https://shannon-explorer.somnia.network/address/0xA51eF1F8d804BAbA0e65073A9b5f2b1a58b03b44) |
| **DrawdownGuard (impl)** | `0xF8119f8d66b3A1b9700783b08130875025f052D1` | [View](https://shannon-explorer.somnia.network/address/0xF8119f8d66b3A1b9700783b08130875025f052D1) |
| **EpochCron (impl)** | `0xE38D9E7Aebd6818114261c9E79EaBee4BA497Eaa` | [View](https://shannon-explorer.somnia.network/address/0xE38D9E7Aebd6818114261c9E79EaBee4BA497Eaa) |
| **PerformanceLedger (impl)** | `0x4a595A20899993d2e1Bbd3543693EDF978580f20` | [View](https://shannon-explorer.somnia.network/address/0x4a595A20899993d2e1Bbd3543693EDF978580f20) |
| **FeeDistributor (impl)** | `0x06bCf35346D903CB82853F64443a17D78bb94671` | [View](https://shannon-explorer.somnia.network/address/0x06bCf35346D903CB82853F64443a17D78bb94671) |
| **Demo StrategyVault** | `0x6DE77BacB732A060549465999f895A1f4FdE3158` | [View](https://shannon-explorer.somnia.network/address/0x6DE77BacB732A060549465999f895A1f4FdE3158) |
| **Demo AgentOrchestrator** | `0x96D2D03b901d6b416795a726c28D975f115a51b5` | [View](https://shannon-explorer.somnia.network/address/0x96D2D03b901d6b416795a726c28D975f115a51b5) |
| **Demo MirrorReactor** | `0x5a213B28E1Cf0cC1Fc8E0E1Bc9f6cf0F5Fe4a066` | [View](https://shannon-explorer.somnia.network/address/0x5a213B28E1Cf0cC1Fc8E0E1Bc9f6cf0F5Fe4a066) |
| **Demo StopReactor** | `0xA5F46aF29A00398A024E2c7155e3Dc7892a5CEF1` | [View](https://shannon-explorer.somnia.network/address/0xA5F46aF29A00398A024E2c7155e3Dc7892a5CEF1) |
| **Demo DrawdownGuard** | `0xa3569d967bB70E04160286301d4A0130a852d431` | [View](https://shannon-explorer.somnia.network/address/0xa3569d967bB70E04160286301d4A0130a852d431) |
| **Demo EpochCron** | `0xeD5d2e89B7f92dae60E41d9f5239c22a869eAf94` | [View](https://shannon-explorer.somnia.network/address/0xeD5d2e89B7f92dae60E41d9f5239c22a869eAf94) |
| **Demo PerformanceLedger** | `0x92997bc11aEA5437b51275e75259f0DA1058A2fF` | [View](https://shannon-explorer.somnia.network/address/0x92997bc11aEA5437b51275e75259f0DA1058A2fF) |
| **Demo FeeDistributor** | `0xBAB99BF7610626A16fAbDe5c522DaD8bAfDaADc0` | [View](https://shannon-explorer.somnia.network/address/0xBAB99BF7610626A16fAbDe5c522DaD8bAfDaADc0) |
| **SharpeGatedLending** | `0xc8F4E595f3C4ad57682ED48C52C3467EA67dBD97` | [View](https://shannon-explorer.somnia.network/address/0xc8F4E595f3C4ad57682ED48C52C3467EA67dBD97) |
| **dreamDEX WETH Pool** | `0xD180195da5459C7a0DEA188ed61216ec43682b50` | [View](https://shannon-explorer.somnia.network/address/0xD180195da5459C7a0DEA188ed61216ec43682b50) |
| **Somnia Agent Platform** | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` | [View](https://shannon-explorer.somnia.network/address/0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776) |
| **Reactivity Precompile** | `0x0000000000000000000000000000000000000100` | [View](https://shannon-explorer.somnia.network/address/0x0000000000000000000000000000000000000100) |
| **Protofire ETH/USD Oracle** | `0xd9132c1d762D432672493F640a63B758891B449e` | [View](https://shannon-explorer.somnia.network/address/0xd9132c1d762D432672493F640a63B758891B449e) |

### Somnia Agent IDs (Testnet)

| Agent | ID | Cost (per validator) |
|-------|-----|----------------------|
| JSON API Agent | `13174292974160097713` | 0.03 STT |
| LLM Parse Website Agent | `12875401142070969085` | 0.10 STT |
| LLM inferToolsChat Agent | `12847293847561029384` | 0.07 STT |

Subcommittee size: **3 validators** per agent request.

---

## Table of Contents

1. [Introduction](#introduction)
2. [The Problem](#the-problem)
3. [Our Solution](#our-solution)
4. [A Case Study](#a-case-study)
5. [How It All Works](#how-it-all-works)
6. [How Somnia's Agentic L1 Infra Powers SignalVault](#how-somnias-agentic-l1-infra-powers-signalvault)
7. [The Smart Contracts](#the-smart-contracts)
8. [How to Demo](#how-to-demo)
9. [Conclusion](#conclusion)

---

## Introduction

SignalVault is a fully autonomous social trading protocol built exclusively on **Somnia Agentic L1**. A strategy provider deploys a `StrategyVault` smart contract, defines a natural-language strategy ruleset, and funds an agent pipeline with STT. From that point forward, an autonomous loop — powered by Somnia's on-chain agent infrastructure — fetches live market data, scrapes macro sentiment from the web, synthesizes both into a trading decision via deterministic LLM inference, and commits the signed signal with its full reasoning trail to on-chain state.

Followers subscribe to a vault with configurable risk parameters. When the agent updates the signal, on-chain reactive handlers fire in the **same block** and place each follower's scaled order on **dreamDEX**. The vault's live PnL, Sharpe ratio, and per-trade history are published to **Somnia Data Streams**, making vault performance a composable, protocol-native data layer readable by any other Somnia contract.

**Repository structure:**

```
SignalVault/
├── contracts/          # Solidity — vault system, reactors, dreamDEX adapter
├── backend/            # Express API — indexers, stream publisher, mirror worker
├── frontend/           # Next.js — deploy wizard, vault dashboard, audit trail
└── docs/               # Product requirements and architecture notes
```

---

## The Problem

Copy trading has existed for over a decade. It remains broken in three fundamental ways:

| Problem | Description |
|---------|-------------|
| **Trust** | Strategy providers on CEX copy-trading are black boxes. Track records are curated. Reasoning is hidden. Historical PnL can be cherry-picked. Followers have no independent verification. |
| **Latency** | Off-chain copy approaches (wallet tracking, Telegram bots) are surveillance, not automation. By the time a follower observes a move and submits a transaction, the market has moved. MEV bots can front-run mempool observers. |
| **AI Opacity** | AI-assisted trading tools make decisions in opaque black boxes. There is no way to audit what data the model consumed, what it reasoned, or whether the same inputs would produce the same output again. |

**The gap:** No system exists where strategy logic is auditable on-chain, agent inputs are consensus-validated, AI reasoning is committed and verifiable, follower execution is atomically bound to the signal with zero latency gap, and no operator can interfere with any step.

---

## Our Solution

SignalVault makes signal publication and follower mirroring a **single atomic operation** on Somnia:

```
Strategy Agent produces signal in block N
        ↓
MirrorReactor places follower orders in block N
        ↓
PerformanceLedger records PnL → Data Streams publish composable output
```

| Stakeholder | What SignalVault Provides |
|-------------|---------------------------|
| **Strategy Provider** | Deploy a vault in one transaction. Define strategy in natural language. Autonomous loop runs indefinitely. Performance is publicly verifiable. Earn performance fees. |
| **Follower** | Subscribe once with risk config. Orders placed automatically in the same block as every signal. Full reasoning trail inspectable. Emergency exit on drawdown breach. |
| **Ecosystem** | Vault signals and PnL published to Data Streams. Any Somnia contract reads live performance as a primitive — lending rates, DAO gating, structured products. |

---

## A Case Study

**Meet Alex — an independent crypto trader with 2 years of experience.**

Alex follows three "alpha" wallets on Arkham and manually copies their ETH trades on a CEX. Last month:

- Alex saw a wallet go long ETH at $3,400. By the time Alex placed the order, ETH was at $3,428 — the edge was gone.
- One wallet rotated to short without Alex noticing for 40 minutes. Alex held the long through a -4% drawdown.
- A fourth wallet Alex followed turned out to be wash-trading; the "track record" was fabricated off-chain.

Alex discovers SignalVault on Somnia testnet:

1. **Verification before subscribing** — Alex opens the demo vault audit page and reads the last signal's full chain: ETH price from JSON API agent, Fear & Greed index scraped from `alternative.me` via LLM Parse Website, macro headline from CoinDesk, and the LLM's one-sentence reasoning. Every input is a verifiable agent receipt.

2. **One-click subscribe** — Alex sets 10% risk, $500 max position, 1% slippage tolerance. One wallet signature.

3. **Same-block execution** — When the vault agent fires `SignalUpdated`, Alex's `MirrorReactor` places an IOC order on dreamDEX in the **same block**. Alex inspects the block on Shannon Explorer: agent callback → signal update → mirror order — all atomic.

4. **Drawdown protection** — Alex configured a vault with 20% max drawdown. If breached, `DrawdownGuard` triggers `emergencyExit()` via Somnia Schedule reactivity — no off-chain monitor required.

5. **Composability** — Alex's Sharpe-gated lending position on another protocol reads the vault's live Sharpe from `PerformanceLedger` via Data Streams and receives a 0.5% borrow rate discount.

**Without SignalVault:** Alex trusts opaque wallets, reacts late, and has no audit trail.  
**With SignalVault + Somnia:** Alex verifies reasoning, mirrors atomically, and benefits from composable on-chain performance data.

---

## How It All Works

### End-to-End Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STRATEGY PROVIDER                                 │
│  Deploy Vault (VaultFactory) → Fund Agent → Define Strategy Prompt          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTONOMOUS AGENT LOOP                               │
│                                                                             │
│  EpochTick (Somnia Reactivity)                                              │
│       │                                                                     │
│       ▼                                                                     │
│  EpochCron → AgentOrchestrator.startPipeline()                              │
│       │                                                                     │
│       ├── Stage 1: Protofire Oracle + JSON API Agent (price, funding)       │
│       ├── Stage 2: LLM Parse Website (Fear & Greed, news headlines)         │
│       └── Stage 3: inferToolsChat → updateSignal() on StrategyVault         │
│                                                                             │
│  StrategyVault emits SignalUpdated                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼────────────────┐
                    ▼                 ▼                ▼
           MirrorReactor      StopReactor        DrawdownGuard
           (same block)       (stop checks)      (Schedule on breach)
                    │                 │                │
                    ▼                 ▼                ▼
              dreamDEX IOC       dreamDEX close    emergencyExit()
                    │                                  │
                    ▼                                  ▼
           PerformanceLedger ←─────────────────────────┘
                    │
                    ▼
           Somnia Data Streams (Signal, PnL, VaultMeta)
                    │
                    ▼
           Frontend / Composability (SharpeGatedLending)
```

### Phase 1 — Vault Deployment

A strategist calls `VaultFactory.deployVault(strategyPrompt, performanceFeeBps, maxDrawdownBps)` with an STT deposit. In a **single transaction**, the factory:

- Clones 8 implementation contracts (vault, orchestrator, 3 reactors, ledger, fees, cron)
- Initializes all contracts with the strategy prompt and risk parameters
- Wires `MirrorReactor`, `StopReactor`, `DrawdownGuard` to the vault
- Authorizes orchestrator and mirror reactor on `PerformanceLedger`
- Splits STT deposit 50/50 between `AgentOrchestrator` and `EpochCron`
- Deploys a per-vault `DreamDexAdapter` pointed at the dreamDEX WETH pool
- Transfers ownership to the strategist
- Emits `VaultDeployed`

The frontend **Launch Wizard** then guides the strategist through wallet-signed post-deploy setup:

1. Register 4 Somnia Reactivity subscriptions (Mirror, Stop, Drawdown, Epoch)
2. Fund `EpochCron` with STT for autonomous pipeline triggers
3. Trigger the first agent pipeline run

### Phase 2 — Autonomous Agent Pipeline

Every epoch (~5 minutes), `EpochCron` receives an `EpochTick` system event from the Somnia Reactivity precompile and calls `AgentOrchestrator.startPipeline()`:

| Stage | Agent | Input | Output |
|-------|-------|-------|--------|
| 1a | Protofire Oracle | On-chain Chainlink-style feed | ETH/USD price (cents) |
| 1b | JSON API Agent | CoinGecko API | 24h price change (funding proxy) |
| 2a | LLM Parse Website | `alternative.me` | Fear & Greed Index (0–100) |
| 2b | LLM Parse Website | `coindesk.com/tag/ethereum` | Macro news summary |
| 3 | inferToolsChat | All above + strategy prompt | `updateSignal()` or `emergencyExit()` calldata |

The orchestrator executes the LLM's tool call on `StrategyVault`, which emits `SignalUpdated(signalHash, direction, sizeBps, stopPrice, reasoningSummary, reasoningHash)`.

### Phase 3 — Same-Block Follower Mirroring

`MirrorReactor` is subscribed to `SignalUpdated` on the vault. When the event fires:

1. Reads dreamDEX mark price via `DreamDexAdapter.getMarkPrice()`
2. Iterates all active followers from `StrategyVault.getFollowers()`
3. Scales position: `quoteNotional = maxPositionSize × sizeBps × riskPct / (10000 × 100)`
4. Calls `dreamDEX.placeOrder()` with IOC order type
5. Records open leg on `PerformanceLedger`

All of this executes as a **synthetic transaction in the same block** as the signal — enabled exclusively by Somnia Reactivity.

### Phase 4 — Data Streams & Composability

The backend `StreamPublisher` listens to on-chain events via Somnia Reactivity WebSocket SDK and publishes typed records to three Data Stream schemas:

- **SignalStream** — direction, size, stop, reasoning hash, reasoning summary
- **PnLStream** — per-follower trade settlements with entry/exit prices
- **VaultMetaStream** — strategist, fee bps, follower count, Sharpe, max drawdown

Any Somnia contract or off-chain consumer can subscribe to these streams. `SharpeGatedLending` demonstrates composability: it reads `PerformanceLedger.getSharpeApprox()` and discounts borrow rates for high-Sharpe vaults.

### Phase 5 — Risk Management

| Component | Trigger | Action |
|-----------|---------|--------|
| **StopReactor** | `SignalUpdated` with stop price | Checks follower positions against adjusted stop; closes via dreamDEX |
| **DrawdownGuard** | `DrawdownUpdated` from ledger | If drawdown ≥ threshold → `emergencyExit()` + 24h cooldown via Schedule |
| **FeeDistributor** | Schedule subscription | Distributes accumulated performance fees to strategist |

---

## How Somnia's Agentic L1 Infra Powers SignalVault

This section documents **every** Somnia primitive used in SignalVault, with implementation references.

---

### 1. Somnia Agents — Agent Requester Platform

**What it is:** The on-chain gateway (`0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`) through which smart contracts invoke Somnia's distributed agent network. Validators independently execute agent requests; consensus ensures deterministic results.

**Role in SignalVault:** `AgentOrchestrator` is an `IAgentRequesterHandler` — it creates agent requests, receives callbacks from the platform, and advances a multi-stage pipeline.

**Initialization — wiring the platform:**

```83:90:contracts/src/core/AgentOrchestrator.sol
    function initialize(address _platform, address _vault, address _owner, string calldata _strategyPrompt) external {
        require(!_initialized, "already initialized");
        _initialized = true;
        platform = IAgentRequester(_platform);
        vault = _vault;
        owner = _owner;
        strategyPrompt = _strategyPrompt;
    }
```

`VaultFactory` passes `AGENT_PLATFORM` (`0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`) during deployment.

**Agent ID constants:**

```20:27:contracts/src/core/AgentOrchestrator.sol
    uint256 public constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 public constant LLM_PARSE_AGENT_ID = 12875401142070969085;
    uint256 public constant LLM_INFER_AGENT_ID = 12847293847561029384;

    uint256 public constant JSON_FETCH_COST_PER_AGENT = 0.03 ether;
    uint256 public constant LLM_PARSE_COST_PER_AGENT = 0.10 ether;
    uint256 public constant LLM_INFER_COST_PER_AGENT = 0.07 ether;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
```

---

### 2. JSON API Agent — Consensus-Validated HTTP Fetch

**What it is:** Fetches any public HTTP JSON endpoint. Each of 3 elected validators independently performs the fetch; consensus is reached when a majority returns identical results. Cost: **0.03 STT per validator**.

**Role in SignalVault:** Stage 1b — fetches 24h ETH price change from CoinGecko as a funding-rate sentiment proxy.

**Solidity invocation:**

```247:258:contracts/src/core/AgentOrchestrator.sol
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
```

**Callback — advancing pipeline:**

```263:283:contracts/src/core/AgentOrchestrator.sol
    function handleFundingResponse(
        uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory
    ) external onlyPlatform {
        require(pendingRequests[requestId], "unknown request");
        delete pendingRequests[requestId];

        uint256 runId = requestToRun[requestId];
        PipelineRun storage run = runs[runId];
        if ((run.flags & 8) != 0) return;

        run.fetchedFunding = abi.decode(responses[0].result, (uint256));
        run.flags |= 2; // fundingReady
        emit StageCompleted(runId, "funding", requestId);

        _tryFireStage2(runId);
    }
```

**Why Somnia-only:** Other chains require off-chain keepers or trusted oracles. Somnia validators execute the API call in consensus — every validator independently fetched the same data.

---

### 3. Protofire ETH/USD Oracle — On-Chain Price Anchor

**What it is:** Chainlink-compatible price feed on Somnia testnet (`0xd9132c1d762D432672493F640a63B758891B449e`).

**Role in SignalVault:** Stage 1a — reliable ETH/USD spot price read synchronously before agent callbacks return. Also used by `PerformanceLedger` for mark-to-market and `VaultFactory` for deployment wiring.

```232:237:contracts/src/core/AgentOrchestrator.sol
    function _readOraclePriceCents() internal view returns (uint256) {
        (, int256 answer,,,) = AggregatorV3Interface(ETH_USD_ORACLE).latestRoundData();
        require(answer > 0, "invalid oracle");
        // Chainlink-style 8-decimal USD price → cents (2 decimals)
        return uint256(answer) / 1e6;
    }
```

---

### 4. LLM Parse Website Agent — Browser-Based Macro Extraction

**What it is:** Launches a real browser, navigates to a URL or searches a domain, runs LLM extraction over rendered JavaScript pages. Returns typed structured fields with confidence scores. Cost: **~0.10 STT per validator**.

**Role in SignalVault:** Stages 2a and 2b — extracts Fear & Greed Index and macro news headlines that have no clean JSON API.

**Stage 2a — Fear & Greed from `alternative.me`:**

```295:314:contracts/src/core/AgentOrchestrator.sol
        bytes memory payload = abi.encodeWithSelector(
            ILLMParseAgent.ExtractANumber.selector,
            "fear_greed_value",
            "The current Crypto Fear and Greed Index value (0-100)",
            uint256(0),
            uint256(100),
            "What is the current Crypto Fear and Greed Index value?",
            "alternative.me",
            true,
            uint8(2),
            uint8(60)
        );

        uint256 deposit = platform.getRequestDeposit() + LLM_PARSE_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            LLM_PARSE_AGENT_ID, address(this), this.handleFearGreedResponse.selector, payload
        );
```

**Stage 2b — News headline from CoinDesk:**

```348:366:contracts/src/core/AgentOrchestrator.sol
        bytes memory payload = abi.encodeWithSelector(
            ILLMParseAgent.ExtractString.selector,
            "macro_summary",
            "A one-sentence summary of the current Ethereum/crypto macro sentiment from recent headlines",
            options,
            "Ethereum crypto market sentiment macro outlook latest news",
            "coindesk.com/tag/ethereum",
            true,
            uint8(2),
            uint8(50)
        );

        uint256 deposit = platform.getRequestDeposit() + LLM_PARSE_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            LLM_PARSE_AGENT_ID, address(this), this.handleNewsResponse.selector, payload
        );
```

**Why Somnia-only:** No other chain has a browser-scraping compute layer backed by validator consensus. Fear & Greed and news headlines are JS-rendered pages with no stable API.

---

### 5. LLM inferToolsChat Agent — Deterministic On-Chain AI with Tool Calling

**What it is:** Multi-turn LLM inference (Qwen3-30B, temperature=0, fixed seed) where the model can call **on-chain tools** that return ABI-encoded calldata executed by your contract. Cost: **~0.07 STT per validator**.

**Role in SignalVault:** Stage 3 — synthesizes all fetched data + strategy prompt into a trading decision via `updateSignal()` or `emergencyExit()`.

**Tool definitions:**

```426:434:contracts/src/core/AgentOrchestrator.sol
        ILLMInferAgent.OnchainTool[] memory tools = new ILLMInferAgent.OnchainTool[](2);
        tools[0] = ILLMInferAgent.OnchainTool(
            "updateSignal(int8 direction, uint16 sizeBps, uint256 stopPrice, string reasoning)",
            "Update the vault trading signal. direction: 1=LONG, -1=SHORT, 0=FLAT. sizeBps: position size 0-3000 (30% max). stopPrice: stop loss in cents (2 decimals). reasoning: one sentence explanation."
        );
        tools[1] = ILLMInferAgent.OnchainTool(
            "emergencyExit(string reason)",
            "Emergency exit all positions. Use ONLY if drawdown exceeds threshold or critical risk detected."
        );
```

**Inference request:**

```436:447:contracts/src/core/AgentOrchestrator.sol
        bytes memory payload = abi.encodeWithSelector(
            ILLMInferAgent.inferToolsChat.selector,
            roles, messages, mcpUrls, tools, uint256(3), true
        );

        uint256 deposit = platform.getRequestDeposit() + LLM_INFER_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 requestId = platform.createRequest{value: deposit}(
            LLM_INFER_AGENT_ID, address(this), this.handleInferResponse.selector, payload
        );
```

**Signal commit on vault:**

```88:114:contracts/src/core/StrategyVault.sol
    function updateSignal(
        int8 direction,
        uint16 sizeBps,
        uint256 stopPrice,
        string calldata reasoningSummary,
        bytes32 reasoningHash
    ) external onlyOrchestrator notEmergency {
        // ...
        currentSignal = sig;
        _signalHistory.push(sig);

        bytes32 signalHash = keccak256(
            abi.encodePacked(direction, sizeBps, stopPrice, block.number)
        );

        emit SignalUpdated(signalHash, direction, sizeBps, stopPrice, reasoningSummary, reasoningHash);
    }
```

**Why Somnia-only:** Deterministic LLM inference in consensus means every validator independently arrived at the same signal. It's not "trust the AI" — it's "verify the AI."

---

### 6. On-Chain Reactivity — Same-Block Synthetic Transactions

**What it is:** Somnia's native event subscription system. Contracts extending `SomniaEventHandler` register subscriptions via `SomniaExtensions.subscribe()`. When a matching event fires, the handler's `_onEvent()` is invoked as a **synthetic transaction in the same block**.

**Reactivity Precompile:** `0x0000000000000000000000000000000000000100`

**Role in SignalVault:** Powers all reactor contracts and the epoch cron. This is the primitive that makes copy trading atomic.

#### 6a. MirrorReactor — Same-Block Follower Orders

```79:88:contracts/src/reactivity/MirrorReactor.sol
    function registerSubscription() external onlyOwner {
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [SIGNAL_UPDATED_TOPIC, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: vault
        });

        SomniaExtensions.SubscriptionOptions memory options = SomniaExtensions.defaultSubscriptionOptions();
        subscriptionId = SomniaExtensions.subscribe(address(this), filter, options);
```

**Handler — places dreamDEX orders for every follower:**

```91:157:contracts/src/reactivity/MirrorReactor.sol
    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        if (emitter != vault || eventTopics[0] != SIGNAL_UPDATED_TOPIC) return;
        // ... decode signal ...
        uint256 markPrice = IDreamDexPricing(address(dex)).getMarkPrice();
        address[] memory followers = IStrategyVault(vault).getFollowers();

        for (uint256 i = 0; i < followers.length; i++) {
            // ... scale by riskPct, maxPositionSize, sizeBps ...
            try dex.placeOrder{value: 0}(
                follower, direction, quoteNotional, adjustedStop, config.maxSlippageBps
            ) returns (bytes32 positionId) {
                // ... record on PerformanceLedger ...
                emit MirrorExecuted(follower, direction, quoteNotional, positionId, fillPrice);
            }
        }
    }
```

**Frontend subscription registration (wallet-signed at deploy):**

```98:103:frontend/src/lib/reactivity-subscriptions.ts
export function encodeReactivitySubscriptionCalldata(params: SubscriptionTarget): Hex {
  const structValue = {
    eventTopics: [params.topic0, ZERO_BYTES32, ZERO_BYTES32, ZERO_BYTES32] as const,
    origin: ZERO_ADDR,
    caller: ZERO_ADDR,
    emitter: params.emitter,
```

#### 6b. StopReactor — Stop-Loss Enforcement

Subscribed to the same `SignalUpdated` event. Checks follower positions against the signal's stop price and closes breached positions on dreamDEX.

```41:50:contracts/src/reactivity/StopReactor.sol
    function registerSubscription() external onlyOwner {
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [SIGNAL_UPDATED_TOPIC, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: vault
        });
        subscriptionId = SomniaExtensions.subscribe(address(this), filter, options);
    }
```

#### 6c. DrawdownGuard — Emergency Exit + Schedule Cooldown

Subscribed to `DrawdownUpdated` from `PerformanceLedger`. On breach, triggers vault emergency exit and schedules a 24-hour cooldown via Somnia Schedule.

```45:54:contracts/src/reactivity/DrawdownGuard.sol
    function registerSubscription() external onlyOwner {
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [DRAWDOWN_UPDATED_TOPIC, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: ledger
        });
        drawdownSubscriptionId = SomniaExtensions.subscribe(address(this), filter, options);
    }
```

```84:88:contracts/src/reactivity/DrawdownGuard.sol
            uint256 reactivateAt = (block.timestamp + COOLDOWN_PERIOD) * 1000;
            cooldownSubscriptionId = SomniaExtensions.scheduleSubscriptionAtTimestamp(
                address(this), reactivateAt, options
            );
```

#### 6d. EpochCron — Autonomous Pipeline Trigger

Subscribed to `EpochTick` system events from the Reactivity precompile. Fires `AgentOrchestrator.startPipeline()` every epoch with funded STT.

```43:52:contracts/src/reactivity/EpochCron.sol
    function registerSubscription() external onlyOwner {
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [EPOCH_TICK_TOPIC, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS
        });
        subscriptionId = SomniaExtensions.subscribe(address(this), filter, options);
    }
```

```70:75:contracts/src/reactivity/EpochCron.sol
        try orchestrator.startPipeline{value: budget}() {
            totalTriggers++;
            emit EpochTriggered(epochNumber, block.number, block.timestamp);
        } catch {}
```

**Why Somnia-only:** On Ethereum, a follower contract observes an event in block N and submits in block N+1 or later. Somnia's reactive subscriptions insert a synthetic handler invocation in the **same block**. This is architecturally impossible on other EVM chains.

---

### 7. EpochTick System Event — Native On-Chain Cron

**What it is:** A system event emitted by the Somnia Reactivity precompile on a periodic schedule (~5 minutes). No external keeper, Chainlink Automation, or Gelato required.

**Role in SignalVault:** `EpochCron` subscribes to `EpochTick(uint64,uint64)` and autonomously triggers the agent pipeline. This is what makes the strategy loop fully autonomous after deployment.

**Topic hash:**

```16:16:contracts/src/reactivity/EpochCron.sol
    bytes32 public constant EPOCH_TICK_TOPIC = keccak256("EpochTick(uint64,uint64)");
```

---

### 8. Schedule System Event — One-Shot Timed Callbacks

**What it is:** A Somnia Reactivity primitive for scheduling a one-shot handler invocation at a specific millisecond timestamp.

**Role in SignalVault:**
- `DrawdownGuard` schedules a 24-hour cooldown after emergency exit
- `FeeDistributor` schedules periodic fee distribution to the strategist

---

### 9. Somnia Data Streams — Composable Typed Output Layer

**What it is:** Typed, queryable, multi-publisher data records on Somnia. Contracts and TypeScript clients publish and subscribe via `@somnia-chain/streams` SDK. Unlike EVM events (one-way, ephemeral), Data Streams persist and are composable.

**Role in SignalVault:** The backend `StreamPublisher` listens to on-chain events and publishes three schemas:

| Schema | Fields | Trigger |
|--------|--------|---------|
| `SignalVault.Signal` | timestamp, vault, direction, sizeBps, stopPrice, reasoningHash, reasoning | `SignalUpdated` |
| `SignalVault.PnL` | timestamp, vault, follower, direction, entryPrice, exitPrice, pnlBps, signalHash | `FollowerTradeSettled` |
| `SignalVault.VaultMeta` | timestamp, vault, strategist, name, feeBps, followerCount, sharpe30dBps, maxDrawdownBps | Periodic / on update |

**Schema registration:**

```79:96:backend/src/services/stream-publisher.ts
  private async initSchemaIds(): Promise<void> {
    if (!this.streamsSDK) return;

    const signalId = await this.streamsSDK.streams.computeSchemaId(SIGNAL_SCHEMA);
    const pnlId = await this.streamsSDK.streams.computeSchemaId(PNL_SCHEMA);
    const vaultMetaId = await this.streamsSDK.streams.computeSchemaId(VAULT_META_SCHEMA);

    this.schemaIds = {
      signal: signalId as `0x${string}`,
      pnl: pnlId as `0x${string}`,
      vaultMeta: vaultMetaId as `0x${string}`,
    };
  }
```

**Publishing a signal record:**

```191:213:backend/src/services/stream-publisher.ts
  private async publishSignal(data: SubscriptionCallback): Promise<void> {
    const encoder = new SchemaEncoder(SIGNAL_SCHEMA);
    const payload = encoder.encodeData([
      { name: 'timestamp', value: now, type: 'uint64' },
      { name: 'vault', value: decoded.vault, type: 'address' },
      { name: 'direction', value: BigInt(decoded.direction), type: 'int8' },
      { name: 'sizeBps', value: BigInt(decoded.sizeBps), type: 'uint16' },
      { name: 'stopPrice', value: decoded.stopPrice, type: 'uint256' },
      { name: 'reasoningHash', value: decoded.reasoningHash, type: 'bytes32' },
      { name: 'reasoning', value: sanitizePipelineText(decoded.reasoningSummary), type: 'string' },
    ]);

    const tx = await this.streamsSDK.streams.set([
      { id: dataId, schemaId: this.schemaIds.signal, data: payload },
    ]);
  }
```

---

### 10. Somnia Reactivity WebSocket SDK — Real-Time Event Ingestion

**What it is:** `@somnia-chain/reactivity` SDK for subscribing to on-chain events via WebSocket RPC (`wss://api.infra.testnet.somnia.network/ws`).

**Role in SignalVault:** `StreamPublisher` subscribes to `SignalUpdated`, `TradeSettled`, `FollowerTradeSettled`, and `DrawdownUpdated` across all indexed vault contracts. Events flow into Data Stream publishing and the mirror worker.

```113:120:backend/src/services/stream-publisher.ts
    const sub = await this.reactivitySDK.subscribe({
      ethCalls: [],
      eventContractSources: contractSources.length > 0 ? contractSources : undefined,
      topicOverrides: [
        EVENT_SIGNATURES.SignalUpdated,
        EVENT_SIGNATURES.TradeSettled,
        EVENT_SIGNATURES.FollowerTradeSettled,
        EVENT_SIGNATURES.DrawdownUpdated,
```

---

### 11. dreamDEX — On-Chain Order Execution

**What it is:** Somnia's native spot DEX. SignalVault integrates via `DreamDexAdapter`, a thin wrapper over dreamDEX's `SpotPool` contract.

**Pool address:** `0xD180195da5459C7a0DEA188ed61216ec43682b50` (WETH/USDso)

**Role in SignalVault:**
- `MirrorReactor` places IOC orders for followers when signals fire
- `StopReactor` closes positions when stops are breached
- Mark price for PnL calculation comes from dreamDEX EMA midpoint

**Adapter — placing an IOC order:**

```90:122:contracts/src/integrations/DreamDexAdapter.sol
    function placeOrder(
        address trader,
        int8 direction,
        uint256 size,
        uint256 stopPrice,
        uint16 maxSlippageBps
    ) external payable onlyMirror returns (bytes32 positionId) {
        bool isBid = direction > 0;
        (uint256 price, uint256 minQuantity, uint256 lotSize) =
            _resolveOrderPrice(stopPrice, maxSlippageBps, isBid);
        uint256 quantity = _quoteToQuantity(size, price, minQuantity, lotSize);

        (bool success, uint128 orderId) = spotPool.placeOrder(
            isBid, 0, price, quantity, expireNs,
            ISpotPool.OrderType.ImmediateOrCancel,
            ISpotPool.SelfMatchingOption.CancelTaker,
            address(0), 0
        );
        return success ? bytes32(uint256(orderId)) : bytes32(0);
    }
```

**Mark price from dreamDEX EMA:**

```84:87:contracts/src/integrations/DreamDexAdapter.sol
    function getMarkPrice() external view returns (uint256) {
        (uint256 emaValue,) = spotPool.getMidpointEmaState();
        return emaValue;
    }
```

**Factory deploys per-vault adapter:**

```197:199:contracts/src/core/VaultFactory.sol
        dep.mirrorReactor = implMirrorReactor.clone();
        address dexAdapter = address(new DreamDexAdapter(DREAMDEX_WETH_POOL, dep.mirrorReactor));
        IInitMirror(dep.mirrorReactor).initialize(dep.strategist, dep.vault, dexAdapter);
```

**Why dreamDEX matters:** Every follower subscription routes automated order flow to the DEX. SignalVault generates composable liquidity — the same relationship Binance copy trading has with Binance's order book, but protocol-native on Somnia.

---

### 12. EIP-1167 Minimal Proxy Clones — Gas-Efficient Vault Deployment

**What it is:** OpenZeppelin `Clones` library for deploying minimal proxy instances of implementation contracts.

**Role in SignalVault:** `VaultFactory` deploys 8 cloned contracts per vault in a single transaction, keeping deployment costs manageable on Somnia's high-gas CREATE environment.

```148:150:contracts/src/core/VaultFactory.sol
        dep.orchestrator = implOrchestrator.clone();
        dep.vault = implVault.clone();
```

---

### 13. MultiStream Consensus Economics — Sub-Cent Agent Loops

**What it is:** Somnia's consensus architecture enables ~100ms blocks and sub-cent STT fees per agent call, making 5-minute autonomous agent loops economically viable.

**Role in SignalVault:** A full pipeline (oracle + JSON API + 2× LLM Parse + inferToolsChat) costs approximately **~0.60 STT per epoch**. Combined with `EpochCron` autonomous triggering, a vault can run indefinitely on a modest STT deposit.

| Component | STT Cost |
|-----------|----------|
| JSON API (3 validators) | ~0.09 |
| LLM Parse × 2 (3 validators each) | ~0.60 |
| inferToolsChat (3 validators) | ~0.21 |
| **Total per pipeline run** | **~0.90 STT** |

---

### 14. Frontend Wallet-Signed Reactivity Registration

**What it is:** Post-deploy setup transactions signed by the strategist's MetaMask wallet — no backend private keys.

**Role in SignalVault:** After `deployVault()`, the Launch Wizard sequentially registers all 4 reactivity subscriptions, funds EpochCron, and triggers the first pipeline — each confirmed in the user's wallet.

```130:145:frontend/src/lib/vault-setup-runner.ts
      const calldata = encodeReactivitySubscriptionCalldata(target)
      const hash = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: walletClient.chain,
        to: REACTIVITY_PRECOMPILE,
        data: calldata,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
```

---

### 15. Follower Vault Index — Efficient Strategy Lookup

**What it is:** Backend reverse index mapping `follower → subscribed vaults` with cached strategy metadata from the vault indexer.

**Role in SignalVault:** The mirror worker resolves vault display names and subscribed followers without repeated on-chain strategy reads.

```95:110:backend/src/services/follower-vault-index.ts
  getSubscribedVaults(follower: Address): SubscribedVaultInfo[] {
    const followerKey = follower.toLowerCase();
    const vaultAddrs = this.followerToVaults.get(followerKey);
    // ... returns strategyPrompt, displayName, currentSignal from indexer cache
  }
```

**API endpoint:** `GET /api/followers/:address/subscriptions`

---

### Somnia Primitive Dependency Map

| SignalVault Feature | Somnia Primitive | Implementation |
|---------------------|------------------|----------------|
| Live price + funding fetch | JSON API Agent | `AgentOrchestrator._fetchFunding()` |
| Fear & Greed extraction | LLM Parse Website | `AgentOrchestrator._tryFireStage2()` |
| News headline extraction | LLM Parse Website | `AgentOrchestrator._fetchNewsSummary()` |
| Trading decision | inferToolsChat | `AgentOrchestrator._runInference()` |
| Autonomous epoch loop | EpochTick + Reactivity | `EpochCron._onEvent()` |
| Same-block follower orders | On-chain Reactivity | `MirrorReactor._onEvent()` |
| Stop-loss enforcement | On-chain Reactivity | `StopReactor._onEvent()` |
| Drawdown emergency exit | Reactivity + Schedule | `DrawdownGuard._handleDrawdown()` |
| Fee distribution | Schedule | `FeeDistributor` |
| Composable vault data | Data Streams | `StreamPublisher.publish*()` |
| Real-time event ingestion | Reactivity WebSocket SDK | `StreamPublisher.subscribeToEvents()` |
| Order execution | dreamDEX SpotPool | `DreamDexAdapter.placeOrder()` |
| Mark-to-market pricing | dreamDEX EMA | `DreamDexAdapter.getMarkPrice()` |
| Gas-efficient deployment | EIP-1167 Clones | `VaultFactory.deployVault()` |
| Wallet-signed setup | Reactivity Precompile | `vault-setup-runner.ts` |

---

## The Smart Contracts

### Contract Overview

| Contract | Path | Role |
|----------|------|------|
| **VaultFactory** | [`contracts/src/core/VaultFactory.sol`](contracts/src/core/VaultFactory.sol) | Deploys complete vault systems atomically via EIP-1167 clones |
| **StrategyVault** | [`contracts/src/core/StrategyVault.sol`](contracts/src/core/StrategyVault.sol) | Core vault — signals, followers, strategy prompt, emergency mode |
| **AgentOrchestrator** | [`contracts/src/core/AgentOrchestrator.sol`](contracts/src/core/AgentOrchestrator.sol) | Multi-stage Somnia agent pipeline (JSON API → LLM Parse → inferToolsChat) |
| **MirrorReactor** | [`contracts/src/reactivity/MirrorReactor.sol`](contracts/src/reactivity/MirrorReactor.sol) | Same-block follower order placement on dreamDEX |
| **StopReactor** | [`contracts/src/reactivity/StopReactor.sol`](contracts/src/reactivity/StopReactor.sol) | Stop-loss enforcement on dreamDEX positions |
| **DrawdownGuard** | [`contracts/src/reactivity/DrawdownGuard.sol`](contracts/src/reactivity/DrawdownGuard.sol) | Drawdown breach → emergency exit + Schedule cooldown |
| **EpochCron** | [`contracts/src/reactivity/EpochCron.sol`](contracts/src/reactivity/EpochCron.sol) | EpochTick handler → autonomous pipeline trigger |
| **PerformanceLedger** | [`contracts/src/finance/PerformanceLedger.sol`](contracts/src/finance/PerformanceLedger.sol) | PnL tracking, Sharpe approximation, drawdown metrics |
| **FeeDistributor** | [`contracts/src/finance/FeeDistributor.sol`](contracts/src/finance/FeeDistributor.sol) | Performance fee collection and scheduled distribution |
| **DreamDexAdapter** | [`contracts/src/integrations/DreamDexAdapter.sol`](contracts/src/integrations/DreamDexAdapter.sol) | dreamDEX SpotPool integration for IOC orders |
| **SharpeGatedLending** | [`contracts/src/demo/SharpeGatedLending.sol`](contracts/src/demo/SharpeGatedLending.sol) | Composability demo — borrow rate discount by vault Sharpe |

### VaultFactory

**GitHub:** [`contracts/src/core/VaultFactory.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/core/VaultFactory.sol)  
**Explorer:** [0x5C5E7222C2Ed5DE198398F67d7574cAa87012E9e](https://shannon-explorer.somnia.network/address/0x5C5E7222C2Ed5DE198398F67d7574cAa87012E9e)

Single-transaction deployment of the entire vault system. Uses Somnia's Agent Platform address and Protofire oracle constants. Deploys a per-vault `DreamDexAdapter` wired to the dreamDEX WETH pool.

```137:189:contracts/src/core/VaultFactory.sol
    function deployVault(
        string calldata strategyPrompt,
        uint16 performanceFeeBps,
        uint256 maxDrawdownBps
    ) external payable returns (uint256 vaultId) {
        // Clone core contracts
        dep.orchestrator = implOrchestrator.clone();
        dep.vault = implVault.clone();
        // Initialize, wire reactors, fund orchestrator + epoch cron
        // Transfer ownership to strategist
        emit VaultDeployed(vaultId, dep.vault, dep.strategist, ...);
    }
```

### StrategyVault

**GitHub:** [`contracts/src/core/StrategyVault.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/core/StrategyVault.sol)  
**Demo instance:** [0x6DE77BacB732A060549465999f895A1f4FdE3158](https://shannon-explorer.somnia.network/address/0x6DE77BacB732A060549465999f895A1f4FdE3158)

- Stores immutable `strategyPrompt` set at deployment
- `updateSignal()` — called only by `AgentOrchestrator` after inferToolsChat
- `subscribe()` / `unsubscribe()` — follower opt-in with risk configuration
- `emergencyExit()` — triggered by `DrawdownGuard` on drawdown breach
- Emits `SignalUpdated` — the event that triggers all reactor handlers via Somnia Reactivity

### AgentOrchestrator

**GitHub:** [`contracts/src/core/AgentOrchestrator.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/core/AgentOrchestrator.sol)  
**Demo instance:** [0x96D2D03b901d6b416795a726c28D975f115a51b5](https://shannon-explorer.somnia.network/address/0x96D2D03b901d6b416795a726c28D975f115a51b5)

Implements `IAgentRequesterHandler`. Orchestrates the full 5-stage Somnia agent pipeline. All agent interactions go through `platform.createRequest()` with the three Somnia agent IDs.

### MirrorReactor

**GitHub:** [`contracts/src/reactivity/MirrorReactor.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/reactivity/MirrorReactor.sol)  
**Demo instance:** [0x5a213B28E1Cf0cC1Fc8E0E1Bc9f6cf0F5Fe4a066](https://shannon-explorer.somnia.network/address/0x5a213B28E1Cf0cC1Fc8E0E1Bc9f6cf0F5Fe4a066)

Extends `SomniaEventHandler`. Subscribed to `SignalUpdated`. Places scaled IOC orders on dreamDEX for every active follower in the same block.

### StopReactor

**GitHub:** [`contracts/src/reactivity/StopReactor.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/reactivity/StopReactor.sol)  
**Demo instance:** [0xA5F46aF29A00398A024E2c7155e3Dc7892a5CEF1](https://shannon-explorer.somnia.network/address/0xA5F46aF29A00398A024E2c7155e3Dc7892a5CEF1)

Monitors follower positions against signal stop prices. Closes positions on dreamDEX when stops are breached.

### DrawdownGuard

**GitHub:** [`contracts/src/reactivity/DrawdownGuard.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/reactivity/DrawdownGuard.sol)  
**Demo instance:** [0xa3569d967bB70E04160286301d4A0130a852d431](https://shannon-explorer.somnia.network/address/0xa3569d967bB70E04160286301d4A0130a852d431)

Uses Somnia Reactivity for drawdown monitoring and Somnia Schedule for cooldown management after emergency exits.

### EpochCron

**GitHub:** [`contracts/src/reactivity/EpochCron.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/reactivity/EpochCron.sol)  
**Demo instance:** [0xeD5d2e89B7f92dae60E41d9f5239c22a869eAf94](https://shannon-explorer.somnia.network/address/0xeD5d2e89B7f92dae60E41d9f5239c22a869eAf94)

Subscribed to Somnia `EpochTick` system events. Autonomously funds and triggers `AgentOrchestrator.startPipeline()` every epoch.

### PerformanceLedger

**GitHub:** [`contracts/src/finance/PerformanceLedger.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/finance/PerformanceLedger.sol)  
**Demo instance:** [0x92997bc11aEA5437b51275e75259f0DA1058A2fF](https://shannon-explorer.somnia.network/address/0x92997bc11aEA5437b51275e75259f0DA1058A2fF)

Tracks vault and follower trade history. Computes Sharpe approximation, max drawdown, win rate. Emits `DrawdownUpdated` for `DrawdownGuard`. Uses Protofire oracle for mark-to-market.

### FeeDistributor

**GitHub:** [`contracts/src/finance/FeeDistributor.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/finance/FeeDistributor.sol)  
**Demo instance:** [0xBAB99BF7610626A16fAbDe5c522DaD8bAfDaADc0](https://shannon-explorer.somnia.network/address/0xBAB99BF7610626A16fAbDe5c522DaD8bAfDaADc0)

Collects performance fees from follower PnL. Uses Somnia Schedule for periodic distribution to the strategist.

### DreamDexAdapter

**GitHub:** [`contracts/src/integrations/DreamDexAdapter.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/integrations/DreamDexAdapter.sol)

Maps SignalVault's `IDreamDEX` interface to dreamDEX `SpotPool.placeOrder()`. Resolves prices from EMA midpoint with slippage adjustment. Only callable by `MirrorReactor`.

### SharpeGatedLending

**GitHub:** [`contracts/src/demo/SharpeGatedLending.sol`](https://github.com/SamFelix03/SignalVault/blob/main/contracts/src/demo/SharpeGatedLending.sol)  
**Explorer:** [0xc8F4E595f3C4ad57682ED48C52C3467EA67dBD97](https://shannon-explorer.somnia.network/address/0xc8F4E595f3C4ad57682ED48C52C3467EA67dBD97)

Demonstrates composability: reads `PerformanceLedger.getSharpeApprox()` and applies a borrow rate discount for vaults with Sharpe ≥ 1.5.

```15:23:contracts/src/demo/SharpeGatedLending.sol
    function borrowRateBps(address performanceLedger)
        external view returns (uint256 rateBps, int256 sharpe, bool eligible)
    {
        sharpe = IPerformanceLedger(performanceLedger).getSharpeApprox();
        eligible = sharpe >= SHARPE_THRESHOLD;
        rateBps = eligible ? BASE_BORROW_RATE_BPS - SHARPE_DISCOUNT_BPS : BASE_BORROW_RATE_BPS;
    }
```

---

## How to Demo

### Prerequisites

| Requirement | Details |
|-------------|---------|
| **Wallet** | MetaMask with Somnia Testnet added (Chain ID `50312`, RPC `https://api.infra.testnet.somnia.network/`) |
| **STT Balance** | ≥ **5 STT** recommended (1 STT deploy deposit + ~0.9 STT per pipeline + subscription gas + epoch cron funding) |
| **Node.js** | v18+ |
| **Git** | Clone the repository |

### 1. Run Locally

```bash
# Clone
git clone https://github.com/SamFelix03/SignalVault.git
cd SignalVault

# Backend
cd backend
cp .env.example .env   # Set RPC_URL, PRIVATE_KEY (for stream publisher), VAULT_FACTORY_ADDRESS
npm install
npm run dev            # → http://localhost:3001

# Frontend (new terminal)
cd frontend
npm install
npm run dev            # → http://localhost:3000
```

### 2. Explore the Demo Vault

Open the leaderboard at `http://localhost:3000`. The demo vault (`0x6DE77Bac...`) shows live signal, PnL, follower count, and strategy summary.

Navigate to the vault page to see:
- Current signal (direction, size, stop, reasoning summary)
- Signal history
- Pipeline status
- Subscribe form

### 3. Deploy Your Own Vault

Go to **Deploy Vault** (`/deploy`). Use these sample values:

| Field | Value |
|-------|-------|
| Vault Name | `ETH Fear & Greed Alpha` |
| Strategy Prompt | `Momentum on ETH/USDso with macro overlay. Go long when price momentum is positive and Fear & Greed is below 30. Go short when momentum is negative and Fear & Greed is above 75. Use 15–20% position sizing. Exit if 24h funding exceeds 0.1%.` |
| Performance Fee | 5% |
| Max Drawdown | 20% |
| Agent Funding | 1 STT |

Click **Deploy Vault** → confirm in MetaMask.

The **Launch Wizard** then guides you through wallet-signed setup (~6 MetaMask confirmations):

1. Index vault on backend
2. Register MirrorReactor subscription (Somnia Reactivity)
3. Register StopReactor subscription
4. Register DrawdownGuard subscription
5. Register EpochCron subscription (EpochTick)
6. Fund EpochCron with 0.5 STT
7. Trigger first agent pipeline run

Each transaction appears in the wizard with Shannon Explorer links.

### 4. Run a Pipeline

On the vault page, open the **Pipeline** tab and click **Trigger Pipeline**. Watch the 5 stages complete:

| Stage | What Happens |
|-------|-------------|
| Fetching Price | Protofire oracle read + JSON API funding fetch |
| Fetching Funding | CoinGecko 24h change via JSON API Agent |
| Parsing Fear & Greed | LLM Parse Website on `alternative.me` |
| Parsing News | LLM Parse Website on CoinDesk ETH headlines |
| Inferring | inferToolsChat → `updateSignal()` on vault |

When complete, the vault emits `SignalUpdated` and the signal appears on the vault page.

### 5. Subscribe as a Follower

On the vault page, configure risk parameters and click **Subscribe**:

| Parameter | Suggested Value |
|-----------|----------------|
| Risk Level | 10% |
| Max Position | $0.02 STT (testnet) |
| Max Slippage | 1% |
| Stop Loss Buffer | $1 |

### 6. View Mirror Trades

After a signal fires with an active subscription:

- **Follow page** (`/follow`) — shows open positions and settled trades with PnL
- **Vault audit page** (`/vault/{address}/audit/{hash}`) — full reasoning chain with agent receipt data
- **Shannon Explorer** — inspect the block: agent callback → `SignalUpdated` → `MirrorExecuted` events in the same block

### 7. Composability Demo

Open **Composability** (`/composability`) to see `SharpeGatedLending` reading live vault Sharpe from `PerformanceLedger` and adjusting borrow rates.

### Sample Deploy Script (CLI Alternative)

```bash
cd backend
npx tsx src/scripts/deploy-demo-vault.ts
npx tsx src/scripts/register-subscriptions.ts
npx tsx src/scripts/fund-epoch-cron.ts
```

---

## Conclusion

SignalVault is the clearest demonstration of what **Somnia Agentic L1** means in practice:

- **The agent is the strategy** — `inferToolsChat` reasons over consensus-validated data and commits decisions on-chain
- **The vault is the agent** — `StrategyVault` stores immutable rules; `AgentOrchestrator` executes them autonomously via Somnia Agents
- **The reasoning is on-chain** — every pipeline run produces a verifiable `reasoningHash` auditable by anyone
- **The execution is atomic** — Somnia Reactivity places follower orders on dreamDEX in the same block as the signal
- **The output is composable** — Somnia Data Streams publish vault intelligence readable by any protocol on the network

No other chain can replicate this stack. JSON API agents, browser-based LLM parsing, deterministic on-chain inference, native cron, same-block reactive handlers, and typed data streams are Somnia primitives with no EVM equivalent. SignalVault turns them into a complete autonomous social trading protocol — verifiable, atomic, and composable.
