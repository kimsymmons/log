import { tagColor } from './tagColor'

/**
 * Persistent tag colour registry (`log-canvas-tags-v1`).
 *
 * Which tags sit on which card is NOT stored here — that lives in the card's
 * `tags` shape prop and persists through the node adapter. This registry only
 * remembers each label's stable colour so the same tag is the same hue across
 * every card, picker, and connection.
 */
export interface TagDef {
  id: string
  label: string
  icon: string
  color: string
}

interface TagState {
  defs: Record<string, TagDef>
}

export const TAGS_KEY = 'log-canvas-tags-v1'

// Sticky-palette names the Tag component tints; creation cycles through them.
const PALETTE = ['yellow', 'green', 'blue', 'purple', 'pink', 'gray'] as const

export function tagId(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '-')
}

// Keyword → lucide glyph. A tag never uses the literal "tag" icon; it picks a
// meaning-bearing glyph from its label, falling back to "hash".
const GLYPH_KEYWORDS: Array<[RegExp, string]> = [
  [/design|ux|ui|figma/, 'pen-line'],
  [/dev|code|eng|build/, 'code'],
  [/research|study|learn/, 'search'],
  [/idea|brainstorm/, 'lightbulb'],
  [/bug|fix|issue/, 'bug'],
  [/doc|spec|note|write/, 'file-text'],
  [/data|db|sql/, 'database'],
  [/api|server|infra|backend/, 'server'],
  [/security|auth|secret/, 'shield'],
  [/perf|speed|latency/, 'gauge'],
  [/test|qa|eval/, 'flask-conical'],
  [/ship|release|launch|deploy/, 'rocket'],
  [/q[1-4]|date|time|deadline|roadmap/, 'calendar'],
  [/team|people|user/, 'users'],
  [/money|cost|price|budget/, 'dollar-sign'],
]

/** A meaning-bearing glyph for a tag label, or "hash" as the neutral fallback. */
export function nameToGlyph(name: string): string {
  const n = name.trim().toLowerCase()
  for (const [re, icon] of GLYPH_KEYWORDS) {
    if (re.test(n)) return icon
  }
  return 'hash'
}

function read(storage: Storage): TagState {
  try {
    const raw = storage.getItem(TAGS_KEY)
    if (!raw) return { defs: {} }
    const parsed = JSON.parse(raw) as Partial<TagState>
    return { defs: parsed.defs ?? {} }
  } catch {
    return { defs: {} }
  }
}

function write(storage: Storage, state: TagState): void {
  storage.setItem(TAGS_KEY, JSON.stringify(state))
}

export function getTagDefs(storage: Storage = localStorage): TagDef[] {
  return Object.values(read(storage).defs)
}

/** Resolve a label to its persisted def, creating one (next colour in the
 *  cycle) if it does not exist yet. */
export function ensureTag(label: string, storage: Storage = localStorage): TagDef {
  const id = tagId(label)
  const state = read(storage)
  const existing = state.defs[id]
  if (existing) return existing
  const color = PALETTE[Object.keys(state.defs).length % PALETTE.length]
  const def: TagDef = { id, label: label.trim(), icon: nameToGlyph(label), color }
  state.defs[id] = def
  write(storage, state)
  return def
}

export function tagColorFor(label: string, storage: Storage = localStorage): string {
  return read(storage).defs[tagId(label)]?.color ?? tagColor(label)
}

/** The glyph for a tag — its persisted def icon, or one derived from the name. */
export function tagGlyphFor(label: string, storage: Storage = localStorage): string {
  return read(storage).defs[tagId(label)]?.icon ?? nameToGlyph(label)
}
