import React, { useState, useCallback, useMemo } from 'react'
import { HTMLContainer } from 'tldraw'

// ── Logical node-type filter keys ────────────────────────────────────────────
//
// These are the *logical* node types the filter bar exposes — distinct from
// tldraw shape `type` strings. The mapping between the two lives in
// `shapeLogicalType` below (e.g. a `chat-card` is either Project or Chat
// depending on its tags).

export type FilterKey =
  | 'project'
  | 'idea'
  | 'chat'
  | 'doc'
  | 'sketch'
  | 'agent'
  | 'skill'
  | 'mcp'
  | 'gem'

/** Order shown in the filter bar (after the leading "All" pill). */
export const FILTER_KEYS: FilterKey[] = [
  'project',
  'idea',
  'chat',
  'doc',
  'sketch',
  'agent',
  'skill',
  'mcp',
  'gem',
]

/** Minimal shape view the filter logic needs — keeps these pure & testable. */
export interface FilterShape {
  type: string
  props?: { tags?: string[] } & Record<string, unknown>
}

/**
 * Map a tldraw shape to its logical filter key, or null for shapes that aren't
 * filterable node types (frames, arrows, artifacts, …). A `chat-card` counts as
 * Project when tagged "project", otherwise Chat.
 */
export function shapeLogicalType(shape: FilterShape): FilterKey | null {
  if (shape.type === 'chat-card') {
    const tags = (shape.props?.tags ?? []) as string[]
    return tags.includes('project') ? 'project' : 'chat'
  }
  switch (shape.type) {
    case 'musing': return 'idea'
    case 'doc': return 'doc'
    case 'draw': return 'sketch'
    case 'agent-card': return 'agent'
    case 'skill': return 'skill'
    case 'mcp-server': return 'mcp'
    case 'gem': return 'gem'
    default: return null
  }
}

/**
 * A shape is dimmed when a filter is active and its logical type is not among
 * the active types. Shapes with no logical type (structural elements) never dim.
 */
export function isShapeDimmed(shape: FilterShape, activeTypes: Set<FilterKey>): boolean {
  if (activeTypes.size === 0) return false
  const lt = shapeLogicalType(shape)
  if (lt === null) return false
  return !activeTypes.has(lt)
}

/** Count shapes by logical type — drives the per-pill count badges. */
export function countByLogicalType(shapes: FilterShape[]): Record<FilterKey, number> {
  const counts = Object.fromEntries(FILTER_KEYS.map(k => [k, 0])) as Record<FilterKey, number>
  for (const shape of shapes) {
    const lt = shapeLogicalType(shape)
    if (lt !== null) counts[lt] += 1
  }
  return counts
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface FilterContextValue {
  activeTypes: Set<FilterKey>
  /** True when at least one type filter is active (i.e. not "All"). */
  filterActive: boolean
  /** Toggle a single type on/off. Toggling off the last type returns to "All". */
  toggleType: (key: FilterKey) => void
  /** Clear all type filters — back to showing everything ("All"). */
  clearTypes: () => void
}

const noop = () => {}

export const FilterContext = React.createContext<FilterContextValue>({
  activeTypes: new Set(),
  filterActive: false,
  toggleType: noop,
  clearTypes: noop,
})

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [activeTypes, setActiveTypes] = useState<Set<FilterKey>>(() => new Set())

  const toggleType = useCallback((key: FilterKey) => {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const clearTypes = useCallback(() => {
    setActiveTypes(prev => (prev.size === 0 ? prev : new Set()))
  }, [])

  const value = useMemo<FilterContextValue>(() => ({
    activeTypes,
    filterActive: activeTypes.size > 0,
    toggleType,
    clearTypes,
  }), [activeTypes, toggleType, clearTypes])

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilter(): FilterContextValue {
  return React.useContext(FilterContext)
}

/** Hook for shape components: tells whether *this* shape should be dimmed. */
export function useFilterActive(): { filterActive: boolean; isDimmed: (shape: FilterShape) => boolean } {
  const { activeTypes, filterActive } = useFilter()
  const isDimmed = useCallback(
    (shape: FilterShape) => isShapeDimmed(shape, activeTypes),
    [activeTypes],
  )
  return { filterActive, isDimmed }
}

// ── Dimming container for shape `component()` methods ──────────────────────────
//
// Wraps a shape's HTMLContainer so the outermost div dims (opacity 0.15, no
// pointer events) when a filter is active and this shape doesn't match it.

export function FilterDimContainer({
  shape,
  dataShapeType,
  children,
}: {
  shape: FilterShape
  dataShapeType?: string
  children: React.ReactNode
}) {
  const { filterActive, isDimmed } = useFilterActive()
  const dimmed = filterActive && isDimmed(shape)
  return (
    <HTMLContainer
      data-shape-type={dataShapeType}
      data-filter-dimmed={dimmed ? 'true' : undefined}
      style={dimmed ? { pointerEvents: 'none', opacity: 0.15 } : { pointerEvents: 'all' }}
    >
      {children}
    </HTMLContainer>
  )
}
