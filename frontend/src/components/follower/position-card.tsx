'use client'

import Link from 'next/link'
import { cn, directionLabel, directionBg, formatPrice, formatPnlPercent, truncateAddress } from '@/lib/utils'
import { SignalIndicator } from '@/components/leaderboard/signal-indicator'
import { ArrowRight } from 'lucide-react'

interface PositionCardProps {
  vaultAddress: string
  vaultName: string
  direction: number
  entryPrice: number
  currentPnl: number
  pnlPercent: number
  stopPrice: number
}

export function PositionCard({
  vaultAddress,
  vaultName,
  direction,
  entryPrice,
  currentPnl,
  pnlPercent,
  stopPrice,
}: PositionCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{vaultName || truncateAddress(vaultAddress)}</h3>
          <p className="mt-0.5 font-mono text-xs text-zinc-600">{truncateAddress(vaultAddress)}</p>
        </div>
        <SignalIndicator direction={direction} size="sm" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-zinc-500">Entry</p>
          <p className="mt-0.5 font-mono text-sm text-zinc-300">${formatPrice(entryPrice)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">PnL</p>
          <p className={cn('mt-0.5 font-mono text-sm font-semibold', currentPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {formatPnlPercent(pnlPercent)}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Stop</p>
          <p className="mt-0.5 font-mono text-sm text-zinc-300">${formatPrice(stopPrice)}</p>
        </div>
      </div>

      <Link
        href={`/vault/${vaultAddress}`}
        className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800/60 py-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-200"
      >
        View Vault <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  )
}
