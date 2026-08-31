# Event Contracts

Event Contracts trade on the Somnia Markets on-chain order book. The developer surface is the **`@somnia-chain/markets-sdk`** (TypeScript) — the [HTTP API](/developers/http-api.md) covers spot only and has no event-contract endpoints.

With the SDK you can:

* Discover live markets and stream order books, fills, and candles in real time
* Place and cancel orders by symbol in human units (prices are Up probabilities in (0, 1))
* Mint and merge complete sets (1 USDso ⇄ 1 Up + 1 Down) for sell-side inventory
* Redeem winning positions after settlement

## Install

The SDK is public on npm. Nothing else to configure:

```bash
npm install @somnia-chain/markets-sdk viem
```

Use version 0.28.0 or newer. Two floors matter: below 0.23.0 nothing reads at all, because the indexer dropped the `longOpenInterest` column those versions still ask for and `loadMarkets` and `listBinaryMarkets` both fail; and below 0.28.0 an ordinary float price lands off the tick grid and the pool rejects it. The examples here are TypeScript, so run them with a TypeScript runner such as [`tsx`](https://tsx.is) (`npx tsx bot.ts`).

## A minimal loop

Discover a market, gate on its live on-chain state, read the book, take a position:

```ts
import { SomniaMarkets, isBinaryMarket, type PlaceOrderResult } from "@somnia-chain/markets-sdk";

const exchange = new SomniaMarkets({ indexerUrl, chain, wsRpcUrl, addresses, privateKey });
const markets = Object.values(await exchange.loadMarkets(true));

for (const m of markets) {
  // `info` is a union across market kinds; isBinaryMarket narrows it.
  if (!m.active || !isBinaryMarket(m.info)) continue;

  // The indexer lags: gate every write on the live on-chain status (1 = Trading).
  // Row ids are plain strings; the client wants them hex-typed.
  const onchain = await exchange.client.getMarketOnchain(m.info.marketId as `0x${string}`);
  if (onchain.status !== 1) continue;

  const upSymbol = m.outcomes?.[0]?.symbol;   // e.g. "BTC-0-12AUG26-1600/USDso#YES"
  if (!upSymbol) continue;
  const book = await exchange.fetchOrderBook(upSymbol, 5);
  const ask = book.asks[0]?.[0];
  if (ask === undefined) continue;                    // no resting liquidity yet

  // Cross the touch; IOC so the unfilled remainder never rests silently.
  // From 0.23.0 a reverted write throws a decoded revert error, so let it
  // propagate or catch it here rather than testing a status flag.
  const order = await exchange.createOrder(upSymbol, "limit", "buy", 5, ask + 0.02, { timeInForce: "IOC" });

  // The receipt rides on `info`; the order itself has no `receipt` field.
  const { receipt } = order.info as PlaceOrderResult;
  console.log("filled in", receipt.transactionHash);
}
```

The package README on [npm](https://www.npmjs.com/package/@somnia-chain/markets-sdk) covers the rest of the surface: realtime watches, the React hooks, and the raw trader tier. Types ship with the package, so an editor with TypeScript will autocomplete the whole API.

Go deeper: [Recipes](/developers/event-contracts/recipes.md) has a snippet for every action a bot needs, from resting a quote to redeeming after settlement; [Market Structure & Lifecycle](/developers/event-contracts/market-structure.md) explains the contract family, the four fill paths, and escrow; [Contracts & Addresses](/developers/event-contracts/contracts-and-addresses.md) lists the deployed core.

{% hint style="info" %}
There are no API rate limits: market data is the chain itself, and the public RPC endpoints are unthrottled. A trading system should snapshot once and stay current from on-chain events — the SDK's live watches do exactly this.
{% endhint %}

Two mechanics worth understanding before you build:

* **One book, two sides.** Up and Down trade on a single order book; a Down price is always 1 minus the Up price. Two opposite-side buyers can cross with no seller at all — the pool mints a fresh Up/Down pair from their combined collateral (so you can quote both sides with zero inventory).
* **Markets die on schedule and respawn.** Every window has a hard expiry; the venue rolls a successor automatically. Track the successor via the market list, and note that a settled market leaves the live list — winnings are claimed by scanning recently settled markets.

Read the [Gotchas](/developers/event-contracts/gotchas.md) before sending a real order.

# Recipes

Every action an event-contract bot needs, as a short snippet. All of these assume an `exchange` built as in [Building on Event Contracts](/developers/event-contracts.md), and a signer for anything that writes. Types used below (`PlaceOrderResult`) come from the same package.

Three tiers are available and you will use all of them:

| Tier            | Reach it with       | Use it for                                                                            |
| --------------- | ------------------- | ------------------------------------------------------------------------------------- |
| Unified         | `exchange.*`        | Trading by symbol in human units. Most of your bot.                                   |
| Client (reads)  | `exchange.client.*` | On-chain truth: market status, outcome balances.                                      |
| Trader (writes) | `exchange.trader.*` | The few writes the unified tier does not model, notably redeeming a specific outcome. |

## Find a market worth trading

Gate on the **on-chain** status, and skip windows that are about to close.

`listLiveBinaryMarkets` returns only the windows that are currently open, already scoped to binary markets, so there is no spot or perp to fetch and discard:

```ts
const now = Date.now() / 1000;
const candidates = [];

for (const m of await exchange.client.listLiveBinaryMarkets({ limit: 50 })) {
  // The row carries an indexer status too, but that trails the chain.
  const onchain = await exchange.client.getMarketOnchain(m.marketId as `0x${string}`);
  if (onchain.status !== 1) continue;                 // 1 = Trading
  const secondsLeft = Number(m.expiry) - now;
  if (secondsLeft < 300) continue;                    // no time for anything useful
  candidates.push({ market: m, onchain, secondsLeft });
}
```

Pass a filter to narrow by venue, asset or cadence. `loadMarkets` still works if you want one symbol-keyed map across every market kind, but for a bot that only trades event contracts this is the direct route.

Keep the `onchain` snapshot you validated and reuse it for the rest of the pass. Pools are recycled between windows, so a snapshot taken now is the one generation your reads and writes agree on.

## Read the book

```ts
const [up, down] = market.outcomes ?? [];
if (!up || !down) return;                       // not a binary market
const { yes, no } = { yes: up.symbol, no: down.symbol };
const book = await exchange.fetchOrderBook(yes, 5);
const bestBid = book.bids[0]?.[0];
const bestAsk = book.asks[0]?.[0];
```

Prices are Up probabilities in (0, 1). The Down book is the same book read from the other side: quote `no` and the SDK converts to Up terms for you.

## Read a market's volume

Every market row carries its own traded volume, so per-contract volume is a read rather than something you aggregate yourself:

```ts
const rows = await exchange.client.listBinaryMarkets({ status: "Finalized", limit: 60 });

for (const m of rows.filter((r) => Number(r.tradeCount) > 0)) {
  console.log({
    asset: m.asset,                                       // "BTC" | "ETH"
    cadence: Number(m.intervalSec) / 60 + "m",
    volume: Number(m.cumulativeQuoteVolume) / 1e18,       // collateral, USDso
    contracts: Number(m.cumulativeBaseVolume) / 1e18,
    trades: Number(m.tradeCount),
    lastPrice: m.lastPrice ? Number(m.lastPrice) / 1e18 : null,
    lastTradeAt: m.lastTradeAt,
  });
}
```

To rank markets by volume rather than scan for it, pass `orderBy: "volume"`. The sort runs server-side; the keys are `newest`, `closingSoon`, `volume` and `tradeCount`.

`cumulativeQuoteVolume` is the collateral that changed hands, counting each fill once: a direct fill is worth one side's notional, and a mint or burn is worth the whole contract because the two sides each pay their share of it. Summing your own per-trader legs instead gives a larger number, because a direct fill has both a payer and a receiver.

Divide by the collateral's decimals, not by a constant: 18 on mainnet USDso, 6 on the testnet faucet token.

For a ccxt-shaped view of the same numbers, `fetchTicker(outcomeSymbol)` returns `baseVolume` and `quoteVolume` already scaled.

## Size to the venue's lot grid

From markets-sdk 0.24.0 `amountToPrecision` reads the pool's lot size, so the unified verbs size correctly on their own. Anything below one lot floors to **zero**: ask for 0.0004 contracts on mainnet and you get `0`, with nothing thrown. Check the result and skip the order when it comes back 0, or you will send an order for nothing and wonder why the book never shows it.

You still quantize by hand when you build params for the raw trader tier, which takes exact units:

```ts
const LOT = 1_000_000_000_000_000n;           // 1e15 on an 18-decimal venue
const decimals = 18;

function quantize(human: number): number {
  const raw = BigInt(Math.floor(human * 10 ** decimals));
  const snapped = (raw / LOT) * LOT;
  return Number(snapped) / 10 ** decimals;    // 0 means "below one lot, skip"
}
```

## Price and size on the venue's grid

The pool accepts prices on a tick grid and sizes on a lot grid. Read them rather than hardcoding them, because they scale with the collateral's decimals:

```ts
const { tickSize, lotSize, minQuantity } = await exchange.client.getBinaryBookParams(pool);
// mainnet today: all three are 1e15, so 0.001 in probability and 0.001 contracts
```

From markets-sdk 0.28.0 the unified verbs snap for you. `priceToPrecision` takes `0.0512` to `0.051`, and `amountToPrecision` takes `0.137` to `0.137`, both on the venue's own grid, so ordinary numbers convert onto the grid instead of a few wei off it.

{% hint style="warning" %}
Below 0.28.0 an ordinary float price did not land. `createOrder` converted with `parseUnits(price.toFixed(18), 18)`, and `(0.05).toFixed(18)` is `"0.050000000000000003"`, three wei off the grid, which the pool rejects with `InvalidPrice`. Only 0.25, 0.5 and 0.75 survived that conversion. If you are pinned below 0.28.0, snap prices to whole ticks and send bigints through the raw trader tier.
{% endhint %}

When you want exact units rather than the unified verbs, build them yourself and send them through the raw trader tier:

```ts
const ONE = 10n ** 18n;                 // collateral scale, 1e6 on testnet
const TICK = 1_000_000_000_000_000n;    // 1e15 = 0.001 here, 1e3 on testnet
const LOT = TICK;

const ticks = (p: number) => BigInt(Math.round(p * Number(ONE / TICK))) * TICK;
const lots = (q: number) => BigInt(Math.floor(q * Number(ONE / LOT) + 1e-9)) * LOT;

await exchange.trader.placeOrder({
  pool: onchain.pool,
  side: "BUY_YES",                      // or SELL_YES / BUY_NO / SELL_NO
  price: ticks(0.05),                   // always in YES terms: a NO price is ONE - ticks(p)
  quantity: lots(5),
  orderType: ORDER_TYPE.POST_ONLY,      // LIMIT | MARKET (IOC) | FILL_OR_KILL | POST_ONLY
  expireTimestampNs: BigInt(Math.floor(Date.now() / 1000) + 300) * 1_000_000_000n,
});
```

## Take liquidity

Cross the touch with IOC so the remainder never rests behind your back.

```ts
const size = quantize(5);
if (size > 0 && bestAsk !== undefined) {
  const order = await exchange.createOrder(yes, "limit", "buy", size, bestAsk + 0.02, {
    timeInForce: "IOC",
  });
  // The unified result has no `receipt` of its own: it wraps the raw tx result
  // in `info`, and that is where the on-chain status lives.
  const { receipt } = order.info as PlaceOrderResult;
  if (receipt.status === "reverted") throw new Error("reverted on-chain");
  console.log(`filled ${order.filled} of ${order.amount}`);
}
```

## Rest a quote

Post-only means the order refuses to cross, so a quoting loop never pays the spread.

A post-only that would have crossed **reverts** with `PostOnlyWouldCross()`, and the call throws. It does not come back with a status for you to inspect, on either tier: the unified `createOrder` and the raw `trader.placeOrder` both raise it. Catch it and treat it as "the book moved into me", which on a quoting loop is a normal event rather than a fault.

```ts
try {
  await exchange.createOrder(yes, "limit", "buy", size, 0.45, { postOnly: true });
} catch (err) {
  if (String(err).includes("PostOnlyWouldCross")) {
    // the touch moved through our price between the read and the send; requote
  } else {
    throw err;
  }
}
```

Every order carries an expiry capped at the market's own. Set it just past your requote interval and a crashed bot's orders age off the book on their own.

## Get inventory so you can sell

You can only sell an outcome you hold, and there is no naked short. New tokens come from minting a **complete set**: collateral in, one Up plus one Down out.

```ts
await exchange.mintSet(market.symbol, 10);    // 10 collateral -> 10 Up + 10 Down
// ...later, to unwind an unsold pair back to collateral:
await exchange.burnSet(market.symbol, 10);
```

You do not need this to quote both sides. Two opposite-side buyers cross with no seller at all (the pool mints the pair from their combined collateral), so a resting Buy Up at *p* plus a Buy Down at *1 − p* is already a two-sided quote with zero inventory.

## Manage working orders

```ts
const open = await exchange.fetchOpenOrders(yes);
for (const o of open) await exchange.cancelOrder(o.id, yes);
```

Cancel refunds return to your **wallet**, in the exact amount that was escrowed, so reconcile there. The per-pool vault is a payout fallback and normally reads 0, though placement draws it first when it does hold something.

## Know what actually filled

Treat your own trade history as the source of truth for position, not what you asked for.

```ts
const trades = await exchange.fetchMyTrades(yes, since);
const shares = trades.filter((t) => t.side !== "sell").reduce((n, t) => n + t.amount, 0);
```

Indexer rows land a few seconds after the transaction confirms, so poll with a deadline rather than trusting a single read.

## Check your positions

Outcome tokens are ids on one shared ERC-6909 contract, not per-market ERC-20s, so read them by id:

```ts
const me = exchange.walletAddress;
if (!me) throw new Error("no signer");
const up = await exchange.client.getOutcomeBalance(onchain.outcomeToken, me, onchain.yesId);
const down = await exchange.client.getOutcomeBalance(onchain.outcomeToken, me, onchain.noId);
```

## Redeem after settlement

This is the step people miss, and `loadMarkets()` will not help you find it.

A settled market leaves the live list, and the registry sweep behind `loadMarkets()` skips finalized binary markets outright — so filtering it for inactive rows returns an empty set and a redeem-by-scan bot silently reports nothing to claim while real winnings sit unredeemed.

The binary tier still has them, under the terminal status `"Finalized"`:

```ts
const settled = await exchange.client.listBinaryMarkets({
  venueId,
  status: "Finalized",
  limit: 120,
});
const settledMarketIds = settled
  // The server sorts newest-created; you want newest-expired. Those agree within
  // a series but not across cadences, so over-fetch and sort before you cut.
  .sort((a, b) => Number(b.expiry ?? 0) - Number(a.expiry ?? 0))
  .slice(0, 40)
  .map((m) => m.marketId);
```

Then redeem through the trader with an explicit outcome index. The convenience method infers the winner from the market, which is meaningless on a voided market where both sides pay 0.5.

```ts
type OutcomeIdx = 0 | 1;
const UP: OutcomeIdx = 0, DOWN: OutcomeIdx = 1;

// marketIds from the query above.
for (const marketId of settledMarketIds) {
  const oc = await exchange.client.getMarketOnchain(marketId as `0x${string}`);
  if (!oc.isResolved && !oc.isVoided) continue;

  const held: Record<OutcomeIdx, bigint> = {
    [UP]: await exchange.client.getOutcomeBalance(oc.outcomeToken, me, oc.yesId),
    [DOWN]: await exchange.client.getOutcomeBalance(oc.outcomeToken, me, oc.noId),
  };

  // Voided: claim both sides at 0.5. Resolved: only the winning side pays.
  const toClaim: OutcomeIdx[] = oc.isVoided ? [UP, DOWN] : [oc.winningOutcome === 0 ? UP : DOWN];

  for (const outcome of toClaim) {
    if (held[outcome] === 0n) continue;
    const res = await exchange.trader.redeem({
      marketId: marketId as `0x${string}`,
      market: oc.marketAddress,
      outcomeToken: oc.outcomeToken,
      outcomeIdx: outcome,
      amount: held[outcome],
    });
    if (res.receipt?.status === "reverted") throw new Error("redeem reverted");
  }
}
```

Redeeming a losing position does not revert. It succeeds and pays nothing, so check the outcome before you spend gas.

## Read a settled market's history

Settled markets are not in `loadMarkets()`, and `listBinaryMarkets({ status: "Finalized" })` is only the start of what the indexer keeps. There is a purpose-built history surface:

```ts
// most-recently-expired first; filter by venue, asset, cadence; page with limit + offset
const past = await exchange.client.listPastBinaryMarkets({ status: "Finalized", asset: "BTC", limit: 50 });

const total = await exchange.client.countBinaryMarkets({});      // how far the tail goes
const res   = await exchange.client.getMarketResolution(marketId);
const open  = await exchange.client.getOpeningPrices([marketId]);
const pnl   = await exchange.client.getBinaryPositionPnL(account, marketId);
```

`getMarketResolution` returns objects rather than bare prices. The number you want is `numericValue`: compare `openingAnswer.numericValue` against `closingAnswer.numericValue` and you have the comparison the market settled on, alongside `events` for the lifecycle.

Use **`Finalized`** to reach settled markets. Resolution auto-finalizes, so markets do not linger in `Resolved`, and asking for that status returns an empty list.

{% hint style="warning" %}
`getCandles` and `getFills` are keyed on the **pool**, and a pool serves many successive markets. One live pool has already carried 100 of them, so `getCandles(poolAddress, 60)` happily returns candles from dozens of markets that are not the one you asked about.

Scope every history read to the market's own window, or filter the rows by `market` afterwards. Note the option names differ between the two calls:

```ts
const candles = await exchange.client.getCandles(pool, 60, { from: m.tradingStart, to: m.expiry });
const fills   = await exchange.client.getFills(pool, { since: m.tradingStart, until: m.expiry });
```

{% endhint %}

Candle buckets come at 60, 300, 900, 3600, 14400 and 86400 seconds. `getUserFills(account, opts)` is the same tape filtered to one wallet.

### What is kept

Fills, orders and candles all survive settlement. A five-week-old finalized market still returns its full trade tape, its candles, and every order that ever rested on it, including the ones that were cancelled without trading.

There is no order-book snapshot table, but you do not need one: every order carries `placedAtBlock` and `lastUpdatedAtBlock`, so the resting book at any block is derivable from the order rows, and the fills carry `blockNumber` and `logIndex` for exact ordering.

Two things not to assume. `fetchPriceCandles` reads an external price feed rather than the book, and needs `priceFeed` configured. And `getMarketStatusHistory` currently returns the `Locked` transition rather than a full `Listed → Trading → … → Resolved` trail.

## Follow a series as it rolls

Windows expire on a schedule and the venue opens a successor automatically. Key your state by `marketId` or by symbol, never by pool address, and re-resolve the current window each cycle rather than caching it.

```ts
// Every cycle: re-read the market list, pick the live window for your series,
// and start a fresh position count when the symbol changes.
if (currentSymbol !== previousSymbol) resetPositionState();
```

## Where to go next

The full API surface, including realtime watches and the React hooks, is documented in the package README on [npm](https://www.npmjs.com/package/@somnia-chain/markets-sdk). Types ship with the package, so an editor with TypeScript will autocomplete everything above.

Read the [Gotchas](/developers/event-contracts/gotchas.md) before sending a real order.
# Market Structure & Lifecycle

## One market, four contracts

Every event-contract market is a small family of contracts deployed per window:

| Piece                 | Role                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `BinaryMarketsModule` | The registry and user entry point. Holds every market's record (`markets(marketId)`), routes complete-set mints/merges and redemptions. |
| Market contract       | Per-window lifecycle state: trading window, resolution, winning outcome.                                                                |
| Pool (order book)     | The CLOB you trade on. Extends the same on-chain matching engine as spot, and owns all escrow.                                          |
| `OutcomeToken6909`    | One shared ERC-6909 singleton for all markets — Up and Down positions are token *ids* on it, not separate ERC-20 deploys.               |

Markets are identified by a `bytes32 marketId` (a module-scoped counter). **Key your state by `marketId` or symbol, never by pool address**: pools are recycled across successive windows of a series, so a pool address is a time-varying binding.

## Lifecycle

```
Listed → Trading → Locked → Resolved | Voided
  0        1          2         4        5
```

* **Listed (0)** — deployed, not yet open.
* **Trading (1)** — the only state that accepts orders. Mint/merge of complete sets is live.
* **Locked (2)** — the window ended; no new orders, cancels still work. Awaiting the settlement price.
* **Resolved (4)** — winning side fixed; winners redeem 1 USDso per contract (less the venue settlement fee — 0 on dreamDEX).
* **Voided (5)** — no reliable settlement price inside the settlement window; both sides redeem at 0.5.

Status transitions are time-derived on-chain — read the market's live status before every write; the indexed status lags by seconds. (An intermediate `Settling (3)` exists in the enum but is effectively never observable.)

## The order book: one book, two sides

Up and Down trade on a **single** order book quoted in Up terms; a Down price is always `1 − up price`. Crossing orders settle by one of four paths:

| Crossing pair        | Path            | What happens                                                            |
| -------------------- | --------------- | ----------------------------------------------------------------------- |
| Buy Up × Sell Up     | direct          | Up tokens ↔ collateral swap                                             |
| Buy Down × Sell Down | direct          | Down tokens ↔ collateral swap                                           |
| Buy Up × Buy Down    | **mint-a-pair** | Both pay collateral; the pool mints a fresh Up/Down pair, one side each |
| Sell Up × Sell Down  | burn-a-pair     | Both positions burn; each seller is paid their share                    |

Mint-a-pair is the cold-start mechanism: two opposite-side buyers need no seller and no market maker — which also means you can quote **both sides with zero inventory** (a resting Buy Up at *p* plus Buy Down at *1 − p* is a complete two-sided quote).

## Escrow and complete sets

* **Buys** escrow collateral at placement (worst case, vault-first: your per-pool vault balance is spent before your wallet).
* **Sells** escrow the outcome tokens themselves — you can only sell what you hold. New tokens come from minting a **complete set**: 1 USDso mints 1 Up + 1 Down (`mintCompleteSet`), and merging a pair returns 1 USDso (`mergeCompleteSet`).
* Refunds settle in your **wallet**. Cancelling a resting bid returns the exact escrow to it, and a taker is charged the fill price rather than the price it offered. The pool vault is a payout fallback that reads 0 in normal operation, which is why placement can draw it first without you ever seeing a balance there.

## Settlement rail

Resolution is oracle-driven and permissionless to observe: the settlement reference for each market is published, results are checked against the window's opening price, and redemption is served on-chain. The protocol supports a one-time settlement fee on winning redemptions; dreamDEX sets every fee — maker, taker, and settlement — to zero.

### Who triggers resolution

Nobody has to — the chain does. Each market's settlement question is scheduled on the oracle hub at creation, with the gas for its future resolution reserved up front. When the oracle posts the settlement answer at expiry, **Somnia's on-chain reactivity delivers that event straight to the hub's callback** — no keeper, no cron job, no operator in the loop. The hub hands the result to the `BinaryMarketsModule` (the only address a market trusts as its settler), the market flips to Resolved or Voided, and finalization happens in the same flow, so redemption opens immediately.

Two permissionless backstops cover a missed callback:

* `pokeOracle(questionId)` pulls a posted answer manually and resolves the market.
* Once the settlement window passes with no answer, anyone can call the market's `voidExpired()` — it voids, and both sides redeem at 0.5.

A market can never strand funds waiting on someone's permission.

### Auditing a resolution

How the *answer itself* is produced is public. A market row carries an `oracleQuestionId`, and that id is the question's number on the oracle explorer, so you can deep-link any market straight to its own resolution:

```
https://prd.oracle.somnia.host/questions/{oracleQuestionId}?view=graph
```

The Graph tab walks the pipeline for that market: the on-chain question definition, every price source with the value it returned and a receipt, the median across them, the minimum number of sources that had to succeed, and the interval the median fell into. Worth surfacing in any interface you build on top of event contracts.

# Contracts & Addresses

The protocol core is deployed via CREATE3, so the addresses are **identical on testnet and mainnet**:

| Contract            | Address (testnet 50312 = mainnet 5031)       |
| ------------------- | -------------------------------------------- |
| BinaryMarketsModule | `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| MarketsCore         | `0x2802504314685D89bF6C992CA5a8e7cC78bc0294` |
| BinarySettlement    | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |
| OutcomeToken6909    | `0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9` |
| OracleHub           | `0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b` |
| CollateralRouter    | `0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C` |

Per-market contracts (the market and its pool) are read from the module registry — `markets(marketId)` — or from the SDK; never hardcode them, since pools are recycled across windows.

**Collateral** is per-venue:

| Network | Token | Address                                      | Decimals |
| ------- | ----- | -------------------------------------------- | -------- |
| Mainnet | USDso | `0x00000022dA000002656c64D9eA6011ea952D008A` | 18       |
| Testnet | tUSDC | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` | 6        |

The two differ by a factor of 10^12. A constant that converts correctly on testnet misprices every order, book read and balance on mainnet, and nothing reverts to tell you — derive the scale from the collateral's `decimals()` rather than from a literal.

These are proxies, so each one's implementation can roll forward while the address stays put. Check any of them on the Somnia explorer: [mainnet](https://explorer.somnia.network) and [testnet](https://shannon-explorer.somnia.network).

Working from a non-JS stack? `@somnia-chain/markets-sdk` exports the ABIs you need directly (`binaryModuleReadAbi`, `binaryModuleWriteAbi`, `binarySettlementAbi`, `erc6909Abi`, `oracleHubAbi`), so you can pull them out of the package and drive the contracts with any RPC client. The package ships its own sources, so `npm pack` and open `src/` to read them as human-readable signature strings that mirror the Solidity.

{% hint style="warning" %}
Confirm the addresses on-chain before trading real funds, and never hardcode a market or pool address: those are per-window, and pools are recycled across windows. Read them from the module registry or the SDK instead.
{% endhint %}

## Getting testnet collateral

The testnet token mints on demand, so there is no faucet page and no address to paste anywhere: `faucet(uint256 amount)` credits **`msg.sender`**, and each call is capped at **10,000 tUSDC**. Asking for more reverts with `FaucetCapExceeded`.

```ts
await exchange.trader.faucet();                       // 10,000 tUSDC, the cap
await exchange.trader.faucet({ amount: 500n * 10n ** 6n });  // raw units, 6 decimals
```
# Gotchas

The things that bite people building on event contracts. All of these were hit and verified in real testing.

### 1. Gate on the on-chain market status, not the indexer

The indexer lags by seconds. Before every write, read the market's on-chain state and only trade a market in **Trading**. Orders on a market that just locked revert — or worse, appear to succeed (see #2).

### 2. Know how a revert reaches you

SDK writes sign with fixed fees and skip simulation. Through markets-sdk 0.22.0 they resolved even when the transaction reverted on-chain, so a mint on a just-locked market "succeeded" silently; from 0.23.0 the write throws a decoded revert error instead. On a supported version let that error propagate rather than checking a status flag, and on anything older check `receipt.status` yourself.

Where the receipt lives depends on the tier. `exchange.trader.*` returns it directly. The unified verbs (`createOrder`, `mintSet`, …) return a `UnifiedOrder` with **no `receipt` field of its own** — it wraps the raw result in `info`, so read `(order.info as PlaceOrderResult).receipt`. Reaching for `order.receipt` compiles against `unknown` in some setups and is always `undefined`, which silently disables the check.

### 3. Below 0.28.0, a float price reverts on an 18-decimal venue

Fixed in markets-sdk 0.28.0, which snaps to the venue's tick grid for you. Before it, `createOrder` converted with `parseUnits(price.toFixed(18), 18)`, and `(0.05).toFixed(18)` is `"0.050000000000000003"` — three wei off the grid, which the pool rejects with `InvalidPrice`. Of fifteen ordinary probabilities only 0.25, 0.5 and 0.75 survived, the ones binary floating point represents exactly. A 6-decimal venue never showed it, so testnet looked clean while every mainnet order failed. If you are pinned below 0.28.0, snap the price to whole ticks and send a bigint through `trader.placeOrder`.

### 4. Decide between taking and resting

The unfilled remainder of a limit order rests on the book with escrow locked — invisibly, if you are not tracking open orders. Taker-style bots should send IOC; resting liquidity should be a deliberate choice with cancel management around it.

### 5. Order expiry is mandatory — make it your dead-man's switch

Every order carries `expireTimestampNs`: unix time in **nanoseconds**, in the future, and no later than the market's own expiry. Set it just past your requote interval so a crashed bot's orders age off the book on their own.

There is no "no expiry" value: passing `0` reverts with `OrderAlreadyExpired`.

```ts
expireTimestampNs: BigInt(Math.floor(Date.now() / 1000) + 300) * 1_000_000_000n,
```

### 6. Size to the venue's lot grid

Through markets-sdk 0.23.0 the generic `amountToPrecision` skipped lot sizing on event-contract markets and snapped to whole contracts, which floors anything under one contract to zero on an 18-decimal venue. From 0.24.0 it reads the pool's lot size. If you build order params yourself for `trader.placeOrder`, you are still quantizing by hand: snap to the lot grid and skip when the result is 0.

### 7. Reconcile against the wallet, and check it before you sign

Escrow leaves the wallet and comes back to it. Cancel a resting bid and the exact escrow returns; cross a 0.945 ask with a 0.98 bid and you are charged 0.945, not 0.98. The per-pool vault is a payout **fallback** and reads 0 in normal operation, though placement draws it first when it does hold something.

Check the balance before you sign, because a reverted write does not throw (#2). An underfunded bot does not stop: it sends an order that reverts on every cycle and pays gas each time. The on-chain reason is a bare selector unless you decode it, `ERC20InsufficientBalance` for a buy with no collateral and `InsufficientBalance()` for a sell with no outcome tokens.

### 8. Scope to the venue

A deployment hosts more than one venue, and markets from all of them sit side by side in the indexer. Filter by the venue id (from the market row) or your bot will happily quote a venue you did not mean.

### 9. Pick markets with expiry headroom

A window minutes from close can lock between your snapshot and your send: orders expire silently and reads flip to Locked mid-flight. Skip markets with only a few minutes left.

### 10. `loadMarkets()` will not show you a settled market

Winnings live in markets that have already resolved, and the registry sweep behind `loadMarkets()` skips finalized binaries — so filtering it for inactive rows returns nothing and a redeem-by-scan bot reports no winnings while real ones sit unclaimed.

Ask the binary tier instead. A settled binary's terminal status is `"Finalized"`, and it is a filter like any other:

```ts
const settled = await exchange.client.listBinaryMarkets({ venueId, status: "Finalized" });
```

### 11. Winners pay out via the settlement rail

The protocol supports a one-time settlement fee on winning redemptions; **on dreamDEX it is set to zero**, so winners redeem 1:1. Redeeming a losing position succeeds and pays 0 — it does not revert. On a voided market, redeem both sides explicitly (each pays 0.5); there is no winning outcome to infer.

### 12. Pools are recycled, so key state by market id

Every window ends and the venue rolls a successor, but the pool the market traded on goes back to a free list and is reused by a later market. A pool serves one market at a time, never two concurrently, so `poolAddress` is a 1:1 binding that varies over time. State keyed by pool address will silently attach to a market you never traded.

Key by `marketId`, or by symbol, and treat the pool as something you read per market rather than remember. Where you do need to tell a pool's successive markets apart, the pair `(poolAddress, nonce)` identifies one of them, and `nonce` is what an outcome id carries. It can be `null` on a market discovered from a live event, in which case the next snapshot fills it in.

### 13. Do not parse the question text

The market's creation event carries `asset` and `intervalSec` as typed fields, and the indexer exposes both on `Market`. Read those. The question wording has changed several times, the fields have not, and a regex over "BTC closes at or above its opening price" breaks the next time someone rewords it.
