import 'tldraw/tldraw.css'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button, CanvasToolbar, CanvasFilterBar, IconButton, ToolButton, Icon } from './design-system'
import {
  Tldraw,
  useEditor,
  useValue,
  DefaultColorStyle,
  DefaultSizeStyle,
  type Editor,
  type TLShapePartial,
  type TLFrameShape,
  type TLDefaultColorStyle,
  type TLDefaultSizeStyle,
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
import { FocusProvider, useFocus } from './canvas/FocusContext'
import { TagConnectionOverlay } from './canvas/TagConnectionOverlay'
import { PropertiesPanel } from './canvas/PropertiesPanel'
import { useThreadLoader } from './hooks/useThreadLoader'
import { useIdeaLoader } from './hooks/useIdeaLoader'

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

// Shared floating-surface style for the toolbars (matches the design spec).
const floatingSurface: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4,
  borderRadius: 'var(--radius-4)', background: 'var(--bg-raised)',
  border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-floating)',
}

const ToolbarDivider = () => (
  <span style={{ width: 1, height: 24, background: 'var(--border-1)', margin: '0 2px', flexShrink: 0 }} />
)

// Draw-family tool ids that show the ink sub-toolbar.
const INK_TOOLS = ['draw', 'highlight', 'eraser']

// Ink palette — maps each design swatch (a token, for display) to tldraw's
// DefaultColorStyle value, so drawing uses native tldraw shapes/styles.
const INK_COLORS: Array<{ name: string; value: TLDefaultColorStyle; swatch: string }> = [
  { name: 'White', value: 'white', swatch: 'var(--text-1)' },
  { name: 'Indigo', value: 'violet', swatch: 'var(--accent)' },
  { name: 'Yellow', value: 'yellow', swatch: 'var(--yellow)' },
  { name: 'Green', value: 'green', swatch: 'var(--green)' },
  { name: 'Blue', value: 'light-blue', swatch: 'var(--blue)' },
  { name: 'Lavender', value: 'light-violet', swatch: 'var(--purple)' },
  { name: 'Pink', value: 'light-red', swatch: 'var(--sticky-pink-text)' },
  { name: 'Red', value: 'red', swatch: 'var(--red)' },
]
const INK_WEIGHTS: Array<{ name: string; value: TLDefaultSizeStyle; dot: number }> = [
  { name: 'Thin', value: 's', dot: 4 },
  { name: 'Medium', value: 'm', dot: 7 },
  { name: 'Thick', value: 'l', dot: 11 },
]

// Secondary ink toolbar — mounted only while a draw-family tool is active.
// Drives tldraw's native draw / highlight / eraser tools and shared styles
// (no custom canvas layer, so undo/redo + selection stay consistent).
function InkSubToolbar() {
  const editor = useEditor()
  const toolId = useValue('ink tool', () => editor.getCurrentToolId(), [editor])
  const styles = useValue('ink styles', () => editor.getInstanceState().stylesForNextShape as Record<string, unknown>, [editor])
  const activeColor = styles?.[DefaultColorStyle.id]
  const activeSize = styles?.[DefaultSizeStyle.id] ?? 'm'
  return (
    <div
      data-testid="ink-subtoolbar"
      role="toolbar"
      aria-label="Ink tools"
      style={{
        position: 'absolute', bottom: 72, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, pointerEvents: 'all', ...floatingSurface,
      }}
    >
      <ToolButton icon="pen-line" label="Pen" active={toolId === 'draw'} onClick={() => editor.setCurrentTool('draw')} />
      <ToolButton icon="highlighter" label="Highlighter" active={toolId === 'highlight'} onClick={() => editor.setCurrentTool('highlight')} />
      <ToolButton icon="eraser" label="Eraser" active={toolId === 'eraser'} onClick={() => editor.setCurrentTool('eraser')} />
      <ToolbarDivider />
      {INK_WEIGHTS.map((w) => {
        const sel = activeSize === w.value
        return (
          <button
            key={w.name} type="button" aria-label={`${w.name} weight`} aria-pressed={sel}
            onClick={() => editor.setStyleForNextShapes(DefaultSizeStyle, w.value)}
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 'var(--radius-2)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: sel ? 'var(--bg-app)' : 'transparent',
              boxShadow: sel ? 'var(--shadow-inset), inset 0 0 0 1px var(--border-1)' : 'none',
            }}
          >
            <span style={{ width: w.dot, height: w.dot, borderRadius: 'var(--radius-pill)', background: sel ? 'var(--text-1)' : 'var(--text-3)' }} />
          </button>
        )
      })}
      <ToolbarDivider />
      {INK_COLORS.map((c) => {
        const selected = activeColor === c.value
        return (
          <button
            key={c.name} type="button" aria-label={c.name} aria-pressed={selected}
            onClick={() => editor.setStyleForNextShapes(DefaultColorStyle, c.value)}
            style={{
              width: 24, height: 24, padding: 0, border: 'none', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent',
              boxShadow: selected ? '0 0 0 2px var(--bg-raised), 0 0 0 3px var(--text-1)' : 'none',
            }}
          >
            <span style={{ width: 16, height: 16, borderRadius: 'var(--radius-pill)', background: c.swatch, border: '1px solid var(--border-2)' }} />
          </button>
        )
      })}
    </div>
  )
}

