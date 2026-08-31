/**
 * Step 4: Trace margin deposit + placeOrder allowance chain for mirror wallet.
 */
import 'dotenv/config'
import { createPublicClient, http, parseAbi, decodeErrorResult, type Address, type Hex } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'

const vault = '0x535d863382aF5dbB94d078E28fFbdC42573F8F69' as Address
const follower = '0x6C8011a929164485c3aED93433E7363Fcb990b97' as Address
const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address
const pool = '0x996d36787cfc6569037039730d8cf82ad29c8f56' as Address

function decodeRevert(data: Hex | undefined) {
  if (!data) return null
  const abis = [
    'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
    'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
    'error InvalidPrice()',
    'error ImmediateOrCancelNoFill()',
  ]
  for (const sig of abis) {
    try {
      return decodeErrorResult({ abi: parseAbi([sig]), data })
    } catch { /* next */ }
  }
  return { raw: data }
}

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const { mirrorWallet, perpRouter } = await resolveMirrorWallet(vault, follower)

  const usdso = await client.readContract({
    address: MARGIN_BANK,
    abi: parseAbi([
      'function getSystemConfig() view returns (address marginBank, address collateralToken, address perpPoolFactory, address liquidationEngine, address insuranceFund, address feeRecipient, uint16 maxLeverageLimit, bool fullyWired)',
    ]),
    functionName: 'getSystemConfig',
  }).then((r) => r[1])

  const marginPull = 1_200_000_000_000_000_000n
  const [followerAllowMirror, mirrorAllowBank, mirrorUsdso, followerUsdso, deposited] = await Promise.all([
    client.readContract({ address: usdso, abi: parseAbi(['function allowance(address,address) view returns (uint256)']), functionName: 'allowance', args: [follower, mirrorWallet] }),
    client.readContract({ address: usdso, abi: parseAbi(['function allowance(address,address) view returns (uint256)']), functionName: 'allowance', args: [mirrorWallet, MARGIN_BANK] }),
    client.readContract({ address: usdso, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [mirrorWallet] }),
    client.readContract({ address: usdso, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [follower] }),
    client.readContract({
      address: MARGIN_BANK,
      abi: parseAbi(['function getDepositedBalance(address account) view returns (uint256)']),
      functionName: 'getDepositedBalance',
      args: [mirrorWallet],
    }).catch(() => 0n),
  ])

  console.log('=== Allowance chain ===')
  console.log({ usdso, mirrorWallet, perpRouter, MARGIN_BANK })
  console.log('follower USDso:', followerUsdso.toString())
  console.log('follower → mirror allowance:', followerAllowMirror.toString())
  console.log('mirror → marginBank allowance:', mirrorAllowBank.toString())
  console.log('mirror wallet USDso balance:', mirrorUsdso.toString())
  console.log('mirror margin bank deposit:', deposited.toString())

  // Simulate margin bank deposit from mirror (needs mirror to hold USDso first)
  console.log('\n=== Simulate marginBank.deposit from mirror (no prior pull) ===')
  try {
    await client.simulateContract({
      address: MARGIN_BANK,
      abi: parseAbi(['function deposit(uint256 amount)']),
      functionName: 'deposit',
      args: [marginPull],
      account: mirrorWallet,
    })
    console.log('deposit: OK (unexpected — mirror has no USDso)')
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; cause?: { data?: Hex } }
    console.log('deposit REVERT:', err.shortMessage)
    console.log('decoded:', decodeRevert(err.cause?.data))
  }

  const mark = await client.readContract({ address: pool, abi: parseAbi(['function getMarkPrice() view returns (uint256)']), functionName: 'getMarkPrice' })
  const tick = (await client.readContract({ address: pool, abi: parseAbi(['function getOrderBookParameters() view returns (uint256,uint256,uint256)']), functionName: 'getOrderBookParameters' }))[0]
  const adj = (mark * 300n) / 10_000n
  let price = mark - adj
  price = price - (price % tick)
  const expireNs = BigInt((Math.floor(Date.now() / 1000) + 300) * 1_000_000_000)

  console.log('\n=== Simulate executeOpen (full margin pull) ===')
  try {
    const r = await client.simulateContract({
      address: mirrorWallet,
      abi: parseAbi([
        'function executeOpen(address pool, uint256 marginPull, bool isBid, uint256 price, uint256 quantity, uint64 expireNs) returns (uint128)',
      ]),
      functionName: 'executeOpen',
      args: [pool, marginPull, false, price, 9_000_000n, expireNs],
      account: perpRouter,
    })
    console.log('executeOpen OK orderId=', r.result?.toString())
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; cause?: { data?: Hex } }
    const data = err.cause?.data
    console.log('executeOpen REVERT:', err.shortMessage)
    console.log('full data:', data)
    if (data && data.length > 10) {
      const spender = `0x${data.slice(34, 74)}`
      const allowance = BigInt(`0x${data.slice(74, 138)}`)
      const needed = BigInt(`0x${data.slice(138, 202)}`)
      console.log('ERC20InsufficientAllowance?', { spender, allowance: allowance.toString(), needed: needed.toString() })
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
