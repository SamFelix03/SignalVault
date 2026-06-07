'use client'

import { cn } from '@/lib/utils'
import { StageType, type StageTypeValue } from '@/types/pipeline'
import { Circle, CheckCircle2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

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
  const progress = (currentIdx / (stages.length - 1)) * 100

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Agent Pipeline</CardTitle>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-xs text-accent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Running
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progress} className="h-1.5 [&>div]:bg-accent" />

        <div className="relative flex items-center justify-between">
          {stages.map(({ key, label }, i) => {
            const isComplete = i < currentIdx
            const isCurrent = i === currentIdx
            return (
              <div key={key} className="relative z-10 flex flex-col items-center gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                    isComplete
                      ? 'border-success bg-success/20'
                      : isCurrent && isRunning
                        ? 'border-accent bg-accent/20'
                        : 'border-border bg-secondary'
                  )}
                >
                  {isComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : isCurrent && isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <span
                  className={cn(
                    'whitespace-nowrap text-[10px] font-medium',
                    isComplete ? 'text-success' : isCurrent ? 'text-accent' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
