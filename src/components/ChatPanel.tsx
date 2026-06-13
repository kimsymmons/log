import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createShapeId, type Editor } from 'tldraw'
import {
  readSseLines,
  COLLAPSED_SIZE,
  type Message,
  type ChatCardShape,
} from '../shapes/ChatCard'
import { useChatPanel, buildSeedMessage, nodeContext, type SourceNode } from '../canvas/ChatPanelContext'

const API_BASE = (import.meta.env as Record<string, string>).VITE_API_URL ?? 'http://localhost:3001'
const PANEL_WIDTH = 380

function getEditor(): Editor | null {
  return (window as typeof window & { __tldrawEditor?: Editor }).__tldrawEditor ?? null
}

/**
 * Create a chat-card on the canvas, 50px to the right of the source node, linked
 * back to it. Returns the new shape's id (or null if the editor isn't ready).
 */
function spawnLinkedChatCard(source: SourceNode, title: string, summary: string, messages: Message[]): string | null {
  const editor = getEditor()
  if (!editor) return null
  const id = createShapeId()
  const bounds = editor.getShapePageBounds(source.id as ChatCardShape['id'])
  const x = bounds ? bounds.maxX + 50 : 100
  const y = bounds ? bounds.y : 100
  editor.createShape<ChatCardShape>({
    id: id as ChatCardShape['id'],
    type: 'chat-card',
    x,
    y,
    props: {
      w: COLLAPSED_SIZE.w,
      h: COLLAPSED_SIZE.h,
      title: title || 'Chat',
      messages,
      summary,
      createdAt: Date.now(),
      linkedShapeId: source.id,
    },
  })
  return id
}

function updateChatCard(chatId: string, title: string, summary: string, messages: Message[]): void {
  const editor = getEditor()
  if (!editor) return
  editor.updateShape<ChatCardShape>({
    id: chatId as ChatCardShape['id'],
    type: 'chat-card',
    props: { title, summary, messages },
  })
}

