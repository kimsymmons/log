import { describe, it, expect } from 'vitest'
import { buildGraph, runLayout, isLogCardShape } from './clustering'

// Minimal shape-like object — avoids importing tldraw (DOM side effects in test env)
type ShapeLike = {
  id: string
  type: string
  x: number
  y: number
  props: { tags?: string[]; [k: string]: unknown }
  meta: Record<string, unknown>
}

function shape(id: string, tags: string[], x = 0, y = 0): ShapeLike {
  return { id, type: 'chat-card', x, y, props: { tags }, meta: {} }
}

// ── buildGraph ────────────────────────────────────────────────────────────────

describe('buildGraph', () => {
  it('creates one node per shape', () => {
    const graph = buildGraph([shape('a', []), shape('b', [])] as never)
    expect(graph.order).toBe(2)
  })

  it('adds no edges when shapes share no tags', () => {
    const graph = buildGraph([shape('a', ['x']), shape('b', ['y'])] as never)
    expect(graph.size).toBe(0)
  })

  it('adds an edge for each pair with shared tags', () => {
    const graph = buildGraph([
      shape('a', ['foo', 'bar']),
      shape('b', ['foo']),
      shape('c', ['baz']),
    ] as never)
    expect(graph.hasEdge('a', 'b')).toBe(true)
    expect(graph.hasEdge('a', 'c')).toBe(false)
    expect(graph.hasEdge('b', 'c')).toBe(false)
  })

  it('weights edges by number of shared tags', () => {
    const graph = buildGraph([
      shape('a', ['foo', 'bar', 'baz']),
      shape('b', ['foo', 'bar']),
    ] as never)
    expect(graph.getEdgeAttribute('a', 'b', 'weight')).toBe(2)
  })

  it('handles shapes with no tags prop gracefully', () => {
    const noTags = [
      { id: 'x', type: 'chat-card', x: 0, y: 0, props: {}, meta: {} },
      { id: 'y', type: 'chat-card', x: 10, y: 0, props: {}, meta: {} },
    ]
    const graph = buildGraph(noTags as never)
    expect(graph.order).toBe(2)
    expect(graph.size).toBe(0)
  })

  it('sets initial node x/y attributes from shape position', () => {
    const graph = buildGraph([shape('a', [], 42, 99)] as never)
    expect(graph.getNodeAttribute('a', 'x')).toBe(42)
    expect(graph.getNodeAttribute('a', 'y')).toBe(99)
  })

  it('excludes native tldraw shapes (draw, geo, arrow, …) from the graph', () => {
    const mixed = [
      shape('card', ['x']),
      { id: 'ink', type: 'draw', x: 0, y: 0, props: {}, meta: {} },
      { id: 'box', type: 'geo', x: 0, y: 0, props: {}, meta: {} },
      { id: 'line', type: 'arrow', x: 0, y: 0, props: {}, meta: {} },
      { id: 'hl', type: 'highlight', x: 0, y: 0, props: {}, meta: {} },
    ]
    const graph = buildGraph(mixed as never)
    expect(graph.order).toBe(1)
    expect(graph.hasNode('card')).toBe(true)
    expect(graph.hasNode('ink')).toBe(false)
    expect(graph.hasNode('box')).toBe(false)
  })

  it('includes every custom Log card shape type', () => {
    for (const type of [
      'chat-card', 'markdown-artifact', 'code-artifact', 'image-artifact',
      'musing', 'skill', 'mcp-server', 'gem', 'agent-card',
    ]) {
      expect(isLogCardShape({ type })).toBe(true)
    }
    expect(isLogCardShape({ type: 'draw' })).toBe(false)
    expect(isLogCardShape({ type: 'geo' })).toBe(false)
  })
})

// ── runLayout ─────────────────────────────────────────────────────────────────

describe('runLayout', () => {
  it('returns empty map for empty graph', () => {
    const positions = runLayout(buildGraph([] as never))
    expect(positions.size).toBe(0)
  })

  it('returns a position for every node', () => {
    const graph = buildGraph([
      shape('a', ['x'], 0, 0),
      shape('b', ['x'], 100, 0),
      shape('c', ['y'], 200, 0),
    ] as never)
    const positions = runLayout(graph)
    expect(positions.size).toBe(3)
    expect(positions.get('a')).toMatchObject({ x: expect.any(Number), y: expect.any(Number) })
  })

  it('co-tagged nodes end up closer than unrelated nodes', () => {
    // Place shared-tag pair far apart so FA2 clearly pulls them together
    // Place unrelated node on the opposite side
    const graph = buildGraph([
      shape('a', ['shared'], -200, 0),
      shape('b', ['shared'],  200, 0),
      shape('c', ['unique'],    0, 1000),
    ] as never)
    const pos = runLayout(graph)
    const a = pos.get('a')!
    const b = pos.get('b')!
    const c = pos.get('c')!

    const distAB = Math.hypot(a.x - b.x, a.y - b.y)
    const distAC = Math.hypot(a.x - c.x, a.y - c.y)
    expect(distAB).toBeLessThan(distAC)
  })
})
