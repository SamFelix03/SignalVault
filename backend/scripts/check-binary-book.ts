/**
 * Check binary order book liquidity for YES vs NO sides.
 *   npx tsx scripts/check-binary-book.ts [asset]
 */
import 'dotenv/config'
import { createMarketsExchange } from '../src/services/markets-exchange.js'

const asset = process.argv[2] ?? 'BTC'

async function main() {
  const ex = await createMarketsExchange()
  const rows = await ex.client.listLiveBinaryMarkets({ limit: 50 })
  const now = Date.now() / 1000
  const row = rows.find((r) => r.asset === asset && Number(r.expiry) - now > 60)
  if (!row) throw new Error(`No live ${asset} market`)

  const markets = await ex.loadMarkets(true)
  const entry = Object.values(markets).find(
    (m) => m.active && m.info && 'marketId' in m.info && m.info.marketId === row.marketId,
  )
  if (!entry || !('outcomes' in entry) || !entry.outcomes) throw new Error('Market entry not found')

  const yes = entry.outcomes[0]?.symbol
  const no = entry.outcomes[1]?.symbol
  console.log({ asset, marketId: row.marketId, yes, no, secondsLeft: Math.round(Number(row.expiry) - now) })

  for (const sym of [yes, no]) {
    if (!sym) continue
    const book = await ex.fetchOrderBook(sym, 5)
    console.log(`\n${sym}`)
    console.log('  asks:', book.asks.slice(0, 3))
    console.log('  bids:', book.bids.slice(0, 3))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
