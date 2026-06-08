# Contract Specifications

## Overview

dreamDEX spot markets enable direct exchange of crypto assets with atomic on-chain settlement. Unlike perpetual contracts, spot trades result in immediate ownership transfer of the underlying assets with no margin, funding, or expiration mechanics.

All v1.0 spot markets are quoted in **USDso** (Somnia's USD stablecoin, backed 1:1 by FraxUSD via LayerZero), providing a consistent quote currency across pairs.

## Contract Specifications

| Specification       | Details                                                  |
| ------------------- | -------------------------------------------------------- |
| **Instrument Type** | Spot                                                     |
| **Settlement**      | Immediate (atomic)                                       |
| **Quote Currency**  | USDso                                                    |
| **Custody**         | Non-custodial (assets held in user wallet or pool vault) |
| **Tick Size**       | Varies per pair (see [Live Markets](#live-markets))      |
| **Lot Size**        | Varies per pair (see [Live Markets](#live-markets))      |
| **Minimum Order**   | Varies per pair (see [Live Markets](#live-markets))      |
| **Expiration**      | N/A                                                      |
| **Fees**            | 0% maker / 0% taker (configurable per pool)              |
| **Trading Hours**   | 24/7/365                                                 |

## Live Markets

All dreamDEX spot markets quote against **USDso**.

### Mainnet (chain ID `5031`)

| Pair                                         | SpotPool                                     |
| -------------------------------------------- | -------------------------------------------- |
| **SOMI**/USDso (native)                      | `0x035De7403eac6872787779CCA7CCF1b4CDb61379` |
| **USDC.e**/USDso (Bridged USDC via Stargate) | `0x47fD2f18426f67106DBaC82F6d21D446c5F2120b` |
| **WBTC**/USDso (Wrapped Bitcoin)             | `0x25bfF6B7B5E2243424F38E75de7ab03C0522a5EA` |
| **WETH**/USDso (Wrapped Ether)               | `0xa936da11B57b50A344e1293AAaE5232885ea2bDE` |

### Testnet (Somnia Shannon, chain ID `50312`)

| Pair                    | SpotPool                                     |
| ----------------------- | -------------------------------------------- |
| **SOMI**/USDso (native) | `0x259fD6559214dd5aD3752322426eA9F9fABEFff4` |
| **WBTC**/USDso          | `0x3605f28aA7C50e7441211e77Cb0762d49539326C` |
| **WETH**/USDso          | `0xD180195da5459C7a0DEA188ed61216ec43682b50` |

Per-pair tick / lot / minimum-quantity values are configured at pool initialization and can be queried at any time via the [`GET /v0/markets`](/ld25g222WKDrLlJMcR41/developers/http-api/market-data.md) HTTP endpoint or by calling `getPoolParams()` directly on the SpotPool contract — those calls are the canonical source of truth.

{% hint style="info" %}
**Raw values.** On-chain parameters are stored in raw token units. For example, with `USDso` at 18 decimals, a tick size of `0.01` USDso is stored as `10000000000000000` on-chain. Use `getPoolParams()` to query the raw values for a specific market.
{% endhint %}

{% hint style="success" %}
**Stablecoin conversion.** The USDC.e / USDso pair provides an on-ramp between bridged USDC and USDso, the quote currency used across dreamDEX.
{% endhint %}

{% hint style="warning" %}
**Native SOMI pool.** On the SOMI/USDso pair, SOMI is the chain's native token (no ERC-20 deposit). Use `depositNative()` with `msg.value` instead of `deposit(token, amount)`, and the `payable` variant of `placeTakerOrderWithoutVault` pulls input from `msg.value` instead of an ERC-20 allowance.
{% endhint %}

## Stop Order Registries

Each spot market has an associated [SpotStopOrderRegistry](/ld25g222WKDrLlJMcR41/trading/readme-1/stop-orders.md) for conditional stop-loss and take-profit orders. Registries are triggered automatically by Somnia's on-chain reactivity when the SpotPool's EMA-smoothed mark price crosses a trigger threshold.

### Mainnet

| Pool pair           | Stop Order Registry                          |
| ------------------- | -------------------------------------------- |
| SOMI/USDso (native) | `0x68c8f6fb1EA19A28F25358Ff00b8Ed8E1216df30` |
| USDC.e/USDso        | `0xD53E3F3b73513F2147377ef8f573f649cF60100c` |
| WBTC/USDso          | `0xed32F048D6a47923D38eCeD868d6f8b0eB4852bd` |
| WETH/USDso          | `0x9653a7355849B7691802A6AA49fDe18eF5ba633d` |

### Testnet

| Pool pair           | Stop Order Registry                          |
| ------------------- | -------------------------------------------- |
| SOMI/USDso (native) | `0xEb97349Aa62A68507c0bE535eD88B0d028a47E1e` |
| WBTC/USDso          | `0x53d5B2b0791b3992a1F3b5e0b0277Ee2e08B7aaD` |
| WETH/USDso          | `0xf822D4Cb94902d667c9650e702aA5f096cc7598F` |

### Default configuration

| Parameter              | Default                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `slippageToleranceBps` | `500` (5%) — used to compute the limit price for MARKET-type stop orders at trigger time          |
| `somiPaymentPerOrder`  | `0.1 SOMI` — exact payment required when creating a pending stop order                            |
| `minStopDistanceBps`   | `0` (disabled) — minimum allowed gap between a stop's `triggerPrice` and the current EMA midpoint |
| `gasBufferBps`         | `5000` (50%) — per-iteration gas headroom for the trigger loop                                    |

These are admin-tunable per registry. Read the live values via `slippageToleranceBps()`, `somiPaymentPerOrder()`, `minStopDistanceBps()`, and `gasBufferBps()` on the registry contract.