export function ChatPanel() {
  const { isOpen, sourceShape, activeChatId, setActiveChatId, closePanel } = useChatPanel()

  const [messages, setMessages] = useState<Message[]>([])
  const [streamedContent, setStreamedContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  // The chat-card spawned for this conversation. Mirrors context activeChatId
  // but kept in a ref so the async send loop reads the latest value.
  const chatIdRef = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const seededRef = useRef<string | null>(null)

  const send = useCallback(async (content: string, source: SourceNode, history: Message[]) => {
    const text = content.trim()
    if (!text) return

    const nextHistory: Message[] = [...history, { role: 'user', content: text }]
    setMessages(nextHistory)
    setStreamedContent('')
    setStreaming(true)
    setError(null)

    const authToken = localStorage.getItem('auth_token') ?? ''

    try {
      const response = await fetch(`${API_BASE}/inference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          artifactId: chatIdRef.current ?? `chat-trigger:${source.id}`,
          modelId: 'claude-sonnet-4-6',
          messages: nextHistory,
          stream: true,
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      let accumulated = ''
      let title = ''
      let summary = ''
      for await (const event of readSseLines(response)) {
        if (event.type === 'delta') {
          accumulated += event.text
          setStreamedContent(accumulated)
        } else if (event.type === 'summary') {
          title = event.title
          summary = event.body
        } else if (event.type === 'error') {
          throw new Error(event.message)
        } else if (event.type === 'done') {
          break
        }
      }

      const finalMessages: Message[] = [...nextHistory, { role: 'assistant', content: accumulated }]
      setMessages(finalMessages)
      setStreamedContent('')

      // First AI response → spawn the linked chat-card; later responses update it.
      if (!chatIdRef.current) {
        const newId = spawnLinkedChatCard(source, title, summary || accumulated.slice(0, 120), finalMessages)
        if (newId) {
          chatIdRef.current = newId
          setActiveChatId(newId)
        }
      } else {
        updateChatCard(chatIdRef.current, title, summary || accumulated.slice(0, 120), finalMessages)
      }
    } catch (err) {
      setError((err as Error).message ?? 'Request failed')
    } finally {
      setStreaming(false)
    }
  }, [setActiveChatId])

  // On open with a fresh source node, reset the conversation and auto-send the seed.
  useEffect(() => {
    if (!isOpen || !sourceShape) return
    if (seededRef.current === sourceShape.id) return
    seededRef.current = sourceShape.id
    chatIdRef.current = null
    setMessages([])
    setStreamedContent('')
    setError(null)
    void send(buildSeedMessage(sourceShape), sourceShape, [])
  }, [isOpen, sourceShape, send])

  // Allow re-opening the same node later to start a fresh conversation.
  useEffect(() => {
    if (!isOpen) seededRef.current = null
  }, [isOpen])

  // Keep activeChatId ref in sync if the context resets it externally.
  useEffect(() => {
    chatIdRef.current = activeChatId
  }, [activeChatId])

  // Escape closes the panel.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, closePanel])

  // Auto-scroll to the newest content. (scrollTo is absent under jsdom.)
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streamedContent])

  const handleSend = useCallback(() => {
    if (!sourceShape || streaming) return
    const text = input
    setInput('')
    void send(text, sourceShape, messages)
  }, [input, sourceShape, streaming, messages, send])

  const typeLabel = sourceShape ? nodeContext(sourceShape).typeLabel : ''

  return (
    <div
      role="complementary"
      aria-label="Chat panel"
      data-testid="chat-panel"
      data-open={isOpen ? 'true' : 'false'}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: PANEL_WIDTH,
        height: '100vh',
        background: 'var(--bg-raised, #ffffff)',
        borderLeft: '1px solid var(--border-1, #e3e3e3)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.10)',
        transform: isOpen ? 'translateX(0)' : `translateX(${PANEL_WIDTH}px)`,
        transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: isOpen ? 'all' : 'none',
        zIndex: 600,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-ui, system-ui, sans-serif)',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', borderBottom: '1px solid var(--border-1, #e3e3e3)', flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-2, #888)' }}>
            {typeLabel || 'Node'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Chat about this
          </div>
        </div>
        <button
          type="button"
          aria-label="Close chat panel"
          onClick={closePanel}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 20, lineHeight: 1, color: 'var(--text-2, #888)', padding: 4,
          }}
        >
          ×
        </button>
      </div>

      {/* Message list */}
      <div
        ref={listRef}
        data-testid="chat-messages"
        style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            data-role={m.role}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '7px 10px',
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: m.role === 'user' ? 'var(--accent, #3b6ef0)' : 'var(--bg-app, #f1f1f3)',
              color: m.role === 'user' ? 'var(--text-on-accent, #fff)' : 'var(--text-1, #1a1a1a)',
            }}
          >
            {m.content}
          </div>
        ))}
        {streaming && (
          <div
            data-role="assistant"
            data-streaming="true"
            style={{
              alignSelf: 'flex-start', maxWidth: '85%', padding: '7px 10px', borderRadius: 10,
              fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: 'var(--bg-app, #f1f1f3)', color: 'var(--text-1, #1a1a1a)',
            }}
          >
            {streamedContent || '…'}
          </div>
        )}
        {error && (
          <div role="alert" style={{ fontSize: 12, color: 'var(--danger, #e74c3c)' }}>Error: {error}</div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: 12, borderTop: '1px solid var(--border-1, #e3e3e3)', flexShrink: 0, display: 'flex', gap: 8 }}>
        <textarea
          aria-label="Message"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          placeholder="Ask a follow-up…"
          rows={2}
          style={{
            flex: 1, resize: 'none', border: '1px solid var(--border-1, #d6d6d6)', borderRadius: 8,
            padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={streaming || !input.trim()}
          style={{
            alignSelf: 'flex-end', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13,
            fontWeight: 600, cursor: streaming || !input.trim() ? 'default' : 'pointer',
            background: 'var(--accent, #3b6ef0)', color: 'var(--text-on-accent, #fff)',
            opacity: streaming || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
