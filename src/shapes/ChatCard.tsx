import React, { useState, useEffect, useCallback } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type TLBaseShape,
  type TLShapePartial,
  type Editor,
} from 'tldraw'
import type { ArtifactSsePayload } from '../types/artifact'
import {
  artifactTypeToShapeType,
  ARTIFACT_COLLAPSED_SIZE,
  type AnyArtifactShape,
} from './ArtifactShapes'

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

// ── SSE parsing ────────────────────────────────────────────────────────────

export type SseEvent =
  | { type: 'delta'; text: string }
  | { type: 'summary'; title: string; body: string; artifacts?: ArtifactSsePayload[] }
  | { type: 'error'; message: string }
  | { type: 'done' }

export function parseSseData(data: string): SseEvent | null {
  if (data === '[DONE]') return { type: 'done' }
  try {
    const obj = JSON.parse(data) as Record<string, unknown>
    if (typeof obj.delta === 'string') return { type: 'delta', text: obj.delta }
    if (obj.summary && typeof obj.summary === 'object') {
      const s = obj.summary as { title?: string; body?: string; artifacts?: ArtifactSsePayload[] }
      const result: SseEvent = { type: 'summary', title: s.title ?? '', body: s.body ?? '' }
      if (s.artifacts && s.artifacts.length > 0) {
        (result as { type: 'summary'; title: string; body: string; artifacts?: ArtifactSsePayload[] }).artifacts = s.artifacts
      }
      return result
    }
    if (typeof obj.error === 'string') return { type: 'error', message: obj.error }
  } catch {
    // malformed
  }
  return null
}

async function* readSseLines(response: Response): AsyncGenerator<SseEvent> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const parsed = parseSseData(line.slice(6))
        if (parsed) yield parsed
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function getEditor(): Editor | null {
  return (window as typeof window & { __tldrawEditor?: Editor }).__tldrawEditor ?? null
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

// ── Inner component ────────────────────────────────────────────────────────

function ChatCardInner({ shape }: { shape: ChatCardShape }) {
  const [uiState, setUiState] = useState<ChatCardState>('collapsed')
  const [inputValue, setInputValue] = useState('')
  const [streamedContent, setStreamedContent] = useState('')

  const dispatch = useCallback((event: ChatCardEvent) => {
    setUiState(prev => chatCardTransition(prev, event))
  }, [])

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

  const handleSend = useCallback(async () => {
    const content = inputValue.trim()
    if (!content) return

    setInputValue('')
    setStreamedContent('')
    dispatch('startStreaming')

    const apiBase = (import.meta.env as Record<string, string>).VITE_API_URL ?? 'http://localhost:3001'
    const authToken = localStorage.getItem('auth_token') ?? ''

    try {
      const response = await fetch(`${apiBase}/inference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          artifactId: shape.id,
          modelId: 'claude-sonnet-4-6',
          messages: [...messages, { role: 'user', content }],
          stream: true,
        }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      let accumulated = ''
      for await (const event of readSseLines(response)) {
        if (event.type === 'delta') {
          accumulated += event.text
          setStreamedContent(accumulated)
        } else if (event.type === 'summary') {
          const editor = getEditor()
          if (editor) {
            editor.updateShape<ChatCardShape>({
              id: shape.id,
              type: 'chat-card',
              props: {
                title: event.title,
                summary: event.body,
                messages: [
                  ...messages,
                  { role: 'user', content },
                  { role: 'assistant', content: accumulated },
                ],
              },
            })
            if (event.artifacts && event.artifacts.length > 0) {
              const currentShape = editor.getShape<ChatCardShape>(shape.id)
              const baseX = (currentShape?.x ?? shape.x) + (currentShape?.props.w ?? shape.props.w) + 20
              const baseY = currentShape?.y ?? shape.y
              event.artifacts.forEach((artifact, i) => {
                editor.createShape<AnyArtifactShape>({
                  type: artifactTypeToShapeType(artifact.type),
                  x: baseX,
                  y: baseY + i * (ARTIFACT_COLLAPSED_SIZE.h + 10),
                  props: {
                    w: ARTIFACT_COLLAPSED_SIZE.w,
                    h: ARTIFACT_COLLAPSED_SIZE.h,
                    chatId: shape.id,
                    content: artifact.content,
                    title: artifact.title,
                  },
                })
              })
            }
          }
        } else if (event.type === 'error') {
          throw new Error(event.message)
        } else if (event.type === 'done') {
          break
        }
      }

      dispatch('streamingDone')
    } catch (err) {
      const editor = getEditor()
      if (editor) {
        editor.updateShape<ChatCardShape>({
          id: shape.id,
          type: 'chat-card',
          props: { summary: `Error: ${(err as Error).message}` },
        })
      }
      dispatch('collapse')
    }
  }, [inputValue, messages, shape.id, dispatch])

  // ── Collapsed ──────────────────────────────────────────────────────────

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

  // ── Streaming ──────────────────────────────────────────────────────────

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
        <div style={{ fontSize: 11, color: '#555', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
          {streamedContent ? (
            <span style={{ overflow: 'hidden', maxHeight: 48 }}>
              {streamedContent}
              <StreamingCursor />
            </span>
          ) : (
            <>
              <StreamingCursor />
              <span>Thinking…</span>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Expanded ───────────────────────────────────────────────────────────

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
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Send a message…"
          style={{ flex: 1, fontSize: 12, border: '1px solid #ddd', borderRadius: 4, padding: '4px 6px' }}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter') void handleSend()
          }}
        />
        <button
          onClick={() => void handleSend()}
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

type DragArtifact = { id: string; type: string; dx: number; dy: number }

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

  // Tracks artifact offsets at drag start so they can follow the parent
  private readonly _dragState = new Map<string, { artifacts: DragArtifact[] }>()

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

  override onTranslateStart(shape: ChatCardShape): void {
    const artifacts = this.editor.getCurrentPageShapes().filter(
      s => ['markdown-artifact', 'code-artifact', 'image-artifact'].includes(s.type) &&
           (s as AnyArtifactShape).props.chatId === shape.id
    ) as AnyArtifactShape[]

    this._dragState.set(shape.id, {
      artifacts: artifacts.map(a => ({ id: a.id, type: a.type, dx: a.x - shape.x, dy: a.y - shape.y })),
    })
  }

  override onTranslate(initial: ChatCardShape, current: ChatCardShape): void {
    const state = this._dragState.get(initial.id)
    if (!state || state.artifacts.length === 0) return
    this.editor.updateShapes(
      state.artifacts.map(({ id, type, dx, dy }) => ({
        id,
        type,
        x: current.x + dx,
        y: current.y + dy,
      } as TLShapePartial))
    )
  }

  override onTranslateEnd(initial: ChatCardShape): void {
    this._dragState.delete(initial.id)
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
