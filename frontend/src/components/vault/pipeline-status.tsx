'use client'

import { cn } from '@/lib/utils'
import { StageType, type StageTypeValue } from '@/types/pipeline'
import { Circle, CheckCircle2, Loader2 } from 'lucide-react'

interface PipelineStatusProps {
  currentStage: StageTypeValue
  isRunning: boolean
}

const stages = [
  { key: StageType.IDLE, label: 'Idle' },
  { key: StageType.FETCHING, label: 'Fetching Data' },
  { key: StageType.SCRAPING, label: 'Scraping News' },
  { key: StageType.REASONING, label: 'LLM Reasoning' },
  { key: StageType.COMPLETE, label: 'Complete' },
] as const

const stageOrder = Object.values(StageType)

export function PipelineStatus({ currentStage, isRunning }: PipelineStatusProps) {
  const currentIdx = stageOrder.indexOf(currentStage)

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-6 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">Agent Pipeline</h2>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-xs text-blue-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            Running
          </span>
        )}
      </div>

      <div className="relative flex items-center justify-between">
        <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-zinc-800" />
        <div
          className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-blue-500 transition-all duration-700"
          style={{ width: `${(currentIdx / (stages.length - 1)) * 100}%` }}
        />

        {stages.map(({ key, label }, i) => {
          const isComplete = i < currentIdx
          const isCurrent = i === currentIdx
          return (
            <div key={key} className="relative z-10 flex flex-col items-center gap-2">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                  isComplete
                    ? 'border-emerald-500 bg-emerald-500/20'
                    : isCurrent && isRunning
                      ? 'border-blue-500 bg-blue-500/20'
                      : 'border-zinc-700 bg-zinc-900'
                )}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : isCurrent && isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                ) : (
                  <Circle className="h-4 w-4 text-zinc-600" />
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium whitespace-nowrap',
                  isComplete ? 'text-emerald-400' : isCurrent ? 'text-blue-400' : 'text-zinc-600'
                )}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
