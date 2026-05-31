'use client'

import { Brain } from 'lucide-react'
import { StageCard } from './stage-card'
import type { StageInferToolsChat as StageInferType } from '@/types/pipeline'

interface StageInferProps {
  data: StageInferType
}

export function StageInfer({ data }: StageInferProps) {
  return (
    <StageCard title="LLM inferToolsChat" stageNumber={3} icon={<Brain className="h-4 w-4" />}>
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">System Prompt</p>
          <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-400 whitespace-pre-wrap">
            {data.systemPrompt}
          </pre>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">User Message</p>
          <pre className="max-h-32 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-300 whitespace-pre-wrap">
            {data.userMessage}
          </pre>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">Chain of Thought</p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-emerald-950/30 border border-emerald-900/30 p-3 text-xs text-emerald-300 whitespace-pre-wrap">
            {data.chainOfThought}
          </pre>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Tool Called</p>
            <code className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-1 text-xs font-semibold text-blue-400">
              {data.toolCalled}
            </code>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Arguments</p>
            <pre className="overflow-auto rounded-lg bg-zinc-900 p-2 text-xs text-zinc-300">
              {JSON.stringify(data.toolArguments, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </StageCard>
  )
}
