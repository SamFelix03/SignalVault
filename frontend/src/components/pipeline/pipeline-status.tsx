'use client'

import { useState } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { type Address, parseEther } from 'viem'
import { agentOrchestratorAbi } from '@/abis/AgentOrchestrator'
import { isMockMode } from '@/lib/mock-mode'
import { mockPipelineDetail } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { formatPrice, timeAgo } from '@/lib/utils'
import { Circle, CheckCircle2, Loader2, Play, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

const STAGE_LABELS: Record<number, string> = {
  0: 'Idle',
  1: 'Fetching Price',
  2: 'Fetching Funding',
  3: 'Parsing Fear & Greed',
  4: 'Parsing News',
  5: 'Inferring',
}

interface PipelineStatusPageProps {
  orchestratorAddress: Address
}

function MockPipelineStatusView() {
  const d = mockPipelineDetail
  const stages = [0, 1, 2, 3, 4, 5]

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
        Mock pipeline data — trigger button is disabled in demo mode.
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Pipeline Status</CardTitle>
          <span className="text-xs text-muted-foreground">Run #{d.runId}</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={100} className="h-1.5 [&>div]:bg-accent" />
          <div className="relative flex items-center justify-between">
            {stages.map((s) => (
              <div key={s} className="relative z-10 flex flex-col items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-success bg-success/20">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
                <span className="whitespace-nowrap text-[10px] font-medium text-success">
                  {STAGE_LABELS[s] ?? `Stage ${s}`}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Started {timeAgo(d.startedAt)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fetched Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DataCard label="Price" value={`$${formatPrice(d.fetchedPrice)}`} />
            <DataCard label="Funding Rate" value={formatPrice(d.fetchedFunding, 6)} />
            <DataCard label="Fear & Greed" value={d.fearGreedIndex.toString()} />
            <DataCard label="News Summary" value={d.newsSummary} isText />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function PipelineStatusPage({ orchestratorAddress }: PipelineStatusPageProps) {
  if (isMockMode()) return <MockPipelineStatusView />
  return <LivePipelineStatusPage orchestratorAddress={orchestratorAddress} />
}

function LivePipelineStatusPage({ orchestratorAddress }: PipelineStatusPageProps) {
  const [triggerError, setTriggerError] = useState<string | null>(null)

  const { data: currentRunId, refetch: refetchRunId } = useReadContract({
    address: orchestratorAddress,
    abi: agentOrchestratorAbi,
    functionName: 'currentRunId',
    query: { refetchInterval: 5_000 },
  })

  const runId = currentRunId as bigint | undefined

  const { data: pipelineStatus } = useReadContract({
    address: orchestratorAddress,
    abi: agentOrchestratorAbi,
    functionName: 'getPipelineStatus',
    args: runId ? [runId] : undefined,
    query: { enabled: !!runId, refetchInterval: 5_000 },
  })

  const { data: pipelineData } = useReadContract({
    address: orchestratorAddress,
    abi: agentOrchestratorAbi,
    functionName: 'getPipelineData',
    args: runId ? [runId] : undefined,
    query: { enabled: !!runId, refetchInterval: 10_000 },
  })

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  const status = pipelineStatus as [number, number, bigint] | undefined
  const stageNum = status ? Number(status[0]) : 0
  const startedAt = status ? Number(status[2]) : 0
  const isRunning = stageNum > 0 && stageNum < 5

  const data = pipelineData as [bigint, bigint, bigint, string] | undefined
  const fetchedPrice = data ? data[0] : BigInt(0)
  const fetchedFunding = data ? data[1] : BigInt(0)
  const fearGreedIndex = data ? Number(data[2]) : 0
  const newsSummary = data ? data[3] : ''

  function handleTrigger() {
    setTriggerError(null)
    try {
      writeContract({
        address: orchestratorAddress,
        abi: agentOrchestratorAbi,
        functionName: 'startPipeline',
        value: parseEther('0.2'),
      })
      setTimeout(() => refetchRunId(), 3000)
    } catch (e: unknown) {
      setTriggerError(e instanceof Error ? e.message : 'Failed to trigger pipeline')
    }
  }

  const stages = [0, 1, 2, 3, 4, 5]
  const progress = (stageNum / (stages.length - 1)) * 100

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Pipeline Status</CardTitle>
          <div className="flex items-center gap-3">
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Running
              </span>
            )}
            {runId !== undefined && (
              <span className="text-xs text-muted-foreground">Run #{runId.toString()}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} className="h-1.5 [&>div]:bg-accent" />

          <div className="relative flex items-center justify-between">
            {stages.map((s) => {
              const isComplete = s < stageNum
              const isCurrent = s === stageNum
              return (
                <div key={s} className="relative z-10 flex flex-col items-center gap-2">
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
                    {STAGE_LABELS[s] ?? `Stage ${s}`}
                  </span>
                </div>
              )
            })}
          </div>

          {startedAt > 0 && (
            <p className="text-xs text-muted-foreground">Started {timeAgo(startedAt)}</p>
          )}
        </CardContent>
      </Card>

      {(fetchedPrice > BigInt(0) || newsSummary) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fetched Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DataCard label="Price" value={`$${formatPrice(fetchedPrice)}`} />
              <DataCard label="Funding Rate" value={formatPrice(fetchedFunding, 6)} />
              <DataCard label="Fear & Greed" value={fearGreedIndex.toString()} />
              <DataCard label="News Summary" value={newsSummary || '—'} isText />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-4">
        <Button
          onClick={handleTrigger}
          disabled={isPending || isConfirming || isRunning}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {isPending || isConfirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isPending ? 'Confirming...' : isConfirming ? 'Waiting...' : 'Trigger Pipeline'}
        </Button>

        {triggerError && (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {triggerError}
          </span>
        )}
      </div>
    </div>
  )
}

function DataCard({ label, value, isText }: { label: string; value: string; isText?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-secondary p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono', isText ? 'line-clamp-3 text-xs text-foreground' : 'text-sm text-foreground')}>
        {value}
      </p>
    </div>
  )
}
