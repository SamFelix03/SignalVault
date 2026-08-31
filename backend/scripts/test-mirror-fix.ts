/**
 * Test script: validate mirror trading with "pull margin AFTER successful fill" logic.
 * This simulates the fix before implementing in PerpRouter v5.
 * 
 *   npx tsx scripts/test-mirror-fix.ts <vault> [follower]
 */
import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'
import { createMarketsExchange } from '../src/services/markets-exchange.js'

const vault = process.argv[2] as Address
const follower = (process.argv[3] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address
const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address
const USDso = '0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171' as Address
const ORDER_TYPE_IOC = 2
const MIN_SLIPPAGE_BPS = 200
const MAX_SLIPPAGE_BPS = 1500
const MAX_FILL_ATTEMPTS = 6

function snapToTick(price: bigint, tickSize: bigint, roundUp: boolean): bigint {
  if (tickSize === 0n) tickSize = 1n
  const rem = price % tickSize
  if (rem === 0n) return price
  return roundUp ? price + (tickSize - rem) : price - rem
}

function snapToLot(qty: bigint, lotSize: bigint): bigint {
  if (lotSize === 0n) lotSize = 1n
  if (qty < lotSize) return 0n
  return (qty / lotSize) * lotSize
}

function resolveMirrorPrice(mark: bigint, slippageBps: number, isBid: boolean, tickSize: bigint): bigint {
  const adj = (mark * BigInt(slippageBps)) / 10_000n
  const price = isBid ? mark + adj : mark > adj ? mark - adj : mark
  return snapToTick(price, tickSize, isBid)
}

function marginToQuantity(marginBudget: bigint, leverage: number, oneBase: bigint, price: bigint, lotSize: bigint): bigint {
  if (oneBase === 0n || price === 0n) return 0n
  const notional = marginBudget * BigInt(leverage)
  const rawQty = (notional * oneBase) / price
  return snapToLot(rawQty, lotSize)
}

async function main() {
  if (!vault) throw new Error('usage: test-mirror-fix.ts <vault> [follower]')
  
  const pk = process.env.PRIVATE_KEY
  if (!pk) throw new Error('PRIVATE_KEY required for test transactions')
  
  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const wallet = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })
  
  const { mirrorWallet, perpRouter } = await resolveMirrorWallet(vault, follower)
  
  // Get current signal and follower config
  const [signal, config] = await Promise.all([
    client.readContract({
      address: vault,
      abi: parseAbi([
        'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
      ]),
      functionName: 'getCurrentSignal',
    }),
    client.readContract({
      address: vault,
      abi: parseAbi([
        'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
      ]),
      functionName: 'getFollowerConfig',
      args: [follower],
    }),
  ])

  const pool = (`0x${signal.marketId.slice(-40)}`) as Address
  const collateral6 = (config.maxPositionSize * BigInt(signal.sizeBps) * BigInt(config.riskPct)) / (10_000n * 10_000n)
  const marginPull = collateral6 * 1_000_000_000_000n
  const isBid = signal.direction > 0
  const directionLabel = signal.direction > 0 ? 'LONG' : signal.direction < 0 ? 'SHORT' : 'FLAT'

  console.log('=== Mirror Test Setup ===')
  console.log({ vault, follower, mirrorWallet, perpRouter, pool })
  console.log({ direction: directionLabel, sizeBps: signal.sizeBps, marginPull: formatUnits(marginPull, 18) })

  if (signal.direction === 0) {
    console.log('Signal is FLAT - testing close logic (not implemented yet)')
    return
  }

  // Get pool parameters
  const poolAbi = parseAbi([
    'function getMarkPrice() view returns (uint256)',
    'function getOneBase() view returns (uint256)',
    'function getOrderBookParameters() view returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize)',
    'function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) returns (bool success, uint128 id)',
  ])

  const [mark, oneBase, ob, leverage] = await Promise.all([
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getMarkPrice' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOneBase' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOrderBookParameters' }),
    client.readContract({
      address: MARGIN_BANK,
      abi: parseAbi(['function getMaxLeverage(address,address) view returns (uint16)']),
      functionName: 'getMaxLeverage',
      args: [mirrorWallet, pool],
    }).catch(() => 0),
  ])

  const [tickSize, minQuantity, lotSize] = ob
  const lev = leverage > 0 ? leverage : 10
  const expireNs = BigInt((Math.floor(Date.now() / 1000) + 300) * 1_000_000_000)

  console.log('\n=== Pool State ===')
  console.log({
    mark: formatUnits(mark, 18),
    leverage: lev,
    tickSize: tickSize.toString(),
    lotSize: lotSize.toString(),
    minQuantity: minQuantity.toString(),
  })

  // Check current balances
  const [followerBal, mirrorBal, allowance, deposited] = await Promise.all([
    client.readContract({ address: USDso, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [follower] }),
    client.readContract({ address: USDso, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [mirrorWallet] }),
    client.readContract({ address: USDso, abi: parseAbi(['function allowance(address,address) view returns (uint256)']), functionName: 'allowance', args: [follower, mirrorWallet] }),
    client.readContract({ address: MARGIN_BANK, abi: parseAbi(['function getDepositedBalance(address) view returns (uint256)']), functionName: 'getDepositedBalance', args: [mirrorWallet] }).catch(() => 0n),
  ])

  console.log('\n=== Current Balances ===')
  console.log({
    followerUSDso: formatUnits(followerBal, 18),
    mirrorWalletUSDso: formatUnits(mirrorBal, 18),
    deposited: formatUnits(deposited, 18),
    allowanceOK: allowance > marginPull,
  })

  if (allowance <= marginPull) {
    console.log('❌ Insufficient allowance - follower must approve USDso to mirror wallet first')
    return
  }

  // Test 1: Try IOC with current order book
  console.log('\n=== Test 1: IOC attempts with slippage ladder ===')
  let slippage = Math.max(config.maxSlippageBps, MIN_SLIPPAGE_BPS)
  let bestFill: { price: bigint; quantity: bigint; orderId: bigint } | null = null

  for (let attempt = 0; attempt < MAX_FILL_ATTEMPTS; attempt++) {
    const price = resolveMirrorPrice(mark, slippage, isBid, tickSize)
    const quantity = marginToQuantity(marginPull, lev, oneBase, price, lotSize)
    
    if (quantity < minQuantity) {
      console.log(`  attempt ${attempt}: qty ${quantity} < minQuantity ${minQuantity} - skip`)
      if (slippage >= MAX_SLIPPAGE_BPS) break
      slippage = Math.min(slippage * 2, MAX_SLIPPAGE_BPS)
      continue
    }

    try {
      // Simulate pool.placeOrder with EXISTING margin (if any)
      const result = await client.simulateContract({
        address: pool,
        abi: poolAbi,
        functionName: 'placeOrder',
        args: [isBid, 0n, price, quantity, expireNs, ORDER_TYPE_IOC, 0, '0x0000000000000000000000000000000000000000', 0n],
        account: mirrorWallet,
      })
      
      const [success, orderId] = result.result || [false, 0n]
      console.log(`  attempt ${attempt}: slippage=${slippage}bps price=${formatUnits(price, 18)} qty=${quantity} → success=${success} orderId=${orderId?.toString()}`)
      
      if (success && orderId && orderId > 0n) {
        bestFill = { price, quantity, orderId }
        console.log(`  ✅ Found fillable order at attempt ${attempt}`)
        break
      }
    } catch (e: unknown) {
      const err = e as { shortMessage?: string }
      console.log(`  attempt ${attempt}: slippage=${slippage}bps → REVERT ${err.shortMessage}`)
    }

    if (slippage >= MAX_SLIPPAGE_BPS) break
    slippage = Math.min(slippage * 2, MAX_SLIPPAGE_BPS)
  }

  if (!bestFill) {
    console.log('❌ No IOC order would fill - checking order book depth')
    
    // Check order book
    const exchange = await createMarketsExchange()
    await exchange.loadMarkets(true)
    const markets = Object.values(exchange.markets)
    const perpMarket = markets.find(
      (m) => m.info && 'poolAddress' in m.info && (m.info.poolAddress as string).toLowerCase() === pool.toLowerCase(),
    )
    
    if (perpMarket) {
      const book = await exchange.fetchOrderBook(perpMarket.symbol, 10)
      console.log('Order book:', {
        symbol: perpMarket.symbol,
        bestBid: book.bids[0],
        bestAsk: book.asks[0],
        bidDepth: book.bids.length,
        askDepth: book.asks.length,
      })
      
      // Compare our prices to book
      const testPrice = resolveMirrorPrice(mark, config.maxSlippageBps, isBid, tickSize)
      const bookPrice = isBid ? book.asks[0]?.[0] : book.bids[0]?.[0]
      if (bookPrice) {
        const testPriceNum = Number(formatUnits(testPrice, 18))
        console.log(`Our ${isBid ? 'buy' : 'sell'} @ ${testPriceNum.toFixed(4)} vs book ${isBid ? 'ask' : 'bid'} @ ${bookPrice}`)
        if (isBid && testPriceNum >= bookPrice) console.log('  → Should cross (buy >= ask)')
        if (!isBid && testPriceNum <= bookPrice) console.log('  → Should cross (sell <= bid)')
      }
    }
    return
  }

  // Test 2: Execute the "fixed" flow - only pull margin AFTER successful IOC
  console.log('\n=== Test 2: Fixed flow - margin pull AFTER successful order ===')
  
  const walletAbi = parseAbi([
    'function executeOpen(address pool, uint256 marginPull, bool isBid, uint256 price, uint256 quantity, uint64 expireNs) returns (uint128)',
    'function fundMargin(uint256 amount)',
  ])

  console.log(`Simulating fundMargin(${formatUnits(marginPull, 18)}) + executeOpen...`)
  
  try {
    // First fund the margin
    const fundResult = await wallet.writeContract({
      address: mirrorWallet,
      abi: walletAbi,
      functionName: 'fundMargin',
      args: [marginPull],
    })
    console.log('fundMargin tx:', fundResult)
    await client.waitForTransactionReceipt({ hash: fundResult })
    
    // Then try the order
    const orderResult = await wallet.writeContract({
      address: mirrorWallet,
      abi: walletAbi,
      functionName: 'executeOpen',
      args: [pool, 0n, isBid, bestFill.price, bestFill.quantity, expireNs],
    })
    console.log('executeOpen tx:', orderResult)
    const receipt = await client.waitForTransactionReceipt({ hash: orderResult })
    
    console.log('✅ Order executed successfully!')
    console.log('Receipt status:', receipt.status)
    
    // Check if position opened
    const pos = await client.readContract({
      address: MARGIN_BANK,
      abi: parseAbi(['function getPosition(address,address) view returns (int128,uint128,int256,uint64)']),
      functionName: 'getPosition',
      args: [mirrorWallet, pool],
    })
    
    console.log('New position:', { size: pos[0].toString(), avgEntry: formatUnits(pos[1], 18) })
    
  } catch (e: unknown) {
    const err = e as { shortMessage?: string }
    console.log('❌ Fixed flow failed:', err.shortMessage)
    
    // If it failed, we still pulled margin - this demonstrates the current issue
    const newDeposited = await client.readContract({
      address: MARGIN_BANK,
      abi: parseAbi(['function getDepositedBalance(address) view returns (uint256)']),
      functionName: 'getDepositedBalance',
      args: [mirrorWallet],
    }).catch(() => 0n)
    
    if (newDeposited > deposited) {
      console.log(`⚠️ Margin was pulled (${formatUnits(newDeposited - deposited, 18)} USDso) but order failed`)
      console.log('This is exactly the bug we need to fix in PerpRouter v5')
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})