import 'tldraw/tldraw.css'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button, CanvasToolbar, CanvasFilterBar, IconButton, ToolButton, Icon } from './design-system'
import {
  Tldraw,
  useEditor,
  useValue,
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
import { MusingShapeUtil, DEFAULT_MUSING_SIZE, type MusingShape } from './shapes/MusingShape'
import { SkillShapeUtil, DEFAULT_SKILL_SIZE, type SkillShape } from './shapes/SkillShape'
import { McpServerShapeUtil, DEFAULT_MCP_SIZE, type McpServerShape } from './shapes/McpServerShape'
import { GemShapeUtil, DEFAULT_GEM_SIZE, type GemShape } from './shapes/GemShape'
import { AgentCardShapeUtil, DEFAULT_AGENT_CARD_SIZE, type AgentCardShape } from './shapes/AgentCardShape'
import { parseConversations, conversationToCardSeed, conversationSourceUrl } from './lib/importChats'
import { shapeToNode, nodeToShape } from './model/tldraw-adapter'
import { createLocalNodeStore } from './persistence/local'
import type { LogNode } from './model/nodes'
import { InkLayer, useInkStrokes } from './ink/InkLayer'
import { CommandPalette, CommandPaletteContext } from './CommandPalette'
import { useClusteringLayout } from './hooks/useClusteringLayout'
import { FilterProvider, useFilter, type FilterKey } from './canvas/FilterContext'
import { TagFocusProvider } from './canvas/TagFocusContext'
import { TagConnectionOverlay } from './canvas/TagConnectionOverlay'
import { PropertiesPanel } from './canvas/PropertiesPanel'
import { useThreadLoader } from './hooks/useThreadLoader'

const shapeUtils = [
  ChatCardShapeUtil,
  MarkdownArtifactShapeUtil,
  CodeArtifactShapeUtil,
  ImageArtifactShapeUtil,
  MusingShapeUtil,
  SkillShapeUtil,
  McpServerShapeUtil,
  GemShapeUtil,
  AgentCardShapeUtil,
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
          style={{ stroke: 'var(--border-3)' }}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

// Canvas connection lines are tag-derived — see TagConnectionOverlay. The
// model-drawn /links feature (with its trust-curation popover) was removed
// from the canvas: connections must derive from shared tags, never be
// fetched, stored, or hand-curated. The /links server endpoints remain for
// the separate AI-link feature.

// ── MinimalToolbar (PEO-120) ─────────────────────────────────────────────────

type ClusterSuggestion = {
  id: string
  label: string
  artifactIds: string[]
  projectType: string
  confidence: number
}

// Custom floating toolbar (bottom-centre) — replaces tldraw's default toolbar.
function CustomToolbar() {
  const editor = useEditor()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<string | null>(null)
  const { inkActive, eraserActive, setInkActive, setEraserActive } = React.useContext(InkContext)
  const { registerImport, registerGroupClusters } = React.useContext(CommandPaletteContext)
  const currentTool = useValue('current tool', () => editor.getCurrentToolId(), [editor])

  const handleInkToggle = useCallback(() => {
    const next = !inkActive
    setInkActive(next)
    editor.setCurrentTool(next ? 'draw' : 'select')
  }, [inkActive, setInkActive, editor])

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

    const apiBase = (import.meta.env as Record<string, string>).VITE_API_URL ?? 'http://localhost:3001'
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
          sourceUrl: conversationSourceUrl(conv),
          created_at: new Date(conv.created_at).getTime() || Date.now(),
        }))
      ),
    }).catch(() => { /* non-fatal */ })

    setToast(`Imported ${seeds.length} chats`)
    setTimeout(() => setToast(null), 3000)
  }, [editor])

  const handleGroupClusters = useCallback(async () => {
    const apiBase = (import.meta.env as Record<string, string>).VITE_API_URL ?? 'http://localhost:3001'
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

  useEffect(() => {
    registerImport(() => fileInputRef.current?.click())
  }, [registerImport])

  useEffect(() => {
    registerGroupClusters(() => { void handleGroupClusters() })
  }, [registerGroupClusters, handleGroupClusters])

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => { void handleImport(e) }} />
      <div data-testid="canvas-toolbar" style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'all' }}>
        <CanvasToolbar
          variant="elevated"
          value={inkActive ? 'draw' : currentTool}
          onChange={(v) => { if (inkActive) setInkActive(false); editor.setCurrentTool(v) }}
          groups={[[
            { value: 'select', icon: 'mouse-pointer-2', label: 'Select', keys: 'V' },
            { value: 'hand', icon: 'hand', label: 'Hand', keys: 'H' },
          ]]}
          trailing={
            <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
              <ToolButton icon="pen-line" label="Ink" keys="I" active={inkActive} onClick={handleInkToggle} />
              {inkActive && <ToolButton icon="eraser" label="Erase" active={eraserActive} onClick={() => setEraserActive(!eraserActive)} />}
              <Button onClick={() => fileInputRef.current?.click()} size="sm" variant="secondary" icon="download">Import</Button>
              <Button onClick={() => { void handleGroupClusters() }} size="sm" variant="secondary" icon="boxes">Group</Button>
            </span>
          }
        />
      </div>
      {toast && (
        <div
          style={{
            position: 'absolute',
            bottom: 72,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-overlay)',
            color: 'var(--text-1)',
            border: '1px solid var(--border-1)',
            padding: '8px 16px',
            borderRadius: 'var(--radius-3)',
            boxShadow: 'var(--shadow-menu)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-ui)',
            pointerEvents: 'none',
            zIndex: 21,
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}

// ── Ink context ───────────────────────────────────────────────────────────────

import { InkContext } from './ink/InkContext'

// ── GlobalKeyboardShortcuts ──────────────────────────────────────────────────

function GlobalKeyboardShortcuts() {
  const editor = useEditor()
  const { open: paletteOpen } = React.useContext(CommandPaletteContext)

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      return (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.isContentEditable
      )
    }

    const handler = (e: KeyboardEvent) => {
      if (paletteOpen) return
      if (isTyping(e)) return

      switch (e.key) {
        case 'Escape':
          editor.selectNone()
          break
        case 'Delete':
        case 'Backspace': {
          const ids = editor.getSelectedShapeIds()
          if (ids.length) editor.deleteShapes(ids)
          break
        }
        case ' ': {
          e.preventDefault()
          editor.setCurrentTool(editor.getCurrentToolId() === 'hand' ? 'select' : 'hand')
          break
        }
        case 'f':
        case 'F':
          editor.zoomToFit()
          break
        case '+':
        case '=':
          editor.zoomIn()
          break
        case '-':
          editor.zoomOut()
          break
        case 'm':
        case 'M': {
          const vp = editor.getViewportPageBounds()
          editor.createShape<MusingShape>({
            type: 'musing',
            x: vp.midX - DEFAULT_MUSING_SIZE.w / 2,
            y: vp.midY - DEFAULT_MUSING_SIZE.h / 2,
            props: {
              w: DEFAULT_MUSING_SIZE.w,
              h: DEFAULT_MUSING_SIZE.h,
              text: '',
              tags: [],
              createdAt: Date.now(),
              linkedTo: [],
            },
          })
          break
        }
        case 's':
        case 'S': {
          const vp = editor.getViewportPageBounds()
          editor.createShape<SkillShape>({
            type: 'skill',
            x: vp.midX - DEFAULT_SKILL_SIZE.w / 2,
            y: vp.midY - DEFAULT_SKILL_SIZE.h / 2,
            props: {
              w: DEFAULT_SKILL_SIZE.w,
              h: DEFAULT_SKILL_SIZE.h,
              name: '',
              description: '',
              invocationKey: '',
              tags: [],
            },
          })
          break
        }
        case 'c':
        case 'C': {
          const vp = editor.getViewportPageBounds()
          editor.createShape<McpServerShape>({
            type: 'mcp-server',
            x: vp.midX - DEFAULT_MCP_SIZE.w / 2,
            y: vp.midY - DEFAULT_MCP_SIZE.h / 2,
            props: {
              w: DEFAULT_MCP_SIZE.w,
              h: DEFAULT_MCP_SIZE.h,
              name: '',
              description: '',
              endpoint: '',
              status: 'disconnected',
              tools: [],
              tags: [],
            },
          })
          break
        }
        case 'g':
        case 'G': {
          const vp = editor.getViewportPageBounds()
          editor.createShape<GemShape>({
            type: 'gem',
            x: vp.midX - DEFAULT_GEM_SIZE.w / 2,
            y: vp.midY - DEFAULT_GEM_SIZE.h / 2,
            props: {
              w: DEFAULT_GEM_SIZE.w,
              h: DEFAULT_GEM_SIZE.h,
              name: '',
              description: '',
              systemPrompt: '',
              tags: [],
              linkedTo: [],
            },
          })
          break
        }
        case 'a':
        case 'A': {
          const vp = editor.getViewportPageBounds()
          editor.createShape<AgentCardShape>({
            type: 'agent-card',
            x: vp.midX - DEFAULT_AGENT_CARD_SIZE.w / 2,
            y: vp.midY - DEFAULT_AGENT_CARD_SIZE.h / 2,
            props: {
              w: DEFAULT_AGENT_CARD_SIZE.w,
              h: DEFAULT_AGENT_CARD_SIZE.h,
              agentName: '',
              model: 'claude-sonnet-4-6',
              status: 'running',
              taskDescription: '',
              tags: [],
              startedAt: Date.now(),
            },
          })
          break
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editor, paletteOpen])

  return null
}

// ── App ──────────────────────────────────────────────────────────────────────

// Dot-grid canvas background (P2). Painted behind shapes in screen space.
function CanvasBackground() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg-canvas)',
        backgroundImage:
          'radial-gradient(circle, var(--canvas-dot) var(--canvas-dot-size), transparent var(--canvas-dot-size))',
        backgroundSize: 'var(--canvas-dot-gap) var(--canvas-dot-gap)',
      }}
    />
  )
}

