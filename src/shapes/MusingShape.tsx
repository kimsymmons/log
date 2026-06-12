import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type TLBaseShape,
} from 'tldraw'
import { useDetailLevel, detailDisplay } from '../hooks/useDetailLevel'

// ── Types ──────────────────────────────────────────────────────────────────

export type MusingShape = TLBaseShape<'musing', {
  w: number
  h: number
  text: string
  tags: string[]
  createdAt: number
  linkedTo: string[]
}>

export const DEFAULT_MUSING_SIZE = { w: 280, h: 180 }

// ── Inner component ────────────────────────────────────────────────────────

export function MusingInner({ shape }: { shape: MusingShape }) {
  const { text, tags, createdAt } = shape.props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const detail = useDetailLevel()
  const d = detailDisplay(detail)

  // Keep draft in sync if shape props change externally
  useEffect(() => {
    if (!editing) setDraft(text)
  }, [text, editing])

  const handleTextClick = useCallback(() => {
    setDraft(text)
    setEditing(true)
  }, [text])

  const handleBlur = useCallback(() => {
    setEditing(false)
    // Persist via tldraw editor global
    const editor = (window as typeof window & { __tldrawEditor?: { updateShape: (s: object) => void } }).__tldrawEditor
    if (editor) {
      editor.updateShape({ id: shape.id, type: 'musing', props: { text: draft } })
    }
  }, [shape.id, draft])

  useEffect(() => {
    if (editing) taRef.current?.focus()
  }, [editing])

  const relTime = (() => {
    const diff = Date.now() - createdAt
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  })()

  return (
    <div
      data-detail={detail}
      style={{
        width: shape.props.w,
        height: d.minimal ? 'auto' : shape.props.h,
        minHeight: d.minimal ? 40 : undefined,
        background: 'rgba(254, 249, 240, 0.92)',
        border: '1px solid #d6c9b0',
        borderRadius: 12,
        padding: '10px 12px',
        fontFamily: 'Georgia, serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        boxSizing: 'border-box',
        backdropFilter: 'blur(2px)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      }}
    >
      {/* body */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {editing ? (
          <textarea
            ref={taRef}
            value={draft}
            placeholder="Write a musing…"
            onChange={e => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Escape') { e.currentTarget.blur() }
            }}
            style={{
              width: '100%',
              height: '100%',
              resize: 'none',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              fontSize: 13,
              color: '#4a3f2f',
              lineHeight: 1.5,
            }}
          />
        ) : (
          <p
            data-musing-text
            onClick={handleTextClick}
            style={{
              margin: 0,
              fontStyle: 'italic',
              fontSize: 13,
              color: text ? '#4a3f2f' : '#b5a48a',
              lineHeight: 1.5,
              cursor: 'text',
              // The musing text doubles as its title (a musing has no separate
              // glyph/title), so it stays visible at every detail level — but
              // collapses to a single ellipsised line when minimal.
              whiteSpace: d.minimal ? 'nowrap' : 'pre-wrap',
              overflow: d.minimal ? 'hidden' : undefined,
              textOverflow: d.minimal ? 'ellipsis' : undefined,
              wordBreak: 'break-word',
            }}
          >
            {text || <span>Write a musing…</span>}
          </p>
        )}
      </div>

      {/* footer: tags + timestamp (secondary) */}
      <div style={{ display: d.secondary ?? 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tags.map(tag => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: 'rgba(180, 150, 100, 0.15)',
                border: '1px solid #c9b48a',
                borderRadius: 10,
                color: '#7a6040',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 10, color: '#b5a48a', fontFamily: 'system-ui, sans-serif' }}>
          {relTime}
        </span>
      </div>
    </div>
  )
}

// ── ShapeUtil ──────────────────────────────────────────────────────────────

export class MusingShapeUtil extends BaseBoxShapeUtil<MusingShape> {
  static override type = 'musing' as const

  static override props = {
    w: T.number,
    h: T.number,
    text: T.string,
    tags: T.arrayOf(T.string),
    createdAt: T.number,
    linkedTo: T.arrayOf(T.string),
  }

  getDefaultProps(): MusingShape['props'] {
    return {
      w: DEFAULT_MUSING_SIZE.w,
      h: DEFAULT_MUSING_SIZE.h,
      text: '',
      tags: [],
      createdAt: Date.now(),
      linkedTo: [],
    }
  }

  component(shape: MusingShape) {
    return (
      <HTMLContainer
        data-shape-type="musing"
        style={{ pointerEvents: 'all' }}
      >
        <MusingInner shape={shape} />
      </HTMLContainer>
    )
  }

  indicator(shape: MusingShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} />
  }
}
