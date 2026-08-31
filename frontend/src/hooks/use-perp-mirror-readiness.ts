'use client'

import { useEffect, useState } from 'react'
import { type Address } from 'viem'
import { fetchPerpRouterStatus, type PerpRouterStatus } from '@/lib/mirror-wallet'

export function usePerpMirrorReadiness(vault: Address | undefined) {
  const [status, setStatus] = useState<PerpRouterStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = () => {
    if (!vault) return
    setLoading(true)
    setError(null)
    fetchPerpRouterStatus(vault)
      .then(setStatus)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to check mirror readiness')
        setStatus(null)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!vault) {
      setStatus(null)
      return
    }
    refresh()
  }, [vault])

  return { status, loading, error, refresh }
}
