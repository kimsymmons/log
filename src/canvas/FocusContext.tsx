import React, { useState, useCallback, useMemo } from 'react'
import { type Editor } from 'tldraw'
import { Icon } from '../design-system/Icon'

/** The live editor via the window global — avoids the useEditor() hook so the
 *  orbit button can be unit-tested outside a <Tldraw /> context. */
function getEditor(): Editor | null {
  return (window as typeof window & { __tldrawEditor?: Editor }).__tldrawEditor ?? null
}

// ── Focus / orbit mode ────────────────────────────────────────────────────────
//
// PEO-158. Tapping a card's orbit (planet) icon focuses that node: the focused
// card and its directly connected cards stay at full opacity; everything else
// dims. Cards never move. "Connected" = tag-derived connections (a shared tag)
// ∪ structural links (Thread ↔ Idea via `sourceThreadId`). The structural half
// is coded but dormant until Idea nodes land — no shape carries `sourceThreadId`
// yet, so today connectivity is tag-derived.

/** Minimal node view the connectivity logic needs — pure & testable. */
export interface FocusNode {
  id: string
  tags: string[]
  /** Artifact id parsed from the shape id (for structural matching). */
  artifactId: string | null
  /** Idea→Thread structural link, when present (dormant until Idea nodes exist). */
  sourceThreadId: string | null
}

/** Artifact id embedded in a node shape id, e.g. `shape:thread-<id>` → `<id>`. */
export function nodeArtifactId(shapeId: string): string | null {
  const m = /^shape:(?:thread|project|idea|doc)-(.+)$/.exec(shapeId)
  return m ? m[1] : null
}

/**
 * Ids of every node directly connected to `focusedId`:
 *   - tag-derived: shares at least one (case-insensitive) tag, or
 *   - structural: Thread ↔ Idea via `sourceThreadId` (either direction).
 * The focused id itself is not included.
 */
export function computeConnectedIds(nodes: FocusNode[], focusedId: string): Set<string> {
  const focused = nodes.find((n) => n.id === focusedId)
  if (!focused) return new Set()
  const focusedTags = new Set(focused.tags.map((t) => t.toLowerCase()))
  const connected = new Set<string>()
  for (const n of nodes) {
    if (n.id === focusedId) continue
    const sharesTag = n.tags.some((t) => focusedTags.has(t.toLowerCase()))
    const structural =
      (n.sourceThreadId != null && n.sourceThreadId === focused.artifactId) ||
      (focused.sourceThreadId != null && focused.sourceThreadId === n.artifactId)
    if (sharesTag || structural) connected.add(n.id)
  }
  return connected
}

/** A node is focus-dimmed when focus is active and it's neither the focused node nor connected. */
export function isFocusDimmed(id: string, focusedNodeId: string | null, connectedIds: ReadonlySet<string>): boolean {
  if (focusedNodeId === null) return false
  if (id === focusedNodeId) return false
  return !connectedIds.has(id)
}

/** Build the connectivity node list from the live editor (any tagged shape). */
export function focusNodesFromEditor(editor: Editor): FocusNode[] {
  return editor.getCurrentPageShapes().map((s) => {
    const props = (s.props ?? {}) as { tags?: unknown; sourceThreadId?: unknown }
    const tags = Array.isArray(props.tags) ? props.tags.filter((t): t is string => typeof t === 'string') : []
    return {
      id: s.id,
      tags,
      artifactId: nodeArtifactId(s.id),
      sourceThreadId: typeof props.sourceThreadId === 'string' ? props.sourceThreadId : null,
    }
  })
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface FocusContextValue {
  focusedNodeId: string | null
  connectedIds: ReadonlySet<string>
  focusActive: boolean
  /** Focus a node (or toggle it off if already focused), with its connected set. */
  toggleFocus: (nodeId: string, connectedIds: Set<string>) => void
  clearFocus: () => void
}

const EMPTY: ReadonlySet<string> = new Set()
const noop = () => {}

export const FocusContext = React.createContext<FocusContextValue>({
  focusedNodeId: null,
  connectedIds: EMPTY,
  focusActive: false,
  toggleFocus: noop,
  clearFocus: noop,
})

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ id: string | null; connected: ReadonlySet<string> }>({ id: null, connected: EMPTY })

  const toggleFocus = useCallback((nodeId: string, connectedIds: Set<string>) => {
    setState((prev) => (prev.id === nodeId ? { id: null, connected: EMPTY } : { id: nodeId, connected: connectedIds }))
  }, [])

  const clearFocus = useCallback(() => {
    setState((prev) => (prev.id === null ? prev : { id: null, connected: EMPTY }))
  }, [])

  const value = useMemo<FocusContextValue>(() => ({
    focusedNodeId: state.id,
    connectedIds: state.connected,
    focusActive: state.id !== null,
    toggleFocus,
    clearFocus,
  }), [state, toggleFocus, clearFocus])

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
}

export function useFocus(): FocusContextValue {
  return React.useContext(FocusContext)
}

// ── Orbit button ──────────────────────────────────────────────────────────────
//
// The always-visible planet icon in a card's top-right corner. Tapping it
// focuses the node (or exits if already focused).

export function FocusOrbitButton({ shapeId }: { shapeId: string }) {
  const { focusedNodeId, toggleFocus } = useFocus()
  const isFocused = focusedNodeId === shapeId
  return (
    <button
      type="button"
      aria-label={isFocused ? 'Exit focus' : 'Focus connected cards'}
      aria-pressed={isFocused}
      title="Focus connected"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        const editor = getEditor()
        if (!editor) return
        const connected = computeConnectedIds(focusNodesFromEditor(editor), shapeId)
        toggleFocus(shapeId, connected)
      }}
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, padding: 0, border: 'none', borderRadius: 'var(--radius-2)',
        background: isFocused ? 'var(--accent-muted)' : 'transparent', cursor: 'pointer',
        transition: 'background var(--duration) var(--ease-mech), color var(--duration) var(--ease-mech)',
      }}
    >
      <Icon name="orbit" size={15} color={isFocused ? 'var(--accent-text)' : 'var(--text-3)'} />
    </button>
  )
}
