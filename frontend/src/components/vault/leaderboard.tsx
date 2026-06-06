'use client'

import { useReadContract } from 'wagmi'
import { type Address } from 'viem'
import { performanceLedgerAbi } from '@/abis/PerformanceLedger'
import { cn } from '@/lib/utils'
import { formatPrice, directionLabel, directionColor, timeAgo } from '@/lib/utils'
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'

interface LeaderboardProps {
  performanceLedgerAddress: Address
}

export function Leaderboard({ performanceLedgerAddress }: LeaderboardProps) {
  const { data: statsData } = useReadContract({
    address: performanceLedgerAddress,
    abi: performanceLedgerAbi,
    functionName: 'stats',
    query: { refetchInterval: 30_000 },
  })

  const { data: winRateData } = useReadContract({
    address: performanceLedgerAddress,
    abi: performanceLedgerAbi,
    functionName: 'getWinRate',
  })

  const { data: sharpeData } = useReadContract({
    address: performanceLedgerAddress,
    abi: performanceLedgerAbi,
    functionName: 'getSharpeApprox',
  })

  const { data: tradeHistoryData } = useReadContract({
    address: performanceLedgerAddress,
    abi: performanceLedgerAbi,
    functionName: 'getTradeHistory',
    args: [BigInt(0), BigInt(20)],
    query: { refetchInterval: 30_000 },
  })

  const stats = statsData as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] | undefined
  const totalPnl = stats ? Number(stats[0]) / 1e18 : 0
  const totalTrades = stats ? Number(stats[1]) : 0
  const maxDrawdownBps = stats ? Number(stats[5]) : 0

  const winRate = winRateData ? Number(winRateData as bigint) / 100 : 0
  const sharpe = sharpeData ? Number(sharpeData as bigint) / 1000 : 0

  const trades = (tradeHistoryData as Array<{
    direction: number
    entryPrice: bigint
    exitPrice: bigint
    size: bigint
    pnl: bigint
    timestamp: bigint
  }>) ?? []

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total PnL"
          value={`${totalPnl >= 0 ? '+' : ''}$${formatPrice(Math.abs(totalPnl))}`}
          color={totalPnl >= 0 ? 'emerald' : 'red'}
          icon={totalPnl >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          color={winRate >= 50 ? 'emerald' : 'amber'}
          icon={BarChart3}
        />
        <StatCard
          label="Sharpe Ratio"
          value={sharpe.toFixed(2)}
          color={sharpe >= 1 ? 'emerald' : sharpe >= 0 ? 'amber' : 'red'}
          icon={TrendingUp}
        />
        <StatCard
          label="Max Drawdown"
          value={`${(maxDrawdownBps / 100).toFixed(2)}%`}
          color="red"
          icon={TrendingDown}
        />
      </div>

      <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-6 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-500">Trade History</h3>
          <span className="text-xs text-zinc-500">{totalTrades} total trades</span>
        </div>

        {trades.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No trades recorded yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800/60 text-xs text-zinc-500">
                  <th className="pb-3 pr-4 font-medium">Direction</th>
                  <th className="pb-3 pr-4 font-medium">Entry</th>
                  <th className="pb-3 pr-4 font-medium">Exit</th>
                  <th className="pb-3 pr-4 font-medium">PnL</th>
                  <th className="pb-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {trades.map((trade, i) => {
                  const pnl = Number(trade.pnl) / 1e18
                  return (
                    <tr key={i} className="text-zinc-300">
                      <td className={cn('py-3 pr-4 font-medium', directionColor(trade.direction))}>
                        {directionLabel(trade.direction)}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        ${formatPrice(trade.entryPrice)}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        ${formatPrice(trade.exitPrice)}
                      </td>
                      <td className={cn('py-3 pr-4 font-mono text-xs', pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)}
                      </td>
                      <td className="py-3 text-xs text-zinc-500">
                        {trade.timestamp > BigInt(0) ? timeAgo(Number(trade.timestamp)) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string
  value: string
  color: 'emerald' | 'red' | 'amber'
  icon: React.ComponentType<{ className?: string }>
}) {
  const colorClasses = {
    emerald: 'border-emerald-500/30 text-emerald-400',
    red: 'border-red-500/30 text-red-400',
    amber: 'border-amber-500/30 text-amber-400',
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', colorClasses[color])} />
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      </div>
      <p className={cn('mt-2 text-xl font-bold', colorClasses[color])}>{value}</p>
    </div>
  )
}
