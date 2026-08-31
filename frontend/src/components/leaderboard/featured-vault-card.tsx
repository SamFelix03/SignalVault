'use client'

import Link from 'next/link'
import { ArrowRight, Users, Plug } from 'lucide-react'
import { cn, truncateAddress, formatPnlPercent, formatBps, timeAgo } from '@/lib/utils'
import { SignalIndicator } from './signal-indicator'
import type { VaultInfo } from '@/types/vault'
import { normalizeSourceType } from '@/lib/vault-source'
import { Button } from '@/components/ui/button'

interface FeaturedVaultCardProps {
  vault: VaultInfo
  rank?: number
  index?: number
}

function ExposureRow({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="max-w-sm space-y-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground">{percent.toFixed(1)}%</span>
      </div>
      <div className="h-px w-full bg-border">
        <div
          className="h-px bg-foreground/50 transition-all duration-500"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

export function FeaturedVaultCard({ vault, rank, index = 0 }: FeaturedVaultCardProps) {
  const pnl = vault.stats?.totalPnl ?? 0
  const sharpe = vault.stats?.sharpeRatio ?? 0
  const sizePercent = (vault.currentSignal?.sizeBps ?? 0) / 100
  const followers = vault.followerCount ?? vault.stats?.followerCount ?? 0
  const description = vault.currentSignal?.reasoning || vault.strategyPrompt

  return (
    <Link href={`/vault/${vault.address}`} className="group block">
      <div
        className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-muted-foreground/25 animate-in fade-in slide-in-from-bottom-4 md:p-8"
        style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'both' }}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {rank !== undefined && (
                <span className="font-mono text-xs text-muted-foreground">#{rank}</span>
              )}
              <SignalIndicator direction={vault.currentSignal?.direction ?? 0} size="sm" />
              {normalizeSourceType(vault.sourceType) === 'wallet' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-chart-1/10 px-2 py-0.5 text-[10px] font-medium text-chart-1">
                  Wallet-tracked
                </span>
              ) : vault.publisherKind === 'custom' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                  <Plug className="h-3 w-3" />
                  Custom agent
                </span>
              ) : null}
              {vault.currentSignal?.timestamp ? (
                <span className="text-xs text-muted-foreground">
                  Updated {timeAgo(vault.currentSignal.timestamp)}
                </span>
              ) : null}
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {vault.name || 'Unnamed Vault'}
              </h2>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                {truncateAddress(vault.address)}
              </p>
            </div>

            {description && (
              <p className="max-w-2xl line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}

            {sizePercent > 0 && <ExposureRow label="Position size" percent={sizePercent} />}
          </div>

          <div className="flex shrink-0 flex-col gap-5 lg:items-end">
            <div className="grid w-full grid-cols-3 gap-6 border-t border-border pt-5 lg:w-auto lg:border-t-0 lg:pt-0">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">30d PnL</p>
                <p className={cn('mt-1 font-mono text-lg font-semibold tabular-nums', pnl < 0 && 'text-destructive')}>
                  {formatPnlPercent(pnl)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sharpe</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">{sharpe.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fee</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">{formatBps(vault.performanceFeeBps)}</p>
              </div>
            </div>

            <div className="flex w-full items-center justify-between gap-4 lg:w-auto lg:justify-end">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                {followers}
              </div>
              <Button variant="outline" size="sm" asChild>
                <span>
                  View vault
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
