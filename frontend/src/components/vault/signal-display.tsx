'use client'

import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn, directionLabel, directionBg, directionColor, formatLimitPrice, formatMarketId } from '@/lib/utils'
import type { Signal } from '@/types/vault'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SignalDisplayProps {
  signal: Signal
  instrumentType?: 'BINARY' | 'PERP'
}

export function SignalDisplay({ signal, instrumentType = 'BINARY' }: SignalDisplayProps) {
  const label =
    instrumentType === 'PERP'
      ? signal.direction > 0
        ? 'LONG'
        : signal.direction < 0
          ? 'SHORT'
          : 'FLAT'
      : directionLabel(signal.direction)
  const sizePercent = signal.sizeBps / 100

  const Icon = label === 'UP' ? ArrowUp : label === 'DOWN' ? ArrowDown : Minus

  return (
    <Card className="border-accent/30">
      <CardHeader>
        <CardTitle className="text-base">Current Signal</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div
            className={cn(
              'flex h-20 w-20 items-center justify-center rounded-2xl border-2',
              directionBg(signal.direction)
            )}
          >
            <Icon className={cn('h-10 w-10', directionColor(signal.direction))} strokeWidth={2.5} />
          </div>

          <div className="space-y-1">
            <p className={cn('text-3xl font-bold', directionColor(signal.direction))}>{label}</p>
            <p className="text-sm text-muted-foreground">
              Size: <span className="font-mono text-foreground">{sizePercent.toFixed(1)}%</span>
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-xs text-muted-foreground">
              {instrumentType === 'PERP' ? 'Pool' : 'Market'}
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">
              {instrumentType === 'PERP'
                ? `0x${signal.marketId.slice(-40)}`
                : formatMarketId(signal.marketId)}
            </p>
          </div>
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-xs text-muted-foreground">
              {instrumentType === 'PERP' ? 'Limit / Mark' : 'Limit Price'}
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">
              {instrumentType === 'PERP'
                ? (Number(signal.limitPrice) / 1e18).toFixed(4)
                : formatLimitPrice(signal.limitPrice)}
            </p>
          </div>
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Epoch</p>
            <p className="mt-1 font-mono text-sm text-foreground">#{signal.epoch}</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-secondary p-3">
          <p className="text-xs text-muted-foreground">Size</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                label === 'UP' ? 'bg-success' : label === 'DOWN' ? 'bg-destructive' : 'bg-warning'
              )}
              style={{ width: `${Math.min(sizePercent, 100)}%` }}
            />
          </div>
        </div>

        {signal.reasoning && (
          <div className="mt-4 rounded-lg bg-secondary p-4">
            <p className="text-xs font-medium text-muted-foreground">Reasoning</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{signal.reasoning}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
