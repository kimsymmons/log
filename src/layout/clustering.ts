import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import type { TLShape } from 'tldraw'

export function buildGraph(shapes: TLShape[]): Graph {
  const graph = new Graph({ type: 'undirected', multi: false })

  for (const s of shapes) {
    graph.addNode(s.id, { x: s.x, y: s.y })
  }

  for (let i = 0; i < shapes.length; i++) {
    const tagsI = ((shapes[i].props as { tags?: string[] }).tags) ?? []
    for (let j = i + 1; j < shapes.length; j++) {
      const tagsJ = ((shapes[j].props as { tags?: string[] }).tags) ?? []
      const shared = tagsI.filter(t => tagsJ.includes(t)).length
      if (shared > 0) {
        graph.addEdge(shapes[i].id, shapes[j].id, { weight: shared })
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
