'use client'

import { Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PromptPreviewProps {
  name: string
  description: string
}

export function PromptPreview({ name, description }: PromptPreviewProps) {
  const formattedPrompt = `You are an autonomous trading agent managing the "${name || 'Untitled'}" vault.

STRATEGY:
${description || '[Enter your strategy description above]'}

INSTRUCTIONS:
- Analyze market data from provided oracle feeds
- Make trading decisions based on the strategy above
- Output a Signal with direction (LONG/SHORT/FLAT), size (0-10000 bps), and stop price
- Include detailed reasoning for each decision`

  const lines = formattedPrompt.split('\n')
  const hasContent = description.length > 0

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Terminal className="h-3.5 w-3.5" />
            agent-system-prompt.md
          </div>
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium',
            hasContent ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
          )}
        >
          {hasContent ? 'Ready' : 'Draft'}
        </span>
      </div>

      <div className="max-h-[420px] overflow-auto bg-[oklch(0.07_0.005_260)] p-4">
        <pre className="font-mono text-xs leading-relaxed">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-4 hover:bg-white/[0.02]">
              <span className="select-none text-right text-muted-foreground/40 w-6 shrink-0">
                {i + 1}
              </span>
              <span
                className={cn(
                  'flex-1 whitespace-pre-wrap',
                  line.startsWith('STRATEGY:') || line.startsWith('INSTRUCTIONS:')
                    ? 'font-semibold text-accent'
                    : line.startsWith('-')
                      ? 'text-chart-1'
                      : hasContent && i >= 2 && i < 2 + description.split('\n').length
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                )}
              >
                {line || ' '}
              </span>
            </div>
          ))}
        </pre>
      </div>

      <div className="border-t border-border bg-secondary/30 px-4 py-2 text-[10px] text-muted-foreground">
        Committed on-chain as reasoning hash each epoch · verifiable by anyone
      </div>
    </div>
  )
}
