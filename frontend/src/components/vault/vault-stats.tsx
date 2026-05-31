'use client'

import { TrendingUp, BarChart3, Target, TrendingDown, Hash, Users } from 'lucide-react'
import { cn, formatPnlPercent } from '@/lib/utils'
import type { VaultStats as VaultStatsType } from '@/types/vault'

interface VaultStatsProps {
  stats: VaultStatsType
}

const statCards = [
  { key: 'totalPnl', label: 'Total PnL', icon: TrendingUp, format: (v: number) => formatPnlPercent(v), colorFn: (v: number) => (v >= 0 ? 'text-emerald-400' : 'text-red-400') },
  { key: 'sharpeRatio', label: 'Sharpe Ratio', icon: BarChart3, format: (v: number) => v.toFixed(2), colorFn: (v: number) => (v >= 1 ? 'text-emerald-400' : v >= 0 ? 'text-amber-400' : 'text-red-400') },
  { key: 'winRate', label: 'Win Rate', icon: Target, format: (v: number) => `${(v * 100).toFixed(1)}%`, colorFn: (v: number) => (v >= 0.5 ? 'text-emerald-400' : 'text-red-400') },
  { key: 'maxDrawdown', label: 'Max Drawdown', icon: TrendingDown, format: (v: number) => formatPnlPercent(-Math.abs(v)), colorFn: () => 'text-red-400' },
  { key: 'tradeCount', label: 'Trades', icon: Hash, format: (v: number) => v.toString(), colorFn: () => 'text-zinc-200' },
  { key: 'followerCount', label: 'Followers', icon: Users, format: (v: number) => v.toString(), colorFn: () => 'text-blue-400' },
] as const

export function VaultStatsPanel({ stats }: VaultStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {statCards.map(({ key, label, icon: Icon, format, colorFn }) => {
        const value = stats[key as keyof VaultStatsType] ?? 0
        return (
          <div
            key={key}
            className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-4 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-zinc-500" />
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
            <p className={cn('mt-2 font-mono text-lg font-semibold', colorFn(value))}>
              {format(value)}
            </p>
          </div>
        )
      })}
    </div>
  )
}
