'use client'

import { useState, useEffect, useCallback } from 'react'
import { type Address } from 'viem'
import { API_URL } from '@/lib/contracts'
import { isMockMode } from '@/lib/mock-mode'
import { mockPipelineDetail } from '@/lib/mock-data'
import { cn, formatFundingChange, formatPrice, timeAgo } from '@/lib/utils'
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

type LogLevel = 'info' | 'warn' | 'success' | 'error'

interface PipelineLogEntry {
  ts: string
  level: LogLevel
  message: string
}

interface PipelineApiResponse {
  runId: string
  stage: number
  flags: number
  startedAt: string
  completed: boolean
  logs?: PipelineLogEntry[]
  data: {
    fetchedPrice: string
    fetchedFunding: string
    fearGreedIndex: string
    newsSummary: string
  } | null
}

interface PipelineStatusPageProps {
  vaultAddress: Address
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
            <DataCard label="24h Change" value={formatFundingChange(d.fetchedFunding)} />
            <DataCard label="Fear & Greed" value={d.fearGreedIndex.toString()} />
            <DataCard label="News Summary" value={d.newsSummary} isText />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function PipelineStatusPage({ vaultAddress, orchestratorAddress }: PipelineStatusPageProps) {
  if (isMockMode()) return <MockPipelineStatusView />
  return (
    <LivePipelineStatusPage
      vaultAddress={vaultAddress}
      orchestratorAddress={orchestratorAddress}
    />
  )
}

function LivePipelineStatusPage({ vaultAddress }: { vaultAddress: Address; orchestratorAddress: Address }) {
  const [status, setStatus] = useState<PipelineApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/pipeline/${vaultAddress}`)
      if (!res.ok) {
        if (res.status === 404) return
        throw new Error(`HTTP ${res.status}`)
      }
      const data = (await res.json()) as PipelineApiResponse
      setStatus(data)
    } catch {
      // Backend may be offline — keep last known state
    } finally {
      setLoading(false)
    }
  }, [vaultAddress])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 4_000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  async function handleTrigger() {
    setTriggerError(null)
    setTriggering(true)
    try {
      const res = await fetch(`${API_URL}/api/pipeline/${vaultAddress}/trigger`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? `Trigger failed (${res.status})`)
      }
      await fetchStatus()
    } catch (e: unknown) {
      setTriggerError(e instanceof Error ? e.message : 'Failed to trigger pipeline')
    } finally {
      setTriggering(false)
    }
  }

  const stageNum = status?.stage ?? 0
  const completed = status?.completed ?? false
  const isRunning = !completed && stageNum > 0
  const runId = status?.runId ?? '0'
  const startedAt = Number(status?.startedAt ?? 0)

  const data = status?.data
  const fetchedPrice = data ? BigInt(data.fetchedPrice) : BigInt(0)
  const fetchedFunding = data ? BigInt(data.fetchedFunding) : BigInt(0)
  const fearGreedIndex = data ? Number(data.fearGreedIndex) : 0
  const newsSummary = data?.newsSummary ?? ''
  const logs = status?.logs ?? []

  const stages = [0, 1, 2, 3, 4, 5]
  const progress = completed ? 100 : (stageNum / (stages.length - 1)) * 100

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
            {completed && (
              <span className="text-xs text-success">Complete</span>
            )}
            {runId !== '0' && (
              <span className="text-xs text-muted-foreground">Run #{runId}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && !status ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading pipeline status…
            </div>
          ) : (
            <>
              <Progress value={progress} className="h-1.5 [&>div]:bg-accent" />

              <div className="relative flex items-center justify-between">
                {stages.map((s) => {
                  const isComplete = completed || s < stageNum
                  const isCurrent = !completed && s === stageNum
                  return (
                    <div key={s} className="relative z-10 flex flex-col items-center gap-2">
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                          isComplete
                            ? 'border-success bg-success/20'
                            : isCurrent && isRunning
                              ? 'border-accent bg-accent/20'
                              : 'border-border bg-secondary',
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
                          isComplete ? 'text-success' : isCurrent ? 'text-accent' : 'text-muted-foreground',
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
            </>
          )}
        </CardContent>
      </Card>

      {(fetchedPrice > BigInt(0) || fearGreedIndex > 0 || newsSummary) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fetched Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DataCard label="Price" value={fetchedPrice > BigInt(0) ? `$${formatPrice(fetchedPrice)}` : '—'} />
              <DataCard label="24h Change" value={fetchedFunding > BigInt(0) ? formatFundingChange(fetchedFunding) : '—'} />
              <DataCard label="Fear & Greed" value={fearGreedIndex > 0 ? fearGreedIndex.toString() : '—'} />
              <DataCard label="News Summary" value={newsSummary || '—'} isText />
            </div>
          </CardContent>
        </Card>
      )}

      {(isRunning || logs.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run Log</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Waiting for backend logs…</p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto font-mono text-[11px]">
                {logs.map((entry, i) => (
                  <li key={`${entry.ts}-${i}`} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground">
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                    <LogLevelDot level={entry.level} />
                    <span
                      className={cn(
                        entry.level === 'error' && 'text-destructive',
                        entry.level === 'warn' && 'text-warning',
                        entry.level === 'success' && 'text-success',
                        entry.level === 'info' && 'text-foreground/90',
                      )}
                    >
                      {entry.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button
          onClick={handleTrigger}
          disabled={triggering || isRunning}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {triggering ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {triggering ? 'Starting…' : 'Trigger Pipeline'}
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

function LogLevelDot({ level }: { level: LogLevel }) {
  const color =
    level === 'error'
      ? 'bg-destructive'
      : level === 'warn'
        ? 'bg-warning'
        : level === 'success'
          ? 'bg-success'
          : 'bg-muted-foreground'
  return <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', color)} />
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
