import React, { useState } from 'react'
import { Icon } from './Icon'

interface TagProps {
  label: string
  icon?: string
  color?: string
  meta?: string
  active?: boolean
  selected?: boolean
  dim?: boolean
  ghost?: boolean
  onClick?: () => void
  onRemove?: () => void
  onMouseEnter?: (e: React.MouseEvent) => void
  onMouseLeave?: (e: React.MouseEvent) => void
  style?: React.CSSProperties
}

export function Tag({ label, icon, color = 'gray', meta, active = false, selected = false, dim = false, ghost = false, onClick, onRemove, onMouseEnter, onMouseLeave, style }: TagProps) {
  const [chipHover, setChipHover] = useState(false)
  return (
    <span
      onClick={onClick}
      onMouseEnter={(e) => { setChipHover(true); onMouseEnter?.(e) }}
      onMouseLeave={(e) => { setChipHover(false); onMouseLeave?.(e) }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 24, padding: '0 9px',
        borderRadius: 'var(--radius-pill)',
        background: selected || active ? `var(--sticky-${color}-bg)` : 'transparent',
        border: `1px solid ${selected || ghost ? 'transparent' : active ? `var(--sticky-${color}-border)` : 'var(--border-2)'}`,
        color: selected ? `var(--sticky-${color}-text)` : active ? 'var(--text-1)' : 'var(--text-2)',
        boxShadow: selected ? 'var(--shadow-inset)' : 'none',
        fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', whiteSpace: 'nowrap',
        opacity: dim ? 0.35 : 1,
        transition: 'opacity var(--duration) var(--ease-mech), background var(--duration) var(--ease-mech), border-color var(--duration) var(--ease-mech), color var(--duration) var(--ease-mech)',
        cursor: onClick ? 'pointer' : 'inherit',
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={13} color={`var(--sticky-${color}-text)`} /> : null}
      {label}
      {meta ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{meta}</span> : null}
      {onRemove && chipHover ? (
        <span
          role="button"
          aria-label={`Remove ${label}`}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ display: 'inline-flex', cursor: 'pointer', color: 'var(--text-3)', margin: '0 -2px 0 -1px' }}
        >
          <Icon name="x" size={11} />
        </span>
      ) : null}
    </span>
  )
}
