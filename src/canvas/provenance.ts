// Provenance links (PEO-155): a chat-card spawned via "Chat about this →" stores
// the originating shape's id in props.linkedShapeId. This pure helper resolves
// which (source → chat) pairs should be drawn, given the current page shapes.
// Kept separate from the overlay so the selection logic is unit-testable without
// a live tldraw editor.

export interface ProvenanceShapeView {
  id: string
  type: string
  /** `object` (not `Record`) so a tldraw `TLShape` is directly assignable. */
  props?: object
}

export interface ProvenancePair {
  chatId: string
  sourceId: string
}

/**
 * For every chat-card carrying a `linkedShapeId` that points at another shape
 * still on the page, return the (source → chat) pair. Self-links and links to
 * absent shapes (e.g. a source that wasn't persisted across reload) are skipped.
 */
export function provenancePairs(shapes: ProvenanceShapeView[]): ProvenancePair[] {
  const ids = new Set(shapes.map((s) => s.id))
  const pairs: ProvenancePair[] = []
  for (const s of shapes) {
    if (s.type !== 'chat-card') continue
    const sourceId = (s.props as { linkedShapeId?: unknown } | undefined)?.linkedShapeId
    if (typeof sourceId !== 'string' || sourceId === '') continue
    if (sourceId === s.id) continue
    if (!ids.has(sourceId)) continue
    pairs.push({ chatId: s.id, sourceId })
  }
  return pairs
}
