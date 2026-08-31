/**
 * List all live binary markets from Somnia indexer
 *   npx tsx scripts/list-binary-markets.ts
 */
import 'dotenv/config'
import { pickLiveMarket, TESTNET_COLLATERAL_DECIMALS } from 'signalvault-sdk'

const INDEXER = process.env.MARKETS_INDEXER_URL ?? 'https://dev.smk.somnia.host/v1/graphql'
const RPC = process.env.RPC_URL ?? 'https://api.infra.testnet.somnia.network/'
const WS = process.env.WS_RPC_URL ?? 'wss://api.infra.testnet.somnia.network/ws'
const PK = process.env.PRIVATE_KEY!

async function listAll() {
  const { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } = await import('@somnia-chain/markets-sdk')
  const { somniaShannon } = await import('@somnia-chain/markets-sdk/chains')

  const exchange = new SomniaMarkets({
    indexerUrl: INDEXER,
    chain: somniaShannon,
    wsRpcUrl: WS,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    privateKey: PK.startsWith('0x') ? PK : `0x${PK}`,
  })

  const rows = await exchange.client.listLiveBinaryMarkets({ limit: 100 })
  const now = Date.now() / 1000

  console.log('=== Live Binary Markets ===')
  console.log('Total from indexer:', rows.length)
  console.log('')

  const byAsset = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byAsset.get(row.asset) ?? []
    list.push(row)
    byAsset.set(row.asset, list)
  }

  for (const [asset, markets] of [...byAsset.entries()].sort()) {
    console.log(`--- ${asset} (${markets.length}) ---`)
    for (const m of markets) {
      const left = Number(m.expiry) - now
      console.log(`  ${m.marketId}  expiry in ${Math.round(left)}s  status=${m.status}`)
    }
  }

  // Try pickLiveMarket for common assets
  console.log('')
  console.log('=== pickLiveMarket results ===')
  const assets = [...new Set(rows.map((r) => r.asset))]
  for (const asset of assets) {
    const pick = await pickLiveMarket({
      indexerUrl: INDEXER,
      rpcUrl: RPC,
      wsRpcUrl: WS,
      privateKey: PK,
      asset,
      minSecondsLeft: 60,
      collateralDecimals: TESTNET_COLLATERAL_DECIMALS,
    })
    if (pick) {
      console.log(`✅ ${asset}: ${pick.upSymbol} (${pick.secondsToExpiry.toFixed(0)}s left) ask=${pick.bestAsk}`)
    } else {
      console.log(`❌ ${asset}: no tradeable market (min 60s left + order book)`)
    }
  }
}

listAll().catch((e) => {
  console.error(e)
  process.exit(1)
})
