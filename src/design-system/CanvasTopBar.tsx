import React from 'react'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

interface CanvasTopBarProps {
  workspace?: string
  board?: string
  style?: React.CSSProperties
}

export function CanvasTopBar({ workspace = 'log', board = 'Untitled', style }: CanvasTopBarProps) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        height: 48, padding: '0 12px',
        background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-1)',
        fontFamily: 'var(--font-ui)',
        ...style,
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: 6,
        background: 'var(--accent)', color: 'var(--text-on-accent)',
        fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)',
      }}>log</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>
        <span style={{ color: 'var(--text-3)' }}>{workspace}</span>
        <Icon name="chevron-right" size={13} color="var(--text-4)" />
        <span style={{ color: 'var(--text-1)' }}>{board}</span>
      </span>
      <IconButton icon="star" label="Favorite" size="sm" />
    </div>
  )
}
