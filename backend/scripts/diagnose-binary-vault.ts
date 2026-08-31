/**
 * Deep diagnostic for binary vault mirror failures.
 *   npx tsx scripts/diagnose-binary-vault.ts <vault> [follower]
 */
import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseAbiItem,
  decodeEventLog,
  formatUnits,
  encodeFunctionData,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL, TESTNET_TUSDC, BINARY_MARKETS_MODULE } from '../src/config/constants.js'

const vault = process.argv[2] as Address
const follower = (process.argv[3] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address
if (!vault) throw new Error('usage: diagnose-binary-vault.ts <vault> [follower]')

const vaultAbi = parseAbi([
  'function mirrorReactor() view returns (address)',
  'function eventRouter() view returns (address)',
  'function instrumentType() view returns (uint8)',
  'function signalPrice() view returns (uint256)',
  'function paymentToken() view returns (address)',
  'function getFollowers() view returns (address[])',
  'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
  'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
  'function paymentAuthorized(address) view returns (bool)',
])

const mirrorAbi = parseAbi([
  'function subscriptionId() view returns (uint256)',
  'function router() view returns (address)',
  'function totalMirrored() view returns (uint256)',
])

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function decimals() view returns (uint8)',
])

const marketsAbi = parseAbi([
  'function markets(bytes32) view returns (uint256 oracleQuestionId, uint8 outcomeSlotCount, uint8 voidPolicy, address collateral, uint32 originOperatorId, bytes32 originVenueId, address oracleAdapter, address creator, address market, address pool, uint256 yesId, uint256 noId, uint64 tradingStart, uint64 expiry)',
])

const marketAbi = parseAbi(['function status() view returns (uint8)'])

const signalUpdated = parseAbiItem(
  'event SignalUpdated(bytes32 indexed signalHash, int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, string reasoningSummary, bytes32 reasoningHash)',
)
const mirrorFailed = parseAbiItem('event MirrorFailed(address indexed follower, string reason)')
const mirrorExecuted = parseAbiItem(
  'event MirrorExecuted(address indexed follower, int8 direction, uint256 collateral, bytes32 fillId, bytes32 marketId)',
)

