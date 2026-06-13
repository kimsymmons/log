import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../design-system/Icon'
import { getTagDefs } from './tagStore'

interface TagPickerProps {
  /** Viewport coordinates of the anchor (the card's "+" button). */
  anchor: { x: number; y: number }
  /** Tag labels currently on the card. */
  current: string[]
  onToggle: (label: string) => void
  onCreate: (label: string) => void
  onClose: () => void
}

/**
 * Tag picker popover (P3 of the Thread-card feature). Toggle existing tags or
 * type a new one and press Enter to create. Rendered through a portal so
 * tldraw's canvas transform doesn't reposition the fixed popover.
 */
export function TagPicker({ anchor, current, onToggle, onCreate, onClose }: TagPickerProps) {
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const defs = getTagDefs()
  const currentSet = new Set(current.map((t) => t.toLowerCase()))

  useEffect(() => {
    inputRef.current?.focus()
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  const q = query.trim()
  const filtered = defs.filter((d) => d.label.toLowerCase().includes(q.toLowerCase()))
  const exactExists = defs.some((d) => d.label.toLowerCase() === q.toLowerCase())

  const popover = (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: anchor.x,
        top: anchor.y,
        zIndex: 1000,
        width: 220,
        maxHeight: 280,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-3)',
        boxShadow: 'var(--shadow-menu)',
        padding: 'var(--space-2)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && q) {
            onCreate(q)
            setQuery('')
          } else if (e.key === 'Escape') {
            onClose()
          }
        }}
        placeholder="Add or create a tag…"
        style={{
          width: '100%',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-ui)',
          color: 'var(--text-1)',
          background: 'var(--bg-app)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--radius-2)',
          padding: '6px 8px',
          outline: 'none',
          marginBottom: 'var(--space-2)',
        }}
      />
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {filtered.map((d) => {
          const on = currentSet.has(d.label.toLowerCase())
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onToggle(d.label)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                width: '100%',
                padding: '6px 8px',
                border: 'none',
                borderRadius: 'var(--radius-2)',
                background: on ? 'var(--bg-raised)' : 'transparent',
                color: 'var(--text-1)',
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Icon name="tag" size={13} color={`var(--sticky-${d.color}-text)`} />
              <span style={{ flex: 1 }}>{d.label}</span>
              {on && <Icon name="check" size={13} color="var(--accent-text)" />}
            </button>
          )
        })}
        {q && !exactExists && (
          <button
            type="button"
            onClick={() => { onCreate(q); setQuery('') }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              width: '100%',
              padding: '6px 8px',
              border: 'none',
              borderRadius: 'var(--radius-2)',
              background: 'transparent',
              color: 'var(--text-2)',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Icon name="plus" size={13} color="var(--text-3)" />
            <span>Create “{q}”</span>
          </button>
        )}
        {filtered.length === 0 && !q && (
          <div style={{ padding: '6px 8px', fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>
            No tags yet — type to create one.
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(popover, document.body)
}
