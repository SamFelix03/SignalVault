const PLACEHOLDER_MARKERS = [
  'Macro context unavailable',
  'News unavailable',
  'Agents timed out',
  'rule-based completion',
  'Rule-based signal:',
  'did not finish in time',
  'Somnia agents',
] as const

const PLACEHOLDER_PATTERNS = [
  /Agents timed out after \d+s\.?/gi,
  /rule-based completion\.?/gi,
  /Rule-based signal:\s*/gi,
  /Somnia agents did not finish in time\.?/gi,
] as const

export function sanitizePipelineText(text: string): string {
  let out = text
  for (const pattern of PLACEHOLDER_PATTERNS) {
    out = out.replace(pattern, '')
  }
  for (const marker of PLACEHOLDER_MARKERS) {
    out = out.split(marker).join('')
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim()
}

export function sanitizeReasoning(reasoning: string | undefined): string | undefined {
  if (!reasoning?.trim()) return undefined
  const cleaned = sanitizePipelineText(reasoning)
  return cleaned || undefined
}
