'use client'

import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '@/lib/contracts'
import { useVaultEvents } from '@/hooks/use-vault-events'
import { isMockMode } from '@/lib/mock-mode'
import { getMockPipeline } from '@/lib/mock-data'
import { StageType, type StageTypeValue, type PipelineRun } from '@/types/pipeline'

const stageMap: Record<number, StageTypeValue> = {
  0: StageType.IDLE,
  1: StageType.FETCHING,
  2: StageType.FETCHING,
  3: StageType.SCRAPING,
  4: StageType.SCRAPING,
  5: StageType.REASONING,
}

export function useAgentPipeline(vaultAddress: string) {
  const mockRun = isMockMode() ? getMockPipeline(vaultAddress) : null
  const [stage, setStage] = useState<StageTypeValue>(mockRun?.currentStage ?? StageType.IDLE)
  const [stageData, setStageData] = useState<Record<string, unknown>>({})
  const [isRunning, setIsRunning] = useState(false)
  const [run, setRun] = useState<PipelineRun | null>(mockRun)

  const fetchStatus = useCallback(async () => {
    if (isMockMode()) {
      const data = getMockPipeline(vaultAddress)
      if (data) {
        setRun(data)
        setStage(data.currentStage)
        setIsRunning(!data.completedAt)
      }
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/pipeline/${vaultAddress}`)
      if (!res.ok) return
      const data = await res.json()

      const onChainStage = Number(data.stage ?? 0)
      const flags = Number(data.flags ?? 0)
      const isCompleted = Boolean(data.completed) || (flags & 8) !== 0
      const isFailed = isCompleted && onChainStage !== 0 && data.data?.fetchedPrice === '0'

      let mapped: StageTypeValue
      if (isCompleted && !isFailed) {
        mapped = StageType.COMPLETE
      } else if (isFailed) {
        mapped = StageType.IDLE
      } else {
        mapped = stageMap[onChainStage] ?? StageType.IDLE
      }

      setStage(mapped)
      setIsRunning(!isCompleted && onChainStage > 0)
      if (data.data) setStageData(data.data)
    } catch {
      // Pipeline endpoint may not exist yet
    }
  }, [vaultAddress])

  useVaultEvents(fetchStatus)

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10_000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  return { stage, stageData, isRunning, run }
}
