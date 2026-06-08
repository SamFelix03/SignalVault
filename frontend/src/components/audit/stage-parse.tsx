'use client'

import { FileText, CheckCircle2, XCircle } from 'lucide-react'
import { StageCard } from './stage-card'
import { cn } from '@/lib/utils'
import type { StageParseWebsite as StageParseType } from '@/types/pipeline'

interface StageParseProps {
  data: StageParseType
}

/** Confidence is stored as 0–100 in receipts; mock data may use the same scale. */
function confidencePercent(confidence: number): number {
  return confidence > 1 ? Math.min(confidence, 100) : confidence * 100
}

export function StageParse({ data }: StageParseProps) {
  const confidencePct = confidencePercent(data.confidence)

  return (
    <StageCard title="LLM Parse Website" stageNumber={2} icon={<FileText className="h-4 w-4" />}>
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">URL Scraped</p>
          <code className="block break-all rounded-lg bg-secondary p-3 text-xs text-accent">{data.url}</code>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Markdown Snippet</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary p-3 text-xs text-foreground">
            {data.markdownSnippet}
          </pre>
        </div>

        <div className="flex gap-6">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Confidence</p>
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    confidencePct >= 80 ? 'bg-success' : confidencePct >= 50 ? 'bg-warning' : 'bg-destructive'
                  )}
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
              <span className="font-mono text-sm text-foreground">{confidencePct.toFixed(0)}%</span>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Answerable</p>
            <div className="flex items-center gap-1.5">
              {data.answerable ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm text-success">Yes</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">No</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </StageCard>
  )
}
