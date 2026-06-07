'use client'

import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '@/lib/contracts'
import { isMockMode } from '@/lib/mock-mode'
import { getMockSignals } from '@/lib/mock-data'
import type { Signal } from '@/types/vault'

export function useSignalHistory(vaultAddress: string) {
  const [signals, setSignals] = useState<Signal[]>(
    isMockMode() ? getMockSignals(vaultAddress) : []
  )
  const [isLoading, setIsLoading] = useState(!isMockMode())
  const [error, setError] = useState<Error | null>(null)

  const fetchSignals = useCallback(async () => {
    if (isMockMode()) {
      setSignals(getMockSignals(vaultAddress))
      setIsLoading(false)
      setError(null)
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/vaults/${vaultAddress}/signals`)
      if (!res.ok) throw new Error(`Failed to fetch signals: ${res.statusText}`)
      const data = await res.json()
      setSignals(data.signals ?? data ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [vaultAddress])

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, 15_000)
    return () => clearInterval(interval)
  }, [fetchSignals])

  return { signals, isLoading, error }
}
