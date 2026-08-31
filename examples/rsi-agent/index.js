import 'dotenv/config'
import { createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  SignalVault,
  SOMNIA_RPC,
  SOMNIA_SHANNON_CHAIN_ID,
  pickLiveMarket,
  pickLivePerpMarketFromIndexer,
  TESTNET_COLLATERAL_DECIMALS,
} from 'signalvault-sdk'
import { fetchPipelineContext } from './lib/pipeline-context.js'
import { signalChanged } from './lib/signal-engine.js'
import { runInference, getGroqConfig } from './lib/llm-inference.js'
import { STRATEGY_VAULT_ABI } from './lib/abis.js'

function parseInstrumentFlag(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--instrument' || arg === '-i') {
      const value = argv[i + 1]?.toLowerCase()
      if (value === 'binary' || value === 'perp') return value
      throw new Error('--instrument must be "binary" or "perp"')
    }
    if (arg.startsWith('--instrument=')) {
      const value = arg.split('=')[1]?.toLowerCase()
      if (value === 'binary' || value === 'perp') return value
      throw new Error('--instrument must be "binary" or "perp"')
    }
  }
  const env = (process.env.INSTRUMENT ?? 'binary').toLowerCase()
  if (env === 'binary' || env === 'perp') return env
  throw new Error('INSTRUMENT must be "binary" or "perp"')
}

const INSTRUMENT = parseInstrumentFlag(process.argv.slice(2))
const IS_PERP = INSTRUMENT === 'perp'

const VAULT_ADDRESS = IS_PERP ? process.env.PERP_VAULT_ADDRESS : process.env.VAULT_ADDRESS
const PRIVATE_KEY = process.env.PRIVATE_KEY
const RPC_URL = process.env.RPC_URL ?? SOMNIA_RPC
const WS_RPC_URL = process.env.WS_RPC_URL
const MARKETS_INDEXER_URL = process.env.MARKETS_INDEXER_URL
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 300_000)
const FORCE_PUBLISH = process.env.FORCE_PUBLISH === '1' || process.env.FORCE_PUBLISH === 'true'
const INFERENCE_MODE = (process.env.INFERENCE_MODE ?? 'rules').toLowerCase()
const MARKET_ASSET = process.env.MARKET_ASSET ?? (IS_PERP ? 'XRP' : 'ETH')
const MARKET_MIN_SECONDS_LEFT = Number(process.env.MARKET_MIN_SECONDS_LEFT ?? 300)
const MARKET_REFRESH_SECONDS = Number(process.env.MARKET_REFRESH_SECONDS ?? 300)

const chain = {
  id: SOMNIA_SHANNON_CHAIN_ID,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
}

if (!VAULT_ADDRESS || !PRIVATE_KEY) {
  console.error(
    IS_PERP
      ? 'Missing PERP_VAULT_ADDRESS or PRIVATE_KEY.'
      : 'Missing VAULT_ADDRESS or PRIVATE_KEY.',
  )
  console.error('Copy .env.example to .env in this folder and fill in your values.')
  process.exit(1)
}

if (!MARKETS_INDEXER_URL) {
  console.error('Missing MARKETS_INDEXER_URL (Somnia markets indexer GraphQL endpoint).')
  process.exit(1)
}

