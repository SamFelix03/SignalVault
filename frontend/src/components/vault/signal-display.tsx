'use client'

import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn, directionLabel, directionBg, directionColor, formatPrice } from '@/lib/utils'
import type { Signal } from '@/types/vault'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SignalDisplayProps {
  signal: Signal
}

export function SignalDisplay({ signal }: SignalDisplayProps) {
  const label = directionLabel(signal.direction)
  const sizePercent = signal.sizeBps / 100

  const Icon = label === 'LONG' ? ArrowUp : label === 'SHORT' ? ArrowDown : Minus

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
            <p className="text-xs text-muted-foreground">Stop Price</p>
            <p className="mt-1 font-mono text-sm text-foreground">${formatPrice(signal.stopPrice)}</p>
          </div>
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Epoch</p>
            <p className="mt-1 font-mono text-sm text-foreground">#{signal.epoch}</p>
          </div>
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Size</p>
            <div className="mt-1.5 h-1.5 rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  label === 'LONG' ? 'bg-success' : label === 'SHORT' ? 'bg-destructive' : 'bg-warning'
                )}
                style={{ width: `${Math.min(sizePercent, 100)}%` }}
              />
            </div>
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
