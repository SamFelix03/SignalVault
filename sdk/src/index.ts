import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { externalSignalPublisherAbi, strategyVaultAbi } from './abis.js'
import { snapToTickGrid } from './markets.js'
import { encodePerpLimitPrice, encodePerpPoolRef } from './discovery-perp.js'

const SOMNIA_SHANNON_CHAIN_ID = 50312
const SOMNIA_RPC = 'https://api.infra.testnet.somnia.network/'
const TESTNET_COLLATERAL_DECIMALS = 6
const PERP_QUOTE_DECIMALS = 18

export type InstrumentMode = 'binary' | 'perp'
export type VaultInstrumentType = 'BINARY' | 'PERP'

export type SignalDirection =
  | 'UP'
  | 'DOWN'
  | 'FLAT'
  | 'LONG'
  | 'SHORT'
  | 1
  | -1
  | 0

export interface SignalVaultConfig {
  vault: string
  privateKey: string
  rpcUrl?: string
  chainId?: number
  collateralDecimals?: number
  instrument?: InstrumentMode
}

export interface BinaryPublishParams {
  direction: 'UP' | 'DOWN' | 'FLAT' | 1 | -1 | 0
  sizeBps: number
  marketId: Hex
  limitPrice: bigint
  reason: string
}

export interface PerpPublishParams {
  direction: 'LONG' | 'SHORT' | 'FLAT' | 1 | -1 | 0
  sizeBps: number
  perpPool: Address
  limitPrice: bigint
  reason: string
}

export interface PublishParams {
  direction: SignalDirection
  sizeBps: number
  marketId: Hex
  limitPrice: bigint
  reason: string
}

export interface VaultSignal {
  direction: number
  sizeBps: number
  marketId: Hex
  limitPrice: bigint
  epoch: bigint
  reasoningSummary: string
}

export type VaultSourceType = 'AGENT' | 'WALLET'

function normalizePrivateKey(key: string): Hex {
  return (key.startsWith('0x') ? key : `0x${key}`) as Hex
}

function resolveBinaryDirection(direction: BinaryPublishParams['direction']): number {
  if (direction === 'UP' || direction === 1) return 1
  if (direction === 'DOWN' || direction === -1) return -1
  if (direction === 'FLAT' || direction === 0) return 0
  throw new Error(`Invalid binary direction: ${String(direction)}`)
}

function resolvePerpDirection(direction: PerpPublishParams['direction']): number {
  if (direction === 'LONG' || direction === 1) return 1
  if (direction === 'SHORT' || direction === -1) return -1
  if (direction === 'FLAT' || direction === 0) return 0
  throw new Error(`Invalid perp direction: ${String(direction)}`)
}

function buildChain(chainId: number, rpcUrl: string) {
  return {
    id: chainId,
    name: chainId === SOMNIA_SHANNON_CHAIN_ID ? 'Somnia Testnet' : `Chain ${chainId}`,
    nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  }
}

function assertMarketId(marketId: Hex) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(marketId)) {
    throw new Error('marketId must be a bytes32 hex string (0x + 64 hex chars)')
  }
}

export class SignalVault {
  private readonly vault: Address
  private readonly account: ReturnType<typeof privateKeyToAccount>
  private readonly publicClient: ReturnType<typeof createPublicClient>
  private readonly walletClient: ReturnType<typeof createWalletClient>
  private readonly collateralDecimals: number
  private publisherAddress: Address | null = null
  private instrumentMode: InstrumentMode | null = null

  constructor(config: SignalVaultConfig) {
    const rpcUrl = config.rpcUrl ?? SOMNIA_RPC
    const chainId = config.chainId ?? SOMNIA_SHANNON_CHAIN_ID
    const chain = buildChain(chainId, rpcUrl)

    this.vault = config.vault as Address
    this.collateralDecimals = config.collateralDecimals ?? TESTNET_COLLATERAL_DECIMALS
    this.instrumentMode = config.instrument ?? null
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

  async getMirrorRouterAddress(): Promise<Address> {
    return this.publicClient.readContract({
      address: this.vault,
      abi: strategyVaultAbi,
      functionName: 'executionRouter',
    })
  }

  async getVaultMeta(): Promise<{
    sourceType: VaultSourceType
    instrumentType: VaultInstrumentType
    sourceWallet?: Address
    relayer?: Address
  }> {
    const [sourceType, instrumentTypeRaw, sourceWallet, relayer] = await Promise.all([
      this.publicClient.readContract({
        address: this.vault,
        abi: strategyVaultAbi,
        functionName: 'sourceType',
      }),
      this.publicClient.readContract({
        address: this.vault,
        abi: strategyVaultAbi,
        functionName: 'instrumentType',
      }).catch(() => 0),
      this.publicClient.readContract({
        address: this.vault,
        abi: strategyVaultAbi,
        functionName: 'sourceWallet',
      }),
      this.publicClient.readContract({
        address: this.vault,
        abi: strategyVaultAbi,
        functionName: 'relayer',
      }),
    ])

    return {
      sourceType: Number(sourceType) === 1 ? 'WALLET' : 'AGENT',
      instrumentType: Number(instrumentTypeRaw) === 1 ? 'PERP' : 'BINARY',
      sourceWallet: sourceWallet === '0x0000000000000000000000000000000000000000' ? undefined : sourceWallet,
      relayer: relayer === '0x0000000000000000000000000000000000000000' ? undefined : relayer,
    }
  }

  async getInstrumentMode(): Promise<InstrumentMode> {
    if (this.instrumentMode) return this.instrumentMode
    const meta = await this.getVaultMeta()
    this.instrumentMode = meta.instrumentType === 'PERP' ? 'perp' : 'binary'
    return this.instrumentMode
  }

  async getCurrentSignal(): Promise<VaultSignal> {
    const signal = await this.publicClient.readContract({
      address: this.vault,
      abi: strategyVaultAbi,
      functionName: 'getCurrentSignal',
    })

    return {
      direction: Number(signal.direction),
      sizeBps: Number(signal.sizeBps),
      marketId: signal.marketId,
      limitPrice: signal.limitPrice,
      epoch: signal.epoch,
      reasoningSummary: signal.reasoningSummary,
    }
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
        'This vault uses the on-chain AI pipeline, not an external agent. ' +
          'Point the SDK at a custom-agent vault address (from your deploy URL).',
      )
    }

