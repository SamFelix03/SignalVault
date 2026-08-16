import 'dotenv/config'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SignalVault, SOMNIA_RPC, SOMNIA_SHANNON_CHAIN_ID } from 'signalvault-sdk'
import { fetchPipelineContext } from './lib/pipeline-context.js'
import { signalChanged } from './lib/signal-engine.js'
import { runInference, getGroqConfig } from './lib/llm-inference.js'
import { ensureDreamDexTrading, readCurrentSignal } from './lib/dreamdex-setup.js'
import { STRATEGY_VAULT_ABI } from './lib/abis.js'

const VAULT_ADDRESS = process.env.VAULT_ADDRESS
const PRIVATE_KEY = process.env.PRIVATE_KEY
const RPC_URL = process.env.RPC_URL ?? SOMNIA_RPC
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 300_000)
const ENABLE_DREAMDEX = process.env.ENABLE_DREAMDEX !== '0'
const INFERENCE_MODE = (process.env.INFERENCE_MODE ?? 'rules').toLowerCase()

const chain = {
  id: SOMNIA_SHANNON_CHAIN_ID,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
}

if (!VAULT_ADDRESS || !PRIVATE_KEY) {
  console.error('Missing VAULT_ADDRESS or PRIVATE_KEY.')
  console.error('Copy .env.example to .env in this folder and fill in your values.')
  process.exit(1)
}

const account = privateKeyToAccount(
  PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`,
)

const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) })

const vault = new SignalVault({
  vault: VAULT_ADDRESS,
  privateKey: PRIVATE_KEY,
  rpcUrl: RPC_URL,
})

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

async function bootstrap() {
  console.log('SignalVault custom agent (native pipeline parity)')
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
  console.log(`  dreamDEX:  ${ENABLE_DREAMDEX ? 'enabled' : 'disabled'}`)

  if (ENABLE_DREAMDEX) {
    console.log('\n── dreamDEX setup ──')
    await ensureDreamDexTrading({
      publicClient,
      walletClient,
      account,
      vaultAddress: VAULT_ADDRESS,
      factoryAddresses: process.env.VAULT_FACTORY_ADDRESS
        ? [process.env.VAULT_FACTORY_ADDRESS, process.env.LEGACY_VAULT_FACTORY_ADDRESS].filter(Boolean)
        : undefined,
      riskPct: Number(process.env.RISK_PCT ?? 1000),
      maxPositionEth: process.env.MAX_POSITION_ETH ?? '0.05',
      maxSlippageBps: Number(process.env.MAX_SLIPPAGE_BPS ?? 300),
      stopLossBufferEth: process.env.STOP_LOSS_BUFFER_ETH ?? '0.01',
      quoteDepositUsd: process.env.QUOTE_DEPOSIT_USD ?? '100',
      baseDepositEth: process.env.BASE_DEPOSIT_ETH ?? '0',
    })
  }

  console.log('\n── pipeline loop (same stages as native AgentOrchestrator) ──\n')
}

async function tick() {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ── Pipeline run ──`)

  const strategyPrompt = await readStrategyPrompt()
  const ctx = await fetchPipelineContext(publicClient)

  for (const stage of ctx.stages) {
    const mark = stage.warn ? '⚠' : '✓'
    console.log(`  ${mark} ${stage.label}: ${stage.detail}`)
  }

  const onChain = await readCurrentSignal(publicClient, VAULT_ADDRESS)
  const signal = await runInference(ctx, onChain, strategyPrompt)

  console.log(`  ✓ Inferring: ${signal.direction} ${signal.sizeBps}bps (${signal.inferenceMode})`)
  console.log(`  Reasoning: ${signal.reason}`)

  const candidate = { directionNum: signal.directionNum, sizeBps: signal.sizeBps }
  if (!signalChanged(onChain, candidate)) {
    console.log('  → skip publish (on-chain signal unchanged)\n')
    return
  }

  const hash = await vault.publish({
    direction: signal.direction,
    sizeBps: signal.sizeBps,
    stopPrice: signal.stopPrice,
    reason: signal.reason,
  })

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
