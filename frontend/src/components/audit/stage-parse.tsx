'use client'

import { FileText, CheckCircle2, XCircle } from 'lucide-react'
import { StageCard } from './stage-card'
import { cn } from '@/lib/utils'
import type { StageParseWebsite as StageParseType } from '@/types/pipeline'

interface StageParseProps {
  data: StageParseType
}

export function StageParse({ data }: StageParseProps) {
  return (
    <StageCard title="LLM Parse Website" stageNumber={2} icon={<FileText className="h-4 w-4" />}>
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">URL Scraped</p>
          <code className="block rounded-lg bg-zinc-900 p-3 text-xs text-blue-400 break-all">{data.url}</code>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">Markdown Snippet</p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-300 whitespace-pre-wrap">
            {data.markdownSnippet}
          </pre>
        </div>

        <div className="flex gap-6">
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Confidence</p>
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 rounded-full bg-zinc-800">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    data.confidence >= 0.8 ? 'bg-emerald-500' : data.confidence >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${data.confidence * 100}%` }}
                />
              </div>
              <span className="font-mono text-sm text-zinc-300">{(data.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Answerable</p>
            <div className="flex items-center gap-1.5">
              {data.answerable ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-emerald-400">Yes</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-400" />
                  <span className="text-sm text-red-400">No</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </StageCard>
  )
}
