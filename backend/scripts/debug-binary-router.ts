/**
 * Step through EventContractsRouter.placeOrder to find revert reason.
 *   npx tsx scripts/debug-binary-router.ts <vault> [follower]
 */
import 'dotenv/config'
import {
  createPublicClient,
  http,
  parseAbi,
  encodeFunctionData,
  formatUnits,
  type Address,
} from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL, TESTNET_TUSDC, BINARY_MARKETS_MODULE } from '../src/config/constants.js'

const vault = process.argv[2] as Address
const follower = (process.argv[3] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address

const vaultAbi = parseAbi([
  'function mirrorReactor() view returns (address)',
  'function eventRouter() view returns (address)',
  'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
  'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
])

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function decimals() view returns (uint8)',
])

const marketsAbi = parseAbi([
  'function markets(bytes32) view returns (uint256, uint8, uint8, address, uint32, bytes32, address, address, address, address, uint256, uint256, uint64, uint64)',
])

const poolAbi = parseAbi([
  'function getBinaryPoolParams() view returns (address collateralToken, address market, address outcomeToken, uint256 yesId, uint256 noId, uint256 oneCollateral, uint256 setBacking, address feeRecipient, uint256 makerFeeBpsTimes1k, uint256 takerFeeBpsTimes1k, uint256 maxBuilderFeeBpsTimes1k, uint256 settlementFeeBpsTimes1k, address settlement, uint64 marketNonce, bool finalized)',
  'function tickSize() view returns (uint256)',
  'function lotSize() view returns (uint256)',
  'function minQuantity() view returns (uint256)',
])

const routerAbi = parseAbi([
  'function placeOrder(address follower, bytes32 marketRef, int8 direction, uint256 collateralAmount, uint256 limitPrice, uint16 maxSlippageBps) returns (bytes32 fillId)',
])

function applySlippage(price: bigint, slippageBps: number, isBuyYes: boolean): bigint {
  if (slippageBps === 0) return price
  const adj = (price * BigInt(slippageBps)) / 10_000n
  if (isBuyYes) return price + adj
  return price > adj ? price - adj : price
}

function collateralToQty(collateral: bigint, price: bigint, oneCollateral: bigint, lot: bigint): bigint {
  if (price === 0n) return 0n
  const raw = (collateral * oneCollateral) / price
  if (raw < lot) return 0n
  return (raw / lot) * lot
}

async function tryCall(
  client: ReturnType<typeof createPublicClient>,
  label: string,
  args: {
    mirror: Address
    router: Address
    follower: Address
    marketId: `0x${string}`
    direction: number
    collateral: bigint
    limitPrice: bigint
    slippage: number
  },
) {
  try {
    await client.call({
      account: args.mirror,
      to: args.router,
      data: encodeFunctionData({
        abi: routerAbi,
        functionName: 'placeOrder',
        args: [
          args.follower,
          args.marketId,
          args.direction,
          args.collateral,
          args.limitPrice,
          args.slippage,
        ],
      }),
    })
    console.log(`✅ ${label}`)
    return true
  } catch (e: unknown) {
    console.log(`❌ ${label}:`, e instanceof Error ? e.message.split('\n')[0] : e)
    return false
  }
}

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const [mirror, router, signal, cfg] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'mirrorReactor' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'eventRouter' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'getCurrentSignal' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'getFollowerConfig', args: [follower] }),
  ])

  const collateral =
    (cfg.maxPositionSize * BigInt(signal.sizeBps) * BigInt(cfg.riskPct)) / (10_000n * 10_000n)

  const marketRow = await client.readContract({
    address: BINARY_MARKETS_MODULE,
    abi: marketsAbi,
    functionName: 'markets',
    args: [signal.marketId],
  })
  const pool = marketRow[9]
  const poolParams = await client.readContract({ address: pool, abi: poolAbi, functionName: 'getBinaryPoolParams' })
  const oneCollateral = poolParams[5]
  const dec = await client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'decimals' })
  const [bal, allow] = await Promise.all([
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'balanceOf', args: [follower] }),
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'allowance', args: [follower, router] }),
  ])

  let tick = 1000n
  let lot = 1000n
  let minQty = 0n
  for (const [name, fn] of [
    ['tickSize', 'tickSize'],
    ['lotSize', 'lotSize'],
    ['minQuantity', 'minQuantity'],
  ] as const) {
    try {
      const v = await client.readContract({
        address: pool,
        abi: poolAbi,
        functionName: fn,
      })
      if (name === 'tickSize') tick = v
      if (name === 'lotSize') lot = v
      if (name === 'minQuantity') minQty = v
      console.log(`${name}:`, v.toString())
    } catch {
      console.log(`${name}: (not exposed)`)
    }
  }

  const isBuyYes = signal.direction > 0
  const execBad = applySlippage(signal.limitPrice, cfg.maxSlippageBps, isBuyYes)
  const goodPrice = 930_000n
  const execGood = applySlippage(goodPrice, cfg.maxSlippageBps, isBuyYes)

  console.log('\n=== Inputs ===')
  console.log({
    direction: signal.direction,
    collateral: formatUnits(collateral, dec),
    badLimit: signal.limitPrice.toString(),
    execBad: execBad.toString(),
    goodLimit: goodPrice.toString(),
    execGood: execGood.toString(),
    qtyBad: collateralToQty(collateral, execBad, oneCollateral, lot).toString(),
    qtyGood: collateralToQty(collateral, execGood, oneCollateral, lot).toString(),
    minQty: minQty.toString(),
    followerBal: formatUnits(bal, dec),
    routerAllow: formatUnits(allow, dec),
    oneCollateral: oneCollateral.toString(),
  })

  console.log('\n=== Router simulations ===')
  const base = { mirror, router, follower, marketId: signal.marketId, direction: signal.direction, slippage: cfg.maxSlippageBps }
  await tryCall(client, 'on-chain limitPrice', { ...base, collateral, limitPrice: signal.limitPrice })
  await tryCall(client, 'fixed 930000', { ...base, collateral, limitPrice: goodPrice })
  await tryCall(client, '10x collateral', { ...base, collateral: collateral * 10n, limitPrice: goodPrice })
  await tryCall(client, 'BUY_YES limit 320000 (0.32)', { ...base, direction: 1, collateral, limitPrice: 320_000n })
  await tryCall(client, 'BUY_NO limit 270000 (0.27)', { ...base, direction: -1, collateral, limitPrice: 270_000n })
  await tryCall(client, 'BUY_NO limit 930000 (bad for NO)', { ...base, direction: -1, collateral, limitPrice: 930_000n })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
