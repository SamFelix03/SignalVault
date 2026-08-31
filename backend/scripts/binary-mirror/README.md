# Binary Mirror Isolation Scripts

Step-by-step diagnostics for **signal → mirror → EventContractsRouter → dreamDEX pool**.

Default vault: `0xd97cBa8979EAA4b1eE6661Ab64b70a5d88E68Eb8`  
Default follower: `0x6C8011a929164485c3aED93433E7363Fcb990b97`

Run from `backend/`:

```bash
cd backend
npx tsx scripts/binary-mirror/run-all.ts
```

## Scripts (run in order)

| # | Script | What it checks |
|---|--------|----------------|
| 01 | `01-vault-wiring.ts` | Vault ↔ mirror ↔ router alignment, follower subscribed |
| 02 | `02-follower-prereqs.ts` | tUSDC balance, vault/router allowances, paymentAuthorized |
| 03 | `03-current-signal.ts` | On-chain signal direction, limit price (human %) |
| 04 | `04-mirror-events.ts` | `MirrorExecuted` / `MirrorFailed` / `OrderMirrored` history |
| 05 | `05-signal-tx.ts` | One signal tx + mirror/router events in same window |
| 06 | `06-market-onchain.ts` | Market TRADING status, pool, expiry |
| 07 | `07-order-book.ts` | YES/NO book depth vs limit — will IOC fill? |
| 08 | `08-quantity-math.ts` | BUY_YES vs BUY_NO qty formulas + escrow |
| 09 | `09-simulate-router.ts` | `eth_call` router.placeOrder scenarios |
| 10 | `10-decode-mirror-tx.ts` | Decode logs from one mirror callback tx |
| 11 | `11-follower-fills.ts` | dreamDEX indexer fill tape for follower |

## Examples

```bash
# Full suite
npx tsx scripts/binary-mirror/run-all.ts

# Custom vault / follower
npx tsx scripts/binary-mirror/02-follower-prereqs.ts 0xd97c... 0x6C80...

# Inspect latest published signal
npx tsx scripts/binary-mirror/05-signal-tx.ts 0x24ff901e9f25bc5d626ef26a59ac04051911f9a321729eebb0eda47ae69c17a9

# Decode mirror failure (get tx from script 04)
npx tsx scripts/binary-mirror/10-decode-mirror-tx.ts 0x55d5f4f58782edb37e72c18d7198a0e24303acb61e956f030aa84e9f6d234781
```

## How to read failures

| Symptom | Likely layer | Script |
|---------|--------------|--------|
| Router allowance 0 | Follower setup | 02 |
| `MirrorFailed` + gas ~259k | No router allowance / early revert | 02, 10 |
| `MirrorFailed` + gas ~745k | Pool order / fill failed | 07, 08, 09 |
| Limit shows billions % | SDK tick bug (fixed) | 03 |
| DOWN never fills | Limit vs NO book | 07 |
| `unknown error` | Pool custom revert (qty/escrow) | 08, 10 |
| No `OrderMirrored` | Router never completed order | 04, 05, 09 |

## Pipeline

```
Agent publish → SignalUpdated (vault)
       ↓
MirrorReactor (reactivity) → chargeSignalFee → router.placeOrder
       ↓
EventContractsRouter → pull tUSDC → placeBinaryOrder (IOC) → forward outcome tokens
       ↓
OrderMirrored + MirrorExecuted
```
