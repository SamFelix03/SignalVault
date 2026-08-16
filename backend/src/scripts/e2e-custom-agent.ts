/**
 * E2E smoke test: publish via SDK-style call and verify vault signal updated.
 * Requires VAULT_ADDRESS, PRIVATE_KEY, and an indexed custom vault.
 */
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ExternalSignalPublisherABI } from '../abis/ExternalSignalPublisher'
import { StrategyVaultABI } from '../abis/StrategyVault'
import { config, somniaTestnet } from '../config/chains'

async function main() {
  const vault = process.env.VAULT_ADDRESS as `0x${string}` | undefined
  const pk = process.env.PRIVATE_KEY
  if (!vault || !pk) throw new Error('Set VAULT_ADDRESS and PRIVATE_KEY')

  const rpc = config.rpcUrl
  const account = privateKeyToAccount(pk.startsWith('0x') ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`))
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(rpc) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(rpc) })

  const orchestrator = await publicClient.readContract({
    address: vault,
    abi: StrategyVaultABI,
    functionName: 'orchestrator',
  })

  const isCustom = await publicClient.readContract({
    address: orchestrator,
    abi: ExternalSignalPublisherABI,
    functionName: 'isCustomPublisher',
  })

  if (!isCustom) throw new Error('Vault is not a custom agent vault')

  const reason = `E2E test ${Date.now()}`
  const hash = await walletClient.writeContract({
    address: orchestrator,
    abi: ExternalSignalPublisherABI,
    functionName: 'publish',
    args: [1, 1200, 320000n, reason],
    account,
    chain: somniaTestnet,
  })

  await publicClient.waitForTransactionReceipt({ hash })
  console.log('publish tx:', hash)

  const signal = await publicClient.readContract({
    address: vault,
    abi: StrategyVaultABI,
    functionName: 'getCurrentSignal',
  })

  console.log('current signal:', {
    direction: signal.direction,
    sizeBps: signal.sizeBps,
    stopPrice: signal.stopPrice.toString(),
    epoch: signal.epoch.toString(),
  })

  if (Number(signal.direction) !== 1) throw new Error('Signal direction mismatch')
  if (Number(signal.sizeBps) !== 1200) throw new Error('Signal sizeBps mismatch')

  console.log('E2E custom agent publish: OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
