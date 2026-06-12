import React from 'react'

interface KeyHintProps {
  keys: string | string[]
  style?: React.CSSProperties
}

export function KeyHint({ keys, style }: KeyHintProps) {
  const list = Array.isArray(keys) ? keys : [keys]
  return (
    <span style={{ display: 'inline-flex', gap: 3, ...style }}>
      {list.map((k, i) => (
        <kbd
          key={i}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 18, height: 18, padding: '0 4px',
            borderRadius: 'var(--radius-1)',
            background: 'var(--bg-raised)', border: '1px solid var(--border-2)',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-3)', lineHeight: 1,
          }}
        >{k}</kbd>
      ))}
    </span>
  )
}
