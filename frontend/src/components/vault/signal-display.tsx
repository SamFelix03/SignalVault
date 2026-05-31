'use client'

import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn, directionLabel, directionBg, formatPrice } from '@/lib/utils'
import type { Signal } from '@/types/vault'

interface SignalDisplayProps {
  signal: Signal
}

export function SignalDisplay({ signal }: SignalDisplayProps) {
  const label = directionLabel(signal.direction)
  const sizePercent = signal.sizeBps / 100

  const Icon = label === 'LONG' ? ArrowUp : label === 'SHORT' ? ArrowDown : Minus

  const colorText = {
    LONG: 'text-emerald-400',
    SHORT: 'text-red-400',
    FLAT: 'text-amber-400',
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-6 backdrop-blur-sm">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">Current Signal</h2>

      <div className="flex items-center gap-6">
        <div
          className={cn(
            'flex h-20 w-20 items-center justify-center rounded-2xl border-2',
            directionBg(signal.direction)
          )}
        >
          <Icon className={cn('h-10 w-10', colorText[label])} strokeWidth={2.5} />
        </div>

        <div className="space-y-1">
          <p className={cn('text-3xl font-bold', colorText[label])}>{label}</p>
          <p className="text-sm text-zinc-500">
            Size: <span className="font-mono text-zinc-300">{sizePercent.toFixed(1)}%</span>
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-zinc-900/50 p-3">
          <p className="text-xs text-zinc-500">Stop Price</p>
          <p className="mt-1 font-mono text-sm text-zinc-200">${formatPrice(signal.stopPrice)}</p>
        </div>
        <div className="rounded-lg bg-zinc-900/50 p-3">
          <p className="text-xs text-zinc-500">Epoch</p>
          <p className="mt-1 font-mono text-sm text-zinc-200">#{signal.epoch}</p>
        </div>
        <div className="rounded-lg bg-zinc-900/50 p-3">
          <p className="text-xs text-zinc-500">Size</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-zinc-800">
            <div
              className={cn('h-full rounded-full transition-all', label === 'LONG' ? 'bg-emerald-500' : label === 'SHORT' ? 'bg-red-500' : 'bg-amber-500')}
              style={{ width: `${Math.min(sizePercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {signal.reasoning && (
        <div className="mt-4 rounded-lg bg-zinc-900/50 p-4">
          <p className="text-xs font-medium text-zinc-500">Reasoning</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">{signal.reasoning}</p>
        </div>
      )}
    </div>
  )
}
