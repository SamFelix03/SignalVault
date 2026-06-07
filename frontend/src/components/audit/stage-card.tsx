'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface StageCardProps {
  title: string
  stageNumber: number
  icon: ReactNode
  children: ReactNode
  className?: string
}

export function StageCard({ title, stageNumber, icon, children, className }: StageCardProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center gap-3 border-b border-border pb-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
          {stageNumber}
        </span>
        <div className="flex items-center gap-2 text-foreground">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  )
}
