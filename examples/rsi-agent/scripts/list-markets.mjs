import 'dotenv/config'
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from '@somnia-chain/markets-sdk'
import { somniaShannon } from '@somnia-chain/markets-sdk/chains'
import { pickLiveMarket, TESTNET_COLLATERAL_DECIMALS } from 'signalvault-sdk'

const indexer = process.env.MARKETS_INDEXER_URL
const rpc = process.env.RPC_URL
const ws = process.env.WS_RPC_URL
const pk = process.env.PRIVATE_KEY

if (!indexer || !rpc || !ws || !pk) throw new Error('Missing env vars in .env')

async function main() {
  const ex = new SomniaMarkets({
    indexerUrl: indexer,
    chain: somniaShannon,
    wsRpcUrl: ws,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    privateKey: pk,
  })

  const rows = await ex.client.listLiveBinaryMarkets({ limit: 100 })
  const now = Date.now() / 1000

  console.log('=== Live Binary Markets ===')
  console.log('Total:', rows.length)

  const assets = [...new Set(rows.map((r) => r.asset))].sort()
  for (const a of assets) {
    const ms = rows.filter((r) => r.asset === a)
    const expiries = ms.map((m) => `${Math.round(Number(m.expiry) - now)}s`).join(', ')
    console.log(`  ${a}: ${ms.length} market(s) [${expiries}]`)
  }

  console.log('\n=== Tradeable (60s+ left + order book) ===')
  let best = null

  for (const a of assets) {
    const pick = await pickLiveMarket({
      indexerUrl: indexer,
      rpcUrl: rpc,
      wsRpcUrl: ws,
      privateKey: pk,
      asset: a,
      minSecondsLeft: 60,
      collateralDecimals: TESTNET_COLLATERAL_DECIMALS,
    })
    if (pick) {
      console.log(`  ✅ ${a} -> ${pick.upSymbol} ask=${pick.bestAsk} (${pick.secondsToExpiry.toFixed(0)}s left)`)
      if (!best) best = { asset: a, upSymbol: pick.upSymbol, bestAsk: pick.bestAsk }
    } else {
      console.log(`  ❌ ${a}`)
    }
  }

  if (best) {
    console.log(`\nRECOMMENDED_ASSET=${best.asset}`)
  } else {
    console.log('\nNo tradeable markets found')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
