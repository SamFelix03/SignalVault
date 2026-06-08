'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { Wallet, TrendingUp, Layers } from 'lucide-react'
import { API_URL } from '@/lib/contracts'
import { isMockMode } from '@/lib/mock-mode'
import { mockFollowerPositions, mockFollowerTrades, MOCK_VAULT_ADDRESSES } from '@/lib/mock-data'
import { PositionCard } from '@/components/follower/position-card'
import { TradeHistory } from '@/components/follower/trade-history'
import { LoadingSpinner } from '@/components/common/loading-spinner'
import { MetricCard } from '@/components/common/metric-card'
import { Card, CardContent } from '@/components/ui/card'
import { formatPnlPercent, formatUsd } from '@/lib/utils'
import type { TradeRecord } from '@/types/vault'

interface FollowerPosition {
  vaultAddress: string
  vaultName: string
  direction: number
  entryPrice: number
  currentPnl: number
  pnlPercent: number
  stopPrice: number
}

export default function FollowDashboard() {
  const { address } = useAccount()
  const [positions, setPositions] = useState<FollowerPosition[]>([])
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (isMockMode()) {
      setPositions(mockFollowerPositions)
      setTrades(mockFollowerTrades)
      setIsLoading(false)
      return
    }

    if (!address) {
      setIsLoading(false)
      return
    }

    const load = () => {
      Promise.all([
        fetch(`${API_URL}/api/followers/${address}/positions`).then(r => r.ok ? r.json() : { positions: [] }),
        fetch(`${API_URL}/api/followers/${address}/trades`).then(r => r.ok ? r.json() : { trades: [] }),
      ])
        .then(([posData, tradeData]) => {
          setPositions(posData.positions ?? [])
          const rawTrades = tradeData.trades ?? []
          setTrades(rawTrades.map((t: TradeRecord & { vaultAddress?: string }) => ({
            epoch: t.epoch ?? t.timestamp ?? 0,
            direction: t.direction,
            sizeBps: t.sizeBps ?? 0,
            stopPrice: t.stopPrice ?? '0',
            entryPrice: String(t.entryPrice),
            exitPrice: String(t.exitPrice),
            pnl: t.pnl ?? 0,
            pnlPercent: t.pnlPercent ?? 0,
            reasoning: t.reasoning ?? '',
            reasoningHash: t.reasoningHash ?? '',
            timestamp: t.timestamp ?? t.epoch ?? 0,
            txHash: t.txHash ?? '',
            vaultAddress: t.vaultAddress,
          })))
        })
        .catch(() => {})
        .finally(() => setIsLoading(false))
    }

    load()
    const timer = setInterval(load, 15_000)
    return () => clearInterval(timer)
  }, [address])

  const totalPnl = positions.reduce((sum, p) => sum + p.currentPnl, 0)
  const avgPnlPercent = positions.length
    ? positions.reduce((sum, p) => sum + p.pnlPercent, 0) / positions.length
    : 0

  if (!address && !isMockMode()) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <p className="text-sm text-muted-foreground">Track your vault subscriptions and positions</p>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-lg text-muted-foreground">Connect your wallet to view your positions</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <p className="text-sm text-muted-foreground">Track your vault subscriptions and positions</p>

      {isLoading ? (
        <LoadingSpinner size="lg" className="py-12" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              title="Active Positions"
              value={String(positions.length)}
              icon={Layers}
              delay={0}
            />
            <MetricCard
              title="Total PnL"
              value={formatUsd(totalPnl)}
              change={formatPnlPercent(avgPnlPercent)}
              changeType={totalPnl >= 0 ? 'positive' : 'negative'}
              icon={TrendingUp}
              delay={1}
            />
            <MetricCard
              title="Total Trades"
              value={String(trades.length)}
              icon={Wallet}
              delay={2}
            />
          </div>

          <div>
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Active Positions ({positions.length})
            </h2>
            {positions.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {positions.map(pos => (
                  <PositionCard key={pos.vaultAddress} {...pos} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">No active positions. Subscribe to a vault to get started.</p>
                </CardContent>
              </Card>
            )}
          </div>

          <TradeHistory
            trades={trades}
            vaultAddress={positions[0]?.vaultAddress ?? MOCK_VAULT_ADDRESSES[0]}
          />
        </>
      )}
    </div>
  )
}
