'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'
import { cn, truncateAddress, formatPnlPercent, timeAgo, formatBps } from '@/lib/utils'
import { SignalIndicator } from './signal-indicator'
import type { VaultInfo } from '@/types/vault'

interface VaultCardProps {
  vault: VaultInfo
  index?: number
  rank?: number
}

export function VaultCard({ vault, index = 0, rank }: VaultCardProps) {
  const pnl7d = vault.stats?.totalPnl ?? 0
  const sharpe = vault.stats?.sharpeRatio ?? 0
  const sizePercent = (vault.currentSignal?.sizeBps ?? 0) / 100
  const strategistInitial = vault.strategist?.slice(2, 4).toUpperCase() ?? 'SV'

  return (
    <Link href={`/vault/${vault.address}`} className="group block h-full">
      <div
        className="relative flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-muted-foreground/25 animate-in fade-in slide-in-from-bottom-4"
        style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'both' }}
      >
        <div className="flex flex-1 flex-col space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-sm font-medium text-muted-foreground">
                {strategistInitial}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {rank !== undefined && (
                    <span className="font-mono text-xs text-muted-foreground">#{rank}</span>
                  )}
                  <h3 className="truncate text-base font-semibold text-foreground">
                    {vault.name || 'Unnamed Vault'}
                  </h3>
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {truncateAddress(vault.strategist)}
                </p>
              </div>
            </div>
            <SignalIndicator direction={vault.currentSignal?.direction ?? 0} size="sm" />
          </div>

          {sizePercent > 0 && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">Position size</span>
                <span className="font-mono tabular-nums text-foreground">{sizePercent.toFixed(1)}%</span>
              </div>
              <div className="h-px w-full bg-border">
                <div
                  className="h-px bg-foreground/40 transition-all duration-500"
                  style={{ width: `${Math.min(sizePercent, 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">PnL</p>
              <p className={cn('mt-0.5 font-mono text-sm font-medium tabular-nums', pnl7d < 0 && 'text-destructive')}>
                {formatPnlPercent(pnl7d)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sharpe</p>
              <p className="mt-0.5 font-mono text-sm font-medium tabular-nums text-foreground">{sharpe.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fee</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">{formatBps(vault.performanceFeeBps)}</p>
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs">{vault.followerCount ?? vault.stats?.followerCount ?? 0}</span>
            </div>
            {vault.currentSignal?.timestamp ? (
              <span className="text-xs text-muted-foreground">{timeAgo(vault.currentSignal.timestamp)}</span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  )
}
