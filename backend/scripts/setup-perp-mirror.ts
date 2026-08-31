/**
 * Vault-owner setup: deploy PerpRouter v3 + register/re-register MirrorReactor subscription.
 *
 *   npx tsx scripts/setup-perp-mirror.ts <vault>
 *   npx tsx scripts/setup-perp-mirror.ts <vault> --fix-gas   # re-register mirror sub at 30M gas
 */
import 'dotenv/config'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
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

async function routerNeedsUpgrade(publicClient: ReturnType<typeof createPublicClient>, router: Address): Promise<boolean> {
  try {
    const version = await publicClient.readContract({
      address: router,
      abi: parseAbi(['function ROUTER_VERSION() view returns (uint256)']),
      functionName: 'ROUTER_VERSION',
    })
    return version < BigInt(PERP_ROUTER_VERSION)
  } catch {
    try {
      await publicClient.readContract({
        address: router,
        abi: parseAbi(['function predictMirrorWallet(address) view returns (address)']),
        functionName: 'predictMirrorWallet',
        args: ['0x0000000000000000000000000000000000000001'],
      })
      return true
    } catch {
      return true
    }
  }
}

async function main() {
  const vault = process.argv[2] as Address
  const fixGas = process.argv.includes('--fix-gas')
  const pk = process.env.PRIVATE_KEY
  if (!vault || !pk) throw new Error('usage: setup-perp-mirror.ts <vault> [--fix-gas]')

  if (fixGas) {
    execSync(`npx tsx scripts/reregister-mirror-sub.ts ${vault}`, {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
    return
  }

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  const [owner, mirrorReactor, oldRouter] = await Promise.all([
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

  const subId = await publicClient.readContract({
    address: mirrorReactor,
    abi: parseAbi(['function subscriptionId() view returns (uint256)']),
    functionName: 'subscriptionId',
  })

  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`PRIVATE_KEY is ${account.address} but vault owner is ${owner}`)
  }

  console.log({ vault, owner, mirror: mirrorReactor, oldRouter, subscriptionId: subId.toString() })

  if (await routerNeedsUpgrade(publicClient, oldRouter)) {
    const contractsDir = join(process.cwd(), '../contracts')
    const artifactPath = join(contractsDir, 'out/PerpRouter.sol/PerpRouter.json')
    if (!existsSync(artifactPath)) {
      console.log('Building PerpRouter…')
      execSync('forge build --contracts src/integrations/PerpRouter.sol', {
        cwd: contractsDir,
        stdio: 'inherit',
      })
    }
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
      bytecode: { object: string }
      abi: unknown
    }

    console.log(`Deploying PerpRouter v${PERP_ROUTER_VERSION} (tick-aligned slippage)…`)
    const deployHash = await walletClient.deployContract({
      abi: artifact.abi as never,
      bytecode: artifact.bytecode.object as Hex,
      args: [mirrorReactor, TESTNET_MARGIN_BANK],
      account,
      chain: somniaTestnet,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
    const newRouter = receipt.contractAddress
    if (!newRouter) throw new Error('PerpRouter deploy failed')

    console.log('PerpRouter deployed:', newRouter)

    const setHash = await walletClient.writeContract({
      address: vault,
      abi: parseAbi(['function setEventRouter(address _router)']),
      functionName: 'setEventRouter',
      args: [newRouter],
      account,
      chain: somniaTestnet,
    })
    await publicClient.waitForTransactionReceipt({ hash: setHash })
    console.log('setEventRouter:', setHash)
  } else {
    console.log(`PerpRouter already at v${PERP_ROUTER_VERSION} — skip deploy`)
  }

  if (subId === 0n) {
    console.log('Registering MirrorReactor subscription…')
    const regHash = await walletClient.writeContract({
      address: mirrorReactor,
      abi: parseAbi(['function registerSubscription()']),
      functionName: 'registerSubscription',
      account,
      chain: somniaTestnet,
    })
    await publicClient.waitForTransactionReceipt({ hash: regHash })
    console.log('registerSubscription:', regHash)
  } else {
    console.log('MirrorReactor subscription already registered')
  }

  const newSubId = await publicClient.readContract({
    address: mirrorReactor,
    abi: parseAbi(['function subscriptionId() view returns (uint256)']),
    functionName: 'subscriptionId',
  })
  const newRouter = await publicClient.readContract({
    address: vault,
    abi: parseAbi(['function eventRouter() view returns (address)']),
    functionName: 'eventRouter',
  })

  console.log('\n✅ Setup complete')
  console.log('  eventRouter:', newRouter)
  console.log('  subscriptionId:', newSubId.toString())
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
