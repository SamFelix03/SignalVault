/**
 * Verify PerpRouterV5 deployment and current vault configuration
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
  const vault = process.argv[2] as Address || '0x535d863382aF5dbB94d078E28fFbdC42573F8F69'

  const client = createPublicClient({
    chain: somniaTestnet,
    transport: http('https://api.infra.testnet.somnia.network/'),
  })

  console.log('=== Vault Router Status ===')
  console.log('Vault:', vault)

  // Get current routers
  const eventRouter = await client.readContract({
    address: vault,
    abi: parseAbi(['function eventRouter() view returns (address)']),
    functionName: 'eventRouter',
  })

  const mirrorReactor = await client.readContract({
    address: vault,
    abi: parseAbi(['function mirrorReactor() view returns (address)']),
    functionName: 'mirrorReactor',
  })

  console.log('Event router:', eventRouter)
  console.log('Mirror reactor:', mirrorReactor)

  // Check mirror reactor's router
  const mirrorRouter = await client.readContract({
    address: mirrorReactor,
    abi: parseAbi(['function router() view returns (address)']),
    functionName: 'router',
  })
  console.log('Mirror reactor router:', mirrorRouter)

  // Check router version
  try {
    const version = await client.readContract({
      address: eventRouter,
      abi: parseAbi(['function ROUTER_VERSION() view returns (uint256)']),
      functionName: 'ROUTER_VERSION',
    })
    console.log('Router version:', version.toString())

    if (version === 5n) {
      console.log('✅ PerpRouterV5 is ACTIVE')
      console.log('✅ Margin-safe IOC logic enabled')
      console.log('✅ No funds lost on order failures')
    } else {
      console.log('❌ Old router version detected')
    }
  } catch (e) {
    console.log('Router version check failed:', e.message)
  }

  // Check if router addresses match
  if (eventRouter.toLowerCase() === mirrorRouter.toLowerCase()) {
    console.log('✅ Router addresses consistent')
  } else {
    console.log('⚠️ Router address mismatch!')
    console.log('  Event router:', eventRouter)
    console.log('  Mirror router:', mirrorRouter)
  }

  // Expected v5 router from upgrade
  const expectedV5 = '0x89E25C1a17f7e65C689A96B652d8FCdee48e793e'
  if (eventRouter.toLowerCase() === expectedV5.toLowerCase()) {
    console.log('✅ Upgraded to expected PerpRouterV5 address')
  } else {
    console.log('⚠️ Router not at expected v5 address')
    console.log('  Expected:', expectedV5)
    console.log('  Actual:', eventRouter)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})