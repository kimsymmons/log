import React, { useEffect, useRef, useCallback } from 'react'
import { useEditor } from 'tldraw'
import { getStroke } from 'perfect-freehand'

export type Point = { x: number; y: number; pressure: number }
export type Stroke = {
  id: string
  points: Point[]
  color: string
  width: number
  // canvas-space coords (page coords) at time of recording — kept for hit-test
  canvasX: number
  canvasY: number
  zoom: number
}

const INK_COLOR = '#1a1a1a'
const BASE_WIDTH = 3
const API_BASE = (typeof import.meta !== 'undefined' && (import.meta.env as Record<string, string>).VITE_API_URL) ?? 'http://localhost:3001'

// ── helpers ──────────────────────────────────────────────────────────────────

function getSvgPathFromStroke(pts: number[][]): string {
  if (!pts.length) return ''
  const d: string[] = [`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`]
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(2)
    const my = ((pts[i][1] + pts[i + 1][1]) / 2).toFixed(2)
    d.push(`Q ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} ${mx} ${my}`)
  }
  d.push('Z')
  return d.join(' ')
}

export function pointNearStroke(px: number, py: number, stroke: Stroke, threshold = 20): boolean {
  for (const pt of stroke.points) {
    const dx = pt.x - px
    const dy = pt.y - py
    if (Math.sqrt(dx * dx + dy * dy) <= threshold) return true
  }
  return false
}

export function applyCamera(
  pt: { x: number; y: number },
  camera: { x: number; y: number; z: number }
): { x: number; y: number } {
  return {
    x: pt.x * camera.z + camera.x,
    y: pt.y * camera.z + camera.y,
  }
}

// ── rendering ────────────────────────────────────────────────────────────────

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, camera: { x: number; y: number; z: number }) {
  if (stroke.points.length < 2) return

  const inputPts = stroke.points.map(p => [p.x, p.y, p.pressure])
  const outlinePts = getStroke(inputPts, {
    size: stroke.width * camera.z,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    last: true,
  })

  if (!outlinePts.length) return

  // Transform page coords → screen coords
  const screenPts = outlinePts.map(([x, y]) => {
    const s = applyCamera({ x, y }, camera)
    return [s.x, s.y]
  })

  const pathStr = getSvgPathFromStroke(screenPts)
  const path2d = new Path2D(pathStr)
  ctx.fillStyle = stroke.color
  ctx.fill(path2d)
}

function renderAll(
  canvas: HTMLCanvasElement,
  completed: Stroke[],
  active: Point[],
  camera: { x: number; y: number; z: number }
) {
  const ctx = canvas.getContext('2d', { desynchronized: true })
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (const stroke of completed) {
    drawStroke(ctx, stroke, camera)
  }

  if (active.length >= 2) {
    const activeStroke: Stroke = {
      id: '__active__',
      points: active,
      color: INK_COLOR,
      width: BASE_WIDTH,
      canvasX: active[0].x,
      canvasY: active[0].y,
      zoom: camera.z,
    }
    drawStroke(ctx, activeStroke, camera)
  }
}

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetchStrokes(): Promise<Stroke[]> {
  try {
    const res = await fetch(`${API_BASE}/ink/strokes`)
    if (!res.ok) return []
    return (await res.json()) as Stroke[]
  } catch {
    return []
  }
}

async function apiPersistStroke(stroke: Stroke): Promise<void> {
  try {
    await fetch(`${API_BASE}/ink/strokes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: stroke.id,
        points: stroke.points,
        color: stroke.color,
        width: stroke.width,
      }),
    })
  } catch {
    // non-fatal
  }
}

async function apiDeleteStroke(id: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/ink/strokes/${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch {
    // non-fatal
  }
}

// ── component ────────────────────────────────────────────────────────────────

interface InkLayerProps {
  active: boolean
  eraserActive: boolean
  strokes: Stroke[]
  onStrokesChange: (strokes: Stroke[]) => void
}

export function InkLayer({ active, eraserActive, strokes, onStrokesChange }: InkLayerProps) {
  const editor = useEditor()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activePointsRef = useRef<Point[]>([])
  const rafRef = useRef<number | null>(null)
  const strokesRef = useRef<Stroke[]>(strokes)

  // Keep strokesRef in sync without causing render loops
  strokesRef.current = strokes

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const canvas = canvasRef.current
      if (!canvas) return
      const camera = editor.getCamera()
      renderAll(canvas, strokesRef.current, activePointsRef.current, camera)
    })
  }, [editor])

  // Resize canvas to match viewport
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      scheduleRender()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [scheduleRender])

  // Re-render on camera change (pan/zoom)
  useEffect(() => {
    return editor.store.listen(scheduleRender)
  }, [editor, scheduleRender])

  // Re-render when strokes change
  useEffect(() => {
    scheduleRender()
  }, [strokes, scheduleRender])

  // Pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active) return
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    activePointsRef.current = []

    if (eraserActive) return

    const page = editor.screenToPage({ x: e.clientX, y: e.clientY })
    activePointsRef.current = [{ x: page.x, y: page.y, pressure: e.pressure || 0.5 }]
    scheduleRender()
  }, [active, eraserActive, editor, scheduleRender])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active || activePointsRef.current.length === 0) return
    if (eraserActive) return
    e.preventDefault()

    const events: PointerEvent[] = typeof e.nativeEvent.getCoalescedEvents === 'function'
      ? e.nativeEvent.getCoalescedEvents()
      : [e.nativeEvent]

    for (const ev of events) {
      const page = editor.screenToPage({ x: ev.clientX, y: ev.clientY })
      activePointsRef.current.push({ x: page.x, y: page.y, pressure: ev.pressure || 0.5 })
    }

    scheduleRender()
  }, [active, eraserActive, editor, scheduleRender])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active) return
    e.preventDefault()

    if (eraserActive) {
      // Hit-test against completed strokes in screen space
      const page = editor.screenToPage({ x: e.clientX, y: e.clientY })
      const hit = strokesRef.current.find(s => pointNearStroke(page.x, page.y, s))
      if (hit) {
        const updated = strokesRef.current.filter(s => s.id !== hit.id)
        onStrokesChange(updated)
        void apiDeleteStroke(hit.id)
      }
      return
    }

    const pts = activePointsRef.current
    activePointsRef.current = []

    if (pts.length < 2) {
      scheduleRender()
      return
    }

    const camera = editor.getCamera()
    const stroke: Stroke = {
      id: crypto.randomUUID(),
      points: pts,
      color: INK_COLOR,
      width: BASE_WIDTH,
      canvasX: pts[0].x,
      canvasY: pts[0].y,
      zoom: camera.z,
    }

    const updated = [...strokesRef.current, stroke]
    onStrokesChange(updated)
    void apiPersistStroke(stroke)
    scheduleRender()
  }, [active, eraserActive, editor, onStrokesChange, scheduleRender])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: active ? 'all' : 'none',
        touchAction: 'none',
        cursor: eraserActive ? 'cell' : 'crosshair',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  )
}

// ── hook: load strokes on mount ───────────────────────────────────────────────

export function useInkStrokes() {
  const [strokes, setStrokes] = React.useState<Stroke[]>([])

  useEffect(() => {
    void apiFetchStrokes().then(setStrokes)
  }, [])

  return { strokes, setStrokes }
}