    const meta = await this.getVaultMeta()
    if (meta.sourceType === 'WALLET') {
      throw new Error('WALLET vaults are published by the platform relayer — use an AGENT vault with signalvault-sdk.')
    }

    return publisher
  }

  private async publishInternal(
    direction: number,
    sizeBps: number,
    marketId: Hex,
    limitPrice: bigint,
    reason: string,
  ): Promise<Hex> {
    const publisher = await this.assertCustomVault()
    if (sizeBps < 0 || sizeBps > 10_000) {
      throw new Error('sizeBps must be between 0 and 10000 (100%)')
    }
    assertMarketId(marketId)

    const hash = await this.walletClient.writeContract({
      address: publisher,
      abi: externalSignalPublisherAbi,
      functionName: 'publish',
      args: [direction, sizeBps, marketId, limitPrice, reason],
      account: this.account,
      chain: this.walletClient.chain,
    })
    await this.publicClient.waitForTransactionReceipt({ hash })
    return hash
  }

  async publishBinary(params: BinaryPublishParams): Promise<Hex> {
    const direction = resolveBinaryDirection(params.direction)
    let limitPrice = params.limitPrice
    if (direction !== 0 && limitPrice === 0n) {
      throw new Error('limitPrice must be > 0 for UP/DOWN signals')
    }
    if (direction !== 0) {
      const human = Number(limitPrice) / 10 ** this.collateralDecimals
      limitPrice = snapToTickGrid(human, this.collateralDecimals)
    }
    return this.publishInternal(direction, params.sizeBps, params.marketId, limitPrice, params.reason)
  }

  async publishPerp(params: PerpPublishParams): Promise<Hex> {
    const direction = resolvePerpDirection(params.direction)
    const marketId = encodePerpPoolRef(params.perpPool)
    let limitPrice = params.limitPrice
    if (direction !== 0 && limitPrice === 0n) {
      throw new Error('limitPrice must be > 0 for LONG/SHORT signals')
    }
    if (direction !== 0) {
      const human = Number(limitPrice) / 10 ** PERP_QUOTE_DECIMALS
      limitPrice = encodePerpLimitPrice(human, PERP_QUOTE_DECIMALS)
    }
    return this.publishInternal(direction, params.sizeBps, marketId, limitPrice, params.reason)
  }

  async publish(params: PublishParams): Promise<Hex> {
    const mode = await this.getInstrumentMode()
    if (mode === 'perp') {
      return this.publishPerp({
        direction: params.direction as PerpPublishParams['direction'],
        sizeBps: params.sizeBps,
        perpPool: (`0x${params.marketId.slice(-40)}`) as Address,
        limitPrice: params.limitPrice,
        reason: params.reason,
      })
    }
    return this.publishBinary({
      direction: params.direction as BinaryPublishParams['direction'],
      sizeBps: params.sizeBps,
      marketId: params.marketId,
      limitPrice: params.limitPrice,
      reason: params.reason,
    })
  }
}

export { SOMNIA_SHANNON_CHAIN_ID, SOMNIA_RPC, TESTNET_COLLATERAL_DECIMALS, PERP_QUOTE_DECIMALS }
export { encodeLimitPrice, decodeLimitPrice, snapToTickGrid } from './markets.js'
export { pickLiveMarket } from './discovery.js'
export type { LiveMarketPick, PickLiveMarketOptions } from './discovery.js'
export { pickLivePerpMarket, pickLivePerpMarketFromIndexer, encodePerpPoolRef, encodePerpLimitPrice, encodePerpLimitPriceForDirection } from './discovery-perp.js'
export type { LivePerpMarketPick, PickLivePerpMarketOptions, PickLivePerpMarketFromIndexerOptions } from './discovery-perp.js'
