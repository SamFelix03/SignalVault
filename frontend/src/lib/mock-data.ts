import type { AgentReceipt, PipelineRun } from '@/types/pipeline'
import { StageType } from '@/types/pipeline'
import type { Signal, VaultInfo, VaultStats, TradeRecord } from '@/types/vault'

const now = Math.floor(Date.now() / 1000)
const hour = 3600

function usd(n: number): bigint {
  return BigInt(Math.round(n * 1e18))
}

export const MOCK_VAULT_ADDRESSES = [
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
] as const

export const MOCK_RECEIPT_HASH =
  '0xabc123def456abc123def456abc123def456abc123def456abc123def456abcd'

function makeSignal(
  direction: number,
  sizeBps: number,
  stopUsd: number,
  epoch: number,
  reasoning: string,
  reasoningHash: string,
  timestamp: number
): Signal {
  return {
    direction,
    sizeBps,
    stopPrice: usd(stopUsd),
    reasoningHash,
    epoch,
    timestamp,
    reasoning,
  }
}

export const mockVaults: VaultInfo[] = [
  {
    address: MOCK_VAULT_ADDRESSES[0],
    name: 'ETH Momentum Alpha',
    strategist: '0xAbCd111111111111111111111111111111111111',
    strategyPrompt: 'ETH momentum strategy with fear/greed overlay. Go long on upward momentum when Fear & Greed < 30.',
    performanceFeeBps: 1000,
    followerCount: 24,
    createdAt: now - hour * 24 * 14,
    stats: {
      totalPnl: 12.4,
      sharpeRatio: 1.82,
      winRate: 0.64,
      maxDrawdown: 8.2,
      tradeCount: 47,
      followerCount: 24,
    },
    currentSignal: makeSignal(
      1,
      2500,
      3180,
      142,
      'Elevated funding but extreme fear (28) — maintain reduced long, tighten stop.',
      MOCK_RECEIPT_HASH,
      now - hour * 2
    ),
  },
  {
    address: MOCK_VAULT_ADDRESSES[1],
    name: 'Macro Sentiment Pro',
    strategist: '0xAbCd222222222222222222222222222222222222',
    strategyPrompt: 'Macro-driven ETH strategy using CoinDesk sentiment and funding rate divergence.',
    performanceFeeBps: 1500,
    followerCount: 18,
    createdAt: now - hour * 24 * 21,
    stats: {
      totalPnl: 6.8,
      sharpeRatio: 1.35,
      winRate: 0.58,
      maxDrawdown: 11.5,
      tradeCount: 31,
      followerCount: 18,
    },
    currentSignal: makeSignal(
      2,
      1800,
      3450,
      141,
      'Hawkish macro headlines + crowded longs — rotate to short 18%.',
      '0xdef789abc123def789abc123def789abc123def789abc123def789abc123def7',
      now - hour * 5
    ),
  },
  {
    address: MOCK_VAULT_ADDRESSES[2],
    name: 'Fear & Greed Rotation',
    strategist: '0xAbCd333333333333333333333333333333333333',
    strategyPrompt: 'Contrarian rotation based on Fear & Greed extremes with tight risk controls.',
    performanceFeeBps: 800,
    followerCount: 41,
    createdAt: now - hour * 24 * 7,
    stats: {
      totalPnl: -2.1,
      sharpeRatio: 0.72,
      winRate: 0.51,
      maxDrawdown: 15.3,
      tradeCount: 22,
      followerCount: 41,
    },
    currentSignal: makeSignal(
      0,
      0,
      0,
      140,
      'Neutral zone — no edge detected, staying flat until next epoch.',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      now - hour * 1
    ),
  },
]

const mockSignalsByVault: Record<string, Signal[]> = {
  [MOCK_VAULT_ADDRESSES[0]]: [
    makeSignal(1, 2500, 95200, 142, 'Reduced long on macro headwind.', MOCK_RECEIPT_HASH, now - hour * 2),
    makeSignal(1, 3000, 94800, 141, 'Momentum breakout above $96k resistance.', MOCK_RECEIPT_HASH, now - hour * 7),
    makeSignal(0, 0, 0, 140, 'Flat — awaiting funding normalization.', '0x0000000000000000000000000000000000000000000000000000000000000000', now - hour * 12),
    makeSignal(1, 2000, 93500, 139, 'Extreme fear buy signal triggered.', MOCK_RECEIPT_HASH, now - hour * 18),
  ],
  [MOCK_VAULT_ADDRESSES[1]]: [
    makeSignal(2, 1800, 101500, 141, 'Macro bearish — short rotation.', '0xdef789abc123def789abc123def789abc123def789abc123def789abc123def7', now - hour * 5),
    makeSignal(1, 1500, 99500, 140, 'Brief long on funding squeeze.', '0x1111111111111111111111111111111111111111111111111111111111111111', now - hour * 11),
  ],
  [MOCK_VAULT_ADDRESSES[2]]: [
    makeSignal(0, 0, 0, 140, 'Flat — neutral fear/greed.', '0x0000000000000000000000000000000000000000000000000000000000000000', now - hour * 1),
    makeSignal(1, 1200, 96800, 139, 'Contrarian long from extreme fear.', MOCK_RECEIPT_HASH, now - hour * 6),
  ],
}

