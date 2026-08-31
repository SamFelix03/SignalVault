/**
 * Deploy PerpRouter v2 (tick-aligned slippage) and point vault at it.
 * Vault owner must match PRIVATE_KEY in backend/.env.
 *
 *   npx tsx scripts/upgrade-perp-router.ts <vault>
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
import { PERP_ROUTER_VERSION } from '../src/services/mirror-wallet.js'

const TESTNET_MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address

const perpRouterBytecodeMarker = '608060405234801561001057600080fd5b50'

async function main() {
  const vault = process.argv[2] as Address
  const pk = process.env.PRIVATE_KEY
  if (!vault || !pk) throw new Error('usage: upgrade-perp-router.ts <vault>')

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  const [owner, mirror, oldRouter] = await Promise.all([
    publicClient.readContract({
      address: vault,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner',
    }),
    publicClient.readContract({
      address: vault,
      abi: parseAbi(['function mirrorReactor() view returns (address)']),
      functionName: 'mirrorReactor',
    }),
    publicClient.readContract({
      address: vault,
      abi: parseAbi(['function eventRouter() view returns (address)']),
      functionName: 'eventRouter',
    }),
  ])

  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`PRIVATE_KEY is ${account.address} but vault owner is ${owner} — connect owner wallet`)
  }

  console.log({ vault, owner, mirror, oldRouter })

  let routerVersion = 0n
  try {
    routerVersion = await publicClient.readContract({
      address: oldRouter,
      abi: parseAbi(['function ROUTER_VERSION() view returns (uint256)']),
      functionName: 'ROUTER_VERSION',
    })
  } catch {
    routerVersion = 0n
  }
  if (routerVersion >= BigInt(PERP_ROUTER_VERSION)) {
    console.log(`PerpRouter already v${routerVersion.toString()} — no upgrade needed`)
    return
  }
  console.log(`Upgrading PerpRouter v${routerVersion.toString()} → v${PERP_ROUTER_VERSION}`)

  const contractsDir = join(dirname(fileURLToPath(import.meta.url)), '../../contracts')
  const artifactPath = join(contractsDir, 'out/PerpRouter.sol/PerpRouter.json')
  if (!existsSync(artifactPath)) {
    console.log('Building PerpRouter with forge…')
    execSync('forge build --contracts src/integrations/PerpRouter.sol', { cwd: contractsDir, stdio: 'inherit' })
  }

  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
    bytecode: { object: string }
    abi: unknown
  }
  if (!artifact.bytecode.object.includes(perpRouterBytecodeMarker.slice(0, 8))) {
    console.warn('Bytecode may be stale — run forge build in contracts/')
  }

  const constructorArgs = [mirror, TESTNET_MARGIN_BANK] as const
  const deployHash = await walletClient.deployContract({
    abi: artifact.abi as never,
    bytecode: artifact.bytecode.object as Hex,
    args: constructorArgs,
    account,
    chain: somniaTestnet,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
  const newRouter = receipt.contractAddress
  if (!newRouter) throw new Error('deploy failed')

  console.log('Deployed PerpRouter:', newRouter)

  const setHash = await walletClient.writeContract({
    address: vault,
    abi: parseAbi(['function setEventRouter(address _router)']),
    functionName: 'setEventRouter',
    args: [newRouter],
    account,
    chain: somniaTestnet,
  })
  await publicClient.waitForTransactionReceipt({ hash: setHash })
  console.log('Vault eventRouter updated:', setHash)
  console.log('\nFollowers must grant operator on NEW router:', newRouter)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
