import { useEffect, useRef } from 'react'
import type { Editor } from 'tldraw'
import { ChatCardShapeUtil, type ChatCardShape } from '../shapes/ChatCard'
import { getPosition } from '../canvas/positionStore'
import { firstTwoSentences, extractTags } from '../canvas/autoTag'
import { wasAutoTagged, markAutoTagged } from '../canvas/tagStore'
import { parseProjectEntity } from '../canvas/projectMapping'

interface ProjectArtifact {
  id: string
  type: string
  title: string | null
  content: string | null
  sourceUrl?: string | null
  created_at: number
}

const CARD_SIZE = { w: 264, h: 208 }
const GRID = { cols: 4, dx: 300, dy: 240, originX: 80, originY: 80 }

const apiBase = () => (import.meta.env as Record<string, string>).VITE_API_URL ?? 'http://localhost:3001'

async function fetchProjects(): Promise<ProjectArtifact[]> {
  const token = localStorage.getItem('auth_token') ?? ''
  try {
    const res = await fetch(`${apiBase()}/artifacts?type=project`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return []
    return (await res.json()) as ProjectArtifact[]
  } catch {
    return []
  }
}

/**
 * Loads normalised projects (entity-schema ProjectEntity, from any source) onto
 * the canvas as Project cards. Status / issue-count / target-date come from the
 * stored entity; tags are auto-generated once from title + description.
 */
export function useProjectLoader(editor: Editor): void {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true

    void (async () => {
      const projects = await fetchProjects()
      if (projects.length === 0) return

      editor.batch(() => {
        projects.forEach((artifact, i) => {
          const entity = parseProjectEntity(artifact.content)
          const shapeId = `shape:project-${artifact.id}` as ChatCardShape['id']
          const title = entity?.title ?? artifact.title ?? 'Untitled project'
          const description = entity?.description ?? ''
          const content = {
            title,
            summary: firstTwoSentences(description),
            cardType: 'project',
            sourceUrl: entity?.sourceUrl ?? artifact.sourceUrl ?? undefined,
            status: entity?.status ?? undefined,
            statusColor: entity?.statusColour ?? undefined,
            issueCount: typeof entity?.issueCount === 'number' ? entity.issueCount : undefined,
            targetDate: entity?.targetDate ?? undefined,
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
              props: { ...content, messages: [], tags: [], w: CARD_SIZE.w, h: CARD_SIZE.h },
            })
          }

          // Auto-tag once from title + description.
          const card = editor.getShape<ChatCardShape>(shapeId)
          if (card && (card.props.tags ?? []).length === 0 && !wasAutoTagged(artifact.id)) {
            const tags = extractTags(`${title} ${description}`)
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
