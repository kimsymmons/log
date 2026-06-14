import React, { useState, useEffect, useCallback } from 'react'
import {
  BaseBoxShapeUtil,
  T,
  type TLBaseShape,
  type TLShapePartial,
  type Editor,
} from 'tldraw'
import { FilterDimContainer } from '../canvas/FilterContext'
import { useDetailLevel, detailDisplay } from '../hooks/useDetailLevel'
import type { ArtifactSsePayload } from '../types/artifact'
import {
  artifactTypeToShapeType,
  ARTIFACT_COLLAPSED_SIZE,
  type AnyArtifactShape,
} from './ArtifactShapes'
import { TypeGlyph } from '../design-system/TypeGlyph'
import { Tag } from '../design-system/Tag'
import { useTagFocus } from '../canvas/TagFocusContext'
import { TagPicker } from '../canvas/TagPicker'
import { ensureTag, tagColorFor, tagGlyphFor } from '../canvas/tagStore'
import { setPosition } from '../canvas/positionStore'
import { Icon } from '../design-system/Icon'

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
  tags?: string[]
  cardType?: string
  sourceUrl?: string
}>

/** Default card type when a card carries none. Chat cards are threads. */
export const DEFAULT_CARD_TYPE = 'thread'

/** Short, type-appropriate metadata line shown beneath the summary. */
export function cardMetaLabel(cardType: string, messageCount: number, summary: string): string {
  switch (cardType) {
    case 'thread':
      return `${messageCount} repl${messageCount === 1 ? 'y' : 'ies'}`
    case 'doc': {
      const words = summary.trim() ? summary.trim().split(/\s+/).length : 0
      return `${words} word${words === 1 ? '' : 's'}`
    }
    case 'project':
      return 'Project'
    case 'idea':
      return 'Idea'
    case 'sketch':
      return 'Sketch'
    default:
      return cardType
  }
}

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

/** Compact relative time for the meta row, e.g. "now", "5m", "2h", "3d". */
export function shortRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

/** The stable artifact id behind a loaded card (thread/idea/…), or the raw id. */
export function artifactIdForShape(shapeId: string): string {
  const m = /^shape:(?:thread|idea)-(.+)$/.exec(shapeId)
  return m ? m[1] : shapeId
}

// ── Inner component ────────────────────────────────────────────────────────

