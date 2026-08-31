Here's the full plan, organized as: contract changes → the two signal-source pipelines → vault discovery/stats → testnet wiring → build order.

## 1. Contract changes to SignalVault

**Vault gets a source type, fixed at creation:**

```solidity
enum SourceType { AGENT, WALLET }

struct VaultMeta {
    SourceType sourceType;
    address sourceWallet;    // set if WALLET, else address(0)
    address publisher;       // who's allowed to call publish() — the agent's key, or your app relayer for WALLET mode
    address owner;            // strategist, always
}
```

A vault is one or the other, permanently. If a strategist wants both a manual agent and a wallet-tracked vault, that's two separate vaults — don't let one vault mix sources, or your stats and mirror logic get ambiguous about what a signal actually represents.

**Signal struct needs a price now**, not just direction and stake — because Event Contracts are a real order book (buy Up at 0.45, not "bet up, know payout upfront"):

```solidity
struct Signal {
    Direction direction;      // UP, DOWN, FLAT
    uint256 sizeBps;
    uint256 limitPrice;       // in Up-probability terms, scaled
    uint256 marketId;         // bytes32 marketId from BinaryMarketsModule, not a pool address
    string reasoning;
}
```

Using `marketId` instead of a pool address matters — dreamDEX pools get recycled across successive windows, so a pool address is not a stable reference. Always resolve `marketId → pool` at execution time via the SDK/registry, never cache it.

**`publish()` access control** stays as-is conceptually (only `publisher` can call it) but now `publisher` means different things per source type:
- **AGENT vault**: `publisher` = the agent's own signing key, calling `publish()` directly, exactly like today.
- **WALLET vault**: `publisher` = your app's relayer address, authorized once by the strategist (a single onchain `setPublisher(relayerAddress)` call signed by the strategist's wallet when they turn on auto-mirror). The relayer publishes signals derived from watching the strategist's real trades — the strategist never signs per-trade.

## 2. The two signal-source pipelines

**Agent path — unchanged.** Your AI agent already calls `publish()` directly. No new work here beyond adding `limitPrice` and `marketId` to whatever it computes today.

**Wallet path — new watcher service, one per wallet-sourced vault:**

1. When a strategist turns on wallet-mode, your backend registers a job: watch fills on dreamDEX Event Contracts where `trader == strategist's wallet`, scoped to the markets you support (BTC/ETH, whatever cadences you choose to track).
2. Use `exchange.client.getUserFills(account, opts)` — the docs confirm this returns the fill tape filtered to one wallet across the venue, so you don't have to enumerate pools yourself. Poll this on a short interval, or use the SDK's realtime fill watches if exposed for third-party accounts — either way this is your trigger, not raw on-chain event topics (the docs don't expose those, and pool recycling makes a static on-chain subscription unsafe as discussed).
3. On a new fill: gate on-chain market status is still `Trading` at read time (indexer lags — a signal published against a market that already ticked to `Locked` will just fail downstream when your MirrorReactor tries to place follower orders).
4. Decode the fill into a Signal (direction from which side they bought, price they paid, size), and call `vault.publish()` from the relayer key.
5. `SignalUpdated` fires → your existing on-chain `MirrorReactor` subscription (this part stays fully on-chain Reactivity, since it's your own contract's event) fans out to followers in the same block, each placing their own sized IOC order on the same live market via the SDK.

This is the one piece of real infrastructure you're adding: a small always-on watcher process per active wallet-vault. Everything after `publish()` is still on-chain and automatic.

## 3. Vault discovery — showing the source clearly

**Vault list/detail page needs:**

- A source badge: "Wallet-tracked" or "AI Agent," pulled straight from `VaultMeta.sourceType`.
- For **wallet vaults**, a stats panel sourced from the strategist's actual dreamDEX trading history — not just your own signal log, since `getUserFills(account)` gives you their full venue-wide tape:
  - Win rate: redeem outcomes per resolved market (`getMarketResolution` + `getBinaryPositionPnL(account, marketId)` per past position)
  - Total volume, number of trades, active streak
  - Wallet address, shown plainly (this is the whole point — followers are trusting a real, checkable trading history, not a black box)
  - Optionally: link out to the wallet on the Somnia explorer for full transparency
- For **agent vaults**, show whatever performance metrics you already compute from your own signal ledger (win rate, publish frequency, etc.) — no wallet history to pull since there's no real wallet behind it.

Compute the wallet stats with a background job (nightly or on-vault-view, cached) rather than live on every page load — `getUserFills` plus per-market PnL lookups is a lot of calls if done synchronously.

## 4. Follower experience (mostly unchanged, one addition)

Subscribe flow, risk settings, SVT approval — same as before regardless of source type; followers don't need to care whether they're following a wallet or an agent once subscribed, only when choosing.

**New addition: redemption.** Event Contracts don't auto-pay out — someone has to call `redeem()` per outcome after a market resolves. Add:
- A watcher scanning `Finalized` markets for follower positions with unredeemed balances (`getOutcomeBalance` per follower per market)
- Either auto-redeem on the follower's behalf (needs the same kind of one-time authorization you did for the wallet-relayer) or a "claim" button in the follower's dashboard showing unclaimed winnings

Skipping this means followers' winnings just sit there silently — worth treating as core to the loop, not an afterthought.

## 5. Testnet wiring (confirmed from the docs you pasted)

- Chain ID `50312`, same core contract addresses as mainnet (`BinaryMarketsModule`, `MarketsCore`, `OutcomeToken6909`, `OracleHub`, etc. — all CREATE3-deployed identically).
- Collateral is **tUSDC**, not USDso, on testnet: `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E`, 6 decimals (vs 18 on mainnet) — read `decimals()` dynamically everywhere, never hardcode.
- Fund test wallets: STT for gas via the Somnia faucet, tUSDC via `exchange.trader.faucet()` (10,000 cap per call, no webpage).
- Use `markets-sdk` ≥ 0.28.0 — below that, float prices land off the tick grid and most orders revert.
- Every write path (publish → mirror → order placement) must re-check on-chain market status is `Trading` right before sending, not trust a cached read.

## 6. Suggested build order

1. Contract changes: `VaultMeta`, updated `Signal` struct, relayer authorization function. Deploy to testnet.
2. Get the agent path working end-to-end again with the new `Signal` fields (`marketId`, `limitPrice`) — this validates your `publish()` → `MirrorReactor` → follower-order chain still works against real Event Contracts on testnet, without the added complexity of the watcher yet.
3. Build the wallet watcher service against `getUserFills`, test it standalone against a test wallet trading manually on testnet Event Contracts — confirm it correctly detects fills and translates them.
4. Wire the watcher's output into `publish()` via the relayer — full wallet-vault loop, testnet, one strategist wallet, one follower wallet.
5. Add redemption watcher/claim flow.
6. Build the vault discovery UI: source badges, wallet stats panel using `getUserFills` + `getBinaryPositionPnL`.
7. Run the full loop with multiple concurrent markets and multiple followers to shake out the "pools get recycled, key by marketId" class of bugs before touching mainnet.
