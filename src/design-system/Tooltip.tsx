import React, { useState } from 'react'
import { KeyHint } from './KeyHint'

interface TooltipProps {
  label: string
  keys?: string | string[]
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
}

export function Tooltip({ label, keys, side = 'top', children }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const pos: React.CSSProperties = {
    top: { bottom: '100%', left: '50%', transform: 'translate(-50%, -6px)' },
    bottom: { top: '100%', left: '50%', transform: 'translate(-50%, 6px)' },
    right: { left: '100%', top: '50%', transform: 'translate(6px, -50%)' },
    left: { right: '100%', top: '50%', transform: 'translate(-6px, -50%)' },
  }[side]

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          style={{
            position: 'absolute', zIndex: 50, whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 8px', borderRadius: 'var(--radius-2)',
            background: 'var(--bg-overlay)', border: '1px solid var(--border-1)',
            boxShadow: 'var(--shadow-menu)',
            fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)',
            fontWeight: 'var(--weight-medium)', color: 'var(--text-1)',
            pointerEvents: 'none',
            ...pos,
          }}
        >
          {label}
          {keys ? <KeyHint keys={keys} /> : null}
        </span>
      ) : null}
    </span>
  )
}
