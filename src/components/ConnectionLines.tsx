import React from 'react'
import { useEditor, useValue, type Editor, type TLShape } from 'tldraw'

// ── PEO-152: connection lines between nodes that share tags ──────────────────
//
// Rendered as a single SVG overlay inside tldraw's `InFrontOfTheCanvas`. Every
// pair of shapes that share at least one tag is joined by a straight line with a
// dot anchor at its midpoint. Lines are subtle indigo by default and light up in
// the tag's colour when either endpoint is hovered or selected.

/** Default line/dot colour — indigo, matching the design-system accent. */
export const DEFAULT_COLOR = 'var(--accent)'

/**
 * Type-identity palette from `src/design-system/tokens.css`. Tags are arbitrary
 * strings, so we map each tag deterministically onto one of these colours.
 */
export const TAG_PALETTE = [
  'var(--type-project)',
  'var(--type-idea)',
  'var(--type-thread)',
  'var(--type-doc)',
  'var(--type-sketch)',
] as const

/** Deterministic tag → palette colour. Same tag always yields the same colour. */
export function tagColor(tag: string): string {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % TAG_PALETTE.length
  return TAG_PALETTE[idx]
}

/** Minimal shape view used by the pure connection logic. */
export interface TaggedNode {
  id: string
  tags: string[]
}

/** A connection between two tagged nodes that share at least one tag. */
export interface Connection {
  key: string
  aId: string
  bId: string
  /** Tags both nodes have, in `a`'s order. */
  sharedTags: string[]
  /** Colour of the first shared tag — used when the connection is highlighted. */
  color: string
}

/** Tags present on both nodes, preserving `a`'s ordering. */
export function sharedTags(a: TaggedNode, b: TaggedNode): string[] {
  const bSet = new Set(b.tags)
  return a.tags.filter((t) => bSet.has(t))
}

/**
 * Every unique pair of nodes that shares at least one tag. The first shared tag
 * (in the lower-id node's order) determines the highlight colour.
 */
export function computeConnections(nodes: TaggedNode[]): Connection[] {
  const tagged = nodes.filter((n) => n.tags.length > 0)
  const out: Connection[] = []
  for (let i = 0; i < tagged.length; i++) {
    for (let j = i + 1; j < tagged.length; j++) {
      const a = tagged[i]
      const b = tagged[j]
      const shared = sharedTags(a, b)
      if (shared.length === 0) continue
      out.push({
        key: `${a.id}__${b.id}`,
        aId: a.id,
        bId: b.id,
        sharedTags: shared,
        color: tagColor(shared[0]),
      })
    }
  }
  return out
}

/** A connection is highlighted when either endpoint is hovered or selected. */
export function isHighlighted(conn: Connection, highlightedIds: Set<string>): boolean {
  return highlightedIds.has(conn.aId) || highlightedIds.has(conn.bId)
}

function getTags(shape: TLShape): string[] {
  const tags = (shape.props as { tags?: unknown }).tags
  return Array.isArray(tags) ? (tags.filter((t) => typeof t === 'string') as string[]) : []
}

interface RenderedLine {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  midX: number
  midY: number
  highlighted: boolean
  color: string
}

/** Build the screen-space lines for the current editor state. */
function buildLines(editor: Editor): RenderedLine[] {
  const shapes = editor.getCurrentPageShapes()
  const nodes: TaggedNode[] = shapes.map((s) => ({ id: s.id, tags: getTags(s) }))
  const connections = computeConnections(nodes)
  if (connections.length === 0) return []

  const highlightedIds = new Set<string>(editor.getSelectedShapeIds())
  const hovered = editor.getHoveredShapeId()
  if (hovered) highlightedIds.add(hovered)

  const boundsById = new Map(shapes.map((s) => [s.id, editor.getShapePageBounds(s)]))

  const lines: RenderedLine[] = []
  for (const conn of connections) {
    const a = boundsById.get(conn.aId as TLShape['id'])
    const b = boundsById.get(conn.bId as TLShape['id'])
    if (!a || !b) continue

    const p1 = editor.pageToScreen({ x: a.midX, y: a.midY })
    const p2 = editor.pageToScreen({ x: b.midX, y: b.midY })
    lines.push({
      key: conn.key,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      midX: (p1.x + p2.x) / 2,
      midY: (p1.y + p2.y) / 2,
      highlighted: isHighlighted(conn, highlightedIds),
      color: conn.color,
    })
  }
  return lines
}

export function ConnectionLines() {
  const editor = useEditor()

  // Recompute reactively: useValue tracks the camera, shape, hover and selection
  // signals it reads, so the overlay re-renders on pan, zoom, edit and hover.
  const lines = useValue('connection-lines', () => buildLines(editor), [editor])

  if (lines.length === 0) return null

  return (
    <svg
      data-testid="connection-lines"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      {lines.map((l) => {
        const color = l.highlighted ? l.color : DEFAULT_COLOR
        return (
          <g key={l.key} data-highlighted={l.highlighted ? 'true' : 'false'}>
            <line
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={color}
              strokeWidth={l.highlighted ? 2 : 1}
              strokeOpacity={l.highlighted ? 1 : 0.3}
              strokeLinecap="round"
            />
            <circle
              cx={l.midX}
              cy={l.midY}
              r={4}
              fill={color}
              fillOpacity={l.highlighted ? 1 : 0.3}
            />
          </g>
        )
      })}
    </svg>
  )
}
