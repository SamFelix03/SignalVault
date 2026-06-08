## **SignalVault**
### *The first autonomous social trading protocol where the strategy agent publishes its full reasoning onchain and followers mirror in the same block — no off-chain bots, no trusted curator, no copy-paste*

---

### The Obvious Problem

Copy trading has existed for a decade. Every CEX has it. But it has a fundamental, unsolved trust problem: **you cannot verify what you're actually copying**.

On Binance copy trading, the "strategy provider" is a black box. Their track record is curated by the exchange. The reasoning behind each trade is hidden. You don't know if their historical PnL was live or cherry-picked. You don't know if they're still running the same strategy or have shifted. You can't independently audit anything. And the moment the exchange decides to delist them — or the provider closes their account — your copy setup silently breaks.

Off-chain copy bots (Nansen, Arkham, manual wallet watching) are surveillance, not automation: you watch someone's wallet, then manually execute. By the time you execute, the edge is usually gone.

**The core unsolved problem is this: there is no trading system in existence where the strategy's reasoning is verifiable, the follower execution is atomic with the signal, and neither the strategy provider nor any platform can tamper with either.** SignalVault is exactly that.

---

### What SignalVault Actually Is

A strategy provider deploys a `StrategyVault` contract. They fund it with a small SOMI deposit. The vault runs a continuous autonomous agent loop: every epoch (5 minutes), it fetches live market data via JSON API agents, scrapes macro/sentiment from news sources via LLM Parse Website, then passes everything to an `inferToolsChat` agent that reasons over the combined context and either holds position, updates the signal, or rotates. The *entire reasoning chain* — what data was fetched, what the LLM concluded, what trade calldata it yielded — is committed as a hash to the vault's onchain state. Anyone can verify it.

Followers subscribe to the vault's `SignalUpdated` event via on-chain reactivity. When the signal updates, their `MirrorReactor` handler fires in the **same block** — sized by their configured risk parameters — and places their order on dreamDEX. No bot. No polling. No latency gap between the signal and the follower's execution.

The vault's live PnL, Sharpe ratio, and per-trade history are published to a `SignalStream` Data Stream. Any other Somnia contract or protocol can read this without touching SignalVault at all — a lending protocol can use it to adjust collateral ratios, a DAO can use it to gate treasury management access.

---

### Why Every Somnia Primitive Is Load-Bearing

**`inferToolsChat` with on-chain tool calling** — this is the beating heart. The strategy agent doesn't just receive data; it *decides*. You give the LLM a system prompt defining the strategy rules ("momentum breakout, max 20% drawdown, exit if funding rate exceeds 0.1%"), the current market state, and a set of on-chain tools: `updateSignal(direction, size, stopPrice)`, `exitAll()`, `pauseStrategy()`. The LLM reasons, then yields back the calldata for whichever tool it wants to call. The vault executes it. This is a real autonomous agent making real trading decisions whose full chain-of-thought is committed onchain and verifiable by anyone. Nothing like this exists anywhere else — deterministic LLM inference in consensus means every validator independently arrived at the same signal. It's not "trust the AI"; it's "verify the AI."

**`LLM Parse Website`** — crypto macro signals live in messy human-readable pages: the Fear & Greed index, CoinDesk headlines, the Fed minutes summary, Binance announcement pages. No clean API. The agent browses these pages with a real browser on every epoch, extracts the relevant signal (e.g. `"fear_greed_index": 23`, `"headline_sentiment": "negative"`), and feeds it into the strategy context alongside the structured market data. This is what makes it a *contextual* strategy agent rather than a pure price-following bot.

**JSON API Agent** — price feeds, funding rates, open interest deltas, liquidation levels from public exchange APIs. Cheap (0.03 STT), fast, consensus-validated. Every input to the strategy model is a provable API response, not a number the strategy provider typed in.

**On-chain Reactivity with same-block execution** — this is the feature that makes "copy trading" mean something completely different. On any other chain, a follower would need an off-chain bot watching for the event, then submit a separate transaction in a future block. On Somnia, the `MirrorReactor` contract is subscribed to `SignalUpdated`. When that event fires in block N, the reactor handler is a synthetic transaction *also in block N*. The follower's order hits the DEX in the same block as the strategy signal. No front-running gap. No keeper dependency. No latency.

**`EpochTick` + `Schedule` system events** — the agent loop re-fires automatically every 5 minutes without any external trigger. A separate `Schedule` subscription fires if the vault's drawdown exceeds a configured threshold at the exact moment it's breached: an emergency exit handler calls `exitAll()` and pauses the strategy. No off-chain monitor needed.

**Data Streams** — `SignalStream` is the composable output layer. The current signal (direction, size, stop, reasoning summary, confidence score), live PnL, and historical trade log are published as typed streams. Any contract on Somnia reads this directly. A lending protocol subscribing to a vault's PnL stream can dynamically adjust the borrowing rate for that strategy's followers. A DAO can gate treasury rebalancing access to vaults with Sharpe > 1.5. A second strategy can use another vault's signal as a *feature* in its own model. The signal network becomes a composable intelligence layer.

