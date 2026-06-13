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
  const def: TagDef = { id, label: label.trim(), icon: 'tag', color }
  state.defs[id] = def
  write(storage, state)
  return def
}

export function tagColorFor(label: string, storage: Storage = localStorage): string {
  return read(storage).defs[tagId(label)]?.color ?? tagColor(label)
}
