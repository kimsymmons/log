/**
 * Persisted Thread-card positions (`log-canvas-positions-v1`), keyed by the
 * stable artifact id. Used as the initial placement hint when a thread is
 * loaded onto the canvas, and updated when the card is dragged.
 */
export interface Point {
  x: number
  y: number
}

export const POSITIONS_KEY = 'log-canvas-positions-v1'

function read(storage: Storage): Record<string, Point> {
  try {
    const raw = storage.getItem(POSITIONS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Point>) : {}
  } catch {
    return {}
  }
}

export function getPosition(artifactId: string, storage: Storage = localStorage): Point | null {
  return read(storage)[artifactId] ?? null
}

export function setPosition(artifactId: string, point: Point, storage: Storage = localStorage): void {
  const all = read(storage)
  all[artifactId] = { x: point.x, y: point.y }
  storage.setItem(POSITIONS_KEY, JSON.stringify(all))
}
