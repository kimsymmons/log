import { useEffect, useRef } from 'react'
import type { Editor } from 'tldraw'
import { ChatCardShapeUtil, type ChatCardShape, type Message } from '../shapes/ChatCard'
import { getPosition } from '../canvas/positionStore'
import { firstTwoSentences, extractTags } from '../canvas/autoTag'
import { wasAutoTagged, markAutoTagged } from '../canvas/tagStore'

interface CardArtifact {
  id: string
  type: string
  title: string | null
  content: string | null
  sourceUrl?: string | null
  created_at: number
}

interface LoaderConfig {
  /** Backend artifact `type` to fetch (e.g. 'chat', 'idea'). */
  artifactType: string
  /** Card glyph type stored on the shape (e.g. 'thread', 'idea'). */
  cardType: string
  /** Stable shape-id prefix, `shape:<idPrefix>-<artifactId>`. */
  idPrefix: 'thread' | 'idea'
  defaultTitle: string
  /** Whether to surface the artifact's sourceUrl as a card link. */
  withSourceUrl: boolean
}

const CARD_SIZE = { w: 264, h: 200 }
// Grid fallback when a card has no persisted position.
const GRID = { cols: 4, dx: 300, dy: 232, originX: 80, originY: 80 }

function parseMessages(content: string | null): Message[] {
  if (!content) return []
  try {
    const parsed = JSON.parse(content) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .filter((m): m is Message => !!m && typeof (m as Message).content === 'string')
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
    }
  } catch {
    // content isn't a messages array — treat it as a single body line
  }
  return []
}

// Card body: the first two sentences of the opening message (falling back to
// raw content when the artifact isn't a messages array).
function bodyOf(messages: Message[], content: string | null): string {
  const first = messages[0]
  const raw = first ? first.content : (content && !content.trim().startsWith('[') ? content : '')
  return firstTwoSentences(raw)
}

const apiBase = () => (import.meta.env as Record<string, string>).VITE_API_URL ?? 'http://localhost:3001'

async function fetchArtifacts(type: string): Promise<CardArtifact[]> {
  const token = localStorage.getItem('auth_token') ?? ''
  try {
    const res = await fetch(`${apiBase()}/artifacts?type=${encodeURIComponent(type)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return []
    return (await res.json()) as CardArtifact[]
  } catch {
    return []
  }
}

/**
 * Loads backend artifacts of one type onto the canvas as chat-card shapes,
 * once per mount. Each card gets a stable shape id so positions (positionStore)
 * and tags (tagStore) survive reloads; content is refreshed from the backend.
 * A card with no tags is auto-tagged once from its title + body.
 */
function useArtifactCardLoader(editor: Editor, cfg: LoaderConfig): void {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true

    void (async () => {
      const artifacts = await fetchArtifacts(cfg.artifactType)
      if (artifacts.length === 0) return

      editor.batch(() => {
        artifacts.forEach((artifact, i) => {
          const shapeId = `shape:${cfg.idPrefix}-${artifact.id}` as ChatCardShape['id']
          const messages = parseMessages(artifact.content)
          const body = bodyOf(messages, artifact.content)
          // Content fields refresh from the backend on every load; tags are NOT
          // touched here — they live in shape props and persist via the node
          // adapter, so an existing card keeps the tags the user assigned.
          const content = {
            title: artifact.title ?? cfg.defaultTitle,
            summary: body,
            messages,
            cardType: cfg.cardType,
            sourceUrl: cfg.withSourceUrl ? (artifact.sourceUrl ?? undefined) : undefined,
            createdAt: artifact.created_at,
          }

          const existing = editor.getShape(shapeId)
          if (existing) {
            editor.updateShape<ChatCardShape>({ id: shapeId, type: 'chat-card', props: content })
          } else {
            const saved = getPosition(artifact.id)
            const x = saved ? saved.x : GRID.originX + (i % GRID.cols) * GRID.dx
            const y = saved ? saved.y : GRID.originY + Math.floor(i / GRID.cols) * GRID.dy
            editor.createShape<ChatCardShape>({
              id: shapeId,
              type: ChatCardShapeUtil.type,
              x,
              y,
              props: { ...content, tags: [], w: CARD_SIZE.w, h: CARD_SIZE.h },
            })
          }

          // Auto-tag once: a card with no tags gets up to 4 keyword tags derived
          // from its title + body. Cached so it never re-runs, and a card the
          // user has already tagged is left alone.
          const card = editor.getShape<ChatCardShape>(shapeId)
          if (card && (card.props.tags ?? []).length === 0 && !wasAutoTagged(artifact.id)) {
            const tags = extractTags(`${content.title} ${body}`)
            if (tags.length > 0) {
              editor.updateShape<ChatCardShape>({ id: shapeId, type: 'chat-card', props: { tags } })
            }
            markAutoTagged(artifact.id)
          }
        })
      })
    })()
  }, [editor])
}

/** Loads chat sessions as Thread cards (with a source link back to the chat). */
export function useThreadLoader(editor: Editor): void {
  useArtifactCardLoader(editor, {
    artifactType: 'chat', cardType: 'thread', idPrefix: 'thread',
    defaultTitle: 'Untitled thread', withSourceUrl: true,
  })
}

/** Loads idea artifacts as Idea cards (lightbulb glyph, no source link). */
export function useIdeaLoader(editor: Editor): void {
  useArtifactCardLoader(editor, {
    artifactType: 'idea', cardType: 'idea', idPrefix: 'idea',
    defaultTitle: 'Untitled idea', withSourceUrl: false,
  })
}
