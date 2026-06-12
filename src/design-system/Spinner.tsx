import React from 'react'

if (typeof document !== 'undefined' && !document.getElementById('log-spinner-anim')) {
  const s = document.createElement('style')
  s.id = 'log-spinner-anim'
  s.textContent =
    '@keyframes log-spin { to { transform: rotate(360deg); } }' +
    '@media (prefers-reduced-motion: reduce) { .log-spinner { animation-duration: 1.6s !important; } }'
  document.head.appendChild(s)
}

interface SpinnerProps {
  size?: number
  strokeWidth?: number
  color?: string
  style?: React.CSSProperties
}

export function Spinner({ size = 16, strokeWidth = 1.5, color = 'currentColor', style }: SpinnerProps) {
  const c = size / 2
  const r = c - strokeWidth
  const circ = 2 * Math.PI * r
  return (
    <svg
      className="log-spinner"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="status"
      aria-label="Loading"
      style={{ animation: 'log-spin 0.7s linear infinite', color, flexShrink: 0, ...style }}
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.2" />
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={`${circ * 0.28} ${circ}`} />
    </svg>
  )
}
