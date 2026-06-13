import { useEffect, useState } from 'react'
import { useEditor } from 'tldraw'
import type { ChatCardShape } from '../shapes/ChatCard'
import { useTagFocus } from './TagFocusContext'

interface ConnLine {
  key: string
  x1: number; y1: number; x2: number; y2: number
  tags: string[]
}

/**
 * Connections derive from shared tags — never hand-drawn, never stored. For
 * every pair of cards that share at least one tag a single thin line is drawn,
 * recomputed live as cards move or tags change. Hovering a tag chip lights up
 * just that tag's network (accent, thicker); otherwise lines stay quiet navy.
 */
export function TagConnectionOverlay() {
  const editor = useEditor()
  const { hovered } = useTagFocus()
  const [lines, setLines] = useState<ConnLine[]>([])

  useEffect(() => {
    const compute = () => {
      const cards = editor
        .getCurrentPageShapes()
        .filter((s): s is ChatCardShape => s.type === 'chat-card')
        .map((s) => ({ shape: s, tags: (s.props.tags ?? []).filter(Boolean) }))
        .filter((c) => c.tags.length > 0)

      const next: ConnLine[] = []
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i]
          const b = cards[j]
          const setA = new Set(a.tags.map((t) => t.toLowerCase()))
          const shared = b.tags.filter((t) => setA.has(t.toLowerCase()))
          if (shared.length === 0) continue

          const ba = editor.getShapePageBounds(a.shape)
          const bb = editor.getShapePageBounds(b.shape)
          if (!ba || !bb) continue
          const p1 = editor.pageToScreen({ x: ba.midX, y: ba.midY })
          const p2 = editor.pageToScreen({ x: bb.midX, y: bb.midY })
          next.push({ key: `${a.shape.id}__${b.shape.id}`, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, tags: shared })
        }
      }
      setLines(next)
    }

    compute()
    return editor.store.listen(compute)
  }, [editor])

  if (lines.length === 0) return null

  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%', overflow: 'visible' }}>
      {lines.map(({ key, x1, y1, x2, y2, tags }) => {
        const highlight = hovered != null && tags.some((t) => t.toLowerCase() === hovered.toLowerCase())
        return (
          <line
            key={key}
            x1={x1} y1={y1} x2={x2} y2={y2}
            style={{
              stroke: highlight ? 'var(--connection-active)' : 'var(--connection)',
              transition: 'stroke var(--duration) var(--ease-mech)',
            }}
            strokeWidth={highlight ? 2.5 : 1.25}
            strokeOpacity={highlight ? 1 : 0.9}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}
