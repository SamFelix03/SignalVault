#!/usr/bin/env npx tsx
/**
 * 07 — dreamDEX order book liquidity (YES + NO) for signal market.
 *
 *   npx tsx scripts/binary-mirror/07-order-book.ts [vault] [follower]
 *
 * Compares book prices vs signal limit to see if IOC can fill.
 */
import 'dotenv/config'
import { createMarketsExchange } from '../../src/services/markets-exchange.js'
import {
  applySlippage,
  createClient,
  decodeLimitHuman,
  loadVaultBundle,
  maxNoPayHuman,
  parseArgs,
  printHeader,
  pass,
  fail,
  warn,
  info,
} from './lib.js'

async function main() {
  const { vault, follower } = parseArgs()
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)
  const marketId = b.signal.marketId

  printHeader('07 — Order book liquidity')

  const ex = await createMarketsExchange()
  const markets = await ex.loadMarkets(true)
  const entry = Object.values(markets).find(
    (m) => m.active && m.info && 'marketId' in m.info && m.info.marketId === marketId,
  )

  if (!entry || !('outcomes' in entry) || !entry.outcomes) {
    fail(`No markets-sdk entry for marketId ${marketId}`)
    process.exit(1)
  }

  const yes = entry.outcomes[0]?.symbol
  const no = entry.outcomes[1]?.symbol
  info(`marketId: ${marketId}`)
  info(`yes: ${yes}`)
  info(`no:  ${no}`)

  const isBuyYes = b.signal.direction > 0
  const execPrice = applySlippage(b.signal.limitPrice, b.cfg.maxSlippageBps)
  
  if (isBuyYes) {
    info(`signal limit: ${decodeLimitHuman(b.signal.limitPrice)} [YES price for BUY_YES]`)
    info(`exec price:   ${decodeLimitHuman(execPrice)}`)
  } else {
    // For BUY_NO, limitPrice is already in NO terms
    const limitNo = Number(b.signal.limitPrice) / 1e6 * 100
    const execNo = Number(execPrice) / 1e6 * 100
    info(`signal limit: ${limitNo.toFixed(2)}% NO [NO price for BUY_NO]`)
    info(`exec price:   ${execNo.toFixed(2)}% NO (after ${b.cfg.maxSlippageBps}bps slip)`)
  }

  for (const sym of [yes, no]) {
    if (!sym) continue
    const book = await ex.fetchOrderBook(sym, 5)
    console.log(`\n--- ${sym} ---`)
    console.log('asks:', book.asks.slice(0, 5))
    console.log('bids:', book.bids.slice(0, 5))
  }

  console.log('\n--- Fillability check ---')
  if (b.signal.direction > 0 && yes) {
    const book = await ex.fetchOrderBook(yes, 3)
    const bestAsk = book.asks[0]?.[0]
    if (bestAsk === undefined) {
      fail('No YES asks')
    } else if (bestAsk <= Number(execPrice) / 1e6) {
      pass(`YES ask ${bestAsk} <= exec limit ${Number(execPrice) / 1e6} — should be fillable`)
    } else {
      fail(`YES ask ${bestAsk} > exec limit ${Number(execPrice) / 1e6} — IOC will NOT fill`)
    }
  } else if (b.signal.direction < 0 && no) {
    const book = await ex.fetchOrderBook(no, 3)
    const bestNoAsk = book.asks[0]?.[0]
    // execPrice is already in NO terms for BUY_NO
    const maxNoWilling = Number(execPrice) / 1e6
    if (bestNoAsk === undefined) {
      fail('No NO asks')
    } else if (bestNoAsk <= maxNoWilling) {
      pass(`NO ask ${bestNoAsk} <= exec limit ${maxNoWilling.toFixed(4)} — should be fillable`)
    } else {
      fail(`NO ask ${bestNoAsk} > exec limit ${maxNoWilling.toFixed(4)} — IOC will NOT fill`)
      warn('Need higher NO limit (increase buffer in SDK discovery).')
    }
  } else {
    warn('FLAT signal — no fill check')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
