'use client'

import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '@/lib/contracts'
import { isMockMode } from '@/lib/mock-mode'
import { getMockPipeline } from '@/lib/mock-data'
import { StageType, type StageTypeValue, type PipelineRun } from '@/types/pipeline'

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
      const res = await fetch(`${API_URL}/api/vaults/${vaultAddress}/pipeline`)
      if (!res.ok) return
      const data: PipelineRun = await res.json()
      setRun(data)
      setStage(data.currentStage)
      setIsRunning(!data.completedAt)
      const currentStageInfo = data.stages.find(s => s.type === data.currentStage)
      if (currentStageInfo?.data) setStageData(currentStageInfo.data)
    } catch {
      // Pipeline endpoint may not exist yet
    }
  }, [vaultAddress])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5_000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  return { stage, stageData, isRunning, run }
}
