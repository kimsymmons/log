/**
 * Deterministic auto-tagging for thread cards (no LLM). Extracts the most
 * salient content words from a chat's title + opening lines and normalises
 * them to kebab-case tags. Runs once per artifact (cached in tagStore).
 */

// Common English stop words + chat filler we never want as tags.
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'your', 'with', 'this', 'that',
  'have', 'has', 'had', 'was', 'were', 'will', 'would', 'should', 'could', 'can',
  'about', 'into', 'from', 'they', 'them', 'their', 'there', 'here', 'what', 'when',
  'which', 'who', 'whom', 'how', 'why', 'all', 'any', 'some', 'one', 'two', 'out',
  'get', 'got', 'let', 'lets', 'its', "it's", 'our', 'his', 'her', 'she', 'him',
  'too', 'now', 'then', 'than', 'also', 'just', 'more', 'most', 'much', 'very',
  'over', 'under', 'only', 'own', 'same', 'such', 'each', 'few', 'both', 'between',
  'because', 'while', 'before', 'after', 'again', 'once', 'yes', 'yeah', 'okay',
  'ok', 'sure', 'maybe', 'like', 'want', 'need', 'make', 'made', 'use', 'used',
  'going', 'gonna', 'really', 'thing', 'things', 'something', 'anything', 'nothing',
  'lot', 'bit', 'way', 'ways', 'work', 'works', 'help', 'know', 'think', 'see',
])

/** kebab-case a single token: lowercase, non-alphanumerics → hyphens, trimmed. */
function kebab(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * The first two sentences of `text`, whitespace-collapsed. Used for the card
 * body when there's no meaningful summary.
 */
export function firstTwoSentences(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean) return ''
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean]
  return sentences.slice(0, 2).map((s) => s.trim()).join(' ').trim()
}

/**
 * Up to `max` kebab-case tags — the most frequent content words in `text`,
 * stop words and short tokens removed. Deterministic: ties break by first
 * appearance, so the same input always yields the same tags.
 */
export function extractTags(text: string, max = 4): string[] {
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9'-]*/g) ?? []
  const freq = new Map<string, { count: number; order: number }>()
  let order = 0
  for (const raw of tokens) {
    const word = raw.replace(/^['-]+|['-]+$/g, '')
    if (word.length < 3) continue
    if (STOP_WORDS.has(word)) continue
    const existing = freq.get(word)
    if (existing) existing.count++
    else freq.set(word, { count: 1, order: order++ })
  }
  return [...freq.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].order - b[1].order)
    .slice(0, max)
    .map(([w]) => kebab(w))
    .filter(Boolean)
}
