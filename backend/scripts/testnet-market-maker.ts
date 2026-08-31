/**
 * Testnet Market Maker Bot
 * 
 * Provides liquidity to the XRP/USDso perp pool so IOC orders can execute
 * 
 *   npx tsx scripts/testnet-market-maker.ts
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

interface PoolParams {
  markPrice: bigint
  tickSize: bigint
  lotSize: bigint
  minQuantity: bigint
}

async function getPoolParams(client: any): Promise<PoolParams> {
  const [markPrice, [tickSize, minQuantity, lotSize]] = await Promise.all([
    client.readContract({
      address: PERP_POOL,
      abi: parseAbi(['function markPrice() view returns (uint256)']),
      functionName: 'markPrice',
    }),
    client.readContract({
      address: PERP_POOL,
      abi: parseAbi(['function getOrderBookParameters() view returns (uint256,uint256,uint256)']),
      functionName: 'getOrderBookParameters',
    }),
  ])
  
  return { markPrice, tickSize, lotSize, minQuantity }
}

async function placeMarketMakerOrder(
  walletClient: any,
  publicClient: any,
  account: any,
  isBid: boolean,
  price: bigint,
  quantity: bigint,
) {
  const expireNs = BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000_000n // 1 hour

  try {
    const { request } = await publicClient.simulateContract({
      address: PERP_POOL,
      abi: parseAbi([
        'function placeOrder(bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96) returns (bool,uint128)'
      ]),
      functionName: 'placeOrder',
      args: [
        isBid,
        0n, // userData
        price,
        quantity,
        expireNs,
        1, // POST_ONLY order type
        0, // SELF_MATCH_CANCEL_TAKER
        account.address,
        0n, // builderFeeBps
      ],
      account,
    })

    const hash = await walletClient.writeContract({
      ...request,
      account,
      chain: somniaTestnet,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash,
      timeout: 120_000,
    })

    return receipt.status === 'success'
  } catch (error) {
    console.log(`  Failed to place ${isBid ? 'BID' : 'ASK'} at ${formatUnits(price, 18)}:`, error.message)
    return false
  }
}

async function main() {
  const pk = process.env.PRIVATE_KEY
  if (!pk) throw new Error('PRIVATE_KEY required')

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  console.log('=== Testnet Market Maker Bot ===')
  console.log('Pool:', PERP_POOL)
  console.log('Maker:', account.address)
  console.log('')

  // Check USDso balance
  const balance = await publicClient.readContract({
    address: USDSO,
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: [account.address],
  })

  console.log('USDso balance:', formatUnits(balance, 18))

  if (balance < parseUnits('10', 18)) {
    console.log('❌ Need at least 10 USDso to provide liquidity')
    return
  }

  // Approve USDso to margin bank if needed
  const allowance = await publicClient.readContract({
    address: USDSO,
    abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
    functionName: 'allowance',
    args: [account.address, MARGIN_BANK],
  })

  if (allowance < parseUnits('100', 18)) {
    console.log('Approving USDso to MarginBank...')
    const approveHash = await walletClient.writeContract({
      address: USDSO,
      abi: parseAbi(['function approve(address,uint256) returns (bool)']),
      functionName: 'approve',
      args: [MARGIN_BANK, parseUnits('1000', 18)],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }

  // Deposit some margin
  console.log('Depositing 5 USDso as margin...')
  const depositHash = await walletClient.writeContract({
    address: MARGIN_BANK,
    abi: parseAbi(['function deposit(uint256) external']),
    functionName: 'deposit',
    args: [parseUnits('5', 18)],
  })
  await publicClient.waitForTransactionReceipt({ hash: depositHash })

  // Get pool parameters
  const params = await getPoolParams(publicClient)
  console.log('')
  console.log('Pool parameters:')
  console.log('  Mark price:', formatUnits(params.markPrice, 18))
  console.log('  Tick size:', formatUnits(params.tickSize, 18))
  console.log('  Lot size:', formatUnits(params.lotSize, 18))
  console.log('  Min quantity:', formatUnits(params.minQuantity, 18))

  // Place market making orders around mark price
  const spread = params.markPrice / 20n // 5% spread each side
  const quantity = params.minQuantity * 5n // 5x minimum quantity

  const bidPrice = params.markPrice - spread
  const askPrice = params.markPrice + spread

  console.log('')
  console.log('Placing market maker orders...')
  console.log(`  BID: ${formatUnits(quantity, 18)} @ ${formatUnits(bidPrice, 18)}`)
  console.log(`  ASK: ${formatUnits(quantity, 18)} @ ${formatUnits(askPrice, 18)}`)

  const [bidSuccess, askSuccess] = await Promise.all([
    placeMarketMakerOrder(walletClient, publicClient, account, true, bidPrice, quantity),
    placeMarketMakerOrder(walletClient, publicClient, account, false, askPrice, quantity),
  ])

  console.log('')
  if (bidSuccess || askSuccess) {
    console.log('✅ Market making orders placed successfully!')
    console.log('🔄 IOC orders should now have liquidity to execute against')
    console.log('📈 Your mirror signals should start working!')
  } else {
    console.log('❌ Failed to place market making orders')
    console.log('💡 Pool might need different order parameters')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})