async function getLogsChunked(
  client: ReturnType<typeof createPublicClient>,
  address: Address,
  event: typeof mirrorFailed,
  fromBlock: bigint,
  toBlock: bigint,
  args?: { follower?: Address },
) {
  const chunk = 900n
  const all: Awaited<ReturnType<typeof client.getLogs>> = []
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n
    const logs = await client.getLogs({ address, event, args, fromBlock: start, toBlock: end })
    all.push(...logs)
  }
  return all
}

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const latest = await client.getBlockNumber()
  const fromBlock = latest > 5000n ? latest - 5000n : 0n

  const [mirror, router, instrument, signalPrice, paymentToken, followers, signal, cfg, paymentOk] =
    await Promise.all([
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'mirrorReactor' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'eventRouter' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'instrumentType' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'signalPrice' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'paymentToken' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'getFollowers' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'getCurrentSignal' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'getFollowerConfig', args: [follower] }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'paymentAuthorized', args: [follower] }),
    ])

  const [subId, totalMirrored, mirrorRouter] = await Promise.all([
    client.readContract({ address: mirror, abi: mirrorAbi, functionName: 'subscriptionId' }),
    client.readContract({ address: mirror, abi: mirrorAbi, functionName: 'totalMirrored' }),
    client.readContract({ address: mirror, abi: mirrorAbi, functionName: 'router' }).catch(() => null),
  ])

  const collateral =
    signal.direction === 0
      ? 0n
      : (cfg.maxPositionSize * BigInt(signal.sizeBps) * BigInt(cfg.riskPct)) / (10_000n * 10_000n)

  const [bal, vaultAllow, routerAllow, dec] = await Promise.all([
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'balanceOf', args: [follower] }),
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'allowance', args: [follower, vault] }),
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'allowance', args: [follower, router] }),
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'decimals' }),
  ])

  console.log('=== Vault ===')
  console.log({
    vault,
    instrument: instrument === 1 ? 'PERP' : 'BINARY',
    mirror,
    router,
    mirrorRouterPointsTo: mirrorRouter,
    routerMatchesMirror: mirrorRouter?.toLowerCase() === router.toLowerCase(),
    signalPrice: formatUnits(signalPrice, dec),
    paymentToken,
  })

  console.log('\n=== Follower ===')
  console.log({
    follower,
    active: cfg.active,
    riskPct: cfg.riskPct,
    maxPositionSize: formatUnits(cfg.maxPositionSize, dec) + ' tUSDC',
    maxSlippageBps: cfg.maxSlippageBps,
    paymentAuthorized: paymentOk,
    tUSDC_balance: formatUnits(bal, dec),
    vault_allowance: formatUnits(vaultAllow, dec),
    router_allowance: formatUnits(routerAllow, dec),
    collateralPerSignal: formatUnits(collateral, dec) + ' tUSDC',
    collateralOk: bal >= collateral,
    routerAllowOk: routerAllow >= collateral,
    vaultAllowOk: vaultAllow >= signalPrice,
  })

  console.log('\n=== Mirror reactor ===')
  console.log({
    subscriptionId: subId.toString(),
    totalMirrored: totalMirrored.toString(),
    subRegistered: subId > 0n,
  })

  console.log('\n=== Current signal ===')
  console.log({
    direction: signal.direction,
    sizeBps: signal.sizeBps,
    marketId: signal.marketId,
    limitPrice: signal.limitPrice.toString(),
    epoch: signal.epoch.toString(),
  })

  if (signal.marketId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    const marketData = await client.readContract({
      address: BINARY_MARKETS_MODULE,
      abi: marketsAbi,
      functionName: 'markets',
      args: [signal.marketId],
    })
    const marketAddr = marketData[8]
    const pool = marketData[9]
    const status = await client.readContract({ address: marketAddr, abi: marketAbi, functionName: 'status' })
    const now = BigInt(Math.floor(Date.now() / 1000))
    console.log('\n=== Market ===')
    console.log({
      market: marketAddr,
      pool,
      status: status === 1 ? 'TRADING' : status,
      expiry: marketData[13].toString(),
      secondsLeft: (marketData[13] - now).toString(),
      collateral: marketData[3],
      collateralIsTusdc: marketData[3].toLowerCase() === TESTNET_TUSDC.toLowerCase(),
    })
  }

  console.log('\n=== Recent mirror events ===')
  const [failed, executed] = await Promise.all([
    getLogsChunked(client, mirror, mirrorFailed, fromBlock, latest, { follower }),
    getLogsChunked(client, mirror, mirrorExecuted, fromBlock, latest, { follower }),
  ])
  for (const log of failed.slice(-5)) {
    console.log('MirrorFailed:', { tx: log.transactionHash, reason: log.args.reason, block: log.blockNumber?.toString() })
  }
  for (const log of executed.slice(-5)) {
    console.log('MirrorExecuted:', { tx: log.transactionHash, fillId: log.args.fillId, block: log.blockNumber?.toString() })
  }
  if (failed.length === 0 && executed.length === 0) console.log('No mirror events in last ~5000 blocks')

  // Simulate router.placeOrder via eth_call from mirror reactor
  if (signal.direction !== 0 && collateral > 0n) {
    console.log('\n=== Simulating router.placeOrder (static call) ===')
    const routerPlaceAbi = parseAbi([
      'function placeOrder(address follower, bytes32 marketRef, int8 direction, uint256 collateralAmount, uint256 limitPrice, uint16 maxSlippageBps) returns (bytes32 fillId)',
    ])
    const badPrice = signal.limitPrice
    const fixedPrice = BigInt(Math.round(0.93 * 1e6)) // ~93% YES prob at 6 decimals
    for (const [label, price] of [['on-chain limitPrice', badPrice], ['corrected ~93%', fixedPrice]] as const) {
      try {
        await client.call({
          account: mirror,
          to: router,
          data: encodeFunctionData({
            abi: routerPlaceAbi,
            functionName: 'placeOrder',
            args: [follower, signal.marketId, signal.direction, collateral, price, cfg.maxSlippageBps],
          }),
        })
        console.log(`✅ ${label} (${price}): simulation succeeded`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`❌ ${label} (${price}):`, msg.split('\n')[0])
      }
    }
  }

  console.log('\n=== Issues ===')
  const issues: string[] = []
  if (!cfg.active) issues.push('Follower not active')
  if (subId === 0n) issues.push('Mirror subscriptionId=0 (reactivity not registered on MirrorReactor contract)')
  if (bal < collateral) issues.push(`Insufficient tUSDC balance (need ${formatUnits(collateral, dec)}, have ${formatUnits(bal, dec)})`)
  if (routerAllow < collateral) issues.push(`Insufficient router allowance (need ${formatUnits(collateral, dec)}, have ${formatUnits(routerAllow, dec)})`)
  if (signalPrice > 0n && vaultAllow < signalPrice) issues.push('Insufficient vault allowance for signal fees')
  if (signalPrice > 0n && !paymentOk) issues.push('paymentAuthorized=false on vault')
  if (signal.limitPrice >= 1_000_000_000_000n) issues.push(`Bad limitPrice=${signal.limitPrice} — tick grid bug (should be ~1e5-1e6 for tUSDC)`)
  if (issues.length === 0) issues.push('No obvious config issues — check simulation revert above')
  for (const i of issues) console.log(' •', i)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
