/**
 * Deploy fixed EventContractsRouter (BUY_NO qty + limit) and wire to vault + mirror.
 *   npx tsx scripts/setup-binary-mirror.ts <vault>
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
import { RPC_URL, TESTNET_TUSDC } from '../src/config/constants.js'

async function main() {
  const vault = process.argv[2] as Address
  const pk = process.env.PRIVATE_KEY
  if (!vault || !pk) throw new Error('usage: setup-binary-mirror.ts <vault>')

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  const [owner, mirrorReactor, oldRouter, instrument] = await Promise.all([
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
    publicClient.readContract({
      address: vault,
      abi: parseAbi(['function instrumentType() view returns (uint8)']),
      functionName: 'instrumentType',
    }),
  ])

  if (instrument !== 0) throw new Error('Vault is not BINARY')
  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`PRIVATE_KEY is ${account.address} but vault owner is ${owner}`)
  }

  console.log({ vault, owner, mirror: mirrorReactor, oldRouter })

  const contractsDir = join(process.cwd(), '../contracts')
  const artifactPath = join(contractsDir, 'out/EventContractsRouter.sol/EventContractsRouter.json')
  if (!existsSync(artifactPath)) {
    console.log('Building EventContractsRouter…')
    execSync('forge build --contracts src/integrations/EventContractsRouter.sol', {
      cwd: contractsDir,
      stdio: 'inherit',
    })
  }
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
    bytecode: { object: string }
    abi: unknown
  }

  console.log('Deploying fixed EventContractsRouter…')
  const deployHash = await walletClient.deployContract({
    abi: artifact.abi as never,
    bytecode: artifact.bytecode.object as Hex,
    args: [mirrorReactor, TESTNET_TUSDC],
    account,
    chain: somniaTestnet,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
  const newRouter = receipt.contractAddress
  if (!newRouter) throw new Error('EventContractsRouter deploy failed')
  console.log('EventContractsRouter deployed:', newRouter)

  const setVaultHash = await walletClient.writeContract({
    address: vault,
    abi: parseAbi(['function setEventRouter(address _router)']),
    functionName: 'setEventRouter',
    args: [newRouter],
    account,
    chain: somniaTestnet,
  })
  await publicClient.waitForTransactionReceipt({ hash: setVaultHash })
  console.log('setEventRouter:', setVaultHash)

  const setMirrorHash = await walletClient.writeContract({
    address: mirrorReactor,
    abi: parseAbi(['function setRouter(address _router)']),
    functionName: 'setRouter',
    args: [newRouter],
    account,
    chain: somniaTestnet,
  })
  await publicClient.waitForTransactionReceipt({ hash: setMirrorHash })
  console.log('mirror.setRouter:', setMirrorHash)

  console.log('\n✅ Binary mirror router upgraded')
  console.log('  oldRouter:', oldRouter)
  console.log('  newRouter:', newRouter)
  console.log('\nNext: restart RSI agent (fixed SDK limit prices) and wait for next signal')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
