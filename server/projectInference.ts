import type { AnthropicCreateLike } from './linking'

export type ProjectType = 'software' | 'research' | 'writing' | 'design' | 'mixed' | 'unknown'

export type ProjectInferenceResult = {
  type: ProjectType
  confidence: number
  rationale: string
}

const INFERENCE_MODEL = 'claude-haiku-4-5-20251001'

const VALID_TYPES = new Set<ProjectType>(['software', 'research', 'writing', 'design', 'mixed', 'unknown'])

export async function inferProjectType(
  artifacts: Array<{ id: string; content: string | null }>,
  anthropic: AnthropicCreateLike
): Promise<ProjectInferenceResult> {
  if (artifacts.length < 3) {
    return { type: 'unknown', confidence: 0, rationale: 'insufficient data' }
  }

  const snippets = artifacts.slice(0, 10).map((a, i) => {
    const snippet = (a.content ?? '').replace(/\s+/g, ' ').slice(0, 200)
    return `${i + 1}. ${snippet}`
  })

  const resp = await anthropic.messages.create({
    model: INFERENCE_MODEL,
    max_tokens: 200,
    system:
      'You classify artifact collections by project type. Respond with JSON only — no markdown, no other text. ' +
      'Schema: {"type":"software"|"research"|"writing"|"design"|"mixed"|"unknown","confidence":0..1,"rationale":"string"}',
    messages: [
      {
        role: 'user',
        content: `Classify this collection of artifact snippets:\n\n${snippets.join('\n')}`,
      },
    ],
  })

  try {
    const raw = resp.content[0]?.type === 'text' ? (resp.content[0].text ?? '') : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as { type?: string; confidence?: number; rationale?: string }
    const type = VALID_TYPES.has(parsed.type as ProjectType) ? (parsed.type as ProjectType) : 'unknown'
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : ''
    return { type, confidence, rationale }
  } catch {
    return { type: 'unknown', confidence: 0, rationale: 'parse error' }
  }
}