const mockStatsByVault: Record<string, VaultStats> = Object.fromEntries(
  mockVaults.map(v => [v.address.toLowerCase(), v.stats])
)

const mockChartDataByVault: Record<string, { date: string; pnl: number; cumulativePnl: number }[]> = {
  [MOCK_VAULT_ADDRESSES[0]]: [
    { date: 'Mon', pnl: 1.2, cumulativePnl: 1.2 },
    { date: 'Tue', pnl: -0.4, cumulativePnl: 0.8 },
    { date: 'Wed', pnl: 2.1, cumulativePnl: 2.9 },
    { date: 'Thu', pnl: 0.6, cumulativePnl: 3.5 },
    { date: 'Fri', pnl: 1.8, cumulativePnl: 5.3 },
    { date: 'Sat', pnl: 3.2, cumulativePnl: 8.5 },
    { date: 'Sun', pnl: 3.9, cumulativePnl: 12.4 },
  ],
  [MOCK_VAULT_ADDRESSES[1]]: [
    { date: 'Mon', pnl: 0.8, cumulativePnl: 0.8 },
    { date: 'Tue', pnl: 1.1, cumulativePnl: 1.9 },
    { date: 'Wed', pnl: -1.2, cumulativePnl: 0.7 },
    { date: 'Thu', pnl: 2.4, cumulativePnl: 3.1 },
    { date: 'Fri', pnl: 1.5, cumulativePnl: 4.6 },
    { date: 'Sat', pnl: 1.0, cumulativePnl: 5.6 },
    { date: 'Sun', pnl: 1.2, cumulativePnl: 6.8 },
  ],
  [MOCK_VAULT_ADDRESSES[2]]: [
    { date: 'Mon', pnl: -0.5, cumulativePnl: -0.5 },
    { date: 'Tue', pnl: -1.1, cumulativePnl: -1.6 },
    { date: 'Wed', pnl: 0.3, cumulativePnl: -1.3 },
    { date: 'Thu', pnl: -0.8, cumulativePnl: -2.1 },
    { date: 'Fri', pnl: 0.6, cumulativePnl: -1.5 },
    { date: 'Sat', pnl: -0.4, cumulativePnl: -1.9 },
    { date: 'Sun', pnl: -0.2, cumulativePnl: -2.1 },
  ],
}

export interface MockVaultMeta {
  strategyPrompt: string
  strategist: string
  orchestrator: string
  performanceLedger: string
  name: string
}

const mockMetaByVault: Record<string, MockVaultMeta> = {
  [MOCK_VAULT_ADDRESSES[0]]: {
    name: 'ETH Momentum Alpha',
    strategyPrompt: mockVaults[0].strategyPrompt,
    strategist: mockVaults[0].strategist,
    orchestrator: '0x00000000000000000000000000000000000000a001',
    performanceLedger: '0x0000000000000000000000000000000000000b001',
  },
  [MOCK_VAULT_ADDRESSES[1]]: {
    name: 'Macro Sentiment Pro',
    strategyPrompt: mockVaults[1].strategyPrompt,
    strategist: mockVaults[1].strategist,
    orchestrator: '0x00000000000000000000000000000000000000a002',
    performanceLedger: '0x0000000000000000000000000000000000000b002',
  },
  [MOCK_VAULT_ADDRESSES[2]]: {
    name: 'Fear & Greed Rotation',
    strategyPrompt: mockVaults[2].strategyPrompt,
    strategist: mockVaults[2].strategist,
    orchestrator: '0x00000000000000000000000000000000000000a003',
    performanceLedger: '0x0000000000000000000000000000000000000b003',
  },
}

export const mockPipelineByVault: Record<string, PipelineRun> = {
  [MOCK_VAULT_ADDRESSES[0]]: {
    vaultAddress: MOCK_VAULT_ADDRESSES[0],
    epoch: 142,
    currentStage: StageType.COMPLETE,
    startedAt: now - 120,
    completedAt: now - 45,
    stages: [
      { type: StageType.FETCHING, label: 'Fetching Data', completedAt: now - 110 },
      { type: StageType.SCRAPING, label: 'Scraping News', completedAt: now - 80 },
      { type: StageType.REASONING, label: 'LLM Reasoning', completedAt: now - 50 },
      { type: StageType.COMPLETE, label: 'Complete', completedAt: now - 45 },
    ],
  },
}