// Custom floating toolbar (bottom-centre) — replaces tldraw's default toolbar.
function CustomToolbar() {
  const editor = useEditor()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<string | null>(null)
  const { registerImport, registerGroupClusters } = React.useContext(CommandPaletteContext)
  const currentTool = useValue('current tool', () => editor.getCurrentToolId(), [editor])
  const inkToolActive = INK_TOOLS.includes(currentTool)

  const pickTool = useCallback((id: string) => { editor.setCurrentTool(id) }, [editor])
  const isTool = (id: string) => currentTool === id

  // Ink button toggles tldraw's native draw tool. Default to white ink so it's
  // visible on the dark canvas; pen/colour/weight then live in the sub-toolbar.
  const handleInk = useCallback(() => {
    if (INK_TOOLS.includes(editor.getCurrentToolId())) { editor.setCurrentTool('select'); return }
    editor.setStyleForNextShapes(DefaultColorStyle, 'white')
    editor.setCurrentTool('draw')
  }, [editor])
  // Placeholder tools (Tag/Doc/Mic/Chat/Add) have no behaviour yet, but still
  // dismiss the ink sub-toolbar like any other main-toolbar button.
  const dismissInk = useCallback(() => { if (INK_TOOLS.includes(editor.getCurrentToolId())) editor.setCurrentTool('select') }, [editor])

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
      {inkToolActive && <InkSubToolbar />}
      <div data-testid="canvas-toolbar" style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'all' }}>
        <div role="toolbar" aria-label="Canvas tools" style={floatingSurface}>
          <ToolButton icon="mouse-pointer-2" label="Select" keys="V" active={isTool('select')} onClick={() => pickTool('select')} />
          <ToolButton icon="hand" label="Pan" keys="H" active={isTool('hand')} onClick={() => pickTool('hand')} />
          <ToolbarDivider />
          <ToolButton icon="pen-line" label="Ink" keys="I" active={inkToolActive} onClick={handleInk} />
          <ToolButton icon="square" label="Rectangle" keys="R" active={isTool('geo')} onClick={() => pickTool('geo')} />
          <ToolButton icon="tag" label="Tag" onClick={dismissInk} />
          <ToolButton icon="file-text" label="Doc" onClick={dismissInk} />
          <ToolButton icon="type" label="Text" keys="T" active={isTool('text')} onClick={() => pickTool('text')} />
          <ToolbarDivider />
          <ToolButton icon="mic" label="Mic" onClick={dismissInk} />
          <ToolButton icon="message-circle" label="Chat" onClick={dismissInk} />
          <ToolbarDivider />
          <ToolButton icon="plus" label="Add" onClick={dismissInk} />
        </div>
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
  const { clearFocus } = useFocus()
  // Tracks hold-space-to-pan: whether space is held and the tool to restore.
  const panRef = useRef<{ down: boolean; prev: string | null }>({ down: false, prev: null })

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
          clearFocus()
          editor.selectNone()
          break
        case 'Delete':
        case 'Backspace': {
          const ids = editor.getSelectedShapeIds()
          if (ids.length) editor.deleteShapes(ids)
          break
        }
        case ' ': {
          // Hold space → temporary pan (hand tool); release restores the prior
          // tool. Guarded against key-repeat so holding doesn't flip-flop.
          e.preventDefault()
          if (!panRef.current.down) {
            panRef.current.down = true
            const cur = editor.getCurrentToolId()
            if (cur !== 'hand') {
              panRef.current.prev = cur
              editor.setCurrentTool('hand')
            }
          }
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

    // Release space → restore the tool we were on before the temporary pan.
    const upHandler = (e: KeyboardEvent) => {
      if (e.key === ' ' && panRef.current.down) {
        panRef.current.down = false
        const prev = panRef.current.prev
        panRef.current.prev = null
        editor.setCurrentTool(prev ?? 'select')
      }
    }

    window.addEventListener('keydown', handler)
    window.addEventListener('keyup', upHandler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('keyup', upHandler)
    }
  }, [editor, paletteOpen, clearFocus])

  return null
}

