# SignalVault Custom Agent

Off-chain agent that runs the **same pipeline stages** as the native `AgentOrchestrator`, then publishes via `signalvault-sdk`.

## Native pipeline vs custom agent

| Stage | Native (on-chain) | Custom agent (this example) |
|-------|-------------------|---------------------------|
| 1. Price | Chainlink oracle via orchestrator | Chainlink oracle (same address) |
| 2. Funding | Somnia JSON API agent → CoinGecko 24h | CoinGecko 24h (same source) |
| 3. Fear & Greed | Somnia LLM Parse agent | alternative.me API (same target site) |
| 4. News | Somnia LLM Parse agent | CoinDesk RSS (same as backend fallback) |
| 5. Inference | Somnia LLM inferToolsChat | **rules** (native fallback logic) or **llm** (Groq tool-call) |
| Publish | `updateSignal(reasoning, …)` | `vault.publish({ reason, … })` → same on-chain field |

The **reasoning string** is stored on-chain in `reasoningSummary` — followers and the UI see it exactly like native vault signals.

## What is different

- **Trigger**: You run this process on a schedule (`INTERVAL_MS`), not `EpochCron` on-chain.
- **Somnia agents**: Stages 2–5 use HTTP/LLM APIs instead of paying STT for on-chain Somnia agents — same data, different delivery.
- **Performance ledger settlement**: Native orchestrator calls `_settlePreviousTrade` before each signal; custom publisher only calls `updateSignal`. Vault-level ledger PnL on native vaults is orchestrator-only today.

## Setup

```bash
cd examples/rsi-agent
npm install
cp .env.example .env
# fill VAULT_ADDRESS + PRIVATE_KEY
npm start
```

## Inference modes

### `INFERENCE_MODE=rules` (default)

Ports `AgentOrchestrator._deriveRuleBasedSignal` — Fear/Greed + funding override, native reasoning format:

```
ETH $3200.45, Fear/Greed 34/100, [macro headline]. Neutral-bullish macro — maintain long exposure.
```

### `INFERENCE_MODE=llm`

Uses **Groq** (OpenAI-compatible API) with the same tool schema as the on-chain orchestrator (`updateSignal` / `emergencyExit`). Default model is `llama-3.1-8b-instant` (fast + cheap).

```env
INFERENCE_MODE=llm
GROQ_API_KEY=gsk_...
# optional: GROQ_MODEL=llama-3.1-8b-instant
```

Get a key at [console.groq.com](https://console.groq.com). Falls back to rules if Groq fails.

## Environment

See `.env.example` for all options.
