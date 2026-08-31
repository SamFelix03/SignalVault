'use client'

import { TrendingUp, BarChart3, Target, TrendingDown, Hash, Users, Coins } from 'lucide-react'
import { formatUnits } from 'viem'
import { TUSDC_DECIMALS } from '@/lib/constants'
import { formatPnlPercent } from '@/lib/utils'
import { MetricCard } from '@/components/common/metric-card'
import type { VaultStats as VaultStatsType } from '@/types/vault'

interface VaultStatsProps {
  stats: VaultStatsType
}

export function VaultStatsPanel({ stats }: VaultStatsProps) {
  const statCards = [
    {
      title: 'Total PnL',
      value: formatPnlPercent(stats.totalPnl ?? 0),
      changeType: (stats.totalPnl ?? 0) >= 0 ? 'positive' as const : 'negative' as const,
      icon: TrendingUp,
    },
    {
      title: 'Sharpe Ratio',
      value: (stats.sharpeRatio ?? 0).toFixed(2),
      changeType: (stats.sharpeRatio ?? 0) >= 1 ? 'positive' as const : (stats.sharpeRatio ?? 0) >= 0 ? 'neutral' as const : 'negative' as const,
      icon: BarChart3,
    },
    {
      title: 'Win Rate',
      value: `${((stats.winRate ?? 0) * 100).toFixed(1)}%`,
      changeType: (stats.winRate ?? 0) >= 0.5 ? 'positive' as const : 'negative' as const,
      icon: Target,
    },
    {
      title: 'Max Drawdown',
      value: formatPnlPercent(-Math.abs(stats.maxDrawdown ?? 0)),
      changeType: 'negative' as const,
      icon: TrendingDown,
    },
    {
      title: 'Trades',
      value: String(stats.tradeCount ?? 0),
      changeType: 'neutral' as const,
      icon: Hash,
    },
    {
      title: 'Followers',
      value: String(stats.followerCount ?? 0),
      changeType: 'neutral' as const,
      icon: Users,
    },
    {
      title: 'Signal Price',
      value:
        stats.signalPrice && stats.signalPrice !== '0'
          ? `${formatUnits(BigInt(stats.signalPrice), TUSDC_DECIMALS)} tUSDC`
          : 'Free',
      changeType: 'neutral' as const,
      icon: Coins,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {statCards.map((card, i) => (
        <MetricCard
          key={card.title}
          title={card.title}
          value={card.value}
          changeType={card.changeType}
          icon={card.icon}
          delay={i}
        />
      ))}
    </div>
  )
}
