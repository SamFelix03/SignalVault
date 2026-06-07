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
          <p className="mb-1 text-xs font-medium text-muted-foreground">URL Called</p>
          <code className="block break-all rounded-lg bg-secondary p-3 text-xs text-accent">{data.url}</code>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Raw Result</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-secondary p-3 text-xs text-foreground">
            {typeof data.rawResult === 'string' ? data.rawResult : JSON.stringify(data.rawResult, null, 2)}
          </pre>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Extracted Value</p>
          <p className="font-mono text-sm font-semibold text-success">{data.extractedValue}</p>
        </div>

        {data.validators?.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Validators</p>
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
