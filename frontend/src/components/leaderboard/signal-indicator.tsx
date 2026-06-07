'use client'

import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn, directionLabel } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface SignalIndicatorProps {
  direction: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  pulse?: boolean
}

export function SignalIndicator({ direction, size = 'md', showLabel = true, pulse = true }: SignalIndicatorProps) {
  const label = directionLabel(direction)

  const variantMap = {
    LONG: 'bg-success/10 text-success border-success/30 hover:bg-success/10',
    SHORT: 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/10',
    FLAT: 'bg-warning/10 text-warning border-warning/30 hover:bg-warning/10',
  }

  const sizeMap = {
    sm: 'h-6 gap-1 px-2 text-xs',
    md: 'h-8 gap-1.5 px-3 text-sm',
    lg: 'h-10 gap-2 px-4 text-base',
  }

  const iconSize = { sm: 'h-3 w-3', md: 'h-4 w-4', lg: 'h-5 w-5' }

  const Icon = label === 'LONG' ? ArrowUp : label === 'SHORT' ? ArrowDown : Minus

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center font-semibold shadow-sm transition-all',
        variantMap[label],
        sizeMap[size],
        pulse && direction !== 0 && 'animate-pulse'
      )}
    >
      <Icon className={iconSize[size]} />
      {showLabel && label}
    </Badge>
  )
}
