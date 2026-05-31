'use client'

import Link from 'next/link'
import { FileSearch } from 'lucide-react'
import { cn, directionLabel, formatPrice, formatPnlPercent, timeAgo } from '@/lib/utils'
import { SignalIndicator } from '@/components/leaderboard/signal-indicator'
import type { TradeRecord } from '@/types/vault'

interface TradeHistoryProps {
  trades: TradeRecord[]
  vaultAddress: string
}

export function TradeHistory({ trades, vaultAddress }: TradeHistoryProps) {
  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-8 text-center backdrop-blur-sm">
        <p className="text-zinc-500">No trades yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 backdrop-blur-sm">
      <div className="border-b border-zinc-800/50 px-6 py-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">Trade History</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800/30 text-xs text-zinc-500">
              <th className="px-6 py-3 text-left font-medium">Direction</th>
              <th className="px-6 py-3 text-right font-medium">Entry</th>
              <th className="px-6 py-3 text-right font-medium">Exit</th>
              <th className="px-6 py-3 text-right font-medium">PnL</th>
              <th className="px-6 py-3 text-right font-medium">Time</th>
              <th className="px-6 py-3 text-center font-medium">Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr
                key={`${trade.epoch}-${i}`}
                className={cn(
                  'border-b border-zinc-800/20 transition-colors hover:bg-zinc-800/20',
                  i % 2 === 0 ? 'bg-transparent' : 'bg-zinc-900/20'
                )}
              >
                <td className="px-6 py-3">
                  <SignalIndicator direction={trade.direction} size="sm" pulse={false} />
                </td>
                <td className="px-6 py-3 text-right font-mono text-sm text-zinc-300">
                  ${formatPrice(Number(trade.entryPrice))}
                </td>
                <td className="px-6 py-3 text-right font-mono text-sm text-zinc-300">
                  ${formatPrice(Number(trade.exitPrice))}
                </td>
                <td className={cn('px-6 py-3 text-right font-mono text-sm font-semibold', trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatPnlPercent(trade.pnlPercent)}
                </td>
                <td className="px-6 py-3 text-right text-sm text-zinc-500">
                  {trade.timestamp ? timeAgo(trade.timestamp) : '—'}
                </td>
                <td className="px-6 py-3 text-center">
                  {trade.reasoningHash ? (
                    <Link
                      href={`/vault/${vaultAddress}/audit/${trade.reasoningHash}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <FileSearch className="h-3.5 w-3.5" />
                      View
                    </Link>
                  ) : (
                    <span className="text-xs text-zinc-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
