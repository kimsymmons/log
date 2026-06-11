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

export type ParsedLink = FoundLink

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

/*
 * Prompt design rationale (v2):
 * - System prompt emphasises PRECISION: the model should only link when the
 *   relationship is clear and meaningful, not superficially thematic.
 * - We enumerate each link type with a one-line definition so the model
 *   picks the most specific type rather than defaulting to "same-topic".
 * - Explicit "when NOT to link" section reduces false positives on the hard
 *   cases (vaguely similar topics, keyword overlap without real relationship).
 * - Confidence guidance: < 0.5 means "omit entirely"; 0.5-0.7 = plausible
 *   but uncertain; >= 0.8 = high confidence.
 * - Format constraint repeated twice (system + user) to reduce markdown wrapping.
 *
 * Eval results (12-pair corpus, 2026-06-11): F1=83.3%, TP=5 FP=2 FN=0 TN=5
 *
 * Known false-positive patterns:
 *   (a) Thematic overlap without semantic specificity — e.g. two artifacts both
 *       discussing caching but at different levels of abstraction (tool selection
 *       vs eviction policy). Broad topic match is not enough.
 *   (b) Structural/pattern similarity in code without shared domain — e.g. two
 *       async fetch helpers with identical shape but operating on different
 *       resources. Code structure is not a link signal.
 *
 * Potential next prompt improvement: add explicit instruction "Do NOT link
 * artifacts that share only a broad topic or code pattern — links should reflect
 * that reading one would meaningfully inform understanding of the other."
 */
export function buildLinkingPrompt(
  sourceContent: string,
  candidates: Array<{ id: string; content: string }>
): string {
  const typeDescriptions = [
    'continuation — the candidate directly continues or follows on from the source (same thread, next step, follow-up)',
    'same-project — both belong to the same project, sprint, or initiative (explicit shared context, not just topic overlap)',
    'same-topic — both discuss the same specific subject in enough depth that a reader of one would benefit from the other',
    'references — the source explicitly mentions, cites, or depends on the candidate (or vice-versa)',
    'supersedes — the source replaces, updates, or obsoletes the candidate (or vice-versa)',
  ]

  return [
    'Source artifact:',
    JSON.stringify({ content: sourceContent }),
    '',
    'Candidate artifacts:',
    JSON.stringify(candidates.map(c => ({ id: c.id, content: c.content }))),
    '',
    'Link type definitions:',
    typeDescriptions.join('\n'),
    '',
    'Task: Identify meaningful links from the source to any candidates.',
    '',
    'Link ONLY when:',
    '- The relationship is clear and specific, not just superficially similar',
    '- A reader of the source would genuinely benefit from seeing the candidate',
    '',
    'Do NOT link when:',
    '- Content shares only broad keywords or general themes',
    '- The similarity is coincidental or trivial',
    '- You are uncertain — omit rather than guess',
    '',
    'Confidence guide: 0.5–0.69 = plausible, 0.70–0.89 = likely, 0.90+ = clear.',
    `Omit any link with confidence < ${CONFIDENCE_THRESHOLD}.`,
    '',
    'Respond ONLY with a JSON array, no markdown fences, no explanation:',
    '[{"targetId":"<id>","type":"<type>","confidence":<0..1>,"rationale":"<one sentence>"}]',
    'Return [] if no links qualify.',
  ].join('\n')
}

export function parseLinkingResponse(raw: string, validIds: Set<string>): ParsedLink[] {
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const links: ParsedLink[] = []
  for (const item of parsed as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') continue
    const { targetId, type, confidence } = item
    if (typeof targetId !== 'string' || !validIds.has(targetId)) continue
    if (typeof type !== 'string' || !(LINK_TYPES as readonly string[]).includes(type)) continue
    if (typeof confidence !== 'number' || confidence < CONFIDENCE_THRESHOLD) continue
    links.push({
      targetId,
      type: type as LinkType,
      confidence,
      rationale: typeof item.rationale === 'string' ? item.rationale : '',
    })
  }
  return links
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

  const prompt = buildLinkingPrompt(
    `[${target.type}] ${target.title ?? ''}\n${summarize(target.content)}`,
    candidates.map(c => ({ id: c.id, content: `[${c.type}] ${c.title ?? ''}\n${summarize(c.content)}` }))
  )

  const resp = await anthropic.messages.create({
    model: LINKING_MODEL,
    max_tokens: 1024,
    system:
      'You identify relationships between artifacts in a spatial knowledge canvas. Be precise — only link when the relationship is clear and meaningful. Respond only with valid JSON, no markdown.',
    messages: [{ role: 'user', content: prompt }],
  })

  const inputTokens = resp.usage?.input_tokens ?? 0
  const outputTokens = resp.usage?.output_tokens ?? 0

  const raw = resp.content[0]?.type === 'text' ? (resp.content[0].text ?? '') : ''
  const links = parseLinkingResponse(raw, new Set(candidates.map(c => c.id)))

  return { links, inputTokens, outputTokens }
}
