import React from 'react'
import { Icon } from './Icon'
import { typeGlyphMeta } from './TypeGlyph'

/**
 * Pill keys & order — the five canonical card types per the design spec.
 * Agent/Skill/MCP/Gem shapes still render and still dim under an active
 * filter (see FilterContext.shapeLogicalType); they're just not offered as
 * filter pills here.
 */
export const FILTER_PILLS: Array<{ key: string; label: string }> = [
  { key: 'project', label: 'Project' },
  { key: 'idea', label: 'Idea' },
  { key: 'thread', label: 'Thread' },
  { key: 'doc', label: 'Doc' },
  { key: 'sketch', label: 'Sketch' },
]

interface CanvasFilterBarProps {
  /** Active type keys. Empty = "All". */
  active?: string[]
  onToggle?: (key: string) => void
  onClear?: () => void
  style?: React.CSSProperties
}

const pillBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 28, padding: '0 11px', border: 'none', borderRadius: 'var(--radius-pill)',
  fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)',
  whiteSpace: 'nowrap', cursor: 'pointer', background: 'transparent', color: 'var(--text-3)',
  transition: 'background var(--duration) var(--ease-mech), color var(--duration) var(--ease-mech), box-shadow var(--duration) var(--ease-mech)',
}

// Selected = a dark "pressed" inset (darker than the bar), subtle hairline +
// inset shadow. NO accent fill — the accent only ever shows on the type glyph.
function pillStyle(selected: boolean): React.CSSProperties {
  if (!selected) return pillBase
  return {
    ...pillBase,
    background: 'var(--bg-app)',
    color: 'var(--text-1)',
    boxShadow: 'var(--shadow-inset), inset 0 0 0 1px var(--border-1)',
  }
}

export function CanvasFilterBar({ active = [], onToggle, onClear, style }: CanvasFilterBarProps) {
  const allActive = active.length === 0

  return (
    <div
      role="toolbar"
      aria-label="Filter node types"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: 5,
        background: 'var(--bg-raised)', border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-4)', boxShadow: 'var(--shadow-floating)',
        pointerEvents: 'all',
        ...style,
      }}
    >
      <button
        type="button"
        aria-pressed={allActive}
        onClick={onClear}
        style={{ ...pillStyle(allActive), padding: '0 12px' }}
      >
        All
      </button>
      <span style={{ width: 1, height: 16, background: 'var(--border-1)', flexShrink: 0, margin: '0 2px' }} />
      {FILTER_PILLS.map(({ key, label }) => {
        const selected = active.includes(key)
        const meta = typeGlyphMeta[key] ?? typeGlyphMeta.project
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle?.(key)}
            style={pillStyle(selected)}
          >
            {/* glyph keeps its natural type colour when selected, greys out when not */}
            <Icon name={meta.icon} size={14} color={selected ? meta.color : 'var(--text-3)'} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
