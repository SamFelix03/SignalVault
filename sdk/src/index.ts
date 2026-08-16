import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { externalSignalPublisherAbi, strategyVaultAbi } from './abis.js'

const SOMNIA_SHANNON_CHAIN_ID = 50312
const SOMNIA_RPC = 'https://api.infra.testnet.somnia.network/'

export type SignalDirection = 'LONG' | 'SHORT' | 'FLAT' | 1 | -1 | 0

export interface SignalVaultConfig {
  vault: string
  privateKey: string
  rpcUrl?: string
  chainId?: number
}

export interface PublishParams {
  direction: SignalDirection
  sizeBps: number
  stopPrice: bigint
  reason: string
}

function normalizePrivateKey(key: string): Hex {
  return (key.startsWith('0x') ? key : `0x${key}`) as Hex
}

function resolveDirection(direction: SignalDirection): number {
  if (direction === 'LONG' || direction === 1) return 1
  if (direction === 'SHORT' || direction === -1) return -1
  if (direction === 'FLAT' || direction === 0) return 0
  throw new Error(`Invalid direction: ${String(direction)}. Use LONG, SHORT, FLAT, 1, -1, or 0.`)
}

function buildChain(chainId: number, rpcUrl: string): Chain {
  return {
    id: chainId,
    name: chainId === SOMNIA_SHANNON_CHAIN_ID ? 'Somnia Testnet' : `Chain ${chainId}`,
    nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  }
}

export class SignalVault {
  private readonly vault: Address
  private readonly account: ReturnType<typeof privateKeyToAccount>
  private readonly publicClient: ReturnType<typeof createPublicClient>
  private readonly walletClient: ReturnType<typeof createWalletClient>
  private publisherAddress: Address | null = null

  constructor(config: SignalVaultConfig) {
    const rpcUrl = config.rpcUrl ?? SOMNIA_RPC
    const chainId = config.chainId ?? SOMNIA_SHANNON_CHAIN_ID
    const chain = buildChain(chainId, rpcUrl)

    this.vault = config.vault as Address
    this.account = privateKeyToAccount(normalizePrivateKey(config.privateKey))
    this.publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(rpcUrl),
    })
  }

  get address(): Address {
    return this.vault
  }

  get walletAddress(): Address {
    return this.account.address
  }

  async getPublisherAddress(): Promise<Address> {
    if (this.publisherAddress) return this.publisherAddress

    const orchestrator = await this.publicClient.readContract({
      address: this.vault,
      abi: strategyVaultAbi,
      functionName: 'orchestrator',
    })

    this.publisherAddress = orchestrator
    return orchestrator
  }

  async assertCustomVault(): Promise<Address> {
    const publisher = await this.getPublisherAddress()

    let isCustom = false
    try {
      isCustom = await this.publicClient.readContract({
        address: publisher,
        abi: externalSignalPublisherAbi,
        functionName: 'isCustomPublisher',
      })
    } catch {
      isCustom = false
    }

    if (!isCustom) {
      throw new Error(
        'This vault uses the native SignalVault AI pipeline. signalvault-sdk only works with custom agent vaults deployed via deployCustomAgentVault.',
      )
    }

    return publisher
  }

  async publish(params: PublishParams): Promise<Hex> {
    const publisher = await this.assertCustomVault()
    const direction = resolveDirection(params.direction)

    if (params.sizeBps < 0 || params.sizeBps > 10_000) {
      throw new Error('sizeBps must be between 0 and 10000 (100%)')
    }

    const hash = await this.walletClient.writeContract({
      address: publisher,
      abi: externalSignalPublisherAbi,
      functionName: 'publish',
      args: [direction, params.sizeBps, params.stopPrice, params.reason],
      account: this.account,
      chain: this.walletClient.chain,
    })

    await this.publicClient.waitForTransactionReceipt({ hash })
    return hash
  }
}

export { SOMNIA_SHANNON_CHAIN_ID, SOMNIA_RPC }
