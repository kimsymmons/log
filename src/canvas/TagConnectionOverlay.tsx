import { useEditor, useValue, type Editor, type TLShape } from 'tldraw'
import { useTagFocus } from './TagFocusContext'
import { useFocus, nodeArtifactId } from './FocusContext'
import { tagColorFor } from './tagStore'

/** String tags on any shape (chat cards, skills, gems, …), or []. */
function shapeTags(s: TLShape): string[] {
  const t = (s.props as { tags?: unknown }).tags
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
}

interface ConnLine {
  key: string
  aId: string; bId: string
  x1: number; y1: number; x2: number; y2: number
  tags: string[]
  /** Structural (Thread↔Idea via sourceThreadId) links render dashed. */
  structural: boolean
}

interface Junction {
  key: string
  cx: number; cy: number
  tags: string[]
}

// Above this many tagged cards the all-pairs (O(n²)) sweep is more hairball
// than signal and would jank pan/zoom, so we draw nothing.
export const MAX_TAGGED_CARDS = 60

/**
 * The point on an axis-aligned rectangle's boundary along the ray from its
 * centre `(cx, cy)` (half-extents `hw, hh`) toward `(tx, ty)`. Used to anchor
 * connection lines at card edges instead of centres.
 */
export function rectEdgePoint(
  cx: number, cy: number, hw: number, hh: number, tx: number, ty: number,
): { x: number; y: number } {
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const t = 1 / Math.max(Math.abs(dx) / (hw || 1e-6), Math.abs(dy) / (hh || 1e-6))
  return { x: cx + dx * t, y: cy + dy * t }
}

const highlightColor = (tag: string) => `var(--sticky-${tagColorFor(tag)}-text)`

/**
 * All shared-tag connections + hub junctions for the current camera, in screen
 * space. Pure read over editor signals so it can run inside `useValue` and
 * recompute reactively on every camera, shape and tag change.
 */
function buildConnections(editor: Editor): { lines: ConnLine[]; junctions: Junction[] } {
  // Connections come from two sources on ANY node type: shared tags (solid) and
  // structural Thread↔Idea links via sourceThreadId (dashed).
  const cards = editor
    .getCurrentPageShapes()
    .map((s) => {
      const props = (s.props ?? {}) as { sourceThreadId?: unknown }
      return {
        shape: s,
        bounds: editor.getShapePageBounds(s),
        tags: shapeTags(s),
        artifactId: nodeArtifactId(s.id),
        sourceThreadId: typeof props.sourceThreadId === 'string' ? props.sourceThreadId : null,
      }
    })
    .filter((c) => c.bounds != null && (c.tags.length > 0 || c.sourceThreadId != null))

  if (cards.length > MAX_TAGGED_CARDS) return { lines: [], junctions: [] }

  const lines: ConnLine[] = []
  const degree = new Map<string, number>()
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i]
      const b = cards[j]
      const setA = new Set(a.tags.map((t) => t.toLowerCase()))
      const shared = b.tags.filter((t) => setA.has(t.toLowerCase()))
      const structural =
        (a.sourceThreadId != null && a.sourceThreadId === b.artifactId) ||
        (b.sourceThreadId != null && b.sourceThreadId === a.artifactId)
      if (shared.length === 0 && !structural) continue

      const ba = a.bounds!
      const bb = b.bounds!
      // Anchor at the card edges (segment ∩ rectangle), in page space.
      const aEdge = rectEdgePoint(ba.midX, ba.midY, ba.w / 2, ba.h / 2, bb.midX, bb.midY)
      const bEdge = rectEdgePoint(bb.midX, bb.midY, bb.w / 2, bb.h / 2, ba.midX, ba.midY)
      const p1 = editor.pageToScreen(aEdge)
      const p2 = editor.pageToScreen(bEdge)
      lines.push({ key: `${a.shape.id}__${b.shape.id}`, aId: a.shape.id, bId: b.shape.id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, tags: shared, structural })
      degree.set(a.shape.id, (degree.get(a.shape.id) ?? 0) + 1)
      degree.set(b.shape.id, (degree.get(b.shape.id) ?? 0) + 1)
    }
  }

  // Junction dots where 3+ lines meet (a hub card).
  const junctions: Junction[] = []
  for (const c of cards) {
    if ((degree.get(c.shape.id) ?? 0) < 3) continue
    const center = editor.pageToScreen({ x: c.bounds!.midX, y: c.bounds!.midY })
    junctions.push({ key: c.shape.id, cx: center.x, cy: center.y, tags: c.tags })
  }

  return { lines, junctions }
}

/**
 * Connections derive from shared tags — never hand-drawn, never stored. A line
 * joins every pair of nodes that share a tag, anchored at the node edges;
 * where three or more lines meet (a hub) a junction dot is drawn. Lines stay
 * quiet navy by default and light up in the hovered tag's own colour when that
 * tag's chip is hovered (focus follows tags).
 */
export function TagConnectionOverlay() {
  const editor = useEditor()
  const { hovered } = useTagFocus()
  const { focusActive, focusedNodeId, connectedIds } = useFocus()
  const { lines, junctions } = useValue('connections', () => buildConnections(editor), [editor])

  if (lines.length === 0) return null

  const isHot = (tags: string[]) => hovered != null && tags.some((t) => t.toLowerCase() === hovered.toLowerCase())
  // In focus mode, only edges touching the focused node stay visible.
  const lineFocusDimmed = (aId: string, bId: string) => focusActive && aId !== focusedNodeId && bId !== focusedNodeId
  const nodeFocusDimmed = (id: string) => focusActive && id !== focusedNodeId && !connectedIds.has(id)

  return (
    <svg data-testid="connection-lines" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%', overflow: 'visible' }}>
      {lines.map(({ key, aId, bId, x1, y1, x2, y2, tags, structural }) => {
        const hot = isHot(tags)
        const dim = lineFocusDimmed(aId, bId)
        return (
          <line
            key={key}
            x1={x1} y1={y1} x2={x2} y2={y2}
            style={{
              stroke: hot ? highlightColor(hovered!) : 'var(--connection)',
              transition: 'stroke var(--duration) var(--ease-mech), stroke-opacity var(--duration) var(--ease-mech)',
            }}
            strokeWidth={hot ? 2.5 : 1.25}
            strokeOpacity={dim ? 0.06 : hot ? 1 : 0.9}
            strokeLinecap={structural ? 'butt' : 'round'}
            strokeDasharray={structural ? '5 5' : undefined}
          />
        )
      })}
      {junctions.map(({ key, cx, cy, tags }) => {
        const hot = isHot(tags)
        const dim = nodeFocusDimmed(key)
        return (
          <circle
            key={`j-${key}`}
            cx={cx}
            cy={cy}
            r={hot ? 4 : 3}
            style={{ fill: hot ? highlightColor(hovered!) : 'var(--connection)', transition: 'fill var(--duration) var(--ease-mech), fill-opacity var(--duration) var(--ease-mech)' }}
            fillOpacity={dim ? 0.06 : hot ? 1 : 0.9}
          />
        )
      })}
    </svg>
  )
}
