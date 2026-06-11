import { deserializeNodes, serializeNodes, type LogNode } from '../model/nodes'

export const CANVAS_STORAGE_KEY = 'log:canvas:v1'

/** Storage seam: localStorage now (ADR-001 — simple authority), server
 *  backup arrives with PEO-115/116 behind this same interface. */
export interface NodeStore {
  save(nodes: LogNode[]): void
  load(): LogNode[] | null
}

export function createLocalNodeStore(
  key: string = CANVAS_STORAGE_KEY,
  storage: Storage = localStorage
): NodeStore {
  return {
    save(nodes) {
      storage.setItem(key, serializeNodes(nodes))
    },
    load() {
      const json = storage.getItem(key)
      if (json === null) return null
      return deserializeNodes(json)
    },
  }
}
