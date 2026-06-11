import React, { useState, useEffect, useCallback } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type TLBaseShape,
} from 'tldraw'

// ── Types ──────────────────────────────────────────────────────────────────

export type Message = { role: 'user' | 'assistant'; content: string }

export type ChatCardState = 'collapsed' | 'expanded' | 'streaming'
export type ChatCardEvent = 'expand' | 'collapse' | 'startStreaming' | 'streamingDone'

export const COLLAPSED_SIZE = { w: 240, h: 120 }
export const EXPANDED_SIZE = { w: 400, h: 500 }

export type ChatCardShape = TLBaseShape<'chat-card', {
  w: number
  h: number
  title: string
  messages: Message[]
  summary: string
  createdAt: number
}>

// ── State machine ──────────────────────────────────────────────────────────

export function chatCardTransition(state: ChatCardState, event: ChatCardEvent): ChatCardState {
  if (state === 'collapsed') {
    if (event === 'expand') return 'expanded'
    if (event === 'startStreaming') return 'streaming'
  }
  if (state === 'streaming') {
    if (event === 'streamingDone') return 'expanded'
  }
  if (state === 'expanded') {
    if (event === 'collapse') return 'collapsed'
    if (event === 'startStreaming') return 'streaming'
  }
  return state
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Inner component (holds local UI state) ─────────────────────────────────

function ChatCardInner({ shape }: { shape: ChatCardShape }) {
  const [uiState, setUiState] = useState<ChatCardState>('collapsed')

  const dispatch = useCallback((event: ChatCardEvent) => {
    setUiState(prev => chatCardTransition(prev, event))
  }, [])

  // streaming stub: auto-transition streaming → expanded after 2s
  useEffect(() => {
    if (uiState !== 'streaming') return
    const id = setTimeout(() => dispatch('streamingDone'), 2000)
    return () => clearTimeout(id)
  }, [uiState, dispatch])

  // collapse on Escape key when expanded
  useEffect(() => {
    if (uiState !== 'expanded') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch('collapse')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [uiState, dispatch])

  const { title, messages, summary, createdAt } = shape.props

  if (uiState === 'collapsed') {
    return (
      <div
        style={{
          width: COLLAPSED_SIZE.w,
          height: COLLAPSED_SIZE.h,
          background: '#f7f7f7',
          border: '1px solid #ccc',
          borderRadius: 6,
          padding: '8px 10px',
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
        onClick={() => dispatch('expand')}
      >
        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: '#555', flexGrow: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {summary || 'No summary yet.'}
        </div>
        <div style={{ fontSize: 10, color: '#999' }}>
          {relativeTime(createdAt)}
        </div>
      </div>
    )
  }

  if (uiState === 'streaming') {
    return (
      <div
        style={{
          width: COLLAPSED_SIZE.w,
          height: COLLAPSED_SIZE.h,
          background: '#f7f7f7',
          border: '1px solid #ccc',
          borderRadius: 6,
          padding: '8px 10px',
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
          <StreamingCursor />
          <span>Thinking…</span>
        </div>
      </div>
    )
  }

  // expanded
  return (
    <div
      style={{
        width: EXPANDED_SIZE.w,
        height: EXPANDED_SIZE.h,
        background: '#fff',
        border: '1px solid #ccc',
        borderRadius: 6,
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
        <button
          onClick={() => dispatch('collapse')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#888', padding: '0 2px' }}
          aria-label="Collapse"
        >
          ×
        </button>
      </div>

      {/* thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 11, color: '#aaa' }}>No messages yet.</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ fontSize: 12, color: msg.role === 'user' ? '#1a1a1a' : '#555' }}>
            <span style={{ fontWeight: 600 }}>{msg.role === 'user' ? 'You' : 'AI'}: </span>
            {msg.content}
          </div>
        ))}
      </div>

      {/* input */}
      <div style={{ padding: '6px 8px', borderTop: '1px solid #eee', display: 'flex', gap: 4 }}>
        <input
          placeholder="Send a message…"
          style={{ flex: 1, fontSize: 12, border: '1px solid #ddd', borderRadius: 4, padding: '4px 6px' }}
          onKeyDown={e => e.stopPropagation()}
        />
        <button
          onClick={() => dispatch('startStreaming')}
          style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#f0f0f0' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

function StreamingCursor() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const id = setInterval(() => setVisible(v => !v), 400)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ display: 'inline-block', width: 6, height: 12, background: visible ? '#555' : 'transparent', borderRadius: 1 }} />
  )
}

// ── ShapeUtil ──────────────────────────────────────────────────────────────

export class ChatCardShapeUtil extends BaseBoxShapeUtil<ChatCardShape> {
  static override type = 'chat-card' as const

  static override props = {
    w: T.number,
    h: T.number,
    title: T.string,
    messages: T.arrayOf(T.object({ role: T.string, content: T.string })),
    summary: T.string,
    createdAt: T.number,
  }

  getDefaultProps(): ChatCardShape['props'] {
    return {
      w: COLLAPSED_SIZE.w,
      h: COLLAPSED_SIZE.h,
      title: 'Untitled Chat',
      messages: [],
      summary: '',
      createdAt: Date.now(),
    }
  }

  component(shape: ChatCardShape) {
    return (
      <HTMLContainer style={{ pointerEvents: 'all' }}>
        <ChatCardInner shape={shape} />
      </HTMLContainer>
    )
  }

  indicator(shape: ChatCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />
  }
}