// ── App ──────────────────────────────────────────────────────────────────────

// Base dot spacing in page units (mirrors --canvas-dot-gap).
const BASE_DOT_GAP = 24

// Dot-grid canvas background (P2). Tied to tldraw's camera: the gap scales with
// zoom and the pattern offsets with pan, so the grid tracks the content. The dot
// size itself stays fixed at --canvas-dot-size.
function CanvasBackground() {
  const editor = useEditor()
  const camera = useValue('camera', () => editor.getCamera(), [editor])
  const gap = BASE_DOT_GAP * camera.z
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg-canvas)',
        backgroundImage:
          'radial-gradient(circle, var(--canvas-dot) var(--canvas-dot-size), transparent var(--canvas-dot-size))',
        backgroundSize: `${gap}px ${gap}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
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

// Exits orbit/focus mode when the canvas background is clicked (clicks that
// fall through dimmed cards count as background too). Only listens while focused.
function FocusController() {
  const editor = useEditor()
  const { focusActive, clearFocus } = useFocus()
  useEffect(() => {
    if (!focusActive) return
    const handler = (info: { name?: string; target?: string }) => {
      if (info.name === 'pointer_down' && info.target === 'canvas') clearFocus()
    }
    editor.on('event', handler)
    return () => { editor.off('event', handler) }
  }, [editor, focusActive, clearFocus])
  return null
}

function CanvasOverlays() {
  const editor = useEditor()
  const { strokes, setStrokes } = React.useContext(InkContext)
  useClusteringLayout(editor)
  useThreadLoader(editor)
  useIdeaLoader(editor)
  return (
    <>
      <FocusController />
      <TagConnectionOverlay />
      <TetherOverlay />
      {/* Legacy ink strokes render read-only; new ink uses tldraw's draw tool. */}
      <InkLayer
        active={false}
        eraserActive={false}
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

  const inkCtx = React.useMemo(() => ({
    inkActive, eraserActive, strokes, setInkActive, setEraserActive, setStrokes,
  }), [inkActive, eraserActive, strokes, setInkActive, setStrokes])

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
        <FocusProvider>
        <CommandPaletteContext.Provider value={paletteCtx}>
          <InkContext.Provider value={inkCtx}>
            {/* App shell — deepest backdrop */}
            <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-app)', overflow: 'hidden' }}>
              <NavBar />
              {/* Canvas panel — inset below the 56px nav, hairline-framed, dot-grid surface.
                  16px sides/bottom to match the nav's 16px horizontal padding. */}
              <div
                style={{
                  position: 'absolute',
                  inset: '56px 16px 16px',
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
        </FocusProvider>
      </TagFocusProvider>
    </FilterProvider>
  )
}
