'use client'

import { useState } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { type Address, parseEther } from 'viem'
import { agentOrchestratorAbi } from '@/abis/AgentOrchestrator'
import { cn } from '@/lib/utils'
import { formatPrice, timeAgo } from '@/lib/utils'
import { Circle, CheckCircle2, Loader2, Play, AlertTriangle } from 'lucide-react'

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

export function PipelineStatusPage({ orchestratorAddress }: PipelineStatusPageProps) {
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
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
  })

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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-6 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">Pipeline Status</h2>
          <div className="flex items-center gap-3">
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-blue-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                Running
              </span>
            )}
            {runId !== undefined && (
              <span className="text-xs text-zinc-500">Run #{runId.toString()}</span>
            )}
          </div>
        </div>

        <div className="relative flex items-center justify-between">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-zinc-800" />
          <div
            className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-blue-500 transition-all duration-700"
            style={{ width: `${(stageNum / (stages.length - 1)) * 100}%` }}
          />

          {stages.map((s) => {
            const isComplete = s < stageNum
            const isCurrent = s === stageNum
            return (
              <div key={s} className="relative z-10 flex flex-col items-center gap-2">
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
                  {STAGE_LABELS[s] ?? `Stage ${s}`}
                </span>
              </div>
            )
          })}
        </div>

        {startedAt > 0 && (
          <p className="mt-4 text-xs text-zinc-500">Started {timeAgo(startedAt)}</p>
        )}
      </div>

      {(fetchedPrice > BigInt(0) || newsSummary) && (
        <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-6 backdrop-blur-sm">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">Fetched Data</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DataCard label="Price" value={`$${formatPrice(fetchedPrice)}`} />
            <DataCard label="Funding Rate" value={formatPrice(fetchedFunding, 6)} />
            <DataCard label="Fear & Greed" value={fearGreedIndex.toString()} />
            <DataCard label="News Summary" value={newsSummary || '—'} isText />
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={handleTrigger}
          disabled={isPending || isConfirming || isRunning}
          className={cn(
            'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all',
            isPending || isConfirming || isRunning
              ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
              : 'bg-blue-600 text-white hover:bg-blue-500'
          )}
        >
          {isPending || isConfirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isPending ? 'Confirming...' : isConfirming ? 'Waiting...' : 'Trigger Pipeline'}
        </button>

        {triggerError && (
          <span className="flex items-center gap-1.5 text-xs text-red-400">
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
    <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/50 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={cn('mt-1 font-mono', isText ? 'text-xs text-zinc-300 line-clamp-3' : 'text-sm text-zinc-100')}>
        {value}
      </p>
    </div>
  )
}
