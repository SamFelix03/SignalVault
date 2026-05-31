'use client'

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

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 backdrop-blur-sm">
      <div className="border-b border-zinc-800/50 px-6 py-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-500">Strategy Prompt Preview</h3>
      </div>
      <div className="p-6">
        <pre className="whitespace-pre-wrap rounded-lg bg-zinc-900/80 p-4 font-mono text-xs leading-relaxed text-zinc-400">
          {formattedPrompt}
        </pre>
      </div>
    </div>
  )
}
