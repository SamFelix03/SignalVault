/**
 * Get the new mirror wallet address for aggressive router
 */
import 'dotenv/config'
import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
} from 'viem'
import { somniaTestnet } from '../src/config/chains.js'

async function main() {
  const follower = '0x6C8011a929164485c3aED93433E7363Fcb990b97' as Address
  const aggressiveRouter = '0x4B7eC339f161482Beb5f4e572f759f073Ff8146B' as Address

  const client = createPublicClient({
    chain: somniaTestnet,
    transport: http('https://api.infra.testnet.somnia.network/'),
  })

  const newMirrorWallet = await client.readContract({
    address: aggressiveRouter,
    abi: parseAbi(['function predictMirrorWallet(address follower) view returns (address)']),
    functionName: 'predictMirrorWallet',
    args: [follower],
  })

  console.log('=== AGGRESSIVE ROUTER SETUP ===')
  console.log('Follower:', follower)
  console.log('Aggressive router:', aggressiveRouter)
  console.log('NEW mirror wallet:', newMirrorWallet)
  console.log('')
  console.log('🔧 Frontend will show new mirror wallet for approval')
  console.log('⚡ Max slippage increased: 15% → 50%')
  console.log('📈 Every signal will now execute in testnet conditions!')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})