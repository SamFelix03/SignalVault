export interface Signal {
  direction: number
  sizeBps: number
  marketId: string
  limitPrice: bigint
  reasoningHash: string
  epoch: number
  timestamp: number
  reasoning?: string
}

export interface FollowerConfig {
  follower: string
  riskBps: number
  maxPositionUsd: bigint
  maxSlippageBps: number
  stopLossBuffer: bigint
  active: boolean
}

export interface VaultStats {
  totalPnl: number
  sharpeRatio: number
  winRate: number
  maxDrawdown: number
  tradeCount: number
  followerCount: number
  signalPrice?: string
}

export type PublisherKind = 'native' | 'custom'
export type VaultSourceType = 'agent' | 'wallet'

export interface VaultInfo {
  address: string
  name: string
  strategist: string
  strategyPrompt: string
  performanceFeeBps: number
  currentSignal: Signal
  stats: VaultStats
  followerCount: number
  createdAt: number
  publisherKind?: PublisherKind
  sourceType?: VaultSourceType
  sourceWallet?: string
  eventRouter?: string
}

export interface TradeRecord {
  epoch: number
  direction: number
  sizeBps: number
  stopPrice: string
  entryPrice: string
  exitPrice: string
  pnl: number
  pnlPercent: number
  reasoning: string
  reasoningHash: string
  timestamp: number
  txHash: string
  vaultAddress?: string
}
