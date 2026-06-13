import React from 'react'
import { Button } from './Button'
import { TypeGlyph, typeGlyphMeta } from './TypeGlyph'

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
      <Button
        variant={allActive ? 'primary' : 'ghost'}
        size="sm"
        ariaPressed={allActive}
        onClick={onClear}
      >
        All
      </Button>
      <span style={{ width: 1, height: 16, background: 'var(--border-1)', flexShrink: 0, margin: '0 2px' }} />
      {FILTER_PILLS.map(({ key, label }) => {
        const selected = active.includes(key)
        return (
          <Button
            key={key}
            variant={selected ? 'primary' : 'ghost'}
            size="sm"
            ariaPressed={selected}
            onClick={() => onToggle?.(key)}
          >
            <TypeGlyph type={typeGlyphMeta[key] ? key : 'project'} size={14} />
            {label}
          </Button>
        )
      })}
    </div>
  )
}
