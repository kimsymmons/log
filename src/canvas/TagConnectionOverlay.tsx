import { useEffect, useState } from 'react'
import { useEditor } from 'tldraw'
import type { ChatCardShape } from '../shapes/ChatCard'
import { useTagFocus } from './TagFocusContext'
import { tagColorFor } from './tagStore'

interface ConnLine {
  key: string
  x1: number; y1: number; x2: number; y2: number
  tags: string[]
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
 * Connections derive from shared tags — never hand-drawn, never stored. A line
 * joins every pair of cards that share a tag, anchored at the card edges;
 * where three or more lines meet (a hub card) a junction dot is drawn. Lines
 * stay quiet navy by default and light up in the hovered tag's own colour when
 * that tag's chip is hovered (focus follows tags).
 */
export function TagConnectionOverlay() {
  const editor = useEditor()
  const { hovered } = useTagFocus()
  const [lines, setLines] = useState<ConnLine[]>([])
  const [junctions, setJunctions] = useState<Junction[]>([])

  useEffect(() => {
    const compute = () => {
      const cards = editor
        .getCurrentPageShapes()
        .filter((s): s is ChatCardShape => s.type === 'chat-card')
        .map((s) => ({ shape: s, bounds: editor.getShapePageBounds(s), tags: (s.props.tags ?? []).filter(Boolean) }))
        .filter((c) => c.tags.length > 0 && c.bounds != null)

      if (cards.length > MAX_TAGGED_CARDS) {
        setLines([])
        setJunctions([])
        return
      }

      const nextLines: ConnLine[] = []
      const degree = new Map<string, number>()
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i]
          const b = cards[j]
          const setA = new Set(a.tags.map((t) => t.toLowerCase()))
          const shared = b.tags.filter((t) => setA.has(t.toLowerCase()))
          if (shared.length === 0) continue

          const ba = a.bounds!
          const bb = b.bounds!
          // Anchor at the card edges (segment ∩ rectangle), in page space.
          const aEdge = rectEdgePoint(ba.midX, ba.midY, ba.w / 2, ba.h / 2, bb.midX, bb.midY)
          const bEdge = rectEdgePoint(bb.midX, bb.midY, bb.w / 2, bb.h / 2, ba.midX, ba.midY)
          const p1 = editor.pageToScreen(aEdge)
          const p2 = editor.pageToScreen(bEdge)
          nextLines.push({ key: `${a.shape.id}__${b.shape.id}`, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, tags: shared })
          degree.set(a.shape.id, (degree.get(a.shape.id) ?? 0) + 1)
          degree.set(b.shape.id, (degree.get(b.shape.id) ?? 0) + 1)
        }
      }

      // Junction dots where 3+ lines meet (a hub card).
      const nextJunctions: Junction[] = []
      for (const c of cards) {
        if ((degree.get(c.shape.id) ?? 0) < 3) continue
        const center = editor.pageToScreen({ x: c.bounds!.midX, y: c.bounds!.midY })
        nextJunctions.push({ key: c.shape.id, cx: center.x, cy: center.y, tags: c.tags })
      }

      setLines(nextLines)
      setJunctions(nextJunctions)
    }

    compute()
    return editor.store.listen(compute)
  }, [editor])

  if (lines.length === 0) return null

  const isHot = (tags: string[]) => hovered != null && tags.some((t) => t.toLowerCase() === hovered.toLowerCase())

  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%', overflow: 'visible' }}>
      {lines.map(({ key, x1, y1, x2, y2, tags }) => {
        const hot = isHot(tags)
        return (
          <line
            key={key}
            x1={x1} y1={y1} x2={x2} y2={y2}
            style={{
              stroke: hot ? highlightColor(hovered!) : 'var(--connection)',
              transition: 'stroke var(--duration) var(--ease-mech)',
            }}
            strokeWidth={hot ? 2.5 : 1.25}
            strokeOpacity={hot ? 1 : 0.9}
            strokeLinecap="round"
          />
        )
      })}
      {junctions.map(({ key, cx, cy, tags }) => {
        const hot = isHot(tags)
        return (
          <circle
            key={`j-${key}`}
            cx={cx}
            cy={cy}
            r={hot ? 4 : 3}
            style={{ fill: hot ? highlightColor(hovered!) : 'var(--connection)', transition: 'fill var(--duration) var(--ease-mech)' }}
            fillOpacity={hot ? 1 : 0.9}
          />
        )
      })}
    </svg>
  )
}
