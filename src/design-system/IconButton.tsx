import React, { useState } from 'react'
import { Icon } from './Icon'

interface IconButtonProps {
  icon: string
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  label?: string
  disabled?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}

export function IconButton({ icon, size = 'md', active = false, label, disabled = false, onClick, style }: IconButtonProps) {
  const [hover, setHover] = useState(false)
  const dim = { sm: 24, md: 28, lg: 32 }[size]
  const iconSize = { sm: 14, md: 16, lg: 16 }[size]
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: dim, height: dim, padding: 0,
        borderRadius: 'var(--radius-2)', border: '1px solid transparent',
        background: active ? 'var(--accent-muted)' : hover && !disabled ? 'var(--bg-surface)' : 'transparent',
        color: active ? 'var(--text-1)' : hover && !disabled ? 'var(--text-1)' : 'var(--text-2)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background var(--duration) var(--ease-mech), color var(--duration) var(--ease-mech)',
        ...style,
      }}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  )
}
