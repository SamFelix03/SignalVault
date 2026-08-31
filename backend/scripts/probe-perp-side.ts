/**
 * Step 3: Compare SHORT (isBid=false) vs LONG (isBid=true) pool reverts + margin requirements.
 */
import 'dotenv/config'
import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'

const vault = '0x535d863382aF5dbB94d078E28fFbdC42573F8F69' as Address
const follower = '0x6C8011a929164485c3aED93433E7363Fcb990b97' as Address
const pool = '0x996d36787cfc6569037039730d8cf82ad29c8f56' as Address

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const { mirrorWallet } = await resolveMirrorWallet(vault, follower)

  const poolAbi = parseAbi([
    'function getMarkPrice() view returns (uint256)',
    'function getOneBase() view returns (uint256)',
    'function getOrderBookParameters() view returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize)',
    'function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) returns (bool success, uint128 id)',
    'function getAutoPullRequirement(address owner, bool isBid, uint256 price, uint256 quantity, uint96 builderFeeBpsTimes1k) view returns (address inputToken, uint256 requiredAmount, uint256 delta)',
  ])

  const [mark, oneBase, ob] = await Promise.all([
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getMarkPrice' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOneBase' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOrderBookParameters' }),
  ])
  const [tickSize, , lotSize] = ob
  const price = (mark * 97n) / 100n // aggressive
  const quantity = lotSize * 9n
  const expireNs = BigInt((Math.floor(Date.now() / 1000) + 300) * 1_000_000_000)

  for (const isBid of [false, true]) {
    const label = isBid ? 'LONG/buy' : 'SHORT/sell'
    try {
      const req = await client.readContract({
        address: pool,
        abi: poolAbi,
        functionName: 'getAutoPullRequirement',
        args: [mirrorWallet, isBid, price, quantity, 0n],
      })
      console.log(`${label} getAutoPullRequirement:`, {
        inputToken: req[0],
        requiredAmount: req[1].toString(),
        delta: req[2].toString(),
      })
    } catch (e: unknown) {
      const err = e as { shortMessage?: string }
      console.log(`${label} getAutoPullRequirement FAILED:`, err.shortMessage)
    }

    try {
      const r = await client.simulateContract({
        address: pool,
        abi: poolAbi,
        functionName: 'placeOrder',
        args: [isBid, 0n, price, quantity, expireNs, 2, 0, '0x0000000000000000000000000000000000000000', 0n],
        account: mirrorWallet,
      })
      console.log(`${label} placeOrder: success=${r.result?.[0]} id=${r.result?.[1]}`)
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; cause?: { data?: string } }
      console.log(`${label} placeOrder REVERT:`, err.shortMessage, err.cause?.data?.slice(0, 18))
    }
  }
}

main()
