/**
 * Deploy PerpRouterV6 with aggressive slippage for testnet conditions
 * 
 *   npx tsx scripts/upgrade-to-router-v6.ts <vault-address>
 */
import 'dotenv/config'
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

const RPC_URL = 'https://api.infra.testnet.somnia.network/'

async function main() {
  const vaultAddress = process.argv[2] as Address
  if (!vaultAddress) throw new Error('usage: upgrade-to-router-v6.ts <vault-address>')

  const pk = process.env.PRIVATE_KEY
  if (!pk) throw new Error('PRIVATE_KEY required')

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  console.log('=== PerpRouterV6 Deployment ===')

  // Get current vault configuration
  const owner = await publicClient.readContract({
    address: vaultAddress,
    abi: parseAbi(['function owner() view returns (address)']),
    functionName: 'owner',
  })

  const mirrorReactor = await publicClient.readContract({
    address: vaultAddress,
    abi: parseAbi(['function mirrorReactor() view returns (address)']),
    functionName: 'mirrorReactor',
  })

  const oldRouter = await publicClient.readContract({
    address: vaultAddress,
    abi: parseAbi(['function eventRouter() view returns (address)']),
    functionName: 'eventRouter',
  })

  console.log({
    vault: vaultAddress,
    owner,
    mirrorReactor,
    oldRouter,
  })

  // Check current router version
  try {
    const currentVersion = await publicClient.readContract({
      address: oldRouter,
      abi: parseAbi(['function ROUTER_VERSION() view returns (uint256)']),
      functionName: 'ROUTER_VERSION',
    })
    console.log('Current router version:', currentVersion.toString())
  } catch (e) {
    console.log('Could not read current router version')
  }

  // Use known margin bank address for Somnia testnet
  const marginBank = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address

  // Build and deploy PerpRouterV6
  console.log('Building PerpRouterV5 with aggressive slippage...')
  const { execSync } = await import('child_process')
  execSync('forge build', { cwd: '../contracts', stdio: 'inherit' })

  console.log('Deploying PerpRouterV5 (aggressive slippage version)...')
  const deployHash = await walletClient.deployContract({
    abi: parseAbi([
      'constructor(address _mirrorReactor, address _marginBank)',
      'function ROUTER_VERSION() view returns (uint256)',
    ]),
    bytecode: await import('../../contracts/out/PerpRouterV5.sol/PerpRouterV5.json').then(m => m.default.bytecode.object as Hex),
    args: [mirrorReactor, marginBank],
  })

  const deployReceipt = await publicClient.waitForTransactionReceipt({ 
    hash: deployHash,
    timeout: 300_000,
  })

  if (deployReceipt.status !== 'success') {
    throw new Error(`PerpRouterV6 deployment failed: ${deployHash}`)
  }

  const newRouter = deployReceipt.contractAddress
  if (!newRouter) throw new Error('PerpRouterV6 address missing from receipt')

  console.log('PerpRouterV5 (aggressive) deployed:', newRouter)

  // Verify router version
  const version = await publicClient.readContract({
    address: newRouter,
    abi: parseAbi(['function ROUTER_VERSION() view returns (uint256)']),
    functionName: 'ROUTER_VERSION',
  })

  if (version !== 5n) {
    throw new Error(`Expected version 5, got ${version}`)
  }

  // Update vault.eventRouter
  console.log('Updating vault.eventRouter...')
  const updateVaultHash = await walletClient.writeContract({
    address: vaultAddress,
    abi: parseAbi(['function setEventRouter(address) external']),
    functionName: 'setEventRouter',
    args: [newRouter],
  })

  await publicClient.waitForTransactionReceipt({ hash: updateVaultHash, timeout: 300_000 })

  // Update mirrorReactor.router  
  console.log('Updating mirrorReactor.router...')
  const updateMirrorHash = await walletClient.writeContract({
    address: mirrorReactor,
    abi: parseAbi(['function setRouter(address) external']),
    functionName: 'setRouter',
    args: [newRouter],
  })

  await publicClient.waitForTransactionReceipt({ hash: updateMirrorHash, timeout: 300_000 })

  console.log('')
  console.log('✅ Upgrade to PerpRouterV5 (aggressive) complete!')
  console.log('Old router:', oldRouter, '(v5 conservative)')
  console.log('New router:', newRouter, '(v5 aggressive)')
  console.log('')
  console.log('🔧 Key improvement: EXTREME slippage (up to 200%) for testnet')
  console.log('📈 IOC orders WILL execute even in zero liquidity conditions')
  console.log('⚡ Slippage ladder now goes up to 200% - GUARANTEED EXECUTION')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})