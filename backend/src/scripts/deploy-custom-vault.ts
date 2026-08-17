/**
 * Deploy a custom agent vault from the CLI (for e2e / CI).
 * Usage: npx tsx src/scripts/deploy-custom-vault.ts "My Vault: RSI momentum"
 */
import { parseEther } from 'viem'
import { VaultFactoryABI } from '../abis/VaultFactory'
import { publicClient, getWalletClient, config } from '../config/chains'

async function main() {
  const description = process.argv[2] ?? 'E2E Custom Agent: momentum test'
  const feeBps = Number(process.env.PERFORMANCE_FEE_BPS ?? 500)
  const maxDrawdownBps = BigInt(process.env.MAX_DRAWDOWN_BPS ?? 2000)

  const factory = config.vaultFactoryAddress
  if (!factory) throw new Error('VAULT_FACTORY_ADDRESS not configured')

  const wallet = getWalletClient()
  const account = wallet.account

  console.log('Deploying custom agent vault...')
  console.log('  factory:', factory)
  console.log('  strategist:', account.address)
  console.log('  description:', description)

  const hash = await wallet.writeContract({
    address: factory,
    abi: VaultFactoryABI,
    functionName: 'deployCustomAgentVault',
    args: [description, feeBps, maxDrawdownBps, 0n],
    account,
    chain: wallet.chain,
  })

  console.log('tx:', hash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('Deploy reverted')

  const logs = await publicClient.getContractEvents({
    address: factory,
    abi: VaultFactoryABI,
    eventName: 'VaultDeployed',
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  })

  const deployed = logs[0]?.args
  if (!deployed?.vault) throw new Error('VaultDeployed event not found')

  console.log(JSON.stringify({
    vault: deployed.vault,
    orchestrator: deployed.orchestrator,
    strategist: deployed.strategist,
    txHash: hash,
  }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
