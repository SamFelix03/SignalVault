import 'dotenv/config'
import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'

const vault = process.argv[2] as Address
const follower = (process.argv[3] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const mirrorReactor = await client.readContract({
    address: vault,
    abi: parseAbi(['function mirrorReactor() view returns (address)']),
    functionName: 'mirrorReactor',
  })
  const perpRouter = await client.readContract({
    address: vault,
    abi: parseAbi(['function eventRouter() view returns (address)']),
    functionName: 'eventRouter',
  })
  const signal = await client.readContract({
    address: vault,
    abi: parseAbi([
      'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
    ]),
    functionName: 'getCurrentSignal',
  })
  const config = await client.readContract({
    address: vault,
    abi: parseAbi([
      'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
    ]),
    functionName: 'getFollowerConfig',
    args: [follower],
  })
  const collateral6 =
    (config.maxPositionSize * BigInt(signal.sizeBps) * BigInt(config.riskPct)) / (10_000n * 10_000n)

  let routerVersion = 'missing'
  try {
    routerVersion = (
      await client.readContract({
        address: perpRouter,
        abi: parseAbi(['function ROUTER_VERSION() view returns (uint256)']),
        functionName: 'ROUTER_VERSION',
      })
    ).toString()
  } catch {
    routerVersion = '0 (no ROUTER_VERSION)'
  }

  console.log('mirrorReactor:', mirrorReactor)
  console.log('perpRouter:', perpRouter, 'ROUTER_VERSION:', routerVersion)

  try {
    await client.simulateContract({
      address: perpRouter,
      abi: parseAbi([
        'function placeOrder(address follower, bytes32 marketRef, int8 direction, uint256 sizeAmount, uint256 limitPrice, uint16 maxSlippageBps) returns (bytes32)',
      ]),
      functionName: 'placeOrder',
      args: [follower, signal.marketId, signal.direction, collateral6, signal.limitPrice, config.maxSlippageBps],
      account: mirrorReactor,
    })
    console.log('✅ simulate placeOrder as MirrorReactor succeeded')
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; cause?: { data?: string; reason?: string }; data?: string }
    console.log('❌ simulate failed:', err.shortMessage ?? err.cause?.reason)
    console.log('revert data:', err.cause?.data ?? err.data ?? 'n/a')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
