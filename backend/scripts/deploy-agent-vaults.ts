/**
 * Deploy BINARY + PERP custom-agent vaults from the current factory.
 *
 *   npx tsx scripts/deploy-agent-vaults.ts
 */
import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL, VAULT_FACTORY_ADDRESS } from '../src/config/constants.js'

const VAULT_FACTORY_ABI = [
  {
    type: 'function',
    name: 'deployAgentVault',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'description', type: 'string' },
      { name: 'performanceFeeBps', type: 'uint16' },
      { name: 'maxDrawdownBps', type: 'uint256' },
      { name: 'signalPricePerSignal', type: 'uint256' },
      { name: 'instrument', type: 'uint8' },
    ],
    outputs: [{ name: 'vaultId', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'VaultDeployed',
    inputs: [
      { name: 'vaultId', type: 'uint256', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'strategist', type: 'address', indexed: true },
      { name: 'orchestrator', type: 'address', indexed: false },
      { name: 'mirrorReactor', type: 'address', indexed: false },
      { name: 'eventRouter', type: 'address', indexed: false },
      { name: 'sourceType', type: 'uint8', indexed: false },
      { name: 'instrumentType', type: 'uint8', indexed: false },
    ],
  },
] as const

const INSTRUMENT = { BINARY: 0, PERP: 1 } as const

async function deployVault(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  label: string,
  instrument: 0 | 1,
) {
  const hash = await walletClient.writeContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: VAULT_FACTORY_ABI,
    functionName: 'deployAgentVault',
    args: [`RSI agent ${label}`, 1000, 2000, 0n, instrument],
    account: walletClient.account!,
    chain: somniaTestnet,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const logs = parseEventLogs({ abi: VAULT_FACTORY_ABI, logs: receipt.logs, eventName: 'VaultDeployed' })
  const vault = logs[0]?.args.vault as Address
  console.log(`${label} vault: ${vault} (tx ${hash})`)
  return vault
}

async function main() {
  const pk = process.env.PRIVATE_KEY
  if (!pk) throw new Error('PRIVATE_KEY not set')

  const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  console.log('Factory:', VAULT_FACTORY_ADDRESS)
  console.log('Deployer:', account.address)

  const binaryVault = await deployVault(walletClient, publicClient, 'BINARY', INSTRUMENT.BINARY)
  const perpVault = await deployVault(walletClient, publicClient, 'PERP', INSTRUMENT.PERP)

  console.log('\nAdd to examples/rsi-agent/.env:')
  console.log(`VAULT_ADDRESS=${binaryVault}`)
  console.log(`PERP_VAULT_ADDRESS=${perpVault}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
