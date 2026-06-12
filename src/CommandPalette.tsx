import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor } from 'tldraw'
import { ChatCardShape, COLLAPSED_SIZE } from './shapes/ChatCard'
import { InkContext } from './ink/InkContext'

// ── Fuzzy match ───────────────────────────────────────────────────────────────

export function fuzzyMatch(query: string, label: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const l = label.toLowerCase()
  let qi = 0
  for (let li = 0; li < l.length && qi < q.length; li++) {
    if (l[li] === q[qi]) qi++
  }
  return qi === q.length
}

// ── Static command definitions (label + optional shortcut, no actions) ────────

export interface CommandDef {
  id: string
  label: string
  shortcut?: string
}

export const COMMAND_DEFS: CommandDef[] = [
  { id: 'new-chat',        label: 'New chat' },
  { id: 'import-chats',    label: 'Import chats' },
  { id: 'group-clusters',  label: 'Group clusters' },
  { id: 'toggle-ink',      label: 'Toggle ink' },
  { id: 'zoom-to-fit',     label: 'Zoom to fit',      shortcut: 'F' },
  { id: 'zoom-in',         label: 'Zoom in',          shortcut: '+' },
  { id: 'zoom-out',        label: 'Zoom out',         shortcut: '−' },
  { id: 'select-all',      label: 'Select all',       shortcut: '⌘A' },
  { id: 'delete-selected', label: 'Delete selected',  shortcut: '⌫' },
]

// ── Context ───────────────────────────────────────────────────────────────────

export interface CommandPaletteCtx {
  open: boolean
  setOpen: (v: boolean) => void
  query: string
  setQuery: (v: string) => void
  onImport: (() => void) | null
  onGroupClusters: (() => void) | null
  registerImport: (fn: () => void) => void
  registerGroupClusters: (fn: () => void) => void
}

export const CommandPaletteContext = createContext<CommandPaletteCtx>({
  open: false,
  setOpen: () => {},
  query: '',
  setQuery: () => {},
  onImport: null,
  onGroupClusters: null,
  registerImport: () => {},
  registerGroupClusters: () => {},
})

export function useCommandPalette() {
  const { open, setOpen, query, setQuery } = useContext(CommandPaletteContext)
  return { open, setOpen, query, setQuery }
}

// ── CommandPalette component ──────────────────────────────────────────────────
// Must be rendered inside the Tldraw tree so useEditor() works.
// Visually it floats above everything via a React portal to document.body.

export function CommandPalette() {
  const editor = useEditor()
  const { inkActive, setInkActive } = useContext(InkContext)
  const { open, setOpen, query, setQuery, onImport, onGroupClusters } = useContext(CommandPaletteContext)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = () => { setOpen(false); setQuery('') }

  const commands = useMemo(() => {
    const defs = COMMAND_DEFS
    const actions: Record<string, () => void> = {
      'new-chat': () => {
        const vp = editor.getViewportScreenBounds()
        const center = editor.screenToPage({ x: vp.w / 2, y: vp.h / 2 })
        editor.createShape<ChatCardShape>({
          type: 'chat-card',
          x: center.x - COLLAPSED_SIZE.w / 2,
          y: center.y - COLLAPSED_SIZE.h / 2,
          props: {
            w: COLLAPSED_SIZE.w,
            h: COLLAPSED_SIZE.h,
            title: 'New chat',
            messages: [],
            summary: '',
            createdAt: Date.now(),
          },
        })
      },
      'import-chats':   () => { onImport?.() },
      'group-clusters': () => { onGroupClusters?.() },
      'toggle-ink':     () => { setInkActive(!inkActive) },
      'zoom-to-fit':    () => { editor.zoomToFit() },
      'zoom-in':        () => { editor.zoomIn() },
      'zoom-out':       () => { editor.zoomOut() },
      'select-all':     () => { editor.selectAll() },
      'delete-selected': () => {
        const ids = editor.getSelectedShapeIds()
        if (ids.length) editor.deleteShapes(ids)
      },
    }
    return defs.map(d => ({ ...d, action: actions[d.id] ?? (() => {}) }))
  }, [editor, inkActive, setInkActive, onImport, onGroupClusters])

  const filtered = useMemo(
    () => (query ? commands.filter(c => fuzzyMatch(query, c.label)) : commands),
    [commands, query]
  )

  useEffect(() => { setSelectedIdx(0) }, [filtered])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  // Keyboard navigation within the palette
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => filtered.length ? (i + 1) % filtered.length : 0)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => filtered.length ? (i - 1 + filtered.length) % filtered.length : 0)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = filtered[selectedIdx]
        if (cmd) { cmd.action(); close() }
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [open, filtered, selectedIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 120,
        background: 'rgba(0,0,0,0.45)',
      }}
      onClick={close}
    >
      <div
        style={{
          width: 480,
          maxWidth: 'calc(100vw - 32px)',
          background: '#1a1a1a',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          fontFamily: 'system-ui, sans-serif',
        }}
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search commands…"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '14px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid #2e2e2e',
            color: '#f0f0f0',
            fontSize: 15,
            outline: 'none',
          }}
        />
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '12px 16px', color: '#666', fontSize: 13 }}>
              No commands match
            </div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                cursor: 'pointer',
                background: i === selectedIdx ? '#2a2a2a' : 'transparent',
                color: '#f0f0f0',
                fontSize: 14,
              }}
              onMouseEnter={() => setSelectedIdx(i)}
              onClick={() => { cmd.action(); close() }}
            >
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <kbd
                  style={{
                    background: '#2e2e2e',
                    border: '1px solid #3e3e3e',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 11,
                    color: '#aaa',
                    fontFamily: 'inherit',
                  }}
                >
                  {cmd.shortcut}
                </kbd>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
