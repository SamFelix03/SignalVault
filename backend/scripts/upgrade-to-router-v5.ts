/**
 * Deploy PerpRouter v5 and upgrade vault to use it.
 * v5 fixes the "margin pull before fill" issue that causes follower losses on IOC no-fill.
 * 
 *   npx tsx scripts/upgrade-to-router-v5.ts <vault>
 */
import 'dotenv/config'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'

const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address

async function main() {
  const vault = process.argv[2] as Address
  const pk = process.env.PRIVATE_KEY
  if (!vault || !pk) throw new Error('usage: upgrade-to-router-v5.ts <vault>')

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const wallet = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  const [owner, mirror, oldRouter] = await Promise.all([
    client.readContract({
      address: vault,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner',
    }),
    client.readContract({
      address: vault,
      abi: parseAbi(['function mirrorReactor() view returns (address)']),
      functionName: 'mirrorReactor',
    }),
    client.readContract({
      address: vault,
      abi: parseAbi(['function eventRouter() view returns (address)']),
      functionName: 'eventRouter',
    }),
  ])

  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`PRIVATE_KEY is ${account.address} but vault owner is ${owner}`)
  }

  console.log({ vault, owner, mirror, oldRouter })

  // Check current router version
  let routerVersion = 0n
  try {
    routerVersion = await client.readContract({
      address: oldRouter,
      abi: parseAbi(['function ROUTER_VERSION() view returns (uint256)']),
      functionName: 'ROUTER_VERSION',
    })
  } catch {
    routerVersion = 0n
  }

  console.log(`Current router version: ${routerVersion}`)
  if (routerVersion >= 5n) {
    console.log('Already at v5 or higher - no upgrade needed')
    return
  }

  // Build PerpRouterV5
  const contractsDir = join(dirname(fileURLToPath(import.meta.url)), '../../contracts')
  const artifactPath = join(contractsDir, 'out/PerpRouterV5.sol/PerpRouterV5.json')
  if (!existsSync(artifactPath)) {
    console.log('Building PerpRouterV5...')
    execSync('forge build --contracts src/integrations/PerpRouterV5.sol', { cwd: contractsDir, stdio: 'inherit' })
  }

  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
    bytecode: { object: string }
    abi: unknown
  }

  console.log('Deploying PerpRouterV5...')
  const deployHash = await wallet.deployContract({
    abi: artifact.abi as never,
    bytecode: artifact.bytecode.object as Hex,
    args: [mirror, MARGIN_BANK],
  })
  const receipt = await client.waitForTransactionReceipt({ hash: deployHash })
  const newRouter = receipt.contractAddress
  if (!newRouter) throw new Error('Deploy failed')

  console.log('PerpRouterV5 deployed:', newRouter)

  // Update vault to use new router
  console.log('Updating vault.eventRouter...')
  const setHash = await wallet.writeContract({
    address: vault,
    abi: parseAbi(['function setEventRouter(address _router)']),
    functionName: 'setEventRouter',
    args: [newRouter],
  })
  await client.waitForTransactionReceipt({ hash: setHash })

  // Update mirror reactor to point to new router
  console.log('Updating mirrorReactor.router...')
  const setRouterHash = await wallet.writeContract({
    address: mirror,
    abi: parseAbi(['function setRouter(address _router)']),
    functionName: 'setRouter',
    args: [newRouter],
  })
  await client.waitForTransactionReceipt({ hash: setRouterHash })

  const newVersion = await client.readContract({
    address: newRouter,
    abi: parseAbi(['function ROUTER_VERSION() view returns (uint256)']),
    functionName: 'ROUTER_VERSION',
  })

  console.log('\n✅ Upgrade complete!')
  console.log('Old router:', oldRouter, `(v${routerVersion})`)
  console.log('New router:', newRouter, `(v${newVersion})`)
  console.log('\n🔧 Key v5 improvement: Margin is only pulled AFTER successful IOC fill')
  console.log('📍 Followers must re-approve USDso to new mirror wallet:')
  
  const predictedWallet = await client.readContract({
    address: newRouter,
    abi: parseAbi(['function predictMirrorWallet(address) view returns (address)']),
    functionName: 'predictMirrorWallet',
    args: ['0x6C8011a929164485c3aED93433E7363Fcb990b97'],
  })
  console.log('   Mirror wallet:', predictedWallet)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})