export const mockPipelineDetail = {
  runId: 42,
  stageNum: 5,
  startedAt: now - 120,
  fetchedPrice: usd(3420),
  fetchedFunding: BigInt('87000000000000'),
  fearGreedIndex: 28,
  newsSummary: 'Fed minutes hawkish, macro risk-off sentiment across crypto headlines.',
}

export const mockReceipt: AgentReceipt = {
  hash: MOCK_RECEIPT_HASH,
  vaultAddress: MOCK_VAULT_ADDRESSES[0],
  epoch: 142,
  blockNumber: 8_421_337,
  txHash: '0xmocktxhash1234567890abcdef1234567890abcdef1234567890abcdef1234',
  stages: {
    jsonApi: {
      url: 'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT',
      rawResult: { symbol: 'ETHUSDT', price: '3420.50' },
      extractedValue: '3420.50',
      validators: ['validator-1', 'validator-2', 'validator-3'],
    },
    parseWebsite: {
      url: 'https://alternative.me/crypto/fear-and-greed-index/',
      markdownSnippet: 'Current Crypto Fear & Greed Index: 28 (Fear). CoinDesk headlines highlight hawkish Fed tone.',
      confidence: 92,
      answerable: true,
    },
    inferToolsChat: {
      systemPrompt: 'ETH momentum strategy with fear/greed overlay...',
      userMessage: 'ETH/USDT: $3,420 | Funding: +0.087% | Fear&Greed: 28 | Macro: risk-off',
      chainOfThought:
        'Funding is elevated suggesting crowded longs, but extreme fear and hawkish macro warrant reduced exposure rather than full exit.',
      toolCalled: 'updateSignal',
      toolArguments: { direction: 1, sizeBps: 2500, stopPrice: 3180, reasoning: 'Reduced long on macro headwind.' },
    },
  },
}

export const mockFollowerPositions = [
  {
    vaultAddress: MOCK_VAULT_ADDRESSES[0],
    vaultName: 'ETH Momentum Alpha',
    direction: 1,
    entryPrice: 3380,
    currentPnl: 420,
    pnlPercent: 4.3,
    stopPrice: 95200,
  },
  {
    vaultAddress: MOCK_VAULT_ADDRESSES[1],
    vaultName: 'Macro Sentiment Pro',
    direction: 2,
    entryPrice: 3410,
    currentPnl: -180,
    pnlPercent: -1.8,
    stopPrice: 101500,
  },
]

export const mockFollowerTrades: TradeRecord[] = [
  {
    epoch: 141,
    direction: 1,
    sizeBps: 3000,
    stopPrice: '94800',
    entryPrice: '96200',
    exitPrice: '97850',
    pnl: 1650,
    pnlPercent: 1.7,
    reasoning: 'Momentum breakout above resistance.',
    reasoningHash: MOCK_RECEIPT_HASH,
    timestamp: now - hour * 8,
    txHash: '0xmocktrade1',
  },
  {
    epoch: 139,
    direction: 1,
    sizeBps: 2000,
    stopPrice: '93500',
    entryPrice: '94100',
    exitPrice: '95800',
    pnl: 1700,
    pnlPercent: 1.8,
    reasoning: 'Extreme fear contrarian entry.',
    reasoningHash: MOCK_RECEIPT_HASH,
    timestamp: now - hour * 20,
    txHash: '0xmocktrade2',
  },
]

export const mockLedgerTrades = [
  { direction: 1, entryPrice: usd(96200), exitPrice: usd(97850), pnlBps: 171, settledAt: BigInt(now - hour * 8) },
  { direction: 1, entryPrice: usd(94100), exitPrice: usd(95800), pnlBps: 180, settledAt: BigInt(now - hour * 20) },
  { direction: 2, entryPrice: usd(100800), exitPrice: usd(99500), pnlBps: 155, settledAt: BigInt(now - hour * 30) },
]

export function getMockVault(address: string): VaultInfo | undefined {
  return mockVaults.find(v => v.address.toLowerCase() === address.toLowerCase())
}

export function getMockVaultMeta(address: string): MockVaultMeta | undefined {
  return mockMetaByVault[address.toLowerCase()]
}

export function getMockSignals(address: string): Signal[] {
  return mockSignalsByVault[address.toLowerCase()] ?? []
}

export function getMockStats(address: string): VaultStats {
  return mockStatsByVault[address.toLowerCase()] ?? {
    totalPnl: 0, sharpeRatio: 0, winRate: 0, maxDrawdown: 0, tradeCount: 0, followerCount: 0,
  }
}

export function getMockChartData(address: string) {
  return mockChartDataByVault[address.toLowerCase()] ?? []
}

export function getMockPipeline(address: string): PipelineRun | null {
  return mockPipelineByVault[address.toLowerCase()] ?? mockPipelineByVault[MOCK_VAULT_ADDRESSES[0]]
}
