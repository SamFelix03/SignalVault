'use client'

import { Brain } from 'lucide-react'
import { StageCard } from './stage-card'
import type { StageInferToolsChat as StageInferType } from '@/types/pipeline'

interface StageInferProps {
  data: StageInferType
}

export function StageInfer({ data }: StageInferProps) {
  const title = 'LLM inferToolsChat'

  return (
    <StageCard title={title} stageNumber={3} icon={<Brain className="h-4 w-4" />}>
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">System Prompt</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
            {data.systemPrompt}
          </pre>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">User Message</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary p-3 text-xs text-foreground">
            {data.userMessage}
          </pre>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Chain of Thought</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-success/30 bg-success/5 p-3 text-xs text-success">
            {data.chainOfThought}
          </pre>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Tool Called</p>
            <code className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
              {data.toolCalled}
            </code>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Arguments</p>
            <pre className="overflow-auto rounded-lg bg-secondary p-2 text-xs text-foreground">
              {JSON.stringify(data.toolArguments, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </StageCard>
  )
}
