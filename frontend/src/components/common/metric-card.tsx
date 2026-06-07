'use client'

import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon: LucideIcon
  delay?: number
}

export function MetricCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  delay = 0,
}: MetricCardProps) {
  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-accent/50 animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${delay * 100}ms`, animationFillMode: 'both' }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative">
        <div className="mb-3 flex items-start justify-between">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary transition-colors duration-300 group-hover:bg-accent/10">
            <Icon className="h-4 w-4 text-muted-foreground transition-colors duration-300 group-hover:text-accent" />
          </div>
        </div>

        <div className="flex items-end gap-3">
          <span className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">{value}</span>
          {change && (
            <div
              className={cn(
                'mb-1 flex items-center gap-1 text-sm font-medium',
                changeType === 'positive' && 'text-success',
                changeType === 'negative' && 'text-destructive',
                changeType === 'neutral' && 'text-muted-foreground'
              )}
            >
              {changeType === 'positive' && <TrendingUp className="h-3.5 w-3.5" />}
              {changeType === 'negative' && <TrendingDown className="h-3.5 w-3.5" />}
              <span>{change}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