const account = privateKeyToAccount(
  PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`,
)

const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })

const vault = new SignalVault({
  vault: VAULT_ADDRESS,
  privateKey: PRIVATE_KEY,
  rpcUrl: RPC_URL,
  instrument: INSTRUMENT,
})

let liveMarket = null
let marketExpiresAt = 0

async function ensureLiveMarket({ force = false } = {}) {
  const now = Date.now() / 1000
  const secondsLeft = marketExpiresAt > 0 ? marketExpiresAt - now : 0
  const needsRefresh = force || !liveMarket || secondsLeft <= MARKET_REFRESH_SECONDS

  if (!needsRefresh) return liveMarket

  if (IS_PERP) {
    const pick = await pickLivePerpMarketFromIndexer({
      indexerUrl: MARKETS_INDEXER_URL,
      rpcUrl: RPC_URL,
      wsRpcUrl: WS_RPC_URL,
      privateKey: PRIVATE_KEY,
      asset: MARKET_ASSET,
      preferLowNotional: true,
    })

    const changed = !liveMarket || liveMarket.pool !== pick.pool
    liveMarket = pick
    marketExpiresAt = now + 3600

    if (changed || force) {
      console.log(`  perp:      ${pick.symbol}`)
      console.log(`  pool:      ${pick.pool}`)
      console.log(`  mark:      ${pick.markPrice} → limit ${pick.suggestedLimitPrice}`)
    }

    return liveMarket
  }

  const pick = await pickLiveMarket({
    indexerUrl: MARKETS_INDEXER_URL,
    rpcUrl: RPC_URL,
    wsRpcUrl: WS_RPC_URL,
    privateKey: PRIVATE_KEY,
    asset: MARKET_ASSET,
    minSecondsLeft: MARKET_MIN_SECONDS_LEFT,
    collateralDecimals: TESTNET_COLLATERAL_DECIMALS,
  })

  if (!pick) {
    throw new Error(
      `No live ${MARKET_ASSET} binary market found (indexer: ${MARKETS_INDEXER_URL})`,
    )
  }

  const changed = !liveMarket || liveMarket.marketId !== pick.marketId
  liveMarket = pick
  marketExpiresAt = now + pick.secondsToExpiry

  if (changed || force) {
    console.log(`  market:    ${pick.asset} ${pick.upSymbol} (${pick.secondsToExpiry.toFixed(0)}s left)`)
    console.log(`  marketId:  ${pick.marketId}`)
    console.log(`  best ask:  ${pick.bestAsk} → UP limit ${pick.suggestedLimitPriceUp ?? pick.suggestedLimitPrice}`)
    if (pick.bestBid !== undefined) {
      console.log(`  best bid:  ${pick.bestBid}`)
    }
    if (pick.bestNoAsk !== undefined) {
      console.log(`  NO ask:    ${pick.bestNoAsk} → DOWN limit ${pick.suggestedLimitPriceDown ?? pick.suggestedLimitPrice}`)
    }
  }

  return liveMarket
}

async function readStrategyPrompt() {
  try {
    const prompt = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: STRATEGY_VAULT_ABI,
      functionName: 'strategyPrompt',
    })
    return String(prompt)
  } catch {
    return 'Custom agent strategy'
  }
}

async function validateVaultInstrument() {
  const meta = await vault.getVaultMeta()
  const expected = IS_PERP ? 'PERP' : 'BINARY'
  if (meta.instrumentType !== expected) {
    throw new Error(
      `Vault ${VAULT_ADDRESS} is ${meta.instrumentType} but agent started with --instrument ${INSTRUMENT}`,
    )
  }
}

async function bootstrap() {
  console.log(`SignalVault custom agent (${INSTRUMENT})`)
  console.log(`  vault:     ${VAULT_ADDRESS}`)
  console.log(`  wallet:    ${account.address}`)
  console.log(`  interval:  ${INTERVAL_MS}ms`)
  const groq = getGroqConfig()
  console.log(`  inference: ${INFERENCE_MODE}${
    INFERENCE_MODE === 'llm'
      ? groq
        ? ` (Groq / ${groq.model})`
        : ' (no GROQ_API_KEY — will use rules)'
      : ''
  }`)
  console.log(`  publish:   ${FORCE_PUBLISH ? 'force every run' : 'only when direction/size changes'}`)

  await validateVaultInstrument()

  console.log('\n── market discovery ──')
  await ensureLiveMarket({ force: true })

  console.log('\n── pipeline loop (same stages as native AgentOrchestrator) ──\n')
}

async function publishSignal(signal, market) {
  if (IS_PERP) {
    const buffer = 0.02
    const mark = market.markPrice
    const human =
      signal.direction === 'SHORT' || signal.directionNum < 0
        ? mark * (1 - buffer)
        : mark * (1 + buffer)
    const limitRaw = BigInt(Math.round(human * 1e18))
    const tick = 100_000_000_000_000n
    const limitPrice = (limitRaw / tick) * tick

    return vault.publishPerp({
      direction: signal.direction,
      sizeBps: signal.sizeBps,
      perpPool: market.pool,
      limitPrice,
      reason: signal.reason,
    })
  }

  return vault.publishBinary({
    direction: signal.direction,
    sizeBps: signal.sizeBps,
    marketId: market.marketId,
    limitPrice:
      signal.direction === 'DOWN' || signal.directionNum < 0
        ? (market.suggestedLimitPriceDown ?? market.suggestedLimitPrice)
        : (market.suggestedLimitPriceUp ?? market.suggestedLimitPrice),
    reason: signal.reason,
  })
}

async function tick() {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ── Pipeline run (${INSTRUMENT}) ──`)

  const market = await ensureLiveMarket()
  const strategyPrompt = await readStrategyPrompt()
  const ctx = await fetchPipelineContext(publicClient)

  for (const stage of ctx.stages) {
    const mark = stage.warn ? '⚠' : '✓'
    console.log(`  ${mark} ${stage.label}: ${stage.detail}`)
  }

  const onChainRaw = await vault.getCurrentSignal()
  const onChain = {
    directionNum: onChainRaw.direction,
    sizeBps: onChainRaw.sizeBps,
    reason: onChainRaw.reasoningSummary,
  }

  const signal = await runInference(ctx, onChain, strategyPrompt, { instrument: INSTRUMENT })

  console.log(`  ✓ Inferring: ${signal.direction} ${signal.sizeBps}bps (${signal.inferenceMode})`)
  console.log(`  Reasoning: ${signal.reason}`)

  const candidate = { directionNum: signal.directionNum, sizeBps: signal.sizeBps }
  if (!FORCE_PUBLISH && !signalChanged(onChain, candidate)) {
    console.log('  → skip publish (on-chain signal unchanged)\n')
    return
  }

  if (FORCE_PUBLISH && !signalChanged(onChain, candidate)) {
    console.log('  → force publish (FORCE_PUBLISH=1)')
  }

  const hash = await publishSignal(signal, market)

  console.log(`  → published: ${hash}\n`)
}

await bootstrap()

try {
  await tick()
} catch (err) {
  console.error('Initial pipeline run failed:', err)
}

setInterval(() => {
  tick().catch((err) => console.error('Pipeline run failed:', err))
}, INTERVAL_MS)
