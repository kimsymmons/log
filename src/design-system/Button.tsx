import React, { useState } from 'react'
import { Icon } from './Icon'
import { Spinner } from './Spinner'

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  children?: React.ReactNode
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
  style?: React.CSSProperties
  /** Toggle semantics for buttons used as on/off pills. */
  ariaPressed?: boolean
}

export function Button({ variant = 'secondary', size = 'md', icon, children, disabled = false, loading = false, onClick, style, ariaPressed }: ButtonProps) {
  const [hover, setHover] = useState(false)
  const [press, setPress] = useState(false)
  const h = { sm: 'var(--control-h-sm)', md: 'var(--control-h-md)', lg: 'var(--control-h-lg)' }[size]
  const fs = { sm: 12, md: 13, lg: 14 }[size]
  const variants = {
    primary: {
      idle: { background: 'var(--accent)', color: 'var(--text-on-accent)', borderColor: 'transparent' },
      hover: { background: 'var(--accent-hover)' },
      press: { background: 'var(--accent-active)' },
    },
    secondary: {
      idle: { background: 'var(--bg-surface)', color: 'var(--text-1)', borderColor: 'var(--border-2)' },
      hover: { background: 'var(--bg-raised)', borderColor: 'var(--border-3)' },
      press: { background: 'var(--bg-sidebar)' },
    },
    ghost: {
      idle: { background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent' },
      hover: { background: 'var(--bg-surface)', color: 'var(--text-1)' },
      press: { background: 'var(--bg-raised)' },
    },
    danger: {
      idle: { background: 'transparent', color: 'var(--red)', borderColor: 'var(--border-2)' },
      hover: { background: 'var(--red-muted)', borderColor: 'var(--red)' },
      press: { background: 'var(--red-muted)' },
    },
  }
  const v = variants[variant] ?? variants.secondary
  const inert = disabled || loading
  const stateStyle = { ...v.idle, ...(hover && !inert ? v.hover : {}), ...(press && !inert ? v.press : {}) }
  return (
    <button
      type="button"
      disabled={inert}
      aria-pressed={ariaPressed}
      onClick={inert ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false) }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: h, padding: '0 12px',
        borderRadius: 'var(--radius-2)', borderWidth: 1, borderStyle: 'solid',
        fontFamily: 'var(--font-ui)', fontSize: fs, fontWeight: 'var(--weight-medium)', letterSpacing: '-0.01em',
        cursor: inert ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background var(--duration) var(--ease-mech), border-color var(--duration) var(--ease-mech), color var(--duration) var(--ease-mech)',
        ...stateStyle, ...style,
      }}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  )
}
