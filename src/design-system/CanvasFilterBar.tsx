import React from 'react'
import { TypeGlyph, typeGlyphMeta } from './TypeGlyph'

interface CanvasFilterBarProps {
  types?: string[]
  active?: string[]
  onToggle?: (type: string) => void
  onClear?: () => void
  label?: string
  style?: React.CSSProperties
}

export function CanvasFilterBar({ types = ['project', 'idea', 'thread', 'doc', 'sketch'], active = [], onToggle, onClear, label = 'All', style }: CanvasFilterBarProps) {
  const allActive = active.length === 0
  const pill = (sel: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 7,
    height: 28, padding: '0 11px 0 9px',
    borderRadius: 'var(--radius-pill)', border: 'none',
    background: sel ? 'var(--bg-app)' : 'transparent',
    boxShadow: sel ? 'var(--shadow-inset), inset 0 0 0 1px var(--border-1)' : 'none',
    color: sel ? 'var(--text-1)' : 'var(--text-2)',
    fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'background var(--duration) var(--ease-mech), color var(--duration) var(--ease-mech), box-shadow var(--duration) var(--ease-mech)',
  })
  return (
    <div
      role="toolbar"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: 5,
        background: 'var(--bg-raised)', border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-4)', boxShadow: 'var(--shadow-floating)',
        ...style,
      }}
    >
      <button type="button" onClick={onClear} style={{ ...pill(allActive), padding: '0 12px' }}>{label}</button>
      <span style={{ width: 1, height: 16, background: 'var(--border-1)', flexShrink: 0, margin: '0 2px' }} />
      {types.map((ty) => {
        const sel = active.includes(ty)
        return (
          <button key={ty} type="button" onClick={() => onToggle?.(ty)} style={pill(sel)}>
            <TypeGlyph type={ty} size={15} dim={!sel && !allActive} />
            {(typeGlyphMeta[ty])?.label ?? ty}
          </button>
        )
      })}
    </div>
  )
}
