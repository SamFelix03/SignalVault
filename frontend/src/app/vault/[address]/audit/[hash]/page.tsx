'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { ExternalLink, ShieldCheck, ShieldX } from 'lucide-react'
import { API_URL } from '@/lib/contracts'
import { isMockMode } from '@/lib/mock-mode'
import { mockReceipt } from '@/lib/mock-data'
import { AddressBadge } from '@/components/common/address-badge'
import { LoadingSpinner } from '@/components/common/loading-spinner'
import { StageJsonApi } from '@/components/audit/stage-json-api'
import { StageParse } from '@/components/audit/stage-parse'
import { StageInfer } from '@/components/audit/stage-infer'
import { usePageHeader } from '@/components/layout/page-header-context'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import type { AgentReceipt } from '@/types/pipeline'

export default function AuditPage({ params }: { params: Promise<{ address: string; hash: string }> }) {
  const { address, hash } = use(params)
  const { setTitle } = usePageHeader()
  const [receipt, setReceipt] = useState<AgentReceipt | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTitle('Audit Trail')
    return () => setTitle(null)
  }, [setTitle])

  useEffect(() => {
    if (isMockMode()) {
      setReceipt(mockReceipt)
      setIsLoading(false)
      return
    }

    fetch(`${API_URL}/api/receipts/${hash}`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to fetch receipt: ${r.statusText}`)
        return r.json()
      })
      .then(setReceipt)
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false))
  }, [hash])

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" />
  }

  if (error || !receipt) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-8 text-center">
          <p className="text-destructive">{error ?? 'Receipt not found'}</p>
        </CardContent>
      </Card>
    )
  }

  const verified = !!receipt.hash

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Leaderboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/vault/${address}`}>Vault</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Audit Trail</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <p className="text-sm text-muted-foreground">Reasoning transparency for epoch #{receipt.epoch}</p>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-2">
            {verified ? (
              <ShieldCheck className="h-5 w-5 text-success" />
            ) : (
              <ShieldX className="h-5 w-5 text-destructive" />
            )}
            <span className={verified ? 'text-sm text-success' : 'text-sm text-destructive'}>
              {verified ? 'Hash Verified' : 'Unverified'}
            </span>
          </div>

          <Separator orientation="vertical" className="h-4" />

          <div className="text-sm text-muted-foreground">
            Block: <span className="font-mono text-foreground">#{receipt.blockNumber}</span>
          </div>

          {receipt.txHash && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <a
                href={`https://shannon-explorer.somnia.network/tx/${receipt.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-accent hover:text-accent/80"
              >
                Tx <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}

          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Vault: <AddressBadge address={address} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {receipt.stages.jsonApi && <StageJsonApi data={receipt.stages.jsonApi} />}
        {receipt.stages.parseWebsite && <StageParse data={receipt.stages.parseWebsite} />}
        {receipt.stages.inferToolsChat && <StageInfer data={receipt.stages.inferToolsChat} />}
      </div>
    </div>
  )
}
