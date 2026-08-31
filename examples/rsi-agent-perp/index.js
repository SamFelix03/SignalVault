/**
 * Perp agent example — set VAULT_ADDRESS to a PERP custom-agent vault.
 * Uses signalvault-sdk publishPerp (see sdk/README or index.ts).
 */
import 'dotenv/config'
import { SignalVault, pickLivePerpMarket, encodePerpLimitPrice } from '../../sdk/src/index.ts'

const PERP_QUOTE_DECIMALS = 18

async function main() {
  const vault = new SignalVault({
    vault: process.env.VAULT_ADDRESS!,
    privateKey: process.env.PRIVATE_KEY!,
    instrument: 'perp',
  })

  const { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } = await import('@somnia-chain/markets-sdk')
  const { somniaShannon } = await import('@somnia-chain/markets-sdk/chains')
  const exchange = new SomniaMarkets({
    indexerUrl: process.env.MARKETS_INDEXER_URL ?? 'https://dev.smk.somnia.host/v1/graphql',
    chain: somniaShannon,
    wsRpcUrl: process.env.WS_RPC_URL,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    privateKey: process.env.PRIVATE_KEY!,
  })

  const pick = await pickLivePerpMarket(exchange, { asset: process.env.MARKET_ASSET ?? 'XRP', preferLowNotional: true })
  const hash = await vault.publishPerp({
    direction: 'LONG',
    sizeBps: 2500,
    perpPool: pick.pool,
    limitPrice: encodePerpLimitPrice(pick.markPrice * 1.01, PERP_QUOTE_DECIMALS),
    reason: `Perp example LONG ${pick.symbol}`,
  })
  console.log('tx', hash)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
