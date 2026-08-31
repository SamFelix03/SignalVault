import 'dotenv/config'
import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'

const vault = process.argv[2] as Address
const pool = '0x996d36787cfc6569037039730d8cf82ad29c8f56' as Address

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const signal = await client.readContract({
    address: vault,
    abi: parseAbi([
      'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
    ]),
    functionName: 'getCurrentSignal',
  })
  const ob = await client.readContract({
    address: pool,
    abi: parseAbi([
      'function getOrderBookParameters() view returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize)',
    ]),
    functionName: 'getOrderBookParameters',
  })
  const tick = ob[0]
  const limit = signal.limitPrice
  const slippageBps = 100n
  const adj = (limit * slippageBps) / 10_000n
  const isBid = signal.direction > 0
  const exec = isBid ? limit + adj : limit > adj ? limit - adj : limit

  console.log('limitPrice:', limit.toString())
  console.log('tickSize:', tick.toString())
  console.log('limit % tick:', (limit % tick).toString(), limit % tick === 0n ? 'OK' : 'BAD')
  console.log('execPrice:', exec.toString())
  console.log('exec % tick:', (exec % tick).toString(), exec % tick === 0n ? 'OK' : 'BAD ← InvalidPrice')
  console.log('tick-aligned exec:', ((exec / tick) * tick).toString())
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
