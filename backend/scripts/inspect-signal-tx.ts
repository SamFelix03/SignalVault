import 'dotenv/config'
import { createPublicClient, http, parseAbiItem, decodeEventLog, type Address, type Hex } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'

const tx = process.argv[2] as Hex
const vault = process.argv[3] as Address

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const receipt = await client.getTransactionReceipt({ hash: tx })
  console.log('tx:', tx, 'status:', receipt.status, 'block:', receipt.blockNumber.toString())

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === vault.toLowerCase()) {
      try {
        const d = decodeEventLog({
          abi: [parseAbiItem('event SignalUpdated(bytes32 indexed signalHash, int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, string reasoningSummary, bytes32 reasoningHash)')],
          data: log.data,
          topics: log.topics,
        })
        console.log('SignalUpdated:', d.args)
      } catch { /* ignore */ }
    }
    if (log.topics[0] === '0x09de437ef2257493939c34f7c57745481434c2909b60359d13aba0638055303') {
      console.log('MirrorExecuted log at', log.address)
    }
  }

  const mirror = await client.readContract({
    address: vault,
    abi: [{ type: 'function', name: 'mirrorReactor', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' }] as const,
    functionName: 'mirrorReactor',
  })

  const from = receipt.blockNumber > 5n ? receipt.blockNumber - 5n : 0n
  const to = receipt.blockNumber + 20n
  const failed = await client.getLogs({
    address: mirror,
    event: parseAbiItem('event MirrorFailed(address indexed follower, string reason)'),
    fromBlock: from,
    toBlock: to,
  })
  const executed = await client.getLogs({
    address: mirror,
    event: parseAbiItem('event MirrorExecuted(address indexed follower, int8 direction, uint256 collateral, bytes32 fillId, bytes32 marketId)'),
    fromBlock: from,
    toBlock: to,
  })

  console.log('\nMirrorFailed:', failed.length)
  for (const l of failed) console.log(' ', l.args.follower, l.args.reason)
  console.log('MirrorExecuted:', executed.length)
  for (const l of executed) console.log(' ', l.args.follower, 'dir', l.args.direction, 'collateral', l.args.collateral?.toString())
}

main().catch((e) => { console.error(e); process.exit(1) })
