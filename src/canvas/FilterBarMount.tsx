import { useState, useEffect } from 'react'
import { useEditor } from 'tldraw'
import { CanvasFilterBar } from '../design-system'
import { useFilter, countByLogicalType, type FilterKey, type FilterShape } from './FilterContext'

/**
 * Mounted in tldraw's `TopPanel` slot. Bridges the live editor (per-type counts,
 * reactive on add/remove) and the FilterContext (active types) into the
 * presentational CanvasFilterBar.
 */
export function FilterBarMount() {
  const editor = useEditor()
  const { activeTypes, toggleType, clearTypes } = useFilter()
  const [counts, setCounts] = useState<Record<FilterKey, number>>(() =>
    countByLogicalType(editor.getCurrentPageShapes() as FilterShape[]),
  )

  useEffect(() => {
    const recompute = () =>
      setCounts(countByLogicalType(editor.getCurrentPageShapes() as FilterShape[]))
    recompute()
    return editor.store.listen(recompute, { scope: 'document' })
  }, [editor])

  return (
    <CanvasFilterBar
      active={[...activeTypes]}
      counts={counts}
      onToggle={(key) => toggleType(key as FilterKey)}
      onClear={clearTypes}
      style={{ marginTop: 8 }}
    />
  )
}
