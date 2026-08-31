#!/usr/bin/env npx tsx
/**
 * 11 — dreamDEX indexer fills for follower wallet.
 *
 *   npx tsx scripts/binary-mirror/11-follower-fills.ts [follower]
 */
import 'dotenv/config'
import { createMarketsExchange } from '../../src/services/markets-exchange.js'
import { DEFAULT_FOLLOWER, printHeader, info, pass, fail } from './lib.js'

async function main() {
  const follower = (process.argv[2] ?? DEFAULT_FOLLOWER) as `0x${string}`

  printHeader('11 — Follower fills (dreamDEX indexer)')

  info(`follower: ${follower}`)

  try {
    const ex = await createMarketsExchange()
    const fills = (await ex.client.getUserFills(follower, { limit: 20 })) as Array<{
      id: string
      market: string
      fillPrice: string
      timestamp: string
      takerIsBid?: boolean
      quoteQuantity?: string
    }>

    if (fills.length === 0) {
      fail('No fills returned — follower has not traded on dreamDEX (or indexer timeout)')
      process.exit(1)
    }

    pass(`${fills.length} fill(s)`)
    for (const f of fills.slice(0, 10)) {
      console.log({
        id: f.id,
        market: f.market,
        fillPrice: f.fillPrice,
        quoteQuantity: f.quoteQuantity,
        takerIsBid: f.takerIsBid,
        timestamp: f.timestamp,
      })
    }
  } catch (e: unknown) {
    fail(`Indexer error: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
