// Approximate per-token costs in USD (as of mid-2025)
// Source: Anthropic and OpenAI pricing pages
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'gpt-4o': { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = PRICING[model]
  if (!rates) return 0
  return rates.input * inputTokens + rates.output * outputTokens
}
