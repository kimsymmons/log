import Database from 'better-sqlite3'

export const LINKING_MODEL = 'claude-haiku-4-5-20251001'
export const LINK_TYPES = ['continuation', 'same-project', 'same-topic', 'references', 'supersedes'] as const
export type LinkType = (typeof LINK_TYPES)[number]
export const CONFIDENCE_THRESHOLD = 0.5
export const MAX_INPUT_TOKENS = 8000
export const TOKENS_PER_ARTIFACT = 100
export const MAX_CANDIDATES = 50

export type FoundLink = {
  targetId: string
  type: LinkType
  confidence: number
  rationale: string
}

export type LinkingResult = {
  links: FoundLink[]
  inputTokens: number
  outputTokens: number
}

// Minimal client shape needed by the skill; AnthropicLike (server/index.ts)
// and the real SDK client both satisfy it structurally.
export type AnthropicCreateLike = {
  messages: {
    create(params: object): Promise<{
      content: Array<{ type: string; text?: string }>
      usage?: { input_tokens: number; output_tokens: number }
    }>
  }
}

type ArtifactRow = { id: string; type: string; title: string | null; content: string | null }

function summarize(content: string | null): string {
  return (content ?? '').replace(/\s+/g, ' ').slice(0, 200)
}

function describe(a: ArtifactRow) {
  return { id: a.id, type: a.type, title: a.title ?? '', summary: summarize(a.content) }
}

export async function findLinks(
  db: Database.Database,
  artifactId: string,
  anthropic: AnthropicCreateLike
): Promise<LinkingResult> {
  const target = db
    .prepare('SELECT id, type, title, content FROM artifacts WHERE id = ?')
    .get(artifactId) as ArtifactRow | undefined
  if (!target) throw new Error('artifact not found')

  const { n: candidateCount } = db
    .prepare('SELECT COUNT(*) as n FROM artifacts WHERE id != ?')
    .get(artifactId) as { n: number }
  if (candidateCount === 0) return { links: [], inputTokens: 0, outputTokens: 0 }

  // Ceiling computed over the full candidate set, before the 50-candidate cap:
  // with the cap applied first the check could never trigger (50 × 100 < 8000).
  const estimatedTokens = candidateCount * TOKENS_PER_ARTIFACT
  if (estimatedTokens > MAX_INPUT_TOKENS) {
    console.warn(
      `[linking] aborted: ~${estimatedTokens} estimated input tokens exceeds ${MAX_INPUT_TOKENS} ceiling`
    )
    return { links: [], inputTokens: 0, outputTokens: 0 }
  }

  const candidates = db
    .prepare('SELECT id, type, title, content FROM artifacts WHERE id != ? ORDER BY created_at DESC LIMIT ?')
    .all(artifactId, MAX_CANDIDATES) as ArtifactRow[]

  const prompt = [
    'Target artifact:',
    JSON.stringify(describe(target)),
    '',
    'Candidate artifacts:',
    JSON.stringify(candidates.map(describe)),
    '',
    `Identify links from the target to candidates. Allowed types: ${LINK_TYPES.join(', ')}.`,
    'Respond only with a JSON array, no markdown:',
    '[{"targetId":"<candidate id>","type":"<type>","confidence":<0..1>,"rationale":"<one sentence>"}]',
    `Return [] if no links apply. Omit links with confidence below ${CONFIDENCE_THRESHOLD}.`,
  ].join('\n')

  const resp = await anthropic.messages.create({
    model: LINKING_MODEL,
    max_tokens: 1024,
    system:
      'You identify relationships between artifacts in a spatial knowledge canvas. Respond only with valid JSON.',
    messages: [{ role: 'user', content: prompt }],
  })

  const inputTokens = resp.usage?.input_tokens ?? 0
  const outputTokens = resp.usage?.output_tokens ?? 0

  const raw = resp.content[0]?.type === 'text' ? (resp.content[0].text ?? '') : ''
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.warn('[linking] model returned malformed JSON; treating as no links')
    return { links: [], inputTokens, outputTokens }
  }
  if (!Array.isArray(parsed)) return { links: [], inputTokens, outputTokens }

  const candidateIds = new Set(candidates.map(c => c.id))
  const links: FoundLink[] = []
  for (const item of parsed as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') continue
    const { targetId, type, confidence } = item
    if (typeof targetId !== 'string' || !candidateIds.has(targetId)) continue
    if (typeof type !== 'string' || !(LINK_TYPES as readonly string[]).includes(type)) continue
    if (typeof confidence !== 'number' || confidence < CONFIDENCE_THRESHOLD) continue
    links.push({
      targetId,
      type: type as LinkType,
      confidence,
      rationale: typeof item.rationale === 'string' ? item.rationale : '',
    })
  }

  return { links, inputTokens, outputTokens }
}
