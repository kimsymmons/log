import React from 'react'
import { TypeGlyph, typeGlyphMeta } from './TypeGlyph'

/** Pill keys & order, matching the logical FilterKey set in FilterContext. */
export const FILTER_PILLS: Array<{ key: string; label: string }> = [
  { key: 'project', label: 'Project' },
  { key: 'idea', label: 'Idea' },
  { key: 'chat', label: 'Chat' },
  { key: 'doc', label: 'Doc' },
  { key: 'sketch', label: 'Sketch' },
  { key: 'agent', label: 'Agent' },
  { key: 'skill', label: 'Skill' },
  { key: 'mcp', label: 'MCP' },
  { key: 'gem', label: 'Gem' },
]

interface CanvasFilterBarProps {
  /** Active type keys. Empty = "All". */
  active?: string[]
  /** Per-type counts, keyed by pill key. */
  counts?: Record<string, number>
  onToggle?: (key: string) => void
  onClear?: () => void
  style?: React.CSSProperties
}

export function CanvasFilterBar({ active = [], counts, onToggle, onClear, style }: CanvasFilterBarProps) {
  const allActive = active.length === 0

  const pill = (selected: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    height: 28, padding: '0 11px',
    borderRadius: 'var(--radius-pill)', border: 'none',
    background: selected ? 'var(--accent)' : 'var(--bg-raised)',
    color: selected ? 'var(--text-on-accent)' : 'var(--text-2)',
    fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'background var(--duration) var(--ease-mech), color var(--duration) var(--ease-mech)',
  })

  return (
    <div
      role="toolbar"
      aria-label="Filter node types"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: 5,
        background: 'var(--bg-overlay)', border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-4)', boxShadow: 'var(--shadow-floating)',
        pointerEvents: 'all',
        ...style,
      }}
    >
      <button type="button" aria-pressed={allActive} onClick={onClear} style={pill(allActive)}>
        All
      </button>
      <span style={{ width: 1, height: 16, background: 'var(--border-1)', flexShrink: 0, margin: '0 2px' }} />
      {FILTER_PILLS.map(({ key, label }) => {
        const selected = active.includes(key)
        const count = counts?.[key]
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle?.(key)}
            style={pill(selected)}
          >
            <TypeGlyph type={typeGlyphMeta[key] ? key : 'project'} size={14} />
            {label}
            {count !== undefined && (
              <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>({count})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
