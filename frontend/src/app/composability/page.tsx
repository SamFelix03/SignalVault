'use client'

import { useEffect, useState } from 'react'
import { API_URL, DEMO_VAULT_ADDRESS } from '@/lib/contracts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/common/loading-spinner'

type ComposabilityData = {
  vault: string
  performanceLedger: string
  reader: string
  baseRateBps: number
  discountBps: number
  effectiveRateBps: number
  sharpeApprox: string
  eligible: boolean
  eligibleThreshold: string
}

export default function ComposabilityPage() {
  const [data, setData] = useState<ComposabilityData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/composability/${DEMO_VAULT_ADDRESS}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 15_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (loading) return <LoadingSpinner />
  if (error) return <p className="p-8 text-destructive">{error}</p>
  if (!data) return null

  const sharpe = Number(data.sharpeApprox) / 1000

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Composability Demo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A lending protocol reads live vault Sharpe from chain and adjusts borrow rates — no API, no trust.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SharpeGatedLending</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vault Sharpe (30d approx)</span>
            <span className="font-mono">{sharpe.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Eligibility (Sharpe ≥ 1.5)</span>
            <span className={data.eligible ? 'text-emerald-400' : 'text-muted-foreground'}>
              {data.eligible ? 'Eligible' : 'Not eligible'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base borrow rate</span>
            <span className="font-mono">{(data.baseRateBps / 100).toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span className="font-mono">-{(data.discountBps / 100).toFixed(2)}%</span>
          </div>
          <div className="flex justify-between border-t border-border pt-3 font-medium">
            <span>Effective rate</span>
            <span className="font-mono text-primary">{(data.effectiveRateBps / 100).toFixed(2)}%</span>
          </div>
          <p className="text-xs text-muted-foreground font-mono break-all">
            Reader: {data.reader}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
