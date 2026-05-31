'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { API_URL } from '@/lib/contracts'
import { PositionCard } from '@/components/follower/position-card'
import { TradeHistory } from '@/components/follower/trade-history'
import { LoadingSpinner } from '@/components/common/loading-spinner'
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
    if (!address) {
      setIsLoading(false)
      return
    }

    Promise.all([
      fetch(`${API_URL}/api/followers/${address}/positions`).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/api/followers/${address}/trades`).then(r => r.ok ? r.json() : []),
    ])
      .then(([posData, tradeData]) => {
        setPositions(posData.positions ?? posData ?? [])
        setTrades(tradeData.trades ?? tradeData ?? [])
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [address])

  if (!address) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Follower Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">Track your vault subscriptions and positions</p>
        </div>
        <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-12 text-center backdrop-blur-sm">
          <p className="text-lg text-zinc-400">Connect your wallet to view your positions</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Follower Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Track your vault subscriptions and positions</p>
      </div>

      {isLoading ? (
        <LoadingSpinner size="lg" className="py-12" />
      ) : (
        <>
          <div>
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">
              Active Positions ({positions.length})
            </h2>
            {positions.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {positions.map(pos => (
                  <PositionCard key={pos.vaultAddress} {...pos} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-8 text-center backdrop-blur-sm">
                <p className="text-zinc-500">No active positions. Subscribe to a vault to get started.</p>
              </div>
            )}
          </div>

          <TradeHistory trades={trades} vaultAddress="" />
        </>
      )}
    </div>
  )
}
