/** Phrases that must never appear in user-facing pipeline copy */
const PLACEHOLDER_MARKERS = [
  'Macro context unavailable',
  'News unavailable',
  'Agents timed out',
  'rule-based completion',
  'Rule-based signal:',
  'did not finish in time',
  'Somnia agents',
] as const;

const PLACEHOLDER_PATTERNS = [
  /Agents timed out after \d+s\.?/gi,
  /rule-based completion\.?/gi,
  /Rule-based signal:\s*/gi,
  /Somnia agents did not finish in time\.?/gi,
] as const;

export function isPlaceholderPipelineText(text: string): boolean {
  if (!text.trim()) return true;
  return PLACEHOLDER_MARKERS.some((m) => text.includes(m));
}

export function sanitizePipelineText(text: string): string {
  let out = text;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    out = out.replace(pattern, '');
  }
  for (const marker of PLACEHOLDER_MARKERS) {
    out = out.split(marker).join('');
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

export function buildDisplayReasoning(
  reasoningSummary: string | undefined,
  newsSummary: string,
): string | undefined {
  const news = sanitizePipelineText(newsSummary);
  if (!reasoningSummary?.trim()) return news || undefined;

  if (isPlaceholderPipelineText(reasoningSummary)) {
    const cleaned = sanitizePipelineText(reasoningSummary);
    if (!cleaned || isPlaceholderPipelineText(cleaned)) {
      return news || undefined;
    }
    return cleaned;
  }

  return sanitizePipelineText(reasoningSummary) || undefined;
}
