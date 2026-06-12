import React from 'react'
import { ToolButton } from './ToolButton'

interface ToolDef {
  value: string
  icon: string
  label?: string
  keys?: string | string[]
}

interface CanvasToolbarProps {
  groups?: ToolDef[][]
  value?: string
  onChange?: (value: string) => void
  variant?: 'elevated' | 'glass' | 'flat'
  trailing?: React.ReactNode
  style?: React.CSSProperties
}

const surfaces: Record<string, React.CSSProperties> = {
  elevated: {
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-1)',
    boxShadow: 'var(--shadow-floating)',
  },
  glass: {
    background: 'var(--glass-bg)',
    border: '1px solid var(--border-1)',
    boxShadow: 'var(--shadow-floating)',
    backdropFilter: 'blur(var(--glass-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-blur))',
  },
  flat: {
    background: 'var(--bg-sidebar)',
    border: '1px solid var(--border-2)',
    boxShadow: 'none',
  },
}

export function CanvasToolbar({ groups = [], value, onChange, variant = 'elevated', trailing, style }: CanvasToolbarProps) {
  return (
    <div
      role="toolbar"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: 4, borderRadius: 'var(--radius-4)',
        ...(surfaces[variant] ?? surfaces.elevated),
        ...style,
      }}
    >
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 ? (
            <span style={{ width: 1, height: 24, background: 'var(--border-1)', margin: '0 2px', flexShrink: 0 }} />
          ) : null}
          <span style={{ display: 'inline-flex', gap: 2 }}>
            {group.map((tool) => (
              <ToolButton
                key={tool.value}
                icon={tool.icon}
                label={tool.label}
                keys={tool.keys}
                active={tool.value === value}
                onClick={() => onChange?.(tool.value)}
              />
            ))}
          </span>
        </React.Fragment>
      ))}
      {trailing ? (
        <React.Fragment>
          <span style={{ width: 1, height: 24, background: 'var(--border-1)', margin: '0 2px', flexShrink: 0 }} />
          {trailing}
        </React.Fragment>
      ) : null}
    </div>
  )
}
