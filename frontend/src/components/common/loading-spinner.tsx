'use client'

import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeMap = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div
        className={cn(
          sizeMap[size],
          'animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500'
        )}
      />
    </div>
  )
}
