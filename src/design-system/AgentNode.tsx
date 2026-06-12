import React, { useState } from 'react'

if (typeof document !== 'undefined' && !document.getElementById('log-agent-anim')) {
  const s = document.createElement('style')
  s.id = 'log-agent-anim'
  s.textContent = [
    '@keyframes log-agent-in { 0% { transform: scale(0.2); opacity: 0; } 70% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }',
    '@keyframes log-agent-absorb { 0% { transform: scale(1); opacity: 1; } 70% { transform: scale(0.45); opacity: 0.9; } 100% { transform: scale(0.08); opacity: 0; } }',
    '@keyframes log-disc-pulse { 0% { transform: scale(1); } 38% { transform: scale(1.05); } 80% { transform: scale(1); } 100% { transform: scale(1); } }',
    '@media (prefers-reduced-motion: reduce) { .log-agent, .log-agent-disc { animation: none !important; } }',
  ].join(' ')
  document.head.appendChild(s)
}

interface AgentNodeProps {
  model?: string
  task?: string
  size?: number
  state?: 'working' | 'absorbing'
  pulse?: string
  style?: React.CSSProperties
}

export function AgentNode({ model, task, size = 28, state = 'working', pulse = '1.2s', style }: AgentNodeProps) {
  const [hover, setHover] = useState(false)
  return (
    <span
      className="log-agent"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', display: 'inline-flex', width: size, height: size,
        animation: state === 'absorbing'
          ? 'log-agent-absorb 300ms var(--ease-mech) forwards'
          : 'log-agent-in 340ms var(--ease-mech)',
        ...style,
      }}
    >
      <span
        className="log-agent-disc"
        style={{
          width: '100%', height: '100%', borderRadius: '50%',
          background: 'var(--bg-raised)',
          border: '1px solid var(--accent)',
          boxShadow: 'var(--shadow-disc)',
          animation: state === 'working' ? `log-disc-pulse ${pulse} ease-in-out infinite` : 'none',
        }}
      />
      {hover && state === 'working' ? (
        <span
          style={{
            position: 'absolute', top: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', zIndex: 40,
            display: 'flex', flexDirection: 'column', gap: 3, width: 200, padding: '9px 11px',
            background: 'var(--bg-overlay)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius-3)', boxShadow: 'var(--shadow-menu)',
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-3)', textTransform: 'lowercase' }}>{model}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--text-1)', lineHeight: 1.4 }}>{task}</span>
        </span>
      ) : null}
    </span>
  )
}
