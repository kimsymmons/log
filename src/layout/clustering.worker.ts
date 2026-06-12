import { buildGraph, runLayout } from './clustering'
import type { TLShape } from 'tldraw'

self.onmessage = (event: MessageEvent<{ shapes: TLShape[] }>) => {
  const { shapes } = event.data
  const graph = buildGraph(shapes)
  const posMap = runLayout(graph)
  const positions: Record<string, { x: number; y: number }> = {}
  for (const [id, pos] of posMap) {
    positions[id] = pos
  }
  self.postMessage({ positions })
}
