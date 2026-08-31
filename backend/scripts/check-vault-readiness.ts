import 'dotenv/config'
import { createPublicClient, http, parseAbi, formatUnits, type Address } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { perpRouterNeedsUpgrade } from '../src/services/mirror-wallet.js'

const vault = process.argv[2] as Address
const follower = (process.argv[3] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address
const USDSO = '0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171' as Address
const MIRROR = '0x175894dE9f2193D4241F2b1482cc0D4b5bE63699' as Address

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const [owner, subId, routerStatus, allowance, balance] = await Promise.all([
    client.readContract({ address: vault, abi: parseAbi(['function owner() view returns (address)']), functionName: 'owner' }),
    client.readContract({ address: MIRROR, abi: parseAbi(['function subscriptionId() view returns (uint256)']), functionName: 'subscriptionId' }),
    perpRouterNeedsUpgrade(vault),
    client.readContract({
      address: USDSO,
      abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
      functionName: 'allowance',
      args: [follower, '0xe414fe242EA6a2940e104Ed8Fde224b4F78E515B' as Address],
    }),
    client.readContract({
      address: USDSO,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [follower],
    }),
  ])

  const mirrorWallet = await client.readContract({
    address: routerStatus.perpRouter,
    abi: parseAbi(['function predictMirrorWallet(address) view returns (address)']),
    functionName: 'predictMirrorWallet',
    args: [follower],
  }).catch(() => null)

  console.log(JSON.stringify({
    vault,
    owner,
    follower,
    mirrorReactorSubscriptionId: subId.toString(),
    perpRouter: routerStatus.perpRouter,
    needsPerpRouterUpgrade: routerStatus.needsUpgrade,
    predictMirrorWalletWorks: mirrorWallet !== null,
    followerUsdsoBalance: formatUnits(balance, 18),
    followerUsdsoAllowance: formatUnits(allowance, 18),
  }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
