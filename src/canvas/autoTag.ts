/**
 * Deterministic auto-tagging fallback for cards (no LLM). The haiku extractor
 * is the primary, semantic tagger; this runs when extraction hasn't (yet)
 * produced tags. Tag format rules (shared with the extractor prompt):
 *   single words · lowercase · singular · no contractions · no hyphenated fragments.
 */

// Common English stop words + chat filler + generic action verbs we never want
// as tags, plus contraction remnants left after a letters-only tokenise
// (e.g. "isn't" → "isn"/"t", "I'm" → "i"/"m").
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'your', 'with', 'this', 'that',
  'have', 'has', 'had', 'was', 'were', 'will', 'would', 'should', 'could', 'can',
  'about', 'into', 'from', 'they', 'them', 'their', 'there', 'here', 'what', 'when',
  'which', 'who', 'whom', 'how', 'why', 'all', 'any', 'some', 'one', 'two', 'out',
  'get', 'got', 'let', 'its', 'our', 'his', 'her', 'she', 'him',
  'too', 'now', 'then', 'than', 'also', 'just', 'more', 'most', 'much', 'very',
  'over', 'under', 'only', 'own', 'same', 'such', 'each', 'few', 'both', 'between',
  'because', 'while', 'before', 'after', 'again', 'once', 'yes', 'yeah', 'okay',
  'sure', 'maybe', 'like', 'want', 'need', 'make', 'made', 'use', 'using',
  'going', 'really', 'thing', 'something', 'anything', 'nothing',
  'way', 'work', 'help', 'know', 'think', 'see',
  // contraction remnants (letters-only tokeniser splits on ' and -)
  'isn', 'arent', 'aren', 'wasn', 'weren', 'don', 'doesn', 'didn', 'wont',
  'cant', 'couldn', 'wouldn', 'shouldn', 'hasn', 'haven', 'hadn', 'ain', 'ive',
  // generic gerunds / fillers that aren't semantic signal
  'stop', 'concept', 'actually', 'trying', 'planning', 'looking', 'building',
  'designing', 'automating', 'troubleshooting', 'understanding', 'good', 'best',
  'better', 'first', 'next', 'able', 'around', 'still', 'every', 'day',
])

/**
 * Crude singulariser: "rates" → "rate", "episodes" → "episode",
 * "stories" → "story". Leaves short words and -ss/-us/-is endings alone.
 */
function singularize(w: string): string {
  if (w.length <= 4) return w
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  // Leave non-plural -s words alone (canvas, status, analysis, atlas, chaos).
  if (/(ss|us|is|os|as)$/.test(w)) return w
  if (w.endsWith('s')) return w.slice(0, -1)
  return w
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
 * Up to `max` single-word, lowercase, singular tags — the most frequent
 * content words in `text`. The letters-only tokeniser guarantees no
 * contractions ("i-m") or hyphenated fragments ("auto-process") survive.
 * Deterministic: ties break by first appearance.
 */
export function extractTags(text: string, max = 4): string[] {
  // Letters only — drops digits, apostrophes and hyphens, so no fragments.
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? []
  const freq = new Map<string, { count: number; order: number }>()
  let order = 0
  for (const raw of tokens) {
    if (raw.length < 3 || STOP_WORDS.has(raw)) continue
    const word = singularize(raw)
    if (word.length < 3 || STOP_WORDS.has(word)) continue
    const existing = freq.get(word)
    if (existing) existing.count++
    else freq.set(word, { count: 1, order: order++ })
  }
  return [...freq.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].order - b[1].order)
    .slice(0, max)
    .map(([w]) => w)
}

/** Normalise an arbitrary tag (e.g. from the LLM) to the canonical format. */
export function normalizeTag(raw: string): string {
  const word = (raw.toLowerCase().match(/[a-z]+/g) ?? [])[0] ?? ''
  return word.length >= 3 ? singularize(word) : ''
}
