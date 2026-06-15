import { useEffect, useRef } from 'react'
import type { Editor } from 'tldraw'
import { ChatCardShapeUtil, type ChatCardShape, type Message } from '../shapes/ChatCard'
import { getPosition } from '../canvas/positionStore'
import { firstTwoSentences, extractTags } from '../canvas/autoTag'
import { wasAutoTagged, markAutoTagged } from '../canvas/tagStore'

interface ChatArtifact {
  id: string
  type: string
  title: string | null
  content: string | null
  sourceUrl?: string | null
  tags?: string | string[] | null
  created_at: number
}

/** Parse the artifact's stored (haiku) tags, if any — JSON string or array. */
export function parseStoredTags(raw: string | string[] | null | undefined): string[] | null {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string')
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : null
  } catch {
    return null
  }
}

const THREAD_CARD_SIZE = { w: 264, h: 200 }
// Grid fallback when a thread has no persisted position.
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

async function fetchThreads(): Promise<ChatArtifact[]> {
  const token = localStorage.getItem('auth_token') ?? ''
  try {
    const res = await fetch(`${apiBase()}/artifacts?type=chat`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return []
    return (await res.json()) as ChatArtifact[]
  } catch {
    return []
  }
}

/**
 * Loads existing chat threads from the backend onto the canvas as Thread
 * cards, once per mount. Each thread gets a stable shape id so positions
 * (positionStore) and tags (tagStore) survive reloads; content is refreshed
 * from the backend so reply counts and previews stay current.
 */
export function useThreadLoader(editor: Editor): void {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true

    void (async () => {
      const threads = await fetchThreads()
      if (threads.length === 0) return

      editor.batch(() => {
        threads.forEach((artifact, i) => {
          const shapeId = `shape:thread-${artifact.id}` as ChatCardShape['id']
          const messages = parseMessages(artifact.content)
          const body = bodyOf(messages, artifact.content)
          // Semantic tags from the haiku extractor are authoritative when present.
          const storedTags = parseStoredTags(artifact.tags)
          // Content fields refresh from the backend on every load. Tags are only
          // set here from storedTags (haiku) — otherwise an existing card keeps
          // whatever tags it has (user- or deterministically-assigned).
          const content = {
            title: artifact.title ?? 'Untitled thread',
            summary: body,
            messages,
            cardType: 'thread',
            sourceUrl: artifact.sourceUrl ?? undefined,
            createdAt: artifact.created_at,
            ...(storedTags ? { tags: storedTags } : {}),
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
              props: { ...content, tags: storedTags ?? [], w: THREAD_CARD_SIZE.w, h: THREAD_CARD_SIZE.h },
            })
          }

          // Deterministic fallback: only when the extractor hasn't tagged this
          // thread. A thread with no tags gets up to 4 keyword tags from its
          // title + body, cached so it never re-runs.
          const card = editor.getShape<ChatCardShape>(shapeId)
          if (!storedTags && card && (card.props.tags ?? []).length === 0 && !wasAutoTagged(artifact.id)) {
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
