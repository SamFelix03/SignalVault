'use client'

import { Globe } from 'lucide-react'
import { StageCard } from './stage-card'
import { AddressBadge } from '@/components/common/address-badge'
import type { StageJsonApi as StageJsonApiType } from '@/types/pipeline'

interface StageJsonApiProps {
  data: StageJsonApiType
}

export function StageJsonApi({ data }: StageJsonApiProps) {
  return (
    <StageCard title="JSON API Call" stageNumber={1} icon={<Globe className="h-4 w-4" />}>
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">URL Called</p>
          <code className="block rounded-lg bg-zinc-900 p-3 text-xs text-blue-400 break-all">{data.url}</code>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">Raw Result</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-300">
            {typeof data.rawResult === 'string' ? data.rawResult : JSON.stringify(data.rawResult, null, 2)}
          </pre>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">Extracted Value</p>
          <p className="font-mono text-sm font-semibold text-emerald-400">{data.extractedValue}</p>
        </div>

        {data.validators?.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-500">Validators</p>
            <div className="flex flex-wrap gap-2">
              {data.validators.map((addr) => (
                <AddressBadge key={addr} address={addr} showExplorer={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    </StageCard>
  )
}
