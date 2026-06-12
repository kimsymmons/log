/**
 * Log node model — the canonical object schema for canvas artifacts.
 * Defined once, shared with the Platform & Data epic (PEO-109).
 *
 * No tldraw types may appear in this file: the canvas library is an
 * implementation detail behind src/model/tldraw-adapter.ts
 * (PRE-MORTEM risk 6 — store API wrapped, not called from product code).
 */

export type LogNodeType = 'chat' | 'artifact' | 'ink-group' | 'region'

export interface BaseNode {
  id: string
  x: number
  y: number
  /** Rotation in radians around the shape origin. */
  rotation: number
  w: number
  h: number
  /**
   * Z-order as an opaque lexicographic sort key: nodes render back-to-front
   * in ascending `z` order. Persisted verbatim so ordering survives reloads
   * exactly, without renumbering.
   */
  z: string
  /** Containing node id, or null when the node sits directly on the canvas. */
  parentId: string | null
}

export interface ChatNode extends BaseNode {
  type: 'chat'
  title: string
  body: string
  timestamp: string
}

export interface ArtifactNode extends BaseNode {
  type: 'artifact'
}

export interface InkSegment {
  type: 'free' | 'straight'
  points: { x: number; y: number; z: number }[]
}

export interface InkGroupNode extends BaseNode {
  type: 'ink-group'
  segments: InkSegment[]
  /**
   * Stroke style passthrough (colour, size, dash, …) kept opaque until ink
   * becomes a first-class layer in M3 (PEO-126), when this schema is decided
   * properly. Round-trips losslessly in the meantime.
   */
  style: Record<string, unknown>
}

export type ProjectLifecycleStatus = 'active' | 'paused' | 'complete' | 'stale'

export interface RegionNode extends BaseNode {
  type: 'region'
  status: ProjectLifecycleStatus
  updatedAt: number
}

export type LogNode = ChatNode | ArtifactNode | InkGroupNode | RegionNode

export function serializeNodes(nodes: LogNode[]): string {
  return JSON.stringify(nodes)
}

export function deserializeNodes(json: string): LogNode[] {
  return JSON.parse(json) as LogNode[]
}
