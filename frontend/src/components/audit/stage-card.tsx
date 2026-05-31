'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface StageCardProps {
  title: string
  stageNumber: number
  icon: ReactNode
  children: ReactNode
  className?: string
}

export function StageCard({ title, stageNumber, icon, children, className }: StageCardProps) {
  return (
    <div className={cn('rounded-xl border border-zinc-800/60 bg-[#111118]/80 backdrop-blur-sm overflow-hidden', className)}>
      <div className="flex items-center gap-3 border-b border-zinc-800/50 px-6 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
          {stageNumber}
        </span>
        <div className="flex items-center gap-2 text-zinc-300">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}
