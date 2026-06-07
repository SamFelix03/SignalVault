'use client'

import Link from 'next/link'
import { cn, formatPrice, formatPnlPercent, truncateAddress } from '@/lib/utils'
import { SignalIndicator } from '@/components/leaderboard/signal-indicator'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
    <Card className="group transition-all duration-300 hover:border-accent/50">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{vaultName || truncateAddress(vaultAddress)}</h3>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{truncateAddress(vaultAddress)}</p>
          </div>
          <SignalIndicator direction={direction} size="sm" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Entry</p>
            <p className="mt-0.5 font-mono text-sm text-foreground">${formatPrice(entryPrice)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">PnL</p>
            <p className={cn('mt-0.5 font-mono text-sm font-semibold', currentPnl >= 0 ? 'text-success' : 'text-destructive')}>
              {formatPnlPercent(pnlPercent)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Stop</p>
            <p className="mt-0.5 font-mono text-sm text-foreground">${formatPrice(stopPrice)}</p>
          </div>
        </div>

        <Button variant="secondary" className="mt-4 w-full" asChild>
          <Link href={`/vault/${vaultAddress}`}>
            View Vault <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