---

### The Full Technical Architecture

```
StrategyVault.sol
  address public strategist
  Signal public currentSignal          // direction · size · stopPrice · epoch
  bytes32 public latestReasoningHash   // keccak256(agent receipt IPFS CID)
  PerformanceLedger public stats       // PnL · Sharpe · maxDrawdown · winRate
  mapping(address => FollowerConfig) followers  // riskPct · maxSize · slippage

  function runEpochAgent() external      // called by EpochTick handler
  function handleAgentResponse(...)      // IAgentRequesterHandler callback
  function subscribe(FollowerConfig)     // follower opt-in
  function unsubscribe()

AgentOrchestrator.sol
  // Step 1: JSON API → price + funding + OI (createRequest × 2)
  // Step 2 callback: fires LLM Parse Website → news/macro (createRequest)
  // Step 3 callback: fires inferToolsChat with:
  //   - market state from steps 1+2
  //   - onchainTools: [updateSignal, exitAll, pauseStrategy]
  //   - system prompt: strategy ruleset
  // Step 4 callback: vault executes yielded calldata
  //   → emits SignalUpdated + publishes to Data Stream

MirrorReactor.sol  (SomniaEventHandler)
  // subscribed to StrategyVault.SignalUpdated
  _onEvent: for each follower subscribed to this vault
    → scale signal by follower.riskPct
    → call dreamDEX.placeOrder(scaled calldata)
    // ALL in same block as signal

StopReactor.sol  (SomniaEventHandler)
  // subscribed to StrategyVault.SignalUpdated
  _onEvent: if signal.stopPrice breached
    → call dreamDEX.closePosition(follower)

DrawdownGuard.sol  (SomniaEventHandler)
  // Schedule subscription fires when drawdown threshold hit
  _onEvent: → StrategyVault.emergencyExit()
              → broadcasts ExitAll to all followers via reactor

StreamPublisher (TypeScript, off-chain, optional)
  // listens via WebSocket reactivity to SignalUpdated + TradeSettled
  // publishes to SignalStream + PnLStream Data Streams
  // (can be made fully onchain in callback too)
```

---

### The Demo (5 Minutes, Anyone Understands It)

**1. Open the frontend.** You see a live feed of strategy vaults. Each card shows: current position, live PnL, the last signal's reasoning summary, and a follower count. The cards update in real time via WebSocket — no refresh, because off-chain reactivity is pushing every `SignalUpdated` event straight to the browser.

**2. Open one vault.** You can read the full reasoning trail for the last 10 signals: *"Fetched ETH/USDso at $3,420. Funding rate: +0.087% (elevated, longs paying). Scraped CoinDesk (ETH): 'Ethereum Foundation cuts aren't a crisis, Joe Lubin says.' LLM reasoning: elevated funding suggests crowded long, macro headwind, fear/greed at 28 (extreme fear). Decision: reduce long 60%→30%, tighten stop to $3,320."* Every step is a verifiable agent receipt. Click the receipt hash and see the full chain-of-thought, the exact URLs scraped, the structured extraction, the LLM's intermediate reasoning.

**3. Subscribe as a follower.** Set your risk config: 10% of portfolio, max 2x the signal size, 1% slippage tolerance. Sign once.

**4. Watch a signal fire.** The epoch ticks. The agent pipeline runs — you see the three pending agent requests appear in the UI. Within seconds, callbacks land. The signal updates: `LONG → SHORT, 30% size, stop $100,200`. Simultaneously, in the same block, your `MirrorReactor` fires and places your order on dreamDEX. You didn't touch anything. The onchain receipt proves your order was placed in the identical block as the strategy signal — zero latency gap, verifiable by anyone inspecting the block.

**5. Show the audit trail.** Pull up the block on the explorer. You see: the synthetic transaction from the agent callback updating the vault signal, immediately followed by the synthetic MirrorReactor transactions placing orders for each follower. All same block. All provably derived from the same agent execution.

**6. Show composability.** Open a hypothetical lending protocol. It shows that followers of vaults with Sharpe > 1.5 (read directly from the PnLStream) get a 0.5% discount on borrowing rates. This works right now because the stream is live and readable by any contract on Somnia. No integration work needed.

---

### Why This Is an Ecosystem-Level Product

dreamDEX needs flow. SignalVault generates it — every follower subscription is a source of automated order flow routed to the DEX. This is the same relationship Binance copy trading has with Binance's order book: the copy feature makes the exchange stickier. But SignalVault is protocol-native, not platform-dependent.

The `SignalStream` and `PnLStream` Data Streams are infrastructure. Any Somnia DeFi protocol — lending, options, structured products — can read live vault performance without any API call or trust assumption. This is a credentialing layer for autonomous strategy agents, built directly into the chain's data layer.

It also answers a question Somnia's own positioning raises: *"What does an agent-native DeFi application actually look like?"* SignalVault is the clearest possible answer. The agent *is* the strategy. The vault *is* the agent. The reasoning is onchain. The execution is atomic. The output is composable. That's exactly what "Agentic L1" means in practice, demonstrated in one product.