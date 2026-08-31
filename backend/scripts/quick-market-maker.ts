/**
 * Quick Market Maker - Use your wallet to provide ONE trade worth of liquidity
 * 
 * This will place a single BUY order at a price your SHORT signal can hit
 * 
 *   npx tsx scripts/quick-market-maker.ts
 */
import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../src/config/chains.js'

const RPC_URL = 'https://api.infra.testnet.somnia.network/'
const PERP_POOL = '0x996d36787cfc6569037039730d8cf82ad29c8f56' as Address
const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address
const USDSO = '0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171' as Address

async function main() {
  const pk = process.env.PRIVATE_KEY
  if (!pk) throw new Error('PRIVATE_KEY required')

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  console.log('=== Quick Market Maker for ONE Trade ===')
  console.log('Strategy: Place ONE buy order that your SHORT signal can hit')
  console.log('')

  // Get current mark price
  const markPrice = await publicClient.readContract({
    address: PERP_POOL,
    abi: parseAbi(['function markPrice() view returns (uint256)']),
    functionName: 'markPrice',
  }).catch(() => {
    console.log('❌ Cannot get mark price - pool may be broken')
    return null
  })

  if (!markPrice) {
    console.log('Pool is not responding. Testnet perp pool may be non-functional.')
    return
  }

  console.log('Current mark price:', formatUnits(markPrice, 18))

  // Your SHORT signal wants to sell at mark * 0.88 (12% below)
  // So we place a BUY order at that price to provide liquidity
  const shortSignalPrice = (markPrice * 8800n) / 10000n
  const quantity = parseUnits('1.0', 6) // 1.0 units

  console.log('SHORT signal price:', formatUnits(shortSignalPrice, 18))
  console.log('Placing BUY order at SHORT price to provide liquidity...')

  // Check balance and approve
  const balance = await publicClient.readContract({
    address: USDSO,
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: [account.address],
  })

  console.log('USDso balance:', formatUnits(balance, 18))

  if (balance < parseUnits('2', 18)) {
    console.log('❌ Need at least 2 USDso to provide liquidity')
    return
  }

  // Approve and deposit margin
  const allowance = await publicClient.readContract({
    address: USDSO,
    abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
    functionName: 'allowance',
    args: [account.address, MARGIN_BANK],
  })

  if (allowance < parseUnits('10', 18)) {
    console.log('Approving USDso...')
    const approveHash = await walletClient.writeContract({
      address: USDSO,
      abi: parseAbi(['function approve(address,uint256) returns (bool)']),
      functionName: 'approve',
      args: [MARGIN_BANK, parseUnits('100', 18)],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }

  console.log('Depositing 2 USDso as margin...')
  const depositHash = await walletClient.writeContract({
    address: MARGIN_BANK,
    abi: parseAbi(['function deposit(uint256) external']),
    functionName: 'deposit',
    args: [parseUnits('2', 18)],
  })
  await publicClient.waitForTransactionReceipt({ hash: depositHash })

  // Place LIMIT BUY order at SHORT signal price
  const expireNs = BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000_000n // 1 hour

  console.log('Placing LIMIT BUY order...')
  const orderHash = await walletClient.writeContract({
    address: PERP_POOL,
    abi: parseAbi([
      'function placeOrder(bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96) returns (bool,uint128)'
    ]),
    functionName: 'placeOrder',
    args: [
      true, // isBid = true (BUY order)
      0n, // userData
      shortSignalPrice, // price = where SHORT signal will sell
      quantity, // quantity
      expireNs, // expire in 1 hour
      1, // ORDER_TYPE_LIMIT
      0, // SELF_MATCH_CANCEL_TAKER
      account.address,
      0n, // builderFeeBps
    ],
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash: orderHash })

  if (receipt.status === 'success') {
    console.log('')
    console.log('✅ Market maker order placed successfully!')
    console.log('📈 Your SHORT signal should now be able to execute')
    console.log('🎯 Next RSI signal will have liquidity to trade against')
    console.log('')
    console.log('Order details:')
    console.log('  Type: LIMIT BUY')
    console.log('  Price:', formatUnits(shortSignalPrice, 18))
    console.log('  Quantity:', formatUnits(quantity, 6))
    console.log('  Expires: 1 hour')
  } else {
    console.log('❌ Market maker order failed')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})