// 56px head nav — board-title pill + avatar. Lives in the app shell, above
// the canvas panel.
function NavBar() {
  return (
    <div
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 56, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: 'var(--bg-app)', pointerEvents: 'all',
      }}
    >
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: 36, padding: '0 14px',
          background: 'var(--bg-sidebar)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-4)',
          fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--text-1)',
        }}
      >
        <Icon name="layout-grid" size={14} color="var(--text-3)" />
        log canvas
      </div>
      <div
        aria-label="Account"
        style={{
          width: 28, height: 28, borderRadius: 'var(--radius-pill)',
          background: 'var(--accent)', color: 'var(--text-on-accent)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)',
        }}
      >
        K
      </div>
    </div>
  )
}

// Floating type filter — top-centre, 16px from top.
function FilterBarOverlay() {
  const { activeTypes, toggleType, clearTypes } = useFilter()
  return (
    <div data-testid="filter-bar" style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'all' }}>
      <CanvasFilterBar active={[...activeTypes]} onToggle={(k) => toggleType(k as FilterKey)} onClear={clearTypes} />
    </div>
  )
}

// Custom zoom pill — bottom-left, 16px. Mono / tabular-nums per the spec.
function ZoomPill() {
  const editor = useEditor()
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  return (
    <div
      data-testid="zoom-pill"
      style={{
        position: 'absolute', bottom: 16, left: 16, zIndex: 20, pointerEvents: 'all',
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2,
        background: 'var(--bg-raised)', border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-3)', boxShadow: 'var(--shadow-floating)',
      }}
    >
      <IconButton icon="minus" label="Zoom out" size="sm" onClick={() => editor.zoomOut()} />
      <button
        type="button"
        onClick={() => editor.resetZoom()}
        aria-label="Reset zoom"
        style={{
          minWidth: 48, height: 24, padding: '0 6px', border: 'none', background: 'transparent', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton icon="plus" label="Zoom in" size="sm" onClick={() => editor.zoomIn()} />
    </div>
  )
}

function CanvasOverlays() {
  const editor = useEditor()
  const { inkActive, eraserActive, strokes, setStrokes } = React.useContext(InkContext)
  useClusteringLayout(editor)
  useThreadLoader(editor)
  return (
    <>
      <TagConnectionOverlay />
      <TetherOverlay />
      <InkLayer
        active={inkActive}
        eraserActive={eraserActive}
        strokes={strokes}
        onStrokesChange={setStrokes}
      />
      <FilterBarOverlay />
      <CustomToolbar />
      <ZoomPill />
      <PropertiesPanel />
      <CommandPalette />
      <GlobalKeyboardShortcuts />
    </>
  )
}

export default function App() {
  const [inkActive, setInkActiveRaw] = useState(false)
  const [eraserActive, setEraserActive] = useState(false)
  const { strokes, setStrokes } = useInkStrokes()

  const setInkActive = useCallback((v: boolean) => {
    setInkActiveRaw(v)
    if (!v) setEraserActive(false)
  }, [])

  // ── Command palette state ──
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [onImport, setOnImport] = useState<(() => void) | null>(null)
  const [onGroupClusters, setOnGroupClusters] = useState<(() => void) | null>(null)

  // useState setter wraps functions in a thunk to avoid setState(fn) ambiguity
  const registerImport = useCallback((fn: () => void) => { setOnImport(() => fn) }, [])
  const registerGroupClusters = useCallback((fn: () => void) => { setOnGroupClusters(() => fn) }, [])

  // Cmd+K / Ctrl+K to open palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPaletteOpen(v => !v)
        setPaletteQuery('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const paletteCtx = React.useMemo(() => ({
    open: paletteOpen,
    setOpen: setPaletteOpen,
    query: paletteQuery,
    setQuery: setPaletteQuery,
    onImport,
    onGroupClusters,
    registerImport,
    registerGroupClusters,
  }), [paletteOpen, paletteQuery, onImport, onGroupClusters, registerImport, registerGroupClusters])

  // Custom chrome only: every default tldraw UI slot is nulled out. The dot-grid
  // Background and the InFrontOfTheCanvas overlay layer (nav-less; the nav lives
  // in the app shell) are the only slots we keep.
  const components = React.useMemo(() => ({
    InFrontOfTheCanvas: CanvasOverlays,
    Background: CanvasBackground,
    Toolbar: null,
    StylePanel: null,
    PageMenu: null,
    MainMenu: null,
    ZoomMenu: null,
    HelpMenu: null,
    NavigationPanel: null,
    Minimap: null,
    QuickActions: null,
    ActionsMenu: null,
    DebugMenu: null,
    SharePanel: null,
    MenuPanel: null,
    TopPanel: null,
  }), [])

  const options = React.useMemo(() => ({ maxPages: 1 }), [])

  return (
    <FilterProvider>
      <TagFocusProvider>
        <CommandPaletteContext.Provider value={paletteCtx}>
          <InkContext.Provider value={{ inkActive, eraserActive, strokes, setInkActive, setEraserActive, setStrokes }}>
            {/* App shell — deepest backdrop */}
            <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-app)', overflow: 'hidden' }}>
              <NavBar />
              {/* Canvas panel — inset below the 56px nav, hairline-framed, dot-grid surface */}
              <div
                style={{
                  position: 'absolute',
                  inset: '56px 8px 8px',
                  border: '1px solid var(--border-2)',
                  borderRadius: 'var(--radius-4)',
                  boxShadow: 'var(--shadow-canvas)',
                  overflow: 'hidden',
                  background: 'var(--bg-canvas)',
                }}
              >
                <Tldraw
                  shapeUtils={shapeUtils}
                  onMount={(editor) => {
                    window.__tldrawEditor = editor
                    return setupPersistence(editor)
                  }}
                  components={components}
                  options={options}
                />
              </div>
            </div>
          </InkContext.Provider>
        </CommandPaletteContext.Provider>
      </TagFocusProvider>
    </FilterProvider>
  )
}
