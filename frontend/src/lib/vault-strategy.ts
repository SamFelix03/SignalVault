/** Split on-chain strategyPrompt into display name + strategy text (deploy uses "Name: prompt"). */
export function parseVaultStrategyPrompt(full: string): { name: string; prompt: string } {
  const trimmed = full?.trim() ?? ''
  if (!trimmed) {
    return { name: 'Strategy Vault', prompt: '' }
  }

  const colonIdx = trimmed.indexOf(': ')
  if (colonIdx > 0 && colonIdx <= 80) {
    const name = trimmed.slice(0, colonIdx).trim()
    const prompt = trimmed.slice(colonIdx + 2).trim()
    if (name && prompt) {
      return { name, prompt }
    }
  }

  const shortName =
    trimmed.length > 50 ? `${trimmed.slice(0, 50).trim()}…` : trimmed

  return { name: shortName, prompt: trimmed }
}
