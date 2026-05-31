'use client'

import Link from 'next/link'
import { FileSearch } from 'lucide-react'
import { cn, directionLabel, directionColor, formatPrice, timeAgo } from '@/lib/utils'
import { SignalIndicator } from '@/components/leaderboard/signal-indicator'
import type { Signal } from '@/types/vault'

interface SignalHistoryProps {
  signals: Signal[]
  vaultAddress: string
}

export function SignalHistory({ signals, vaultAddress }: SignalHistoryProps) {
  if (signals.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-8 text-center backdrop-blur-sm">
        <p className="text-zinc-500">No signals recorded yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 backdrop-blur-sm">
      <div className="border-b border-zinc-800/50 px-6 py-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">Signal History</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800/30 text-xs text-zinc-500">
              <th className="px-6 py-3 text-left font-medium">Epoch</th>
              <th className="px-6 py-3 text-left font-medium">Direction</th>
              <th className="px-6 py-3 text-right font-medium">Size</th>
              <th className="px-6 py-3 text-right font-medium">Stop Price</th>
              <th className="px-6 py-3 text-right font-medium">Time</th>
              <th className="px-6 py-3 text-center font-medium">Audit</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((sig, i) => (
              <tr
                key={`${sig.epoch}-${i}`}
                className={cn(
                  'border-b border-zinc-800/20 transition-colors hover:bg-zinc-800/20',
                  i % 2 === 0 ? 'bg-transparent' : 'bg-zinc-900/20'
                )}
              >
                <td className="px-6 py-3 font-mono text-sm text-zinc-300">#{sig.epoch}</td>
                <td className="px-6 py-3">
                  <SignalIndicator direction={sig.direction} size="sm" pulse={false} />
                </td>
                <td className="px-6 py-3 text-right font-mono text-sm text-zinc-300">
                  {(sig.sizeBps / 100).toFixed(1)}%
                </td>
                <td className="px-6 py-3 text-right font-mono text-sm text-zinc-300">
                  ${formatPrice(sig.stopPrice)}
                </td>
                <td className="px-6 py-3 text-right text-sm text-zinc-500">
                  {sig.timestamp ? timeAgo(sig.timestamp) : '—'}
                </td>
                <td className="px-6 py-3 text-center">
                  {sig.reasoningHash && sig.reasoningHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' ? (
                    <Link
                      href={`/vault/${vaultAddress}/audit/${sig.reasoningHash}`}
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
