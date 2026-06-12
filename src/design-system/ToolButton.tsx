import React, { useState } from 'react'
import { Icon } from './Icon'
import { Tooltip } from './Tooltip'

interface ToolButtonProps {
  icon: string
  label?: string
  keys?: string | string[]
  active?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}

export function ToolButton({ icon, label, keys, active = false, onClick, style }: ToolButtonProps) {
  const [hover, setHover] = useState(false)
  const btn = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 40, height: 40, padding: 0,
        borderRadius: 'var(--radius-3)', border: 'none',
        background: active ? 'var(--accent)' : hover ? 'var(--bg-overlay)' : 'transparent',
        color: active ? '#fff' : hover ? 'var(--text-1)' : 'var(--text-2)',
        cursor: 'pointer',
        transition: 'background var(--duration) var(--ease-mech), color var(--duration) var(--ease-mech)',
        ...style,
      }}
    >
      <Icon name={icon} size={20} />
    </button>
  )
  return label ? <Tooltip label={label} keys={keys} side="top">{btn}</Tooltip> : btn
}
