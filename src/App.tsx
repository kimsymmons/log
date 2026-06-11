import 'tldraw/tldraw.css'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Tldraw,
  useEditor,
  DefaultToolbar,
  DefaultToolbarContent,
  type Editor,
  type TLShapePartial,
  type TLFrameShape,
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
import { shapeToNode, nodeToShape } from './model/tldraw-adapter'
import { createLocalNodeStore } from './persistence/local'
import type { LogNode } from './model/nodes'
import { linkDisplayProps } from './canvas/linkDisplay'

const shapeUtils = [
  ChatCardShapeUtil,
  MarkdownArtifactShapeUtil,
  CodeArtifactShapeUtil,
  ImageArtifactShapeUtil,
]

const SAVE_DEBOUNCE_MS = 500

declare global {
  interface Window { __tldrawEditor?: Editor }
}

const ARTIFACT_TYPES = new Set(['markdown-artifact', 'code-artifact', 'image-artifact'])

// ── Persistence (PEO-111) ────────────────────────────────────────────────────

function setupPersistence(editor: Editor) {
  const store = createLocalNodeStore()

  const saved = store.load()
  if (saved !== null && editor.getCurrentPageShapeIds().size === 0) {
    const pageId = editor.getCurrentPageId()
    const shapes = saved
      .map((n) => nodeToShape(n, pageId))
      .filter((s): s is TLShapePartial => s !== null)
    if (shapes.length > 0) editor.createShapes(shapes)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const unlisten = editor.store.listen(
    () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        store.save(
          editor
            .getCurrentPageShapes()
            .map(shapeToNode)
            .filter((n): n is LogNode => n !== null)
        )
      }, SAVE_DEBOUNCE_MS)
    },
    { scope: 'document' }
  )

  return () => {
    clearTimeout(timer)
    unlisten()
  }
}

// ── TetherOverlay (PEO-119) ──────────────────────────────────────────────────

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

// ── LinkOverlay (PEO-123) ────────────────────────────────────────────────────

interface ArtifactLink {
  id: string
  source_id: string
  target_id: string
  strength: number
  provenance: string
  rationale: string | null
}

interface LinkPopover {
  linkId: string
  x: number
  y: number
}

const API_BASE = (import.meta.env as Record<string, string>).VITE_API_URL ?? ''
const AUTH_TOKEN = () => localStorage.getItem('auth_token') ?? ''

async function fetchLinksForShape(shapeId: string): Promise<ArtifactLink[]> {
  try {
    const res = await fetch(`${API_BASE}/links?artifactId=${encodeURIComponent(shapeId)}`, {
      headers: AUTH_TOKEN() ? { Authorization: `Bearer ${AUTH_TOKEN()}` } : {},
    })
    if (!res.ok) return []
    return (await res.json()) as ArtifactLink[]
  } catch {
    return []
  }
}

