/**
 * Rewire perp vault: fresh MirrorReactor clone + PerpRouter v4, sync vault pointers.
 *
 *   npx tsx scripts/rewire-perp-mirror.ts <vault> [implMirror]
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
import { RPC_URL, VAULT_FACTORY_ADDRESS } from '../src/config/constants.js'

const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address
const MIRROR_CLONER = '0x9ac3B89f5A0B1337b77C667CECC6B924C546b2BF' as Address

async function cloneMirror(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  account: ReturnType<typeof privateKeyToAccount>,
  implMirror: Address,
): Promise<Address> {
  const { request, result } = await publicClient.simulateContract({
    address: MIRROR_CLONER,
    abi: parseAbi(['function cloneMirror(address implementation) returns (address instance)']),
    functionName: 'cloneMirror',
    args: [implMirror],
    account,
  })
  const hash = await walletClient.writeContract({ ...request, account, chain: somniaTestnet })
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 300_000 })
  if (receipt.status !== 'success') throw new Error(`cloneMirror failed: ${hash}`)
  const newMirror = result as Address
  const mirrorCode = await publicClient.getBytecode({ address: newMirror })
  if (!mirrorCode || mirrorCode === '0x') {
    throw new Error(`MirrorReactor clone has no code at ${newMirror}`)
  }
  return newMirror
}

async function resolveImplMirror(
  publicClient: ReturnType<typeof createPublicClient>,
  override?: Address,
): Promise<Address> {
  if (override) return override
  return publicClient.readContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: parseAbi(['function implMirrorReactor() view returns (address)']),
    functionName: 'implMirrorReactor',
  })
}

async function main() {
  const vault = process.argv[2] as Address
  const implOverride = process.argv[3] as Address | undefined
  const pk = process.env.PRIVATE_KEY
  if (!vault || !pk) throw new Error('usage: rewire-perp-mirror.ts <vault> [implMirror]')

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  const [owner, stop, guard, implMirror] = await Promise.all([
    publicClient.readContract({
      address: vault,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner',
    }),
    publicClient.readContract({
      address: vault,
      abi: parseAbi(['function stopReactor() view returns (address)']),
      functionName: 'stopReactor',
    }),
    publicClient.readContract({
      address: vault,
      abi: parseAbi(['function drawdownGuard() view returns (address)']),
      functionName: 'drawdownGuard',
    }),
    resolveImplMirror(publicClient, implOverride),
  ])

  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`PRIVATE_KEY is ${account.address} but vault owner is ${owner}`)
  }

  console.log({ vault, owner, implMirror, stop, guard })

  const newMirror = await cloneMirror(publicClient, walletClient, account, implMirror)
  console.log('newMirrorReactor:', newMirror)

  const contractsDir = join(dirname(fileURLToPath(import.meta.url)), '../../contracts')
  const artifactPath = join(contractsDir, 'out/PerpRouter.sol/PerpRouter.json')
  if (!existsSync(artifactPath)) {
    execSync('forge build --contracts src/integrations/PerpRouter.sol', {
      cwd: contractsDir,
      stdio: 'inherit',
    })
  }
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
    bytecode: { object: string }
    abi: unknown
  }

  const routerHash = await walletClient.deployContract({
    abi: artifact.abi as never,
    bytecode: artifact.bytecode.object as Hex,
    args: [newMirror, MARGIN_BANK],
    account,
    chain: somniaTestnet,
  })
  const routerReceipt = await publicClient.waitForTransactionReceipt({ hash: routerHash, timeout: 300_000 })
  const newRouter = routerReceipt.contractAddress
  if (!newRouter) throw new Error('PerpRouter deploy failed')
  console.log('newPerpRouter:', newRouter)

  const initHash = await walletClient.writeContract({
    address: newMirror,
    abi: parseAbi(['function initialize(address,address,address)']),
    functionName: 'initialize',
    args: [owner, vault, newRouter],
    account,
    chain: somniaTestnet,
  })
  await publicClient.waitForTransactionReceipt({ hash: initHash, timeout: 300_000 })

  const setRouterHash = await walletClient.writeContract({
    address: vault,
    abi: parseAbi(['function setEventRouter(address _router)']),
    functionName: 'setEventRouter',
    args: [newRouter],
    account,
    chain: somniaTestnet,
  })
  await publicClient.waitForTransactionReceipt({ hash: setRouterHash, timeout: 300_000 })

  const setReactorsHash = await walletClient.writeContract({
    address: vault,
    abi: parseAbi(['function setReactors(address,address,address)']),
    functionName: 'setReactors',
    args: [newMirror, stop, guard],
    account,
    chain: somniaTestnet,
  })
  await publicClient.waitForTransactionReceipt({ hash: setReactorsHash, timeout: 300_000 })

  const routerVersion = await publicClient.readContract({
    address: newRouter,
    abi: parseAbi(['function ROUTER_VERSION() view returns (uint256)']),
    functionName: 'ROUTER_VERSION',
  })

  console.log('\n✅ Rewire complete')
  console.log('  mirrorReactor:', newMirror)
  console.log('  eventRouter:', newRouter)
  console.log('  ROUTER_VERSION:', routerVersion.toString())
  console.log('\nNext: npx tsx scripts/reregister-mirror-sub.ts', vault)
  console.log('Followers must re-approve USDso to the new mirror wallet (predict via PerpRouter.predictMirrorWallet)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
