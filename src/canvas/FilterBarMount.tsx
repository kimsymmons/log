import { CanvasFilterBar } from '../design-system'
import { useFilter, type FilterKey } from './FilterContext'

/**
 * Mounted in tldraw's `TopPanel` slot. Bridges the FilterContext (active types)
 * into the presentational CanvasFilterBar.
 */
export function FilterBarMount() {
  const { activeTypes, toggleType, clearTypes } = useFilter()

  return (
    <CanvasFilterBar
      active={[...activeTypes]}
      onToggle={(key) => toggleType(key as FilterKey)}
      onClear={clearTypes}
      style={{ marginTop: 8 }}
    />
  )
}
