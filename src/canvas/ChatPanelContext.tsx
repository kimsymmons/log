import React, { useState, useCallback, useMemo } from 'react'

// ── Node context extraction (pure, testable) ─────────────────────────────────
//
// Maps any canvas node to a human label + a short seed string used to
// pre-populate the first chat message in the "Chat about this →" flow (PEO-155).

/** Minimal view of a shape the seed logic needs — keeps it pure & testable. */
export interface NodeView {
  type: string
  props?: Record<string, unknown>
}

/** A shape plus its id, as handed to the panel from the context menu. */
export interface SourceNode extends NodeView {
  id: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Resolve a node's display label and seed text (its title, or failing that the
 * first 60 chars of its primary content). Unknown shape types fall back to the
 * raw type string and any title/name/text/content-ish prop.
 */
export function nodeContext(shape: NodeView): { typeLabel: string; seed: string } {
  const p = shape.props ?? {}
  let typeLabel: string
  let title = ''
  let content = ''

  switch (shape.type) {
    case 'musing':
      typeLabel = 'idea'; content = str(p.text); break
    case 'skill':
      typeLabel = 'skill'; title = str(p.name); content = str(p.description); break
    case 'mcp-server':
      typeLabel = 'MCP server'; title = str(p.name); content = str(p.description); break
    case 'gem':
      typeLabel = 'gem'; title = str(p.name); content = str(p.description); break
    case 'agent-card':
      typeLabel = 'agent'; title = str(p.agentName); content = str(p.taskDescription); break
    case 'chat-card':
      typeLabel = 'chat'; title = str(p.title); content = str(p.summary); break
    case 'doc':
      typeLabel = 'doc'; title = str(p.title); content = str(p.content); break
    case 'draw':
      typeLabel = 'sketch'; break
    default:
      typeLabel = shape.type
      title = str(p.title) || str(p.name)
      content = str(p.text) || str(p.content)
  }

  const seed = (title.trim() || content.trim().slice(0, 60)).trim()
  return { typeLabel, seed }
}

/** The first user message pre-seeded into the chat for a node. */
export function buildSeedMessage(shape: NodeView): string {
  const { typeLabel, seed } = nodeContext(shape)
  return seed
    ? `Tell me about this ${typeLabel}: ${seed}`
    : `Tell me about this ${typeLabel}.`
}

// ── Context ──────────────────────────────────────────────────────────────────

export interface ChatPanelContextValue {
  isOpen: boolean
  /** The node the panel was opened from, or null when closed. */
  sourceShape: SourceNode | null
  /** The chat-card shape id created for this conversation, once it exists. */
  activeChatId: string | null
  openPanel: (shape: SourceNode) => void
  closePanel: () => void
  setActiveChatId: (id: string | null) => void
}

const noop = () => {}

export const ChatPanelContext = React.createContext<ChatPanelContextValue>({
  isOpen: false,
  sourceShape: null,
  activeChatId: null,
  openPanel: noop,
  closePanel: noop,
  setActiveChatId: noop,
})

export function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [sourceShape, setSourceShape] = useState<SourceNode | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)

  const openPanel = useCallback((shape: SourceNode) => {
    setSourceShape(shape)
    setActiveChatId(null)
    setIsOpen(true)
  }, [])

  const closePanel = useCallback(() => {
    setIsOpen(false)
  }, [])

  const value = useMemo<ChatPanelContextValue>(() => ({
    isOpen,
    sourceShape,
    activeChatId,
    openPanel,
    closePanel,
    setActiveChatId,
  }), [isOpen, sourceShape, activeChatId, openPanel, closePanel])

  return <ChatPanelContext.Provider value={value}>{children}</ChatPanelContext.Provider>
}

export function useChatPanel(): ChatPanelContextValue {
  return React.useContext(ChatPanelContext)
}
