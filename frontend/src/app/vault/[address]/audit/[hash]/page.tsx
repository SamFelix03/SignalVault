'use client'

import { use, useState, useEffect } from 'react'
import { ExternalLink, ShieldCheck, ShieldX } from 'lucide-react'
import { API_URL } from '@/lib/contracts'
import { AddressBadge } from '@/components/common/address-badge'
import { LoadingSpinner } from '@/components/common/loading-spinner'
import { StageJsonApi } from '@/components/audit/stage-json-api'
import { StageParse } from '@/components/audit/stage-parse'
import { StageInfer } from '@/components/audit/stage-infer'
import type { AgentReceipt } from '@/types/pipeline'

export default function AuditPage({ params }: { params: Promise<{ address: string; hash: string }> }) {
  const { address, hash } = use(params)
  const [receipt, setReceipt] = useState<AgentReceipt | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
        <p className="text-red-400">{error ?? 'Receipt not found'}</p>
      </div>
    )
  }

  const verified = !!receipt.hash

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Audit Trail</h1>
        <p className="mt-1 text-sm text-zinc-500">Reasoning transparency for epoch #{receipt.epoch}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {verified ? (
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          ) : (
            <ShieldX className="h-5 w-5 text-red-400" />
          )}
          <span className={verified ? 'text-sm text-emerald-400' : 'text-sm text-red-400'}>
            {verified ? 'Hash Verified' : 'Unverified'}
          </span>
        </div>

        <div className="h-4 w-px bg-zinc-700" />

        <div className="text-sm text-zinc-500">
          Block: <span className="font-mono text-zinc-300">#{receipt.blockNumber}</span>
        </div>

        {receipt.txHash && (
          <>
            <div className="h-4 w-px bg-zinc-700" />
            <a
              href={`https://shannon-explorer.somnia.network/tx/${receipt.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
            >
              Tx <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}

        <div className="h-4 w-px bg-zinc-700" />
        <div className="text-sm text-zinc-500">
          Vault: <AddressBadge address={address} />
        </div>
      </div>

      <div className="space-y-6">
        {receipt.stages.jsonApi && <StageJsonApi data={receipt.stages.jsonApi} />}
        {receipt.stages.parseWebsite && <StageParse data={receipt.stages.parseWebsite} />}
        {receipt.stages.inferToolsChat && <StageInfer data={receipt.stages.inferToolsChat} />}
      </div>
    </div>
  )
}
