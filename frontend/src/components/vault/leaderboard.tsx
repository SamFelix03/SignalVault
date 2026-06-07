'use client'

import { useReadContract } from 'wagmi'
import { type Address } from 'viem'
import { performanceLedgerAbi } from '@/abis/PerformanceLedger'
import { isMockMode } from '@/lib/mock-mode'
import { mockLedgerTrades } from '@/lib/mock-data'
import { cn, formatPrice, directionLabel, directionColor, timeAgo } from '@/lib/utils'
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'
import { MetricCard } from '@/components/common/metric-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface LeaderboardProps {
  performanceLedgerAddress: Address
}

function MockLeaderboard() {
  const totalPnl = 12.4
  const winRate = 64
  const sharpe = 1.82
  const maxDrawdownBps = 820
  const trades = mockLedgerTrades

  return (
    <LeaderboardContent
      totalPnl={totalPnl}
      winRate={winRate}
      sharpe={sharpe}
      maxDrawdownBps={maxDrawdownBps}
      totalTrades={trades.length}
      trades={trades.map(t => ({
        direction: t.direction,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        pnl: Number(t.pnlBps) / 100,
        timestamp: Number(t.settledAt),
      }))}
    />
  )
}

export function Leaderboard({ performanceLedgerAddress }: LeaderboardProps) {
  if (isMockMode()) return <MockLeaderboard />
  return <LiveLeaderboard performanceLedgerAddress={performanceLedgerAddress} />
}

function LiveLeaderboard({ performanceLedgerAddress }: LeaderboardProps) {
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
    <LeaderboardContent
      totalPnl={totalPnl}
      winRate={winRate}
      sharpe={sharpe}
      maxDrawdownBps={maxDrawdownBps}
      totalTrades={totalTrades}
      trades={trades.map(t => ({
        direction: t.direction,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        pnl: Number(t.pnl) / 1e18,
        timestamp: Number(t.timestamp),
      }))}
    />
  )
}

function LeaderboardContent({
  totalPnl,
  winRate,
  sharpe,
  maxDrawdownBps,
  totalTrades,
  trades,
}: {
  totalPnl: number
  winRate: number
  sharpe: number
  maxDrawdownBps: number
  totalTrades: number
  trades: Array<{
    direction: number
    entryPrice: bigint | number
    exitPrice: bigint | number
    pnl: number
    timestamp: number
  }>
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total PnL"
          value={`${totalPnl >= 0 ? '+' : ''}$${formatPrice(Math.abs(totalPnl))}`}
          changeType={totalPnl >= 0 ? 'positive' : 'negative'}
          icon={totalPnl >= 0 ? TrendingUp : TrendingDown}
          delay={0}
        />
        <MetricCard
          title="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          changeType={winRate >= 50 ? 'positive' : 'neutral'}
          icon={BarChart3}
          delay={1}
        />
        <MetricCard
          title="Sharpe Ratio"
          value={sharpe.toFixed(2)}
          changeType={sharpe >= 1 ? 'positive' : sharpe >= 0 ? 'neutral' : 'negative'}
          icon={TrendingUp}
          delay={2}
        />
        <MetricCard
          title="Max Drawdown"
          value={`${(maxDrawdownBps / 100).toFixed(2)}%`}
          changeType="negative"
          icon={TrendingDown}
          delay={3}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Trade History</CardTitle>
          <span className="text-xs text-muted-foreground">{totalTrades} total trades</span>
        </CardHeader>
        <CardContent className="p-0">
          {trades.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No trades recorded yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Exit</TableHead>
                  <TableHead className="text-right">PnL</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade, i) => (
                  <TableRow key={i}>
                    <TableCell className={cn('font-medium', directionColor(trade.direction))}>
                      {directionLabel(trade.direction)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      ${formatPrice(trade.entryPrice)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      ${formatPrice(trade.exitPrice)}
                    </TableCell>
                    <TableCell className={cn('text-right font-mono text-xs', trade.pnl >= 0 ? 'text-success' : 'text-destructive')}>
                      {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {trade.timestamp > 0 ? timeAgo(trade.timestamp) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
