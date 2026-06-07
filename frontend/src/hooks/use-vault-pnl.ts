'use client'

import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '@/lib/contracts'
import { isMockMode } from '@/lib/mock-mode'
import { getMockChartData } from '@/lib/mock-data'
import type { TradeRecord } from '@/types/vault'

interface ChartDataPoint {
  date: string
  pnl: number
  cumulativePnl: number
}

export function useVaultPnl(vaultAddress: string, range: '1d' | '7d' | '30d' = '7d') {
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchPnl = useCallback(async () => {
    if (isMockMode()) {
      setTrades([])
      setChartData(getMockChartData(vaultAddress))
      setIsLoading(false)
      setError(null)
      return
    }

    try {
      setIsLoading(true)
      const res = await fetch(`${API_URL}/api/vaults/${vaultAddress}/pnl?range=${range}`)
      if (!res.ok) throw new Error(`Failed to fetch PnL: ${res.statusText}`)
      const data = await res.json()
      setTrades(data.trades ?? [])
      setChartData(data.chartData ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [vaultAddress, range])

  useEffect(() => {
    fetchPnl()
    const interval = setInterval(fetchPnl, 30_000)
    return () => clearInterval(interval)
  }, [fetchPnl])

  return { trades, chartData, isLoading, error }
}
