import { useEffect, useRef } from 'react'
import type { Editor } from 'tldraw'

const PINNED_WINDOW_MS = 30 * 60 * 1000
const DEBOUNCE_MS = 500
const TWEEN_MS = 400

function isPinned(meta: Record<string, unknown>): boolean {
  const pinnedAt = meta.pinnedAt
  if (typeof pinnedAt !== 'number') return false
  return Date.now() - pinnedAt < PINNED_WINDOW_MS
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function useClusteringLayout(editor: Editor | null) {
  const workerRef = useRef<Worker | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Prevents the layout-applied store update from triggering another layout run
  const applyingRef = useRef(false)

  useEffect(() => {
    if (!editor) return

    const worker = new Worker(
      new URL('./clustering.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<{ positions: Record<string, { x: number; y: number }> }>) => {
      const { positions } = event.data
      const shapes = editor.getCurrentPageShapes()

      const startPositions = new Map(shapes.map(s => [s.id, { x: s.x, y: s.y }]))
      const startTime = performance.now()

      applyingRef.current = true

      const tick = () => {
        const elapsed = performance.now() - startTime
        const t = Math.min(elapsed / TWEEN_MS, 1)
        const eased = easeOut(t)

        const updates = shapes
          .filter(s => positions[s.id] && !isPinned(s.meta as Record<string, unknown>))
          .map(s => {
            const from = startPositions.get(s.id)!
            const to = positions[s.id]
            return {
              id: s.id,
              type: s.type,
              x: from.x + (to.x - from.x) * eased,
              y: from.y + (to.y - from.y) * eased,
            }
          })

        if (updates.length > 0) {
          editor.updateShapes(updates)
        }

        if (t < 1) {
          requestAnimationFrame(tick)
        } else {
          applyingRef.current = false
        }
      }

      requestAnimationFrame(tick)
    }

    const dispatch = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const shapes = editor.getCurrentPageShapes()
        // Pass only the fields the worker needs (keep message small)
        worker.postMessage({
          shapes: shapes.map(s => ({
            id: s.id,
            type: s.type,
            x: s.x,
            y: s.y,
            props: s.props,
            meta: s.meta,
          })),
        })
      }, DEBOUNCE_MS)
    }

    const unsubscribe = editor.store.listen(() => {
      if (applyingRef.current) return
      dispatch()
    })

    return () => {
      unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
      worker.terminate()
      workerRef.current = null
    }
  }, [editor])
}