export function ChatCardInner({ shape }: { shape: ChatCardShape }) {
  const [uiState, setUiState] = useState<ChatCardState>('collapsed')
  const [inputValue, setInputValue] = useState('')
  const [streamedContent, setStreamedContent] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Semantic zoom (PEO-143): hide body/secondary at lower detail levels.
  const detail = useDetailLevel()
  const d = detailDisplay(detail)
  const { setHovered, hovered } = useTagFocus()

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

  const { title, messages, summary, createdAt, sourceUrl } = shape.props
  const cardType = shape.props.cardType ?? DEFAULT_CARD_TYPE
  const tags = shape.props.tags ?? []
  // Focus follows tags: when a tag chip is hovered, cards that don't carry
  // that tag fade so the hovered tag's network stands out. (Type filtering is
  // handled separately by FilterDimContainer at the shape's outer container.)
  const dimmed = hovered != null && !tags.some((t) => t.toLowerCase() === hovered.toLowerCase())
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null)

  // Tags live in shape props and persist through the node adapter; updating
  // the shape is enough. ensureTag only registers the label's stable colour.
  const applyTags = useCallback((next: string[]) => {
    getEditor()?.updateShape<ChatCardShape>({ id: shape.id, type: 'chat-card', props: { tags: next } })
  }, [shape.id])

  const toggleTag = useCallback((label: string) => {
    ensureTag(label)
    const has = tags.some((t) => t.toLowerCase() === label.toLowerCase())
    applyTags(has ? tags.filter((t) => t.toLowerCase() !== label.toLowerCase()) : [...tags, label])
  }, [tags, applyTags])

  const createTag = useCallback((label: string) => {
    ensureTag(label)
    if (!tags.some((t) => t.toLowerCase() === label.toLowerCase())) applyTags([...tags, label])
  }, [tags, applyTags])

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
      setErrorMessage((err as Error).message ?? 'Request failed')
      // 'streaming + collapse' is a no-op in the state machine, so exit streaming first.
      dispatch('streamingDone')
      if (messages.length === 0) dispatch('collapse')
    }
  }, [inputValue, messages, shape.id, dispatch])

  // ── Collapsed ──────────────────────────────────────────────────────────

  if (uiState === 'collapsed') {
    return (
      <div
        data-detail={detail}
        style={{
          width: shape.props.w,
          height: d.minimal ? 'auto' : shape.props.h,
          minHeight: d.minimal ? 40 : undefined,
          background: 'var(--bg-surface)',
          border: errorMessage ? '1px solid var(--red)' : '1px solid var(--border-1)',
          borderRadius: 'var(--radius-3)',
          padding: 'var(--space-4)',
          fontFamily: 'var(--font-ui)',
          color: 'var(--text-1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          cursor: 'pointer',
          boxSizing: 'border-box',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
          opacity: dimmed ? 0.3 : 1,
          transition: 'opacity var(--duration) var(--ease-mech)',
        }}
        onClick={() => { setErrorMessage(null); dispatch('expand') }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          <TypeGlyph type={cardType} size={16} />
          <span
            title={title}
            style={{
              flex: 1, minWidth: 0,
              fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)', color: 'var(--text-1)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
        </div>

        {errorMessage ? (
          <div data-detail-body style={{ display: d.body ?? 'block', flex: 1, fontSize: 'var(--text-sm)', color: 'var(--red)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            Error: {errorMessage}
          </div>
        ) : (
          <div
            data-detail-body
            style={{
              display: d.body ?? '-webkit-box', flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-2)', lineHeight: 'var(--leading-normal)',
              overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}
          >
            {summary || 'No summary yet.'}
          </div>
        )}

        <div style={{ display: d.secondary ?? 'block', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
          {cardMetaLabel(cardType, messages.length, summary)} · {shortRelativeTime(createdAt)}
        </div>

        <div
          style={{ display: d.secondary ?? 'flex', alignItems: 'center', gap: 'var(--space-1)', flexWrap: 'wrap' }}
          onClick={(e) => e.stopPropagation()}
        >
          {tags.map((t) => (
            <Tag
              key={t}
              label={t}
              icon={tagGlyphFor(t)}
              color={tagColorFor(t)}
              onRemove={() => toggleTag(t)}
              onMouseEnter={() => setHovered(t)}
              onMouseLeave={() => setHovered(null)}
              style={{ height: 22 }}
            />
          ))}
          <button
            type="button"
            aria-label="Add tag"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setPicker((p) => (p ? null : { x: r.left, y: r.bottom + 6 }))
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 'var(--radius-pill)',
              border: '1px dashed var(--border-2)', background: 'transparent',
              color: 'var(--text-3)', cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>

        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: d.secondary ? 'none' : 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content',
              fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', color: 'var(--text-3)', textDecoration: 'none',
            }}
          >
            <Icon name="external-link" size={11} color="var(--text-3)" />
            Open in Claude
          </a>
        )}

        {picker && (
          <TagPicker
            anchor={picker}
            current={tags}
            onToggle={toggleTag}
            onCreate={createTag}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    )
  }

  // ── Streaming ──────────────────────────────────────────────────────────

  if (uiState === 'streaming') {
    return (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          background: 'var(--bg-surface)',
          border: '1px solid var(--accent-border)',
          borderRadius: 'var(--radius-3)',
          padding: 'var(--space-4)',
          fontFamily: 'var(--font-ui)',
          color: 'var(--text-1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          boxSizing: 'border-box',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          <TypeGlyph type={cardType} size={16} />
          <span style={{ flex: 1, minWidth: 0, fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', lineHeight: 'var(--leading-normal)', display: 'flex', alignItems: 'flex-start', gap: 4, overflow: 'hidden' }}>
          {streamedContent ? (
            <span style={{ overflow: 'hidden', maxHeight: 56 }}>
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
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-3)',
        fontFamily: 'var(--font-ui)',
        color: 'var(--text-1)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-floating)',
      }}
    >
      {/* header */}
      <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border-1)', display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        <TypeGlyph type={cardType} size={16} />
        <span style={{ flex: 1, minWidth: 0, fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        <button
          onClick={() => dispatch('collapse')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-md)', color: 'var(--text-3)', padding: '0 2px', lineHeight: 1 }}
          aria-label="Collapse"
        >
          ×
        </button>
      </div>

      {/* thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>No messages yet.</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ fontSize: 'var(--text-xs)', lineHeight: 'var(--leading-normal)', color: msg.role === 'user' ? 'var(--text-1)' : 'var(--text-2)' }}>
            <span style={{ fontWeight: 'var(--weight-semibold)', color: msg.role === 'user' ? 'var(--text-1)' : 'var(--accent-text)' }}>{msg.role === 'user' ? 'You' : 'AI'}: </span>
            {msg.content}
          </div>
        ))}
      </div>

      {/* input */}
      <div style={{ padding: 'var(--space-2)', borderTop: '1px solid var(--border-1)', display: 'flex', gap: 'var(--space-2)' }}>
        <input
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Send a message…"
          style={{ flex: 1, fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', color: 'var(--text-1)', background: 'var(--bg-app)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-2)', padding: '6px 8px', outline: 'none' }}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter') void handleSend()
          }}
        />
        <button
          onClick={() => void handleSend()}
          style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', fontWeight: 'var(--weight-medium)', padding: '0 12px', border: 'none', borderRadius: 'var(--radius-2)', cursor: 'pointer', background: 'var(--accent)', color: 'var(--text-on-accent)' }}
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
    <span style={{ display: 'inline-block', width: 6, height: 12, background: visible ? 'var(--accent-text)' : 'transparent', borderRadius: 1 }} />
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
    tags: T.optional(T.arrayOf(T.string)),
    cardType: T.optional(T.string),
    sourceUrl: T.optional(T.string),
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
      tags: [],
      cardType: DEFAULT_CARD_TYPE,
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
    const current = this.editor.getShape<ChatCardShape>(initial.id)
    if (current) {
      setPosition(artifactIdForShape(current.id as string), { x: current.x, y: current.y })
    }
  }

  component(shape: ChatCardShape) {
    return (
      <FilterDimContainer shape={shape} dataShapeType="chat-card">
        <ChatCardInner shape={shape} />
      </FilterDimContainer>
    )
  }

  indicator(shape: ChatCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
