/**
 * Send USDso from deployer (PRIVATE_KEY) to a follower wallet for perp testing.
 * Also prints mirror margin math for the vault subscription.
 *
 *   npx tsx scripts/send-usdso-to-follower.ts <follower> [amountUsdso]
 */
import 'dotenv/config'
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, formatUnits, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { createMarketsExchange } from '../src/services/markets-exchange.js'

const USDSO = '0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171' as Address
const VAULT = '0x773569f809F74f7BCc17b27b1a41d24fBFB38360' as Address

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

const vaultAbi = parseAbi([
  'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
  'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
])

function mirrorMarginRaw(maxPositionSize: bigint, sizeBps: number, riskPct: number): bigint {
  return (maxPositionSize * BigInt(sizeBps) * BigInt(riskPct)) / (10_000n * 10_000n)
}

async function main() {
  const follower = process.argv[2] as Address
  const amountUsdso = Number(process.argv[3] ?? '8')
  const pk = process.env.PRIVATE_KEY
  if (!pk || !follower) throw new Error('usage: send-usdso-to-follower.ts <follower> [amountUsdso]')

  const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  const [cfg, signal] = await Promise.all([
    publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'getFollowerConfig', args: [follower] }),
    publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'getCurrentSignal' }),
  ])

  const raw = mirrorMarginRaw(cfg.maxPositionSize, signal.sizeBps, cfg.riskPct)
  const asTusdc6 = formatUnits(raw, 6)
  const asUsdso18IfScaled = formatUnits(raw * 1_000_000_000_000n, 18)

  console.log('=== Mirror margin per signal (from subscribe + agent) ===')
  console.log({
    maxPositionSize: `${formatUnits(cfg.maxPositionSize, 6)} (stored as 6-dec tUSDC units)`,
    sizeBps: signal.sizeBps,
    riskPct: cfg.riskPct,
    rawCollateral: raw.toString(),
    effectiveIf6decOnly: `${formatUnits(raw, 6)} (tUSDC-scale units)`,
    effectiveUsdsoPerMirror: `${formatUnits(raw * 1_000_000_000_000n, 18)} USDso (with PerpRouter 1e12 scaling)`,
  })
  console.log('\nRecommended MarginBank deposit: 5–10 USDso + set 10x leverage on XRP pool')
  console.log('Recommended wallet transfer (ERC20):', amountUsdso, 'USDso (then deposit from follower wallet)\n')

  const exchange = await createMarketsExchange({ privateKey: pk })
  const bal = await exchange.fetchBalance()
  let usdso = bal.USDso?.total ?? 0
  console.log(`Deployer ${account.address}: STT=${bal.STT?.total?.toFixed(2)} USDso=${usdso.toFixed(4)}`)

  if (usdso < amountUsdso) {
    console.log('Swapping STT → USDso on SOMI/USDso…')
    const stt = bal.STT?.total ?? 0
    const sell = Math.min(stt - 2, Math.max(20, amountUsdso * 15))
    if (sell <= 0) throw new Error('Not enough STT to swap')
    await exchange.createOrder('SOMI/USDso', 'market', 'sell', sell, undefined, { slippage: 0.03, timeInForce: 'IOC' })
    const after = await exchange.fetchBalance()
    usdso = after.USDso?.total ?? 0
    console.log(`USDso after swap: ${usdso.toFixed(4)}`)
  }

  const amount = parseUnits(String(amountUsdso), 18)
  const followerBal = await publicClient.readContract({
    address: USDSO,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [follower],
  })

  console.log(`Follower USDso before: ${formatUnits(followerBal, 18)}`)
  const hash = await walletClient.writeContract({
    address: USDSO,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [follower, amount],
    chain: somniaTestnet,
    account,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  const afterBal = await publicClient.readContract({
    address: USDSO,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [follower],
  })
  console.log(`Sent ${amountUsdso} USDso → ${follower}`)
  console.log(`Tx: ${hash}`)
  console.log(`Follower USDso after: ${formatUnits(afterBal, 18)}`)
  console.log('\nNext (follower wallet): approve USDso to mirror wallet from PerpRouter.predictMirrorWallet(follower)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
