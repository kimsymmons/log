import 'tldraw/tldraw.css'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Tldraw,
  useEditor,
  DefaultToolbar,
  DefaultToolbarContent,
  type Editor,
} from 'tldraw'
import { ChatCardShapeUtil, COLLAPSED_SIZE, type ChatCardShape } from './shapes/ChatCard'
import {
  MarkdownArtifactShapeUtil,
  CodeArtifactShapeUtil,
  ImageArtifactShapeUtil,
  ARTIFACT_COLLAPSED_SIZE,
  type AnyArtifactShape,
} from './shapes/ArtifactShapes'
import { parseConversations, conversationToCardSeed } from './lib/importChats'

const shapeUtils = [
  ChatCardShapeUtil,
  MarkdownArtifactShapeUtil,
  CodeArtifactShapeUtil,
  ImageArtifactShapeUtil,
]

declare global {
  interface Window { __tldrawEditor?: Editor }
}

const ARTIFACT_TYPES = new Set(['markdown-artifact', 'code-artifact', 'image-artifact'])

// ── TetherOverlay ────────────────────────────────────────────────────────────

function TetherOverlay() {
  const editor = useEditor()
  const [lines, setLines] = useState<Array<{ key: string; x1: number; y1: number; x2: number; y2: number }>>([])

  useEffect(() => {
    const compute = () => {
      const shapes = editor.getCurrentPageShapes()
      const chatCards = shapes.filter(s => s.type === 'chat-card') as ChatCardShape[]
      const artifacts = shapes.filter(s => ARTIFACT_TYPES.has(s.type)) as AnyArtifactShape[]

      const newLines: typeof lines = []
      for (const artifact of artifacts) {
        const parent = chatCards.find(c => c.id === artifact.props.chatId)
        if (!parent) continue

        const p1 = editor.pageToScreen({
          x: parent.x + parent.props.w / 2,
          y: parent.y + parent.props.h / 2,
        })
        const p2 = editor.pageToScreen({
          x: artifact.x + ARTIFACT_COLLAPSED_SIZE.w / 2,
          y: artifact.y + ARTIFACT_COLLAPSED_SIZE.h / 2,
        })
        newLines.push({ key: artifact.id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
      }
      setLines(newLines)
    }

    compute()
    return editor.store.listen(compute)
  }, [editor])

  if (lines.length === 0) return null

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%', overflow: 'visible' }}
    >
      {lines.map(({ key, x1, y1, x2, y2 }) => (
        <line
          key={key}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#aab8e0"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

// ── MinimalToolbar ───────────────────────────────────────────────────────────

function MinimalToolbar() {
  const editor = useEditor()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<string | null>(null)

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      return
    }

    const conversations = parseConversations(raw)
    if (conversations.length === 0) {
      setToast('No valid conversations found')
      setTimeout(() => setToast(null), 3000)
      return
    }

    const bounds = editor.getViewportPageBounds()
    const originX = bounds.x + bounds.w / 2 - (Math.min(conversations.length, 5) * 260) / 2
    const originY = bounds.y + bounds.h / 2 - (Math.ceil(conversations.length / 5) * 160) / 2

    const seeds = conversations.map((conv, i) => conversationToCardSeed(conv, i, originX, originY))

    editor.batch(() => {
      seeds.forEach(seed => {
        editor.createShape<ChatCardShape>({
          type: 'chat-card',
          x: seed.x,
          y: seed.y,
          props: {
            w: COLLAPSED_SIZE.w,
            h: COLLAPSED_SIZE.h,
            title: seed.title,
            messages: seed.messages,
            summary: seed.summary,
            createdAt: seed.createdAt,
          },
        })
      })
    })

    // Persist to backend — non-fatal if it fails
    const apiBase = (import.meta.env as Record<string, string>).VITE_API_URL ?? ''
    const authToken = localStorage.getItem('auth_token') ?? ''
    fetch(`${apiBase}/import/chats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(
        conversations.map(conv => ({
          type: 'chat',
          title: conv.title,
          content: JSON.stringify(conv.messages),
          created_at: new Date(conv.created_at).getTime() || Date.now(),
        }))
      ),
    }).catch(() => { /* non-fatal */ })

    setToast(`Imported ${seeds.length} chats`)
    setTimeout(() => setToast(null), 3000)
  }, [editor])

  return (
    <>
      <DefaultToolbar>
        <DefaultToolbarContent />
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={e => { void handleImport(e) }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            height: 32,
            padding: '0 10px',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            background: '#fff',
            fontSize: 12,
            fontFamily: 'system-ui, sans-serif',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Import chats
        </button>
      </DefaultToolbar>
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a1a',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
            pointerEvents: 'none',
            zIndex: 10000,
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────

const components = {
  InFrontOfTheCanvas: TetherOverlay,
  Toolbar: MinimalToolbar,
}

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={shapeUtils}
        onMount={(editor) => { window.__tldrawEditor = editor }}
        components={components}
      />
    </div>
  )
}
