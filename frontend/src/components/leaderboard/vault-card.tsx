'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'
import { cn, truncateAddress, formatPnlPercent, timeAgo, formatBps } from '@/lib/utils'
import { SignalIndicator } from './signal-indicator'
import type { VaultInfo } from '@/types/vault'

interface VaultCardProps {
  vault: VaultInfo
}

export function VaultCard({ vault }: VaultCardProps) {
  const pnl7d = vault.stats?.totalPnl ?? 0
  const sizePercent = (vault.currentSignal?.sizeBps ?? 0) / 100

  return (
    <Link href={`/vault/${vault.address}`} className="group block">
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-5 backdrop-blur-sm',
          'transition-all duration-300 hover:border-zinc-700/80 hover:bg-[#111118]',
          'hover:shadow-xl hover:shadow-blue-500/5'
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

        <div className="relative space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-zinc-100 group-hover:text-white transition-colors">
                {vault.name || 'Unnamed Vault'}
              </h3>
              <p className="mt-0.5 font-mono text-xs text-zinc-500">
                {truncateAddress(vault.strategist)}
              </p>
            </div>
            <SignalIndicator direction={vault.currentSignal?.direction ?? 0} size="sm" />
          </div>

          {sizePercent > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Position Size</span>
                <span className="font-mono">{sizePercent.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-500/60 transition-all duration-500"
                  style={{ width: `${Math.min(sizePercent, 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500">7d PnL</p>
              <p
                className={cn(
                  'font-mono text-sm font-semibold',
                  pnl7d > 0 ? 'text-emerald-400' : pnl7d < 0 ? 'text-red-400' : 'text-zinc-400'
                )}
              >
                {formatPnlPercent(pnl7d)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">Fee</p>
              <p className="font-mono text-sm text-zinc-300">{formatBps(vault.performanceFeeBps)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800/50 pt-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs">{vault.followerCount ?? vault.stats?.followerCount ?? 0} followers</span>
            </div>
            {vault.currentSignal?.timestamp ? (
              <span className="text-xs text-zinc-600">{timeAgo(vault.currentSignal.timestamp)}</span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  )
}
