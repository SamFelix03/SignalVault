export interface SignalStreamRecord {
  vaultAddress: string
  direction: number
  sizeBps: number
  stopPrice: string
  epoch: number
  timestamp: number
  txHash: string
}

export interface PnLStreamRecord {
  vaultAddress: string
  epoch: number
  pnl: number
  pnlPercent: number
  cumulativePnl: number
  timestamp: number
}

export interface VaultMetaRecord {
  address: string
  name: string
  strategist: string
  performanceFeeBps: number
  followerCount: number
  createdAt: number
}