function LinkOverlay() {
  const editor = useEditor()
  const [links, setLinks] = useState<ArtifactLink[]>([])
  const [lines, setLines] = useState<Array<{
    key: string
    x1: number; y1: number; x2: number; y2: number
    link: ArtifactLink
  }>>([])
  const [popover, setPopover] = useState<LinkPopover | null>(null)

  const fetchAllLinks = useCallback(async () => {
    const shapes = editor.getCurrentPageShapes()
    const chatCards = shapes.filter(s => s.type === 'chat-card') as ChatCardShape[]
    const ids = chatCards.map(c => c.id)

    const batches = await Promise.all(ids.map(fetchLinksForShape))
    const seen = new Set<string>()
    const all: ArtifactLink[] = []
    for (const batch of batches) {
      for (const link of batch) {
        if (!seen.has(link.id)) { seen.add(link.id); all.push(link) }
      }
    }
    setLinks(all)
  }, [editor])

  useEffect(() => {
    void fetchAllLinks()
    const interval = setInterval(() => { void fetchAllLinks() }, 30_000)
    return () => clearInterval(interval)
  }, [fetchAllLinks])

  useEffect(() => {
    const compute = () => {
      const shapes = editor.getCurrentPageShapes()
      const shapeMap = new Map(shapes.map(s => [s.id, s]))

      const newLines: typeof lines = []
      for (const link of links) {
        const src = shapeMap.get(link.source_id as ChatCardShape['id'])
        const tgt = shapeMap.get(link.target_id as ChatCardShape['id'])
        if (!src || !tgt) continue

        const display = linkDisplayProps(link.strength, link.provenance)
        if (!display.visible) continue

        const srcBounds = editor.getShapePageBounds(src)
        const tgtBounds = editor.getShapePageBounds(tgt)
        if (!srcBounds || !tgtBounds) continue

        const p1 = editor.pageToScreen({ x: srcBounds.midX, y: srcBounds.midY })
        const p2 = editor.pageToScreen({ x: tgtBounds.midX, y: tgtBounds.midY })
        newLines.push({ key: link.id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, link })
      }
      setLines(newLines)
    }

    compute()
    return editor.store.listen(compute)
  }, [editor, links])

  const handleLineClick = useCallback((e: React.MouseEvent, linkId: string) => {
    e.stopPropagation()
    setPopover(p => p?.linkId === linkId ? null : { linkId, x: e.clientX, y: e.clientY })
  }, [])

  const handleTrustAction = useCallback(async (linkId: string, action: 'keep' | 'dismiss' | 'remove') => {
    setPopover(null)
    const token = AUTH_TOKEN()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    if (action === 'remove') {
      await fetch(`${API_BASE}/links/${linkId}`, { method: 'DELETE', headers }).catch(() => {})
    } else {
      const provenance = action === 'keep' ? 'user-pinned' : 'dismissed'
      await fetch(`${API_BASE}/links/${linkId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ provenance }),
      }).catch(() => {})
    }
    void fetchAllLinks()
  }, [fetchAllLinks])

  if (lines.length === 0 && !popover) return null

  return (
    <>
      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%', overflow: 'visible' }}>
        {lines.map(({ key, x1, y1, x2, y2, link }) => {
          const display = linkDisplayProps(link.strength, link.provenance)
          return (
            <g
              key={key}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={(e) => handleLineClick(e, link.id)}
            >
              {link.rationale && <title>{link.rationale}</title>}
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#6a9fd8"
                strokeWidth={display.strokeWidth}
                strokeOpacity={display.opacity}
                strokeDasharray={display.strokeDasharray === 'none' ? undefined : display.strokeDasharray}
                strokeLinecap="round"
              />
            </g>
          )
        })}
      </svg>
      {popover && (
        <div
          style={{
            position: 'fixed',
            left: popover.x,
            top: popover.y,
            zIndex: 10000,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            padding: '6px 4px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minWidth: 90,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12,
          }}
        >
          <button style={popoverBtnStyle} onClick={() => { void handleTrustAction(popover.linkId, 'keep') }}>Keep</button>
          <button style={popoverBtnStyle} onClick={() => { void handleTrustAction(popover.linkId, 'dismiss') }}>Dismiss</button>
          <button style={{ ...popoverBtnStyle, color: '#c0392b' }} onClick={() => { void handleTrustAction(popover.linkId, 'remove') }}>Remove</button>
        </div>
      )}
    </>
  )
}

const popoverBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #e0e0e0',
  borderRadius: 4,
  padding: '4px 8px',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  fontSize: 12,
}

// ── MinimalToolbar (PEO-120) ─────────────────────────────────────────────────

type ClusterSuggestion = {
  id: string
  label: string
  artifactIds: string[]
  projectType: string
  confidence: number
}

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

  const handleGroupClusters = useCallback(async () => {
    const apiBase = (import.meta.env as Record<string, string>).VITE_API_URL ?? ''
    const authToken = localStorage.getItem('auth_token') ?? ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authToken) headers.Authorization = `Bearer ${authToken}`

    let clusters: ClusterSuggestion[]
    try {
      const res = await fetch(`${apiBase}/clusters/suggest`, { method: 'POST', headers })
      if (!res.ok) {
        setToast('Cluster suggestion failed')
        setTimeout(() => setToast(null), 3000)
        return
      }
      clusters = (await res.json()) as ClusterSuggestion[]
    } catch {
      setToast('Cluster suggestion failed')
      setTimeout(() => setToast(null), 3000)
      return
    }

    if (clusters.length === 0) {
      setToast('No clusters found')
      setTimeout(() => setToast(null), 3000)
      return
    }

    const PAD = 40
    editor.batch(() => {
      for (const cluster of clusters) {
        const shapes = cluster.artifactIds
          .map(id => editor.getShape(id as TLFrameShape['id']))
          .filter((s): s is NonNullable<typeof s> => s !== undefined)

        if (shapes.length === 0) continue

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const shape of shapes) {
          const bounds = editor.getShapePageBounds(shape)
          if (!bounds) continue
          if (bounds.minX < minX) minX = bounds.minX
          if (bounds.minY < minY) minY = bounds.minY
          if (bounds.maxX > maxX) maxX = bounds.maxX
          if (bounds.maxY > maxY) maxY = bounds.maxY
        }

        if (!isFinite(minX)) continue

        editor.createShape<TLFrameShape>({
          type: 'frame',
          x: minX - PAD,
          y: minY - PAD,
          props: {
            w: maxX - minX + PAD * 2,
            h: maxY - minY + PAD * 2,
            name: cluster.label,
          },
        })
      }
    })

    setToast(`${clusters.length} cluster${clusters.length === 1 ? '' : 's'} suggested`)
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
        <button
          onClick={() => { void handleGroupClusters() }}
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
          Group clusters
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

function CanvasOverlays() {
  return (
    <>
      <TetherOverlay />
      <LinkOverlay />
    </>
  )
}

const components = {
  InFrontOfTheCanvas: CanvasOverlays,
  Toolbar: MinimalToolbar,
}

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={shapeUtils}
        onMount={(editor) => {
          window.__tldrawEditor = editor
          return setupPersistence(editor)
        }}
        components={components}
      />
    </div>
  )
}
