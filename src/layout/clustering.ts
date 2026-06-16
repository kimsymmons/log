import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import type { TLShape } from 'tldraw'

// The custom "Log card" shape types that participate in the clustering layout.
// Native tldraw shapes (draw, highlight, line, geo, arrow, frame, …) must be
// excluded: pulling a free-hand `draw` stroke toward the tag-cluster centroid
// made ink visibly drift to the top-left after drawing.
export const LOG_CARD_SHAPE_TYPES = new Set<string>([
  'chat-card',
  'markdown-artifact',
  'code-artifact',
  'image-artifact',
  'musing',
  'skill',
  'mcp-server',
  'gem',
  'agent-card',
])

export function isLogCardShape(shape: { type: string }): boolean {
  return LOG_CARD_SHAPE_TYPES.has(shape.type)
}

export function buildGraph(shapes: TLShape[]): Graph {
  const graph = new Graph({ type: 'undirected', multi: false })
  // Only Log cards are nodes — native tldraw shapes are left untouched.
  const cards = shapes.filter(isLogCardShape)

  for (const s of cards) {
    graph.addNode(s.id, { x: s.x, y: s.y })
  }

  for (let i = 0; i < cards.length; i++) {
    const tagsI = ((cards[i].props as { tags?: string[] }).tags) ?? []
    for (let j = i + 1; j < cards.length; j++) {
      const tagsJ = ((cards[j].props as { tags?: string[] }).tags) ?? []
      const shared = tagsI.filter(t => tagsJ.includes(t)).length
      if (shared > 0) {
        graph.addEdge(cards[i].id, cards[j].id, { weight: shared })
      }
    }
  }

  return graph
}

export function runLayout(graph: Graph): Map<string, { x: number; y: number }> {
  if (graph.order === 0) return new Map()

  const positions = forceAtlas2(graph, {
    iterations: 200,
    getEdgeWeight: 'weight',
    settings: forceAtlas2.inferSettings(graph),
  }) as Record<string, { x: number; y: number }>

  const result = new Map<string, { x: number; y: number }>()
  for (const [id, pos] of Object.entries(positions)) {
    result.set(id, { x: pos.x, y: pos.y })
  }
  return result
}
