import 'dotenv/config'
import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'

const vault = process.argv[2] as Address
const follower = (process.argv[3] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address
const USDso = '0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171' as Address

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const { mirrorWallet, perpRouter } = await resolveMirrorWallet(vault, follower)

  const vaultAbi = parseAbi([
    'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
    'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
  ])
  const poolAbi = parseAbi([
    'function getMarkPrice() view returns (uint256)',
    'function getOneBase() view returns (uint256)',
    'function getOrderBookParameters() view returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize)',
    'function marginBank() view returns (address)',
  ])

  const [config, signal] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'getFollowerConfig', args: [follower] }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'getCurrentSignal' }),
  ])
  const pool = (`0x${signal.marketId.slice(-40)}`) as Address

  const collateral6 = (config.maxPositionSize * BigInt(signal.sizeBps) * BigInt(config.riskPct)) / (10_000n * 10_000n)
  const marginPull = collateral6 * 1_000_000_000_000n

  const [mark, oneBase, ob, balance, allowance] = await Promise.all([
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getMarkPrice' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOneBase' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOrderBookParameters' }),
    client.readContract({
      address: USDso,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [follower],
    }),
    client.readContract({
      address: USDso,
      abi: parseAbi(['function allowance(address owner, address spender) view returns (uint256)']),
      functionName: 'allowance',
      args: [follower, mirrorWallet],
    }),
  ])

  const lev = 10n
  const price = signal.limitPrice > 0n ? signal.limitPrice : mark
  const slippage = BigInt(config.maxSlippageBps)
  const adj = (price * slippage) / 10_000n
  const isBid = signal.direction > 0
  const execPrice = isBid ? price + adj : (price > adj ? price - adj : price)
  const notional = marginPull * lev
  const rawQty = oneBase > 0n && execPrice > 0n ? (notional * oneBase) / execPrice : 0n
  const lotSize = ob[2] > 0n ? ob[2] : 1n
  const quantity = rawQty >= lotSize ? (rawQty / lotSize) * lotSize : 0n

  console.log('Follower config:', {
    active: config.active,
    riskPct: config.riskPct,
    maxPositionSize: config.maxPositionSize.toString(),
    maxSlippageBps: config.maxSlippageBps,
  })
  console.log('Collateral (6-dec):', collateral6.toString(), '→ marginPull (18-dec):', marginPull.toString())
  console.log('USDso balance:', balance.toString(), 'allowance to mirror:', allowance.toString())
  console.log('Pool:', pool)
  console.log('markPrice:', mark.toString(), 'limitPrice:', signal.limitPrice.toString(), 'execPrice:', execPrice.toString())
  console.log('oneBase:', oneBase.toString(), 'lotSize:', lotSize.toString(), 'minQty:', ob[1].toString())
  console.log('Computed quantity:', quantity.toString(), quantity === 0n ? '← ZERO (would fail)' : '')

  try {
    await client.simulateContract({
      address: perpRouter,
      abi: parseAbi([
        'function placeOrder(address follower, bytes32 marketRef, int8 direction, uint256 sizeAmount, uint256 limitPrice, uint16 maxSlippageBps) returns (bytes32)',
      ]),
      functionName: 'placeOrder',
      args: [follower, signal.marketId, signal.direction, collateral6, signal.limitPrice, config.maxSlippageBps],
      account: '0xe87f06522960667C59aAEe68d23c49720fc40B78',
    })
    console.log('\n✅ simulate placeOrder succeeded')
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; cause?: { reason?: string }; message?: string }
    console.log('\n❌ simulate placeOrder failed:', err.shortMessage ?? err.cause?.reason ?? err.message)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
