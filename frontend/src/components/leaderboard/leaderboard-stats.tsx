'use client'

import { Activity, BarChart3, Trophy, Users } from 'lucide-react'
import { MetricCard } from '@/components/common/metric-card'
import type { VaultInfo } from '@/types/vault'
import { formatPnlPercent } from '@/lib/utils'

interface LeaderboardStatsProps {
  vaults: VaultInfo[]
}

export function LeaderboardStats({ vaults }: LeaderboardStatsProps) {
  const totalFollowers = vaults.reduce(
    (sum, v) => sum + (v.followerCount ?? v.stats?.followerCount ?? 0),
    0
  )
  const avgSharpe =
    vaults.length > 0
      ? vaults.reduce((sum, v) => sum + (v.stats?.sharpeRatio ?? 0), 0) / vaults.length
      : 0
  const topVault = [...vaults].sort(
    (a, b) => (b.stats?.totalPnl ?? 0) - (a.stats?.totalPnl ?? 0)
  )[0]
  const activeSignals = vaults.filter(v => (v.currentSignal?.direction ?? 0) !== 0).length

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard
        title="Live vaults"
        value={String(vaults.length)}
        change={`${activeSignals} signaling`}
        changeType="neutral"
        icon={Activity}
        delay={0}
      />
      <MetricCard
        title="Total followers"
        value={totalFollowers.toLocaleString()}
        changeType="neutral"
        icon={Users}
        delay={1}
      />
      <MetricCard
        title="Avg Sharpe"
        value={avgSharpe.toFixed(2)}
        changeType="neutral"
        icon={BarChart3}
        delay={2}
      />
      <MetricCard
        title="Top performer"
        value={topVault ? formatPnlPercent(topVault.stats?.totalPnl ?? 0) : '—'}
        change={topVault?.name?.slice(0, 18) ?? undefined}
        changeType="neutral"
        icon={Trophy}
        delay={3}
      />
    </div>
  )
}
