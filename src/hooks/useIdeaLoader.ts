import { useEffect, useRef } from 'react'
import type { Editor } from 'tldraw'
import { ChatCardShapeUtil, type ChatCardShape } from '../shapes/ChatCard'
import { getPosition } from '../canvas/positionStore'
import { firstTwoSentences } from '../canvas/autoTag'
import { parseStoredTags } from './useThreadLoader'

interface IdeaArtifact {
  id: string
  type: string
  title: string | null
  content: string | null
  tags?: string | string[] | null
  created_at: number
}

interface IdeaEntity {
  title: string
  description?: string
  sourceThreadId?: string
  sourceThreadTitle?: string
  tags?: string[]
  status?: string
}

const IDEA_CARD_SIZE = { w: 264, h: 200 }
const GRID = { cols: 4, dx: 300, dy: 232, originX: 80, originY: 560 }

function parseIdea(content: string | null): IdeaEntity | null {
  if (!content) return null
  try {
    const e = JSON.parse(content) as IdeaEntity & { type?: string }
    return e && typeof e.title === 'string' ? e : null
  } catch {
    return null
  }
}

const apiBase = () => (import.meta.env as Record<string, string>).VITE_API_URL ?? 'http://localhost:3001'

async function fetchIdeas(): Promise<IdeaArtifact[]> {
  const token = localStorage.getItem('auth_token') ?? ''
  try {
    const res = await fetch(`${apiBase()}/artifacts?type=idea`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return []
    return (await res.json()) as IdeaArtifact[]
  } catch {
    return []
  }
}

/**
 * Loads AI-extracted Idea nodes (type='idea' artifacts) onto the canvas as
 * Idea cards. Each idea carries `sourceThreadId`, which the focus + connection
 * systems use to draw a structural link to its source Thread. New ideas are
 * placed just below their source thread so that link reads at a glance.
 */
export function useIdeaLoader(editor: Editor): void {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true

    void (async () => {
      const ideas = await fetchIdeas()
      if (ideas.length === 0) return

      editor.batch(() => {
        ideas.forEach((artifact, i) => {
          const entity = parseIdea(artifact.content)
          if (!entity) return
          const shapeId = `shape:idea-${artifact.id}` as ChatCardShape['id']
          const tags = parseStoredTags(artifact.tags) ?? entity.tags ?? []
          const content = {
            title: entity.title || artifact.title || 'Untitled idea',
            summary: firstTwoSentences(entity.description ?? ''),
            cardType: 'idea',
            sourceThreadId: entity.sourceThreadId ?? undefined,
            createdAt: artifact.created_at,
          }

          const existing = editor.getShape(shapeId)
          if (existing) {
            editor.updateShape<ChatCardShape>({ id: shapeId, type: 'chat-card', props: { ...content, tags } })
          } else {
            const saved = getPosition(artifact.id)
            const sourceId = entity.sourceThreadId ? `shape:thread-${entity.sourceThreadId}` : null
            const source = sourceId ? editor.getShape(sourceId as ChatCardShape['id']) : undefined
            let x: number
            let y: number
            if (saved) {
              x = saved.x; y = saved.y
            } else if (source) {
              x = source.x + 40; y = source.y + 248 // just below the source thread
            } else {
              x = GRID.originX + (i % GRID.cols) * GRID.dx
              y = GRID.originY + Math.floor(i / GRID.cols) * GRID.dy
            }
            editor.createShape<ChatCardShape>({
              id: shapeId,
              type: ChatCardShapeUtil.type,
              x,
              y,
              props: { ...content, messages: [], tags, w: IDEA_CARD_SIZE.w, h: IDEA_CARD_SIZE.h },
            })
          }
        })
      })
    })()
  }, [editor])
}
