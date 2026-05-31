'use client'

import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { directionLabel } from '@/lib/utils'

interface SignalIndicatorProps {
  direction: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  pulse?: boolean
}

export function SignalIndicator({ direction, size = 'md', showLabel = true, pulse = true }: SignalIndicatorProps) {
  const label = directionLabel(direction)

  const colorMap = {
    LONG: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    SHORT: 'bg-red-500/20 text-red-400 border-red-500/40',
    FLAT: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  }

  const glowMap = {
    LONG: 'shadow-emerald-500/20',
    SHORT: 'shadow-red-500/20',
    FLAT: 'shadow-amber-500/20',
  }

  const sizeMap = {
    sm: 'h-6 gap-1 px-2 text-xs',
    md: 'h-8 gap-1.5 px-3 text-sm',
    lg: 'h-10 gap-2 px-4 text-base',
  }

  const iconSize = { sm: 'h-3 w-3', md: 'h-4 w-4', lg: 'h-5 w-5' }

  const Icon = label === 'LONG' ? ArrowUp : label === 'SHORT' ? ArrowDown : Minus

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border font-semibold shadow-lg transition-all',
        colorMap[label],
        glowMap[label],
        sizeMap[size],
        pulse && direction !== 0 && 'animate-pulse'
      )}
    >
      <Icon className={iconSize[size]} />
      {showLabel && label}
    </span>
  )